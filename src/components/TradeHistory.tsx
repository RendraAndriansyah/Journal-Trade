import { useState, useMemo } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO, isToday, startOfDay } from 'date-fns';
import { ArrowUpRight, ArrowDownRight, Trash2, Filter, GitBranch, Layers2, X } from 'lucide-react';
import type { Trade } from '../types';

interface Props { accountId: string; }

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

  const sorted = [...tradeRows].sort(
    (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
  );

  const merge = (group: TradeRow[]): LayerRow => {
    const totalLots  = parseFloat(group.reduce((s, r) => s + r.totalLots, 0).toFixed(2));
    const totalPnl   = parseFloat(group.reduce((s, r) => s + r.totalPnl,  0).toFixed(2));
    const avgClose   = group.reduce((s, r) => s + r.avgClosePrice * r.totalLots, 0) / totalLots;
    const avgEntry   = group.reduce((s, r) => s + r.entryPrice * r.totalLots, 0) / totalLots;
    const avgPips    = group.reduce((s, r) => s + r.totalPips * r.totalLots, 0) / totalLots;
    return {
      id: group.map(r => r.id).join('||'),
      rows: group,
      isLayer: group.length > 1,
      dateTime: group[0].dateTime,
      pair: group[0].pair,
      type: group[0].type,
      totalLots,
      avgEntryPrice: parseFloat(avgEntry.toFixed(2)),
      avgClosePrice: parseFloat(avgClose.toFixed(2)),
      totalPnl,
      totalPips: parseFloat(avgPips.toFixed(1)),
    };
  };

  const result: LayerRow[] = [];
  let group = [sorted[0]];
  let startMs = new Date(sorted[0].dateTime).getTime();

  for (let i = 1; i < sorted.length; i++) {
    const row   = sorted[i];
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
export const TradeHistory = ({ accountId }: Props) => {
  const [dateFilter, setDateFilter] = useState<'today' | 'lastDay' | 'all' | 'custom'>('lastDay');
  const [startDate, setStartDate]   = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate,   setEndDate]     = useState(format(new Date(), 'yyyy-MM-dd'));
  // Dialog state: null = closed | Trade[] = partial breakdown | TradeRow[] = layer breakdown
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
  } else if (dateFilter === 'custom') {
    const start = new Date(`${startDate}T00:00:00`).getTime();
    const end   = new Date(`${endDate}T23:59:59`).getTime();
    filteredTrades = filteredTrades.filter(t => { const ms = new Date(t.dateTime).getTime(); return ms >= start && ms <= end; });
  }

  const layerRows = useMemo(() => buildLayerRows(buildRows(filteredTrades)), [filteredTrades]);


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



  return (
    <div className="card w-full overflow-hidden">

      {/* ── Partial Close Dialog ─────────────────────────────────────────── */}
      {partialDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setPartialDialog(null)}>
          <div className="bg-[#151a23] border border-[#232936] rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-indigo-400" /> Partial Close Breakdown
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {partialDialog[0].pair} · {partialDialog[0].type} · {format(parseISO(partialDialog[0].dateTime), 'MMM dd, yyyy HH:mm')}
                </p>
              </div>
              <button onClick={() => setPartialDialog(null)} className="p-2 hover:bg-[#232936] rounded-lg text-gray-500 hover:text-gray-200 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase bg-[#0b0e14]">
                    <th className="px-3 py-2 text-left rounded-tl-lg">#</th>
                    <th className="px-3 py-2 text-right">Lots</th>
                    <th className="px-3 py-2 text-right">Entry</th>
                    <th className="px-3 py-2 text-right">Close</th>
                    <th className="px-3 py-2 text-right">Pips</th>
                    <th className="px-3 py-2 text-right rounded-tr-lg">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232936]">
                  {partialDialog.map((t, i) => (
                    <tr key={t.id} className="hover:bg-[#1e2535] transition-colors">
                      <td className="px-3 py-2.5 text-gray-500 text-xs">#{i+1}</td>
                      <td className="px-3 py-2.5 font-mono text-right text-gray-300">{t.lotSize.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-mono text-right text-gray-400">{t.entryPrice.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-mono text-right text-gray-400">{t.closingPrice.toFixed(2)}</td>
                      <td className={`px-3 py-2.5 font-mono text-right ${t.pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.pips >= 0 ? '+' : ''}{t.pips}</td>
                      <td className={`px-3 py-2.5 font-mono font-bold text-right ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#2d3547] bg-[#0b0e14]">
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-semibold uppercase rounded-bl-lg">Total</td>
                    <td className="px-3 py-2.5 font-mono text-right text-gray-300 font-semibold">{parseFloat(partialDialog.reduce((s,t)=>s+t.lotSize,0).toFixed(2))}</td>
                    <td colSpan={3}></td>
                    <td className={`px-3 py-2.5 font-mono font-bold text-right rounded-br-lg ${partialDialog.reduce((s,t)=>s+t.pnl,0)>=0?'text-emerald-400':'text-rose-400'}`}>
                      {(()=>{const tot=partialDialog.reduce((s,t)=>s+t.pnl,0);return `${tot>=0?'+':'-'}$${Math.abs(tot).toFixed(2)}`;})()}
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
          <div className="bg-[#151a23] border border-[#232936] rounded-2xl p-6 w-full max-w-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers2 className="w-5 h-5 text-amber-400" /> Layer Breakdown
                  <span className="text-xs font-normal text-amber-400/70 bg-amber-500/10 px-2 py-0.5 rounded-full">{layerDialog.length} orders</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {layerDialog[0].pair} · {layerDialog[0].type} · opened within 15 s of each other
                </p>
              </div>
              <button onClick={() => setLayerDialog(null)} className="p-2 hover:bg-[#232936] rounded-lg text-gray-500 hover:text-gray-200 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase bg-[#0b0e14]">
                    <th className="px-3 py-2 text-left rounded-tl-lg">Order</th>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-right">Lots</th>
                    <th className="px-3 py-2 text-right">Entry</th>
                    <th className="px-3 py-2 text-right">Close</th>
                    <th className="px-3 py-2 text-right">Pips</th>
                    <th className="px-3 py-2 text-right rounded-tr-lg">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232936]">
                  {layerDialog.map((row, i) => (
                    <tr key={row.id} className="hover:bg-[#1e2535] transition-colors">
                      <td className="px-3 py-2.5">
                        <span className="text-gray-500 text-xs">#{i+1}</span>
                        {row.isPartialGroup && (
                          <button
                            onClick={() => setPartialDialog(row.trades)}
                            className="ml-2 text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded-full border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors cursor-pointer"
                          >
                            {row.trades.length}x partial ↗
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{format(parseISO(row.dateTime), 'HH:mm:ss')}</td>
                      <td className="px-3 py-2.5 font-mono text-right text-gray-300">{row.totalLots.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-mono text-right text-gray-400">{row.entryPrice.toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-mono text-right text-gray-400">
                        {row.isPartialGroup ? <span className="text-gray-500 italic text-xs">avg {row.avgClosePrice.toFixed(2)}</span> : row.avgClosePrice.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2.5 font-mono text-right ${row.totalPips>=0?'text-emerald-400':'text-rose-400'}`}>{row.totalPips>=0?'+':''}{row.totalPips}</td>
                      <td className={`px-3 py-2.5 font-mono font-bold text-right ${row.totalPnl>=0?'text-emerald-400':'text-rose-400'}`}>{row.totalPnl>=0?'+':'-'}${Math.abs(row.totalPnl).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#2d3547] bg-[#0b0e14]">
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-semibold uppercase rounded-bl-lg" colSpan={2}>Total</td>
                    <td className="px-3 py-2.5 font-mono text-right text-gray-300 font-semibold">{parseFloat(layerDialog.reduce((s,r)=>s+r.totalLots,0).toFixed(2))}</td>
                    <td colSpan={3}></td>
                    <td className={`px-3 py-2.5 font-mono font-bold text-right rounded-br-lg ${layerDialog.reduce((s,r)=>s+r.totalPnl,0)>=0?'text-emerald-400':'text-rose-400'}`}>
                      {(()=>{const tot=layerDialog.reduce((s,r)=>s+r.totalPnl,0);return `${tot>=0?'+':'-'}$${Math.abs(tot).toFixed(2)}`;})()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-[#232936] pb-4">
        <h3 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Trade History</h3>
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
      <div className="flex flex-row flex-wrap gap-3 mb-6 bg-[#0b0e14] p-4 rounded-xl border border-[#232936]">
        <div className="flex items-center text-gray-400 gap-2 pr-2 border-r border-[#232936]">
          <Filter className="w-4 h-4" /> <span className="text-sm font-medium hidden sm:inline">Filters</span>
        </div>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value as any)} className="bg-[#151a23] border border-[#232936] text-sm rounded-lg px-3 py-2 text-gray-300 outline-none w-full sm:w-auto">
          <option value="lastDay">Last Trading Day</option>
          <option value="all">All Days</option>
          <option value="custom">Custom Period</option>
        </select>
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 w-full sm:w-auto basis-full sm:basis-auto order-last sm:order-none">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-[#151a23] border border-[#232936] text-sm rounded-lg px-2 py-2 text-gray-300 outline-none w-full sm:w-auto cursor-pointer" />
            <span className="text-gray-500 text-xs">to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-[#151a23] border border-[#232936] text-sm rounded-lg px-2 py-2 text-gray-300 outline-none w-full sm:w-auto cursor-pointer" />
          </div>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {layerRows.length === 0 ? (
        <div className="text-center text-gray-500 py-8 bg-[#0b0e14] rounded-xl border border-[#232936] border-dashed">No trades match the current filters.</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase bg-[#0b0e14]">
                <th className="px-4 py-3 rounded-tl-lg font-medium">Date & Time</th>
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
            <tbody className="divide-y divide-[#232936]">
              {layerRows.map(lr => (
                <tr key={lr.id} className="hover:bg-[#151a23] transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {format(parseISO(lr.dateTime), 'MMM dd, yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-200">{lr.pair}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${lr.type === 'Buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {lr.type === 'Buy' ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>} {lr.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-right text-gray-300">{lr.totalLots.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-right text-gray-400">
                    {lr.isLayer ? <span className="text-gray-500 italic text-xs">avg {lr.avgEntryPrice.toFixed(2)}</span> : lr.avgEntryPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-right text-gray-400">
                    {(lr.isLayer || lr.rows[0]?.isPartialGroup) ? <span className="text-gray-500 italic text-xs">avg {lr.avgClosePrice.toFixed(2)}</span> : lr.avgClosePrice.toFixed(2)}
                  </td>
                  <td className={`px-4 py-3 text-sm font-mono text-right ${lr.totalPips>=0?'text-emerald-400':'text-rose-400'}`}>
                    {lr.totalPips>=0?'+':''}{lr.totalPips}
                  </td>
                  <td className={`px-4 py-3 text-sm font-mono font-bold text-right ${lr.totalPnl>=0?'text-emerald-400':'text-rose-400'}`}>
                    {lr.totalPnl>=0?'+':'-'}${Math.abs(lr.totalPnl).toFixed(2)}
                  </td>

                  {/* Detail column — priority: Layer > Partial > none */}
                  <td className="px-4 py-3 text-center">
                    {lr.isLayer ? (
                      <button
                        onClick={() => setLayerDialog(lr.rows)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold rounded-full hover:bg-amber-500/20 transition-colors cursor-pointer whitespace-nowrap"
                        title="View layer breakdown"
                      >
                        <Layers2 className="w-3 h-3" /> {lr.rows.length}x Layer
                      </button>
                    ) : lr.rows[0]?.isPartialGroup ? (
                      <button
                        onClick={() => setPartialDialog(lr.rows[0].trades)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-semibold rounded-full hover:bg-indigo-500/20 transition-colors cursor-pointer whitespace-nowrap"
                        title="View partial close breakdown"
                      >
                        <GitBranch className="w-3 h-3" /> {lr.rows[0].trades.length}x Partial
                      </button>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
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
