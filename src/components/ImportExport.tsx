import React, { useRef, useState } from 'react';
import { Download, Upload, FileJson, FileText, ArrowRight } from 'lucide-react';
import { db } from '../db';
import type { Trade } from '../types';
import { calculatePips, calculatePnL } from '../utils/calculations';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';

interface ExportFormat {
  timestamp: string;
  type: string;
  lots: number;
  symbol: string;
  price: number;
  action: string;
  profit: number;
  rawProfit?: number;
  note?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Derive a human-readable note from MT5's parts[7] annotation field */
function parseMT5TradeNote(annotation: string): string {
  const a = annotation?.trim() ?? '';
  if (!a) return '';
  if (a.toLowerCase().startsWith('[so')) return 'Margin Call – Stop Out';
  if (a.toLowerCase().startsWith('[sl')) return `Stop Loss (${a.replace(/^\[sl\s*/i, '').replace(/\]$/, '')})`;
  return a;
}

/** Parse a block of raw MT5 tab-separated log text into ExportFormat records */
function parseMT5RawLog(raw: string): ExportFormat[] {
  const lines = raw.trim().split('\n');
  const result: ExportFormat[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 8) continue;

    const timestamp = parts[0]?.trim();
    const type      = parts[2]?.trim().toLowerCase();
    const rawNote   = parts[7]?.trim() ?? '';   // MT5 annotation / description column

    // ── SO Compensation row ─────────────────────────────────────────────────
    // e.g. "2026.03.24 13:01:44  14156644678  so compensation  ...  1 357.73"
    if (type === 'so compensation') {
      const profitStr = parts[12]?.replace(/\s/g, '') ?? '0';
      result.push({
        timestamp,
        type:   'Compensation',
        lots:   0,
        symbol: '',
        price:  0,
        action: 'compensation',
        profit: Math.abs(parseFloat(profitStr) || 0),
        note:   rawNote || 'SO Compensation – Negative Balance Protection',
      });
      continue;
    }

    // ── Balance / Deposit / Withdrawal row ──────────────────────────────────
    if (type === 'balance') {
      const profitStr = parts[12]?.replace(/\s/g, '') ?? '0';
      result.push({
        timestamp,
        type:   'balance',
        lots:   0,
        symbol: '',
        price:  0,
        action: 'balance',
        profit: parseFloat(profitStr) || 0,
        note:   rawNote,
      });
      continue;
    }

    // ── Trade rows (buy / sell) ──────────────────────────────────────────────
    if (type !== 'buy' && type !== 'sell') continue;

    const action = parts[8]?.trim().toLowerCase();
    if (action !== 'in' && !action?.startsWith('out')) continue;

    const commission = parseFloat(parts[9]?.replace(/\s/g,  '') || '0') || 0;
    const taxes      = parseFloat(parts[10]?.replace(/\s/g, '') || '0') || 0;
    const swap       = parseFloat(parts[11]?.replace(/\s/g, '') || '0') || 0;
    const rawProfit  = parseFloat(parts[12]?.replace(/\s/g, '') || '0') || 0;

    result.push({
      timestamp,
      type,
      lots:     parseFloat(parts[3]) || 0,
      symbol:   parts[4]?.trim(),
      price:    parseFloat(parts[5]) || 0,
      action,
      profit:   Number((rawProfit + commission + taxes + swap).toFixed(2)),
      rawProfit,
      note:     parseMT5TradeNote(rawNote),   // ← extract [so…] / [sl…] labels
    });
  }

  return result;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ImportExport = ({ accountId, currency = 'USD' }: { accountId: string, currency?: string }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading]   = useState(false);
  const [rawText, setRawText]   = useState('');

