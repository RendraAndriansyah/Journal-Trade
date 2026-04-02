import { useState } from 'react';
import type { TradeType } from '../types';
import { calculatePips, calculatePnL, calculateRRRatio } from '../utils/calculations';
import { v4 as uuidv4 } from 'uuid';
import { Target, Activity, DollarSign, ListOrdered, Calendar, ArrowRightLeft, Calculator } from 'lucide-react';

import { formatCurrencyWithSign } from '../utils/currency';
import { db } from '../db';

interface TradeFormProps {
  accountId: string;
  currency: string;
  onTradeAdded?: () => void;
}

export const TradeForm: React.FC<TradeFormProps> = ({ accountId, currency, onTradeAdded }) => {
  const [dateTime, setDateTime] = useState(new Date().toISOString().slice(0, 16));
  const [pair, setPair] = useState('XAU/USD');
  const [type, setType] = useState<TradeType>('Buy');
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [closingPrice, setClosingPrice] = useState<string>('');
  const [lotSize, setLotSize] = useState<string>('0.1');
  const [slPrice, setSlPrice] = useState<string>('');
  const [tpPrice, setTpPrice] = useState<string>('');
  
  const ep = parseFloat(entryPrice) || 0;
  const cp = parseFloat(closingPrice) || 0;
  const ls = parseFloat(lotSize) || 0;
  const sl = parseFloat(slPrice) || 0;
  const tp = parseFloat(tpPrice) || 0;

  const pips = ep && cp ? calculatePips(ep, cp, type, pair) : 0;
  const pnl = ep && cp && ls ? calculatePnL(pips, ls, pair) : 0;
  const rrRatio = ep && sl && tp ? calculateRRRatio(ep, sl, tp, type) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryPrice || !closingPrice || !lotSize || !accountId) return;

    await db.trades.add({
      id: uuidv4(),
      accountId,
      dateTime,
      pair,
      type,
      entryPrice: parseFloat(entryPrice),
      closingPrice: parseFloat(closingPrice),
      lotSize: parseFloat(lotSize),
      slPrice: slPrice ? parseFloat(slPrice) : undefined,
      tpPrice: tpPrice ? parseFloat(tpPrice) : undefined,
      pips,
      pnl,
      rrRatio
    });

    if (onTradeAdded) onTradeAdded();
    setEntryPrice('');
    setClosingPrice('');
    setSlPrice('');
    setTpPrice('');
  };

  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <Activity className="w-6 h-6 text-blue-500" />
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Log New Trade</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="label-text flex items-center gap-1.5"><Calendar className="w-4 h-4"/> Date &amp; Time</label>
            <input type="datetime-local" value={dateTime} onChange={e => setDateTime(e.target.value)} className="input-field" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text flex items-center gap-1.5"><ArrowRightLeft className="w-4 h-4"/> Pair</label>
              <select value={pair} onChange={e => setPair(e.target.value)} className="input-field appearance-none cursor-pointer">
                <option value="XAU/USD">XAU/USD</option>
                <option value="EUR/USD">EUR/USD</option>
                <option value="GBP/USD">GBP/USD</option>
              </select>
            </div>
            <div>
              <label className="label-text flex items-center gap-1.5"><Target className="w-4 h-4"/> Type</label>
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <button type="button" onClick={() => setType('Buy')}
                        className={`flex-1 py-2 text-sm font-medium transition-all ${type === 'Buy' ? 'bg-emerald-500/10 text-emerald-400' : ''}`}
                        style={type !== 'Buy' ? { backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' } : undefined}>
                  Buy
                </button>
                <button type="button" onClick={() => setType('Sell')}
                        className={`flex-1 py-2 text-sm font-medium transition-all border-l ${type === 'Sell' ? 'bg-rose-500/10 text-rose-400' : ''}`}
                        style={type !== 'Sell' ? { backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)', borderColor: 'var(--border)' } : { borderColor: 'var(--border)' }}>
                  Sell
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="label-text flex items-center gap-1.5"><DollarSign className="w-4 h-4"/> Entry Price</label>
            <input type="number" step="0.01" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="e.g. 2000.50" className="input-field" required />
          </div>
          <div>
            <label className="label-text flex items-center gap-1.5"><DollarSign className="w-4 h-4"/> Closing Price</label>
            <input type="number" step="0.01" value={closingPrice} onChange={e => setClosingPrice(e.target.value)} placeholder="e.g. 2005.00" className="input-field" required />
          </div>

          <div>
            <label className="label-text">Stop Loss (Optional)</label>
            <input type="number" step="0.01" value={slPrice} onChange={e => setSlPrice(e.target.value)} placeholder="e.g. 1995.00" className="input-field" />
          </div>
          <div>
            <label className="label-text">Take Profit (Optional)</label>
            <input type="number" step="0.01" value={tpPrice} onChange={e => setTpPrice(e.target.value)} placeholder="e.g. 2020.00" className="input-field" />
          </div>

          <div className="md:col-span-2">
            <label className="label-text flex items-center gap-1.5"><ListOrdered className="w-4 h-4"/> Lot Size</label>
            <input type="number" step="0.01" value={lotSize} onChange={e => setLotSize(e.target.value)} placeholder="e.g. 0.10" className="input-field w-full md:w-1/2" required />
          </div>
        </div>

        {/* Real-time Calculation Display */}
        <div className="rounded-xl p-4 mt-6 border" style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
          <h3 className="text-xs uppercase font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <Calculator className="w-3.5 h-3.5"/> Auto-Calculations
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Pips</div>
              <div className={`text-xl font-mono font-medium ${pips > 0 ? 'text-emerald-400' : pips < 0 ? 'text-rose-400' : ''}`}
                   style={pips === 0 ? { color: 'var(--text-secondary)' } : undefined}>
                {pips > 0 ? '+' : ''}{pips}
              </div>
            </div>
            <div>
              <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Est. PnL</div>
              <div className={`text-xl font-mono font-medium ${pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-rose-400' : ''}`}
                   style={pnl === 0 ? { color: 'var(--text-secondary)' } : undefined}>
                {formatCurrencyWithSign(pnl, currency)}
              </div>
            </div>
            <div>
              <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>RR Ratio</div>
              <div className="text-xl font-mono font-medium text-blue-400">
                {rrRatio ? `1:${rrRatio}` : '-'}
              </div>
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full shadow-lg shadow-blue-900/20 py-3 mt-4">
          Save Trade to Journal
        </button>
      </form>
    </div>
  );
};
