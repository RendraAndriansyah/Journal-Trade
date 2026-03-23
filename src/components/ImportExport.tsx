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

export const ImportExport = ({ accountId }: { accountId: string }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [rawText, setRawText] = useState('');

  const processJSONImport = async (data: ExportFormat[]) => {
    const pendingIn: ExportFormat[] = [];
    const newTrades: Trade[] = [];
    const newBalanceLogs: any[] = [];
    
    const existingTrades = await db.trades.where('accountId').equals(accountId).toArray();
    const existingBalances = await db.balanceLogs.where('accountId').equals(accountId).toArray();
    
    const unmatchedTrades = [...existingTrades];
    const unmatchedBalances = [...existingBalances];

    let skippedCount = 0;

    // ─── PRE-PROCESSING PASS ───────────────────────────────────────────────────
    // Detect partial-close sibling groups from JSON exports that have no `note`.
    // Two `in` records sharing the same (symbol, type, timestamp, price) came
    // from the same original position — so their combined lots = originalLots.
    const inRecords = data.filter(r => r.action === 'in' || r.action === 'in ');
    // Build a map: key → { totalLots, count }
    const siblingMap = new Map<string, number>();
    for (const r of inRecords) {
      const key = `${r.symbol}|${r.type}|${r.timestamp}|${r.price}`;
      siblingMap.set(key, (siblingMap.get(key) ?? 0) + r.lots);
    }
    // Stamp each `in` record with its group's total lots
    for (const r of inRecords) {
      const key = `${r.symbol}|${r.type}|${r.timestamp}|${r.price}`;
      (r as any).groupOriginalLots = siblingMap.get(key)!;
    }
    // ──────────────────────────────────────────────────────────────────────────

    for (const record of data) {
      if (record.type === 'balance' || record.action === 'balance') {
        const [datePart, timePart] = record.timestamp.split(' ');
        const formattedDate = datePart.replace(/\./g, '-');
        const isoDateTime = new Date(`${formattedDate}T${timePart}`).toISOString();
        
        const bAmount = Math.abs(record.profit);
        const bType = record.profit >= 0 ? 'Deposit' : 'Withdrawal';
        
        const dupIdx = unmatchedBalances.findIndex(ext => 
          ext.dateTime === isoDateTime &&
          ext.type === bType &&
          ext.amount === bAmount
        );

        if (dupIdx !== -1) {
          unmatchedBalances.splice(dupIdx, 1);
          skippedCount++;
        } else {
          newBalanceLogs.push({
            id: uuidv4(),
            accountId,
            dateTime: isoDateTime,
            amount: bAmount,
            type: bType,
            note: record.note || ''
          });
        }
        continue;
      }

      if (record.action === 'in' || record.action === 'in ') {
        // Store originalLots immediately so partial-close detection is always correct
        (record as any).originalLots = record.lots;
        pendingIn.push(record);
      } else if (record.action.startsWith('out')) {
        const expectedInType = record.type === 'buy' ? 'sell' : 'buy';
        const parsedTradeType: 'Buy' | 'Sell' = expectedInType === 'buy' ? 'Buy' : 'Sell';
        
        const possibleMatches = pendingIn.map((p, i) => ({ p, i }))
          .filter(x => x.p.symbol === record.symbol && x.p.type === expectedInType);
          
        let inIdx = -1;
        if (possibleMatches.length === 1) {
          inIdx = possibleMatches[0].i;
        } else if (possibleMatches.length > 1) {
          // Heuristic PnL targeting: Find the exact entry ticket that produced this exact MT5 profit!
          let bestDiff = Infinity;
          for (const match of possibleMatches) {
            const simulatedPips = calculatePips(match.p.price, record.price, parsedTradeType, record.symbol);
            const simulatedPnL = calculatePnL(simulatedPips, record.lots, record.symbol);
            const diff = Math.abs(simulatedPnL - record.profit);
            if (diff < bestDiff) {
              bestDiff = diff;
              inIdx = match.i;
            }
          }
        }
        
        let entryPrice = record.price;
        let finalTimestamp = record.timestamp;
        let closeNote = "";
        
        if (inIdx !== -1) {
          entryPrice = pendingIn[inIdx].price;
          finalTimestamp = pendingIn[inIdx].timestamp;
          
          // --- AUTO REPAIR CORRUPTED JSON EXPORTS ---
          const simulatedPips = calculatePips(entryPrice, record.price, parsedTradeType, record.symbol);
          const simulatedPnL = calculatePnL(simulatedPips, record.lots, record.symbol);
          const rp = record.rawProfit !== undefined ? record.rawProfit : record.profit;
          const diff = Math.abs(simulatedPnL - rp);
          
          if (diff > 5.0 && Math.abs(record.profit) > 0.01) {
            let inferredDiff = 0;
            if (record.symbol.toUpperCase().includes('XAU') || record.symbol.toUpperCase().includes('GOLD')) {
              inferredDiff = rp / (100 * record.lots);
            } else {
              inferredDiff = rp / (100000 * record.lots);
            }
            if (parsedTradeType === 'Buy') {
              entryPrice = record.price - inferredDiff;
            } else {
              entryPrice = record.price + inferredDiff;
            }
          }
          // --- END AUTO REPAIR ---

          // Verify if it's a partial close
          const pIn: any = pendingIn[inIdx];
          // groupOriginalLots = total lots of ALL closes sharing same entry (detected in pre-processing pass)
          // This works even on old JSON exports that have no `note` field
          const originalLots: number = pIn.groupOriginalLots ?? pIn.lots;
          const currentLots: number = pIn.lots;
          const remainingLots = Number((currentLots - record.lots).toFixed(2));
          
          // It's a partial close if: closing fewer lots than the original full position size
          const isPartialClose = Math.abs(originalLots - record.lots) > 0.001;
          closeNote = isPartialClose ? `Partial Close (${record.lots}/${originalLots} lots)` : "";

          if (remainingLots > 0) {
            pIn.lots = remainingLots;
          } else {
            pendingIn.splice(inIdx, 1);
          }
        } else {
          // Fallback: The user exported an 'out' record but excluded the 'in' record from their text log.
          // We natively reverse-engineer the ENTRY PRICE exclusively from the Raw PnL generated to restore total pip mapping!
          const rp = record.rawProfit !== undefined ? record.rawProfit : record.profit;
          let inferredDiff = 0;
          if (record.symbol.toUpperCase().includes('XAU') || record.symbol.toUpperCase().includes('GOLD')) {
            inferredDiff = rp / (100 * record.lots);
          } else {
            inferredDiff = rp / (100000 * record.lots);
          }
          if (parsedTradeType === 'Buy') {
            entryPrice = record.price - inferredDiff;
          } else {
            entryPrice = record.price + inferredDiff;
          }
        }

        const [datePart, timePart] = finalTimestamp.split(' ');
        const formattedDate = datePart.replace(/\./g, '-');
        // Do not force Z (UTC), assume user's local timezone so broker output hour is preserved perfectly in UI
        const isoDateTime = new Date(`${formattedDate}T${timePart}`).toISOString();
        
        const calcPips = calculatePips(entryPrice, record.price, parsedTradeType, record.symbol);
        
        const tObj = {
          id: uuidv4(),
          accountId,
          dateTime: isoDateTime,
          pair: record.symbol,
          type: parsedTradeType,
          entryPrice,
          closingPrice: record.price,
          lotSize: record.lots,
          pips: calcPips,
          pnl: record.profit,
          rrRatio: null,
          note: record.note || closeNote
        };
        
        const dupIdx = unmatchedTrades.findIndex(ext => 
          ext.dateTime === tObj.dateTime &&
          ext.pair === tObj.pair &&
          ext.type === tObj.type &&
          ext.lotSize === tObj.lotSize &&
          ext.entryPrice === tObj.entryPrice &&
          ext.closingPrice === tObj.closingPrice
        );

        if (dupIdx !== -1) {
          unmatchedTrades.splice(dupIdx, 1);
          skippedCount++;
        } else {
          newTrades.push(tObj);
        }
      }
    }
    
    if (newBalanceLogs.length > 0) {
      await db.balanceLogs.bulkAdd(newBalanceLogs);
    }
    if (newTrades.length > 0) {
      await db.trades.bulkAdd(newTrades);
    }
    return { imported: newTrades.length + newBalanceLogs.length, skipped: skippedCount };
  };

  const handleExport = async () => {
    const trades = await db.trades.where('accountId').equals(accountId).toArray();
    const balanceLogs = await db.balanceLogs.where('accountId').equals(accountId).toArray();
    const exportData: ExportFormat[] = [];
    
    trades.forEach(t => {
      const inType = t.type === 'Buy' ? 'buy' : 'sell';
      const outType = t.type === 'Buy' ? 'sell' : 'buy';
      
      const ts = format(new Date(t.dateTime), "yyyy.MM.dd HH:mm:ss");
      
      exportData.push({
        timestamp: ts,
        type: inType,
        lots: t.lotSize,
        symbol: t.pair,
        price: t.entryPrice,
        action: "in",
        profit: 0.00
      });
      
      exportData.push({
        timestamp: ts,
        type: outType,
        lots: t.lotSize,
        symbol: t.pair,
        price: t.closingPrice,
        action: "out",
        profit: t.pnl,
        note: t.note || ''
      });
    });

    balanceLogs.forEach(b => {
      const ts = format(new Date(b.dateTime), "yyyy.MM.dd HH:mm:ss");
      const amt = b.type === 'Deposit' ? b.amount : -b.amount;
      
      exportData.push({
        timestamp: ts,
        type: "balance",
        lots: 0,
        symbol: "",
        price: 0,
        action: "balance",
        profit: amt,
        note: b.note
      });
    });
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-export-${format(new Date(), 'yyyyMMdd-HHmm')}.json`;
    a.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as ExportFormat[];
        const result = await processJSONImport(data);
        if (result.imported > 0) {
          alert(`Successfully imported ${result.imported} new items! (${result.skipped} duplicates skipped)`);
        } else {
          alert(`No new items to import. (${result.skipped} duplicates skipped)`);
        }
      } catch (err) {
        console.error(err);
        alert("Error parsing JSON file. Please ensure it is an array in the correct format.");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };


  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-6 border-b border-[#232936] pb-4">
        <FileJson className="w-6 h-6 text-indigo-500" />
        <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Import / Export JSON</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#0f121b] border border-[#232936] p-5 rounded-xl flex flex-col items-center justify-center text-center gap-3">
          <Upload className="w-8 h-8 text-blue-400" />
          <div>
            <h3 className="font-semibold text-gray-200">Import Log Data</h3>
            <p className="text-xs text-gray-500 mt-1">Upload a JSON array with action "in" and "out" records.</p>
          </div>
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            onChange={handleImport} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={loading}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors cursor-pointer"
          >
            {loading ? 'Importing...' : 'Select JSON File'}
          </button>
        </div>

        <div className="bg-[#0f121b] border border-[#232936] p-5 rounded-xl flex flex-col items-center justify-center text-center gap-3">
          <Download className="w-8 h-8 text-emerald-400" />
          <div>
            <h3 className="font-semibold text-gray-200">Export Log Data</h3>
            <p className="text-xs text-gray-500 mt-1">Download current account trades in JSON format.</p>
          </div>
          <button 
            onClick={handleExport}
            className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-6 rounded-lg transition-colors cursor-pointer"
          >
            Download JSON
          </button>
        </div>
      </div>

      <div className="mt-8 bg-[#0f121b] border border-[#232936] p-5 rounded-xl">
        <h3 className="font-semibold text-gray-200 flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-indigo-400" /> Raw MT5 Log Converter
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Paste your tab-separated raw MT5 log data below to convert it to JSON format and import.
        </p>
        
        <div className="flex flex-col gap-3">
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder={"Paste raw MT5 log data here (tab-separated):\n2026.03.18 00:03:35\t14120073933\tbuy\t0.10\tXAUUSDc\t..."}
            className="w-full h-52 bg-[#0b0e14] border border-[#232936] rounded-lg p-3 text-xs text-gray-300 font-mono focus:outline-none focus:border-indigo-500 resize-none"
          />
          <button
            onClick={async () => {
              if (!rawText.trim()) return;
              const lines = rawText.trim().split('\n');
              const result: ExportFormat[] = [];
              for (const line of lines) {
                if (!line.trim()) continue;
                const parts = line.split('\t');
                if (parts.length >= 8) {
                  const type = parts[2]?.trim().toLowerCase();
                  if (type === 'balance') {
                    const profitStr = parts[12] ? parts[12].replace(/\s/g, '') : '0';
                    result.push({ timestamp: parts[0]?.trim(), type: 'balance', lots: 0, symbol: '', price: 0, action: 'balance', profit: parseFloat(profitStr) || 0, note: parts[7]?.trim() });
                    continue;
                  }
                  if (type !== 'buy' && type !== 'sell') continue;
                  const action = parts[8]?.trim().toLowerCase();
                  if (action !== 'in' && !action?.startsWith('out')) continue;
                  const commission = parseFloat(parts[9]?.replace(/\s/g, '') || '0') || 0;
                  const taxes      = parseFloat(parts[10]?.replace(/\s/g, '') || '0') || 0;
                  const swap       = parseFloat(parts[11]?.replace(/\s/g, '') || '0') || 0;
                  const rawProfit  = parseFloat(parts[12]?.replace(/\s/g, '') || '0') || 0;
                  result.push({ timestamp: parts[0]?.trim(), type, lots: parseFloat(parts[3]) || 0, symbol: parts[4]?.trim(), price: parseFloat(parts[5]) || 0, action, profit: Number((rawProfit + commission + taxes + swap).toFixed(2)), rawProfit });
                }
              }
              if (result.length === 0) { alert('No valid trade rows found. Check your log format.'); return; }
              setLoading(true);
              try {
                const res = await processJSONImport(result);
                if (res.imported > 0) { alert(`Imported ${res.imported} new items! (${res.skipped} duplicates skipped)`); setRawText(''); }
                else { alert(`No new items to import. (${res.skipped} duplicates skipped)`); }
              } catch (err) { console.error(err); alert('Import failed. Check the log format.'); }
              finally { setLoading(false); }
            }}
            disabled={loading || !rawText.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-6 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? 'Importing...' : <><ArrowRight className="w-4 h-4" /> Import</>}
          </button>
        </div>
      </div>
    </div>
  );
};