  // ── Core import engine ────────────────────────────────────────────────────
  const processJSONImport = async (data: ExportFormat[]) => {
    const pendingIn: ExportFormat[] = [];
    const newTrades: Trade[]        = [];
    const newBalanceLogs: any[]     = [];

    const existingTrades   = await db.trades.where('accountId').equals(accountId).toArray();
    const existingBalances = await db.balanceLogs.where('accountId').equals(accountId).toArray();

    const unmatchedTrades   = [...existingTrades];
    const unmatchedBalances = [...existingBalances];
    let skippedCount = 0;

    // ── Pre-processing: detect sibling partial-close groups ─────────────────
    const inRecords = data.filter(r => r.action === 'in' || r.action === 'in ');
    const siblingMap = new Map<string, number>();
    for (const r of inRecords) {
      const key = `${r.symbol}|${r.type}|${r.timestamp}|${r.price}`;
      siblingMap.set(key, (siblingMap.get(key) ?? 0) + r.lots);
    }
    for (const r of inRecords) {
      const key = `${r.symbol}|${r.type}|${r.timestamp}|${r.price}`;
      (r as any).groupOriginalLots = siblingMap.get(key)!;
    }
    // ────────────────────────────────────────────────────────────────────────

    for (const record of data) {

      // ── Balance / Deposit / Withdrawal / Compensation ─────────────────────
      if (
        record.type === 'balance'      || record.action === 'balance' ||
        record.type === 'Compensation' || record.action === 'compensation'
      ) {
        const [datePart, timePart] = record.timestamp.split(' ');
        const isoDateTime = new Date(`${datePart.replace(/\./g, '-')}T${timePart}`).toISOString();

        const bAmount = Math.abs(record.profit);
        // Preserve Compensation; infer Deposit/Withdrawal from sign
        const bType: 'Deposit' | 'Withdrawal' | 'Compensation' =
          (record.type === 'Compensation' || record.action === 'compensation')
            ? 'Compensation'
            : record.profit >= 0
              ? 'Deposit'
              : 'Withdrawal';

        const dupIdx = unmatchedBalances.findIndex(ext =>
          ext.dateTime === isoDateTime &&
          ext.type     === bType       &&
          ext.amount   === bAmount
        );

        if (dupIdx !== -1) {
          unmatchedBalances.splice(dupIdx, 1);
          skippedCount++;
        } else {
          newBalanceLogs.push({
            id: uuidv4(), accountId,
            dateTime: isoDateTime,
            amount:   bAmount,
            type:     bType,
            note:     record.note || '',
          });
        }
        continue;
      }

      // ── Trade in ─────────────────────────────────────────────────────────
      if (record.action === 'in' || record.action === 'in ') {
        (record as any).originalLots = record.lots;
        pendingIn.push(record);
        continue;
      }

      // ── Trade out ─────────────────────────────────────────────────────────
      if (!record.action.startsWith('out')) continue;

      const expectedInType  = record.type === 'buy' ? 'sell' : 'buy';
      const parsedTradeType: 'Buy' | 'Sell' = expectedInType === 'buy' ? 'Buy' : 'Sell';

      const possibleMatches = pendingIn
        .map((p, i) => ({ p, i }))
        .filter(x => x.p.symbol === record.symbol && x.p.type === expectedInType);

      let inIdx = -1;
      if (possibleMatches.length === 1) {
        inIdx = possibleMatches[0].i;
      } else if (possibleMatches.length > 1) {
        let bestDiff = Infinity;
        for (const match of possibleMatches) {
          const simPips = calculatePips(match.p.price, record.price, parsedTradeType, record.symbol);
          const simPnL  = calculatePnL(simPips, record.lots, record.symbol);
          const diff    = Math.abs(simPnL - record.profit);
          if (diff < bestDiff) { bestDiff = diff; inIdx = match.i; }
        }
      }

      let entryPrice     = record.price;
      let finalTimestamp = record.timestamp;
      let closeNote      = record.note ?? '';   // carry over [Margin Call] / [SL] label from the out row

      if (inIdx !== -1) {
        entryPrice     = pendingIn[inIdx].price;
        finalTimestamp = pendingIn[inIdx].timestamp;

        // Auto-repair grossly incorrect entry prices from corrupted JSON
        const simPips = calculatePips(entryPrice, record.price, parsedTradeType, record.symbol);
        const simPnL  = calculatePnL(simPips, record.lots, record.symbol);
        const rp      = record.rawProfit !== undefined ? record.rawProfit : record.profit;
        if (entryPrice === 0 && Math.abs(simPnL - rp) > 5.0 && Math.abs(record.profit) > 0.01) {
          const isXAU = record.symbol.toUpperCase().includes('XAU') || record.symbol.toUpperCase().includes('GOLD');
          const rate = currency === 'IDR' ? 16000 : 1;
          const inferredDiff = (rp / rate) / ((isXAU ? 100 : 100000) * record.lots);
          entryPrice = parsedTradeType === 'Buy'
            ? record.price - inferredDiff
            : record.price + inferredDiff;
        }

        // Partial-close detection
        const pIn: any = pendingIn[inIdx];
        const originalLots  = pIn.groupOriginalLots ?? pIn.lots;
        const remainingLots = Number((pIn.lots - record.lots).toFixed(2));
        if (Math.abs(originalLots - record.lots) > 0.001 && !closeNote) {
          closeNote = `Partial Close (${record.lots}/${originalLots} lots)`;
        }
        if (remainingLots > 0) { pIn.lots = remainingLots; }
        else { pendingIn.splice(inIdx, 1); }

      } else {
        // No matching "in" found — reverse-engineer entry price from raw profit
        const rp     = record.rawProfit !== undefined ? record.rawProfit : record.profit;
        const isXAU  = record.symbol.toUpperCase().includes('XAU') || record.symbol.toUpperCase().includes('GOLD');
        const rate   = currency === 'IDR' ? 16000 : 1;
        const iDiff  = (rp / rate) / ((isXAU ? 100 : 100000) * record.lots);
        entryPrice   = parsedTradeType === 'Buy' ? record.price - iDiff : record.price + iDiff;
      }

      const [datePart, timePart] = finalTimestamp.split(' ');
      const isoDateTime = new Date(`${datePart.replace(/\./g, '-')}T${timePart}`).toISOString();
      const calcPips    = calculatePips(entryPrice, record.price, parsedTradeType, record.symbol);

      const tObj = {
        id: uuidv4(), accountId,
        dateTime:     isoDateTime,
        pair:         record.symbol,
        type:         parsedTradeType,
        entryPrice,
        closingPrice: record.price,
        lotSize:      record.lots,
        pips:         calcPips,
        pnl:          record.profit,
        rrRatio:      null,
        note:         closeNote,
      };

      const dupIdx = unmatchedTrades.findIndex(ext =>
        ext.dateTime    === tObj.dateTime    &&
        ext.pair        === tObj.pair        &&
        ext.type        === tObj.type        &&
        ext.lotSize     === tObj.lotSize     &&
        ext.entryPrice  === tObj.entryPrice  &&
        ext.closingPrice === tObj.closingPrice
      );

      if (dupIdx !== -1) { unmatchedTrades.splice(dupIdx, 1); skippedCount++; }
      else { newTrades.push(tObj); }
    }

    if (newBalanceLogs.length > 0) await db.balanceLogs.bulkAdd(newBalanceLogs);
    if (newTrades.length > 0)      await db.trades.bulkAdd(newTrades);

    return {
      imported: newTrades.length + newBalanceLogs.length,
      skipped:  skippedCount,
      marginCallTrades: newTrades.filter(t => t.note?.startsWith('Margin Call')).length,
      compensations:    newBalanceLogs.filter(b => b.type === 'Compensation').length,
    };
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    const trades      = await db.trades.where('accountId').equals(accountId).toArray();
    const balanceLogs = await db.balanceLogs.where('accountId').equals(accountId).toArray();
    const exportData: ExportFormat[] = [];

    trades.forEach(t => {
      const inType  = t.type === 'Buy' ? 'buy' : 'sell';
      const outType = t.type === 'Buy' ? 'sell' : 'buy';
      const ts      = format(new Date(t.dateTime), "yyyy.MM.dd HH:mm:ss");
      exportData.push({ timestamp: ts, type: inType, lots: t.lotSize, symbol: t.pair, price: t.entryPrice, action: 'in',  profit: 0 });
      exportData.push({ timestamp: ts, type: outType, lots: t.lotSize, symbol: t.pair, price: t.closingPrice, action: 'out', profit: t.pnl, note: t.note || '' });
    });

    balanceLogs.forEach(b => {
      const ts  = format(new Date(b.dateTime), "yyyy.MM.dd HH:mm:ss");
      const amt = b.type === 'Withdrawal' ? -b.amount : b.amount;   // Compensation & Deposit = positive
      exportData.push({
        timestamp: ts,
        type:      b.type === 'Compensation' ? 'Compensation' : 'balance',
        lots: 0, symbol: '', price: 0,
        action: b.type === 'Compensation' ? 'compensation' : 'balance',
        profit: amt,
        note:   b.note,
      });
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `trades-export-${format(new Date(), 'yyyyMMdd-HHmm')}.json`;
    a.click();
  };

  // ── JSON file import ──────────────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data   = JSON.parse(event.target?.result as string) as ExportFormat[];
        const result = await processJSONImport(data);
        if (result.imported > 0) {
          alert(
            `✅ Imported ${result.imported} new items! (${result.skipped} duplicates skipped)` +
            (result.marginCallTrades > 0 ? `\n⚠️ ${result.marginCallTrades} Margin Call trade(s) detected.` : '') +
            (result.compensations    > 0 ? `\n🛡️ ${result.compensations} SO Compensation entry added.` : '')
          );
        } else {
          alert(`No new items to import. (${result.skipped} duplicates skipped)`);
        }
      } catch (err) {
        console.error(err);
        alert('Error parsing JSON file. Please ensure it is an array in the correct format.');
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ── Raw MT5 paste import ─────────────────────────────────────────────────
  const handleRawImport = async () => {
    if (!rawText.trim()) return;
    const parsed = parseMT5RawLog(rawText);
    if (parsed.length === 0) { alert('No valid rows found. Check your log format.'); return; }

    setLoading(true);
    try {
      const res = await processJSONImport(parsed);
      if (res.imported > 0) {
        alert(
          `✅ Imported ${res.imported} new items! (${res.skipped} duplicates skipped)` +
          (res.marginCallTrades > 0 ? `\n⚠️ ${res.marginCallTrades} Margin Call trade(s) detected & labeled.` : '') +
          (res.compensations    > 0 ? `\n🛡️ ${res.compensations} SO Compensation balance entry added automatically.` : '')
        );
        setRawText('');
      } else {
        alert(`No new items to import. (${res.skipped} duplicates skipped)`);
      }
    } catch (err) {
      console.error(err);
      alert('Import failed. Check the log format.');
    } finally {
      setLoading(false);
    }
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <FileJson className="w-6 h-6 text-indigo-500" />
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Import / Export JSON
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Import */}
        <div className="p-5 rounded-xl flex flex-col items-center justify-center text-center gap-3 border"
             style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
          <Upload className="w-8 h-8 text-blue-400" />
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Import Log Data</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Upload a JSON array with action "in" and "out" records.</p>
          </div>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleImport} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors cursor-pointer"
          >
            {loading ? 'Importing...' : 'Select JSON File'}
          </button>
        </div>

        {/* Export */}
        <div className="p-5 rounded-xl flex flex-col items-center justify-center text-center gap-3 border"
             style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
          <Download className="w-8 h-8 text-emerald-400" />
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Export Log Data</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Download current account trades in JSON format.</p>
          </div>
          <button
            onClick={handleExport}
            className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-6 rounded-lg transition-colors cursor-pointer"
          >
            Download JSON
          </button>
        </div>
      </div>

      {/* Raw MT5 log paste */}
      <div className="mt-8 p-5 rounded-xl border" style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
        <h3 className="font-semibold flex items-center gap-2 mb-1" style={{ color: 'var(--text-primary)' }}>
          <FileText className="w-5 h-5 text-indigo-400" /> Raw MT5 Log Converter
        </h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Paste your tab-separated raw MT5 log data below. Trades, Deposits, and SO Compensation rows are all handled automatically.
        </p>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-4">
          {[
            { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Deposit / Balance' },
            { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',       label: 'SO Compensation → auto-added' },
            { color: 'bg-rose-500/20 text-rose-400 border-rose-500/30',          label: '[so …] trades → Margin Call label' },
            { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',          label: '[sl …] trades → Stop Loss label' },
          ].map(b => (
            <span key={b.label} className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${b.color}`}>
              {b.label}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder={"Paste raw MT5 log data here (tab-separated):\n2026.03.24 07:11:52\t14154137217\tsell\t0.1\tXAUUSDc\t4333.11\t...\t\tin\t0.00\t0.00\t0.00\t0.00"}
            className="w-full h-52 rounded-lg p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none border"
            style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          />
          <button
            onClick={handleRawImport}
            disabled={loading || !rawText.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-6 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? 'Importing...' : <><ArrowRight className="w-4 h-4" /> Convert &amp; Import</>}
          </button>
        </div>
      </div>
    </div>
  );
};
