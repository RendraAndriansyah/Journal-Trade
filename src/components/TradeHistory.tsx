import { useState, useMemo } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO, isToday, startOfDay, addDays, subDays } from 'date-fns';
import { ArrowUpRight, ArrowDownRight, Trash2, Filter, GitBranch, Layers2, X, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Trade } from '../types';

import { formatCurrencyWithSign, formatPips } from '../utils/currency';

interface Props { accountId: string; currency: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractOriginalLots(note: string): number | null {
  const m = note.match(/Partial Close \([\d.]+\/([\d.]+) lots\)/);
  return m ? parseFloat(m[1]) : null;
}

// ─── TradeRow: one position (may be a merged partial-close group) ─────────────
interface TradeRow {
  id: string;
  trades: Trade[];
  isPartialGroup: boolean;
  dateTime: string;
  pair: string;
  type: string;
  totalLots: number;
  entryPrice: number;
  avgClosePrice: number;
  totalPnl: number;
  totalPips: number;
}

function buildRows(trades: Trade[]): TradeRow[] {
  const partialGroups = new Map<string, Trade[]>();
  const standalone: Trade[] = [];

  for (const t of trades) {
    if (t.note?.startsWith('Partial Close')) {
      const origLots = extractOriginalLots(t.note);
      if (origLots !== null) {
        const key = `${t.dateTime}|${t.pair}|${t.type}|${origLots}`;
        if (!partialGroups.has(key)) partialGroups.set(key, []);
        partialGroups.get(key)!.push(t);
        continue;
      }
    }
    standalone.push(t);
  }

  const rows: TradeRow[] = [];
  for (const t of standalone) {
    rows.push({ id: t.id, trades: [t], isPartialGroup: false,
      dateTime: t.dateTime, pair: t.pair, type: t.type,
      totalLots: t.lotSize, entryPrice: t.entryPrice,
      avgClosePrice: t.closingPrice, totalPnl: t.pnl, totalPips: t.pips });
  }
  for (const [key, group] of partialGroups) {
    const totalLots = group.reduce((s, t) => s + t.lotSize, 0);
    const totalPnl  = group.reduce((s, t) => s + t.pnl, 0);
    const avgClose  = group.reduce((s, t) => s + t.closingPrice * t.lotSize, 0) / totalLots;
    const avgPips   = group.reduce((s, t) => s + t.pips * t.lotSize, 0) / totalLots;
    rows.push({ id: key, trades: group, isPartialGroup: true,
      dateTime: group[0].dateTime, pair: group[0].pair, type: group[0].type,
      totalLots: parseFloat(totalLots.toFixed(2)),
      entryPrice: group[0].entryPrice,
      avgClosePrice: parseFloat(avgClose.toFixed(2)),
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      totalPips: parseFloat(avgPips.toFixed(1)) });
  }
  rows.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  return rows;
}

// ─── LayerRow: one or more TradeRows opened within 15 s ─────────────────────
const LAYER_WINDOW_MS = 15_000;

interface LayerRow {
  id: string;
  rows: TradeRow[];
  isLayer: boolean;
  dateTime: string;
  pair: string;
  type: string;
  totalLots: number;
  avgEntryPrice: number;
  avgClosePrice: number;
  totalPnl: number;
  totalPips: number;
}

function buildLayerRows(tradeRows: TradeRow[]): LayerRow[] {
  if (tradeRows.length === 0) return [];
  const sorted = [...tradeRows].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  const merge = (group: TradeRow[]): LayerRow => {
    const totalLots  = parseFloat(group.reduce((s, r) => s + r.totalLots, 0).toFixed(2));
    const totalPnl   = parseFloat(group.reduce((s, r) => s + r.totalPnl,  0).toFixed(2));
    const avgClose   = group.reduce((s, r) => s + r.avgClosePrice * r.totalLots, 0) / totalLots;
    const avgEntry   = group.reduce((s, r) => s + r.entryPrice * r.totalLots, 0) / totalLots;
    const avgPips    = group.reduce((s, r) => s + r.totalPips * r.totalLots, 0) / totalLots;
    return {
      id: group.map(r => r.id).join('||'), rows: group, isLayer: group.length > 1,
      dateTime: group[0].dateTime, pair: group[0].pair, type: group[0].type, totalLots,
      avgEntryPrice: parseFloat(avgEntry.toFixed(2)),
      avgClosePrice: parseFloat(avgClose.toFixed(2)),
      totalPnl, totalPips: parseFloat(avgPips.toFixed(1)),
    };
  };

  const result: LayerRow[] = [];
  let group = [sorted[0]];
  let startMs = new Date(sorted[0].dateTime).getTime();
  for (let i = 1; i < sorted.length; i++) {
    const row = sorted[i];
    const rowMs = new Date(row.dateTime).getTime();
    if (row.pair === group[0].pair && row.type === group[0].type && rowMs - startMs <= LAYER_WINDOW_MS) {
      group.push(row);
    } else {
      result.push(merge(group));
      group = [row]; startMs = rowMs;
    }
  }
  result.push(merge(group));
  result.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const TradeHistory = ({ accountId, currency }: Props) => {
  const [dateFilter, setDateFilter] = useState<'today' | 'lastDay' | 'all' | 'custom' | 'selectedDate'>('lastDay');
  const [startDate, setStartDate]   = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate,   setEndDate]     = useState(format(new Date(), 'yyyy-MM-dd'));
  const [partialDialog, setPartialDialog] = useState<Trade[] | null>(null);
  const [layerDialog,   setLayerDialog]   = useState<TradeRow[] | null>(null);

  const rawTrades = useLiveQuery(
    () => db.trades.where('accountId').equals(accountId).reverse().sortBy('dateTime'),
    [accountId]
  ) || [];

  const lastTradingDate = useMemo(() => {
    if (!rawTrades.length) return null;
    const sorted = [...rawTrades].sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
    return startOfDay(new Date(sorted[0].dateTime));
  }, [rawTrades]);

  let filteredTrades = [...rawTrades];
  if (dateFilter === 'today') {
    filteredTrades = filteredTrades.filter(t => isToday(new Date(t.dateTime)));
  } else if (dateFilter === 'lastDay') {
    if (lastTradingDate)
      filteredTrades = filteredTrades.filter(t => startOfDay(new Date(t.dateTime)).getTime() === lastTradingDate.getTime());
  } else if (dateFilter === 'selectedDate') {
    const day = startOfDay(new Date(`${startDate}T00:00:00`)).getTime();
    filteredTrades = filteredTrades.filter(t => startOfDay(new Date(t.dateTime)).getTime() === day);
  } else if (dateFilter === 'custom') {
    const start = new Date(`${startDate}T00:00:00`).getTime();
    const end   = new Date(`${endDate}T23:59:59`).getTime();
    filteredTrades = filteredTrades.filter(t => { const ms = new Date(t.dateTime).getTime(); return ms >= start && ms <= end; });
  }

  const layerRows = useMemo(() => buildLayerRows(buildRows(filteredTrades)), [filteredTrades]);

  const summary = useMemo(() => {
    const beThreshold = currency === 'IDR' ? 20000 : 20;
    let wins = 0, bes = 0, losses = 0, totalPnl = 0;
    for (const lr of layerRows) {
      totalPnl += lr.totalPnl;
      if (Math.abs(lr.totalPnl) < beThreshold) bes++;
      else if (lr.totalPnl > 0) wins++;
      else losses++;
    }
    return { wins, bes, losses, totalPnl, total: layerRows.length };
  }, [layerRows, currency]);

  const handleDeleteByDay = async () => {
    if (!filteredTrades.length) return;
    if (window.confirm(`Delete ${filteredTrades.length} trades from the current period?`))
      await db.trades.bulkDelete(filteredTrades.map(t => t.id));
  };

  const handleDeleteAll = async () => {
    if (!rawTrades.length) return;
    if (window.confirm(`Delete ALL ${rawTrades.length} trades for this account? This cannot be undone.`))
      await db.trades.bulkDelete(rawTrades.map(t => t.id));
  };

  const dialogBg = { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' };
  const theadBg  = { backgroundColor: 'var(--bg-base)' };

  return (
    <div className="card w-full overflow-hidden">

      {/* ── Partial Close Dialog ─────────────────────────────────────────── */}
      {partialDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setPartialDialog(null)}>
          <div className="rounded-2xl p-6 w-full max-w-lg shadow-2xl" style={dialogBg} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <GitBranch className="w-5 h-5 text-indigo-400" /> Partial Close Breakdown
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {partialDialog[0].pair} · {partialDialog[0].type} · {format(parseISO(partialDialog[0].dateTime), 'MMM dd, yyyy HH:mm')}
                </p>
              </div>
              <button onClick={() => setPartialDialog(null)}
                      className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-xs uppercase" style={{ color: 'var(--text-muted)', ...theadBg }}>
                    <th className="px-3 py-2 text-left rounded-tl-lg">#</th>
                    <th className="px-3 py-2 text-right">Lots</th>
                    <th className="px-3 py-2 text-right">Entry</th>
                    <th className="px-3 py-2 text-right">Close</th>
                    <th className="px-3 py-2 text-right">Pips</th>
                    <th className="px-3 py-2 text-right rounded-tr-lg">Profit</th>
                  </tr>
                </thead>
                <tbody style={{ borderTop: '1px solid var(--border)' }}>
                  {partialDialog.map((t, i) => (
                    <tr key={t.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--hover-row-2)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>#{i+1}</td>
                      <td className="px-3 py-2.5 font-mono text-right" style={{ color: 'var(--text-secondary)' }}>{t.lotSize.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-mono text-right" style={{ color: 'var(--text-muted)' }}>{t.entryPrice.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-mono text-right" style={{ color: 'var(--text-muted)' }}>{t.closingPrice.toFixed(2)}</td>
                      <td className={`px-3 py-2.5 font-mono text-right ${t.pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPips(t.pips)}</td>
                      <td className={`px-3 py-2.5 font-mono font-bold text-right ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrencyWithSign(t.pnl, currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border-deep)', ...theadBg }}>
                    <td className="px-3 py-2.5 text-xs font-semibold uppercase rounded-bl-lg" style={{ color: 'var(--text-muted)' }}>Total</td>
                    <td className="px-3 py-2.5 font-mono text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>{parseFloat(partialDialog.reduce((s,t)=>s+t.lotSize,0).toFixed(2))}</td>
                    <td colSpan={3}></td>
                    <td className={`px-3 py-2.5 font-mono font-bold text-right rounded-br-lg ${partialDialog.reduce((s,t)=>s+t.pnl,0)>=0?'text-emerald-400':'text-rose-400'}`}>
                      {(()=>{const tot=partialDialog.reduce((s,t)=>s+t.pnl,0);return formatCurrencyWithSign(tot, currency);})()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Layer Dialog ─────────────────────────────────────────────────── */}
      {layerDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setLayerDialog(null)}>
          <div className="rounded-2xl p-6 w-full max-w-2xl shadow-2xl" style={dialogBg} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Layers2 className="w-5 h-5 text-amber-400" /> Layer Breakdown
                  <span className="text-xs font-normal text-amber-400/70 bg-amber-500/10 px-2 py-0.5 rounded-full">{layerDialog.length} orders</span>
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {layerDialog[0].pair} · {layerDialog[0].type} · opened within 15 s of each other
                </p>
              </div>
              <button onClick={() => setLayerDialog(null)}
                      className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-xs uppercase" style={{ color: 'var(--text-muted)', ...theadBg }}>
                    <th className="px-3 py-2 text-left rounded-tl-lg">Order</th>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-right">Lots</th>
                    <th className="px-3 py-2 text-right">Entry</th>
                    <th className="px-3 py-2 text-right">Close</th>
                    <th className="px-3 py-2 text-right">Pips</th>
                    <th className="px-3 py-2 text-right rounded-tr-lg">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {layerDialog.map((row, i) => (
                    <tr key={row.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--hover-row-2)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <td className="px-3 py-2.5">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>#{i+1}</span>
                        {row.isPartialGroup && (
                          <button onClick={() => setPartialDialog(row.trades)}
                                  className="ml-2 text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded-full border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors cursor-pointer">
                            {row.trades.length}x partial ↗
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>{format(parseISO(row.dateTime), 'HH:mm:ss')}</td>
                      <td className="px-3 py-2.5 font-mono text-right" style={{ color: 'var(--text-secondary)' }}>{row.totalLots.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-mono text-right" style={{ color: 'var(--text-muted)' }}>{row.entryPrice.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-mono text-right" style={{ color: 'var(--text-muted)' }}>
                        {row.isPartialGroup ? <span className="italic text-xs" style={{ color: 'var(--text-muted)' }}>avg {row.avgClosePrice.toFixed(2)}</span> : row.avgClosePrice.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2.5 font-mono text-right ${row.totalPips>=0?'text-emerald-400':'text-rose-400'}`}>{formatPips(row.totalPips)}</td>
                      <td className={`px-3 py-2.5 font-mono font-bold text-right ${row.totalPnl>=0?'text-emerald-400':'text-rose-400'}`}>{formatCurrencyWithSign(row.totalPnl, currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border-deep)', ...theadBg }}>
                    <td className="px-3 py-2.5 text-xs font-semibold uppercase rounded-bl-lg" colSpan={2} style={{ color: 'var(--text-muted)' }}>Total</td>
                    <td className="px-3 py-2.5 font-mono text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>{parseFloat(layerDialog.reduce((s,r)=>s+r.totalLots,0).toFixed(2))}</td>
                    <td colSpan={3}></td>
                    <td className={`px-3 py-2.5 font-mono font-bold text-right rounded-br-lg ${layerDialog.reduce((s,r)=>s+r.totalPnl,0)>=0?'text-emerald-400':'text-rose-400'}`}>
                      {(()=>{const tot=layerDialog.reduce((s,r)=>s+r.totalPnl,0);return formatCurrencyWithSign(tot, currency);})()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Trade History</h3>
        <div className="flex items-center gap-2">
          {filteredTrades.length > 0 && (
            <button onClick={handleDeleteByDay} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold hover:bg-rose-500/20 transition-colors cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" /> Delete by Day
            </button>
          )}
          {rawTrades.length > 0 && (
            <button onClick={handleDeleteAll} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-900/30 text-rose-500 border border-rose-700/30 rounded-lg text-xs font-semibold hover:bg-rose-900/50 transition-colors cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" /> Delete All
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-row flex-wrap gap-3 mb-6 p-4 rounded-xl border" style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 pr-2" style={{ color: 'var(--text-muted)', borderRight: '1px solid var(--border)' }}>
          <Filter className="w-4 h-4" /> <span className="text-sm font-medium hidden sm:inline">Filters</span>
        </div>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value as any)}
                className="input-field text-sm py-2 rounded-lg w-full sm:w-auto" style={{ width: 'auto' }}>
          <option value="lastDay">Last Trading Day</option>
          <option value="selectedDate">Selected Date</option>
          <option value="all">All Days</option>
          <option value="custom">Custom Period</option>
        </select>
        {dateFilter === 'selectedDate' && (
          <div className="flex items-center gap-1.5 w-full sm:w-auto basis-full sm:basis-auto order-last sm:order-none">
            <button onClick={() => setStartDate(format(subDays(new Date(`${startDate}T00:00:00`), 1), 'yyyy-MM-dd'))}
                    className="p-2 rounded-lg border transition-colors" title="Previous day"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                   className="input-field text-sm py-2 rounded-lg cursor-pointer" style={{ width: 'auto' }} />
            <button onClick={() => setStartDate(format(addDays(new Date(`${startDate}T00:00:00`), 1), 'yyyy-MM-dd'))}
                    className="p-2 rounded-lg border transition-colors" title="Next day"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 w-full sm:w-auto basis-full sm:basis-auto order-last sm:order-none">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                   className="input-field text-sm py-2 rounded-lg cursor-pointer w-full sm:w-auto" />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                   className="input-field text-sm py-2 rounded-lg cursor-pointer w-full sm:w-auto" />
          </div>
        )}
      </div>

      {/* ── Summary Bar ──────────────────────────────────────────────────── */}
      {layerRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-3">
            <div className="bg-emerald-500/15 p-2 rounded-lg shrink-0"><TrendingUp className="w-4 h-4 text-emerald-400" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/80 leading-none mb-1">Win</p>
              <p className="text-xl font-bold font-mono text-emerald-400 leading-none">{summary.wins}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-slate-500/5 border border-slate-500/15 rounded-xl px-4 py-3">
            <div className="bg-slate-500/15 p-2 rounded-lg shrink-0"><Minus className="w-4 h-4 text-slate-400" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80 leading-none mb-1">Break Even</p>
              <p className="text-xl font-bold font-mono text-slate-300 leading-none">{summary.bes}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-rose-500/5 border border-rose-500/15 rounded-xl px-4 py-3">
            <div className="bg-rose-500/15 p-2 rounded-lg shrink-0"><TrendingDown className="w-4 h-4 text-rose-400" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600/80 leading-none mb-1">Loss</p>
              <p className="text-xl font-bold font-mono text-rose-400 leading-none">{summary.losses}</p>
            </div>
          </div>
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
            summary.totalPnl > 0 ? 'bg-blue-500/5 border-blue-500/15'
            : summary.totalPnl < 0 ? 'bg-rose-900/10 border-rose-700/20'
            : 'border-[var(--border)]'
          }`} style={summary.totalPnl === 0 ? { backgroundColor: 'var(--bg-base)' } : undefined}>
            <div className={`p-2 rounded-lg shrink-0 ${summary.totalPnl > 0 ? 'bg-blue-500/15' : summary.totalPnl < 0 ? 'bg-rose-500/15' : 'bg-gray-700/20'}`}>
              {summary.totalPnl >= 0
                ? <TrendingUp className={`w-4 h-4 ${summary.totalPnl > 0 ? 'text-blue-400' : 'text-gray-500'}`} />
                : <TrendingDown className="w-4 h-4 text-rose-400" />}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest leading-none mb-1" style={{ color: 'var(--text-muted)' }}>P&amp;L</p>
              <p className={`text-xl font-bold font-mono leading-none ${summary.totalPnl > 0 ? 'text-blue-400' : summary.totalPnl < 0 ? 'text-rose-400' : 'text-gray-400'}`}>
                {formatCurrencyWithSign(summary.totalPnl, currency)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {layerRows.length === 0 ? (
        <div className="text-center py-8 rounded-xl border border-dashed" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)' }}>
          No trades match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr className="text-left text-xs uppercase" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)' }}>
                <th className="px-4 py-3 rounded-tl-lg font-medium">Date &amp; Time</th>
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">Lots</th>
                <th className="px-4 py-3 font-medium text-right">Entry</th>
                <th className="px-4 py-3 font-medium text-right">Close</th>
                <th className="px-4 py-3 font-medium text-right">Pips</th>
                <th className="px-4 py-3 font-medium text-right">Profit</th>
                <th className="px-4 py-3 rounded-tr-lg font-medium text-center">Detail</th>
              </tr>
            </thead>
            <tbody>
              {layerRows.map(lr => (
                <tr key={lr.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--hover-row)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {format(parseISO(lr.dateTime), 'MMM dd, yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{lr.pair}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${lr.type === 'Buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {lr.type === 'Buy' ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>} {lr.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-right" style={{ color: 'var(--text-secondary)' }}>{lr.totalLots.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-right" style={{ color: 'var(--text-muted)' }}>
                    {lr.isLayer ? <span className="italic text-xs" style={{ color: 'var(--text-muted)' }}>avg {lr.avgEntryPrice.toFixed(2)}</span> : lr.avgEntryPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-right" style={{ color: 'var(--text-muted)' }}>
                    {(lr.isLayer || lr.rows[0]?.isPartialGroup) ? <span className="italic text-xs" style={{ color: 'var(--text-muted)' }}>avg {lr.avgClosePrice.toFixed(2)}</span> : lr.avgClosePrice.toFixed(2)}
                  </td>
                  <td className={`px-4 py-3 text-sm font-mono text-right ${lr.totalPips>=0?'text-emerald-400':'text-rose-400'}`}>
                    {formatPips(lr.totalPips)}
                  </td>
                  <td className={`px-4 py-3 text-sm font-mono font-bold text-right ${lr.totalPnl>=0?'text-emerald-400':'text-rose-400'}`}>
                    {formatCurrencyWithSign(lr.totalPnl, currency)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {lr.isLayer ? (
                      <button onClick={() => setLayerDialog(lr.rows)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold rounded-full hover:bg-amber-500/20 transition-colors cursor-pointer whitespace-nowrap"
                              title="View layer breakdown">
                        <Layers2 className="w-3 h-3" /> {lr.rows.length}x Layer
                      </button>
                    ) : lr.rows[0]?.isPartialGroup ? (
                      <button onClick={() => setPartialDialog(lr.rows[0].trades)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-semibold rounded-full hover:bg-indigo-500/20 transition-colors cursor-pointer whitespace-nowrap"
                              title="View partial close breakdown">
                        <GitBranch className="w-3 h-3" /> {lr.rows[0].trades.length}x Partial
                      </button>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--text-faint)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
