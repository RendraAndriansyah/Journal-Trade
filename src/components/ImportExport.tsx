import React, { useRef, useState } from 'react';
import { Download, Upload, FileJson, FileText, ArrowRight } from 'lucide-react';
import { db } from '../db';
import type { Trade } from '../types';
import { calculatePips } from '../utils/calculations';
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
  note?: string;
}

export const ImportExport = ({ accountId }: { accountId: string }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [rawText, setRawText] = useState('');
  const [parsedJson, setParsedJson] = useState('');

  const processJSONImport = async (data: ExportFormat[]) => {
    const pendingIn: ExportFormat[] = [];
    const newTrades: Trade[] = [];
    const newBalanceLogs: any[] = [];
    
    const existingTrades = await db.trades.where('accountId').equals(accountId).toArray();
    const existingBalances = await db.balanceLogs.where('accountId').equals(accountId).toArray();
    
    const unmatchedTrades = [...existingTrades];
    const unmatchedBalances = [...existingBalances];

    let skippedCount = 0;

    for (const record of data) {
      if (record.type === 'balance' || record.action === 'balance') {
        const [datePart, timePart] = record.timestamp.split(' ');
        const formattedDate = datePart.replace(/\./g, '-');
        const isoDateTime = new Date(`${formattedDate}T${timePart}Z`).toISOString();
        
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
        pendingIn.push(record);
      } else if (record.action === 'out' || record.action === 'out ') {
        const expectedInType = record.type === 'buy' ? 'sell' : 'buy';
        let inIdx = pendingIn.findIndex(p => p.symbol === record.symbol && p.type === expectedInType);
        
        if (inIdx === -1) {
            inIdx = pendingIn.findIndex(p => p.symbol === record.symbol);
        }
        
        let entryPrice = record.price;
        if (inIdx !== -1) {
          entryPrice = pendingIn[inIdx].price;
          pendingIn.splice(inIdx, 1);
        }

        const [datePart, timePart] = record.timestamp.split(' ');
        const formattedDate = datePart.replace(/\./g, '-');
        const isoDateTime = new Date(`${formattedDate}T${timePart}Z`).toISOString();
        
        const tradeType: 'Buy' | 'Sell' = record.type === 'buy' ? 'Sell' : 'Buy';
        const calcPips = calculatePips(entryPrice, record.price, tradeType, record.symbol);
        
        const tObj = {
          id: uuidv4(),
          accountId,
          dateTime: isoDateTime,
          pair: record.symbol,
          type: tradeType,
          entryPrice,
          closingPrice: record.price,
          lotSize: record.lots,
          pips: calcPips,
          pnl: record.profit,
          rrRatio: null
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
        profit: t.pnl
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

  const handleConvertRaw = () => {
    if (!rawText.trim()) return;
    
    const lines = rawText.trim().split('\n');
    const result: ExportFormat[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      
      if (parts.length >= 8) {
        const type = parts[2]?.trim().toLowerCase();
        
        if (type === 'balance') {
          const timestamp = parts[0]?.trim();
          const profitStr = parts[12] ? parts[12].replace(/\s/g, '') : "0";
          const amount = parseFloat(profitStr) || 0;
          
          result.push({
            timestamp,
            type: 'balance',
            lots: 0,
            symbol: '',
            price: 0,
            action: 'balance',
            profit: amount,
            note: parts[7]?.trim()
          });
          continue;
        }

        if (type !== 'buy' && type !== 'sell') continue;
        
        const timestamp = parts[0]?.trim();
        const lots = parseFloat(parts[3]) || 0;
        const symbol = parts[4]?.trim();
        const price = parseFloat(parts[5]) || 0;
        
        const action = parts[8]?.trim().toLowerCase();
        if (action !== 'in' && action !== 'out') continue;

        const profitStr = parts[12] ? parts[12].replace(/\s/g, '') : "0";
        const profit = parseFloat(profitStr) || 0;

        result.push({
          timestamp,
          type,
          lots,
          symbol,
          price,
          action,
          profit
        });
      }
    }
    
    setParsedJson(JSON.stringify(result, null, 2));
  };

  const handleImportParsed = async () => {
    if (!parsedJson) return;
    setLoading(true);
    try {
      const data = JSON.parse(parsedJson) as ExportFormat[];
      const result = await processJSONImport(data);
      if (result.imported > 0) {
        alert(`Successfully imported ${result.imported} new trades from converted text! (${result.skipped} duplicates skipped)`);
        setRawText('');
        setParsedJson('');
      } else {
        alert(`No new items to import from JSON text. (${result.skipped} duplicates skipped)`);
      }
    } catch {
      alert('Invalid JSON text format in the converted result.');
    } finally {
      setLoading(false);
    }
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
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="Paste raw log data here (2026.03.18 00:03:35	14120073933	buy...)"
              className="w-full h-48 bg-[#0b0e14] border border-[#232936] rounded-lg p-3 text-xs text-gray-300 font-mono focus:outline-none focus:border-indigo-500 resize-none"
            />
            <button 
              onClick={handleConvertRaw}
              disabled={!rawText.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              Parse to JSON <ArrowRight className="w-4 h-4"/>
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <textarea
              value={parsedJson}
              onChange={e => setParsedJson(e.target.value)}
              placeholder="Converted JSON preview will appear here..."
              className="w-full h-48 bg-[#0b0e14] border border-[#232936] rounded-lg p-3 text-xs text-emerald-400/80 font-mono focus:outline-none focus:border-emerald-500 resize-none whitespace-pre"
            />
            <button 
              onClick={handleImportParsed}
              disabled={loading || !parsedJson.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
            >
              {loading ? 'Importing...' : 'Confirm JSON & Import Data'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
