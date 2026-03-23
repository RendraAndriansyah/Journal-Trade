import { useState, useMemo } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO, isToday, startOfDay } from 'date-fns';
import { ArrowUpRight, ArrowDownRight, Trash2, Filter } from 'lucide-react';
import type { Trade } from '../types';

interface Props {
  accountId: string;
}

export const TradeHistory = ({ accountId }: Props) => {
  const [dateFilter, setDateFilter] = useState<'today' | 'lastDay' | 'all' | 'custom'>('lastDay');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const rawTrades = useLiveQuery(() => 
    db.trades.where('accountId').equals(accountId).reverse().sortBy('dateTime')
  , [accountId]) || [];

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this trade?')) {
      await db.trades.delete(id);
    }
  };

  let filteredTrades = [...rawTrades];

  // Find the last day that actually has trades (for 'lastDay' filter)
  const lastTradingDate = useMemo(() => {
    if (!rawTrades.length) return null;
    // Sort descending and pick the date of the newest trade
    const sorted = [...rawTrades].sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
    return startOfDay(new Date(sorted[0].dateTime));
  }, [rawTrades]);

  const handleDeleteFiltered = async () => {
    if (filteredTrades.length === 0) return;
    if (window.confirm(`Are you sure you want to permanently delete these ${filteredTrades.length} displayed trades?`)) {
      const idsToDelete = filteredTrades.map(t => t.id);
      await db.trades.bulkDelete(idsToDelete);
    }
  };

  if (dateFilter === 'today') {
    filteredTrades = filteredTrades.filter(t => isToday(new Date(t.dateTime)));
  } else if (dateFilter === 'lastDay') {
    if (lastTradingDate) {
      filteredTrades = filteredTrades.filter(t => startOfDay(new Date(t.dateTime)).getTime() === lastTradingDate.getTime());
    }
  } else if (dateFilter === 'custom') {
    const start = new Date(`${startDate}T00:00:00`).getTime();
    const end = new Date(`${endDate}T23:59:59`).getTime();
    filteredTrades = filteredTrades.filter(t => {
      const time = new Date(t.dateTime).getTime();
      return time >= start && time <= end;
    });
  }

  // Default sort by Newest First
  filteredTrades.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

  return (
    <div className="card w-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-[#232936] pb-4">
        <h3 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent flex items-center gap-2">
          Trade History
        </h3>
        
        {filteredTrades.length > 0 && (
          <button 
            onClick={handleDeleteFiltered}
            title="Delete currently displayed trades"
            className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-lg text-xs font-semibold hover:bg-rose-500/20 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Wipe Displayed
          </button>
        )}
      </div>
      
      <div className="flex flex-row flex-wrap gap-3 mb-6 bg-[#0b0e14] p-4 rounded-xl border border-[#232936]">
        <div className="flex items-center text-gray-400 gap-2 pr-2 border-r border-[#232936]">
          <Filter className="w-4 h-4" /> <span className="text-sm font-medium hidden sm:inline">Filters</span>
        </div>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value as any)} className="bg-[#151a23] border border-[#232936] text-sm rounded-lg px-3 py-2 text-gray-300 outline-none w-full sm:w-auto">
          <option value="lastDay">Last Trading Day</option>
          <option value="today">Today</option>
          <option value="all">All Days</option>
          <option value="custom">Custom Period</option>
        </select>
        
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 w-full sm:w-auto basis-full sm:basis-auto order-last sm:order-none">
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              className="bg-[#151a23] border border-[#232936] text-sm rounded-lg px-2 py-2 text-gray-300 outline-none w-full sm:w-auto cursor-pointer" 
            />
            <span className="text-gray-500 text-xs">to</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              className="bg-[#151a23] border border-[#232936] text-sm rounded-lg px-2 py-2 text-gray-300 outline-none w-full sm:w-auto cursor-pointer" 
            />
          </div>
        )}
      </div>

      {filteredTrades.length === 0 ? (
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
                <th className="px-4 py-3 font-medium text-center">Notes</th>
                <th className="px-4 py-3 rounded-tr-lg font-medium text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232936]">
              {filteredTrades.map((trade: Trade) => (
                <tr key={trade.id} className="hover:bg-[#151a23] transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {format(parseISO(trade.dateTime), 'MMM dd, yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-200">
                    {trade.pair}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium capitalize
                      ${trade.type === 'Buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}
                    >
                      {trade.type === 'Buy' ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                      {trade.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-right text-gray-300">
                    {trade.lotSize.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-right text-gray-400">
                    {trade.entryPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-right text-gray-400">
                    {trade.closingPrice.toFixed(2)}
                  </td>
                  <td className={`px-4 py-3 text-sm font-mono text-right ${trade.pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {trade.pips >= 0 ? '+' : ''}{trade.pips}
                  </td>
                  <td className={`px-4 py-3 text-sm font-mono font-bold text-right ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {trade.pnl >= 0 ? '+' : '-'}${Math.abs(trade.pnl).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {trade.note && (
                      <span className="inline-flex items-center px-2 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold rounded-full whitespace-nowrap">
                        {trade.note}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={() => handleDelete(trade.id)}
                      className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/20 cursor-pointer"
                      title="Delete Trade"
                    >
                      <Trash2 className="w-4 h-4"/>
                    </button>
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
