import { useMemo, useState } from 'react';
import type { Trade, Account, BalanceLog } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { TrendingUp, TrendingDown, Layers, Wallet, BarChart3, Activity, BarChart2, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  format, parseISO,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths
} from 'date-fns';
import { groupTradesIntoLayers } from '../utils/calculations';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';
import type { DailyNote } from '../types';
import { StickyNote, X, Save, MessageSquare, PlusCircle } from 'lucide-react';
import { formatCurrencyValue, formatCurrencyWithSign, getCurrencySymbol } from '../utils/currency';

interface DashboardProps {
  trades: Trade[];
  account: Account;
  balanceLogs: BalanceLog[];
  dailyNotes: DailyNote[];
}

// ─── P&L Calendar ───────────────────────────────────────────────────────────
const PnLCalendar = ({ trades, dailyNotes, accountId, currency }: { trades: Trade[]; dailyNotes: DailyNote[]; accountId: string; currency: string }) => {
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  const pnlByDate = useMemo(() => {
    const map: Record<string, number> = {};
    trades.forEach(t => {
      const key = format(parseISO(t.dateTime), 'yyyy-MM-dd');
      map[key] = (map[key] ?? 0) + t.pnl;
    });
    return map;
  }, [trades]);

  const notesByDate = useMemo(() => {
    const map: Record<string, DailyNote> = {};
    dailyNotes.forEach(n => { map[n.date] = n; });
    return map;
  }, [dailyNotes]);

  const monthStart = startOfMonth(viewDate);
  const monthEnd   = endOfMonth(viewDate);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: 1 });
  const allDays    = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const handleDateClick = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const existingNote = notesByDate[dateKey];
    setSelectedDate(day);
    setNoteContent(existingNote?.content || '');
    setIsNoteModalOpen(true);
  };

  const handleSaveNote = async () => {
    if (!selectedDate) return;
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const existingNote = notesByDate[dateKey];
    if (existingNote) {
      await db.dailyNotes.update(existingNote.id, { content: noteContent, updatedAt: new Date().toISOString() });
    } else {
      await db.dailyNotes.add({
        id: uuidv4(), accountId, date: dateKey, content: noteContent,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    setIsNoteModalOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setViewDate(d => subMonths(d, 1))}
          className="p-2 rounded-lg border transition-colors"
          style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--bg-base)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex flex-col items-center">
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{format(viewDate, 'MMMM yyyy')}</span>
          <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-faint)' }}>Trading Dairy Diary</span>
        </div>
        <button
          onClick={() => setViewDate(d => addMonths(d, 1))}
          className="p-2 rounded-lg border transition-colors"
          style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--bg-base)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[560px]"
             style={{ borderTop: '1px solid var(--border-muted)', borderLeft: '1px solid var(--border-muted)' }}>
          {DAY_HEADERS.map(h => (
            <div key={h} className="text-center text-[10px] font-bold uppercase py-2"
                 style={{ color: 'var(--text-faint)', backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-muted)', borderRight: '1px solid var(--border-muted)' }}>
              {h}
            </div>
          ))}

          {allDays.map(day => {
            const key   = format(day, 'yyyy-MM-dd');
            const pnl   = pnlByDate[key];
            const note  = notesByDate[key];
            const isCurrentMonth = isSameMonth(day, viewDate);
            const today = isToday(day);
            const hasPnl  = pnl !== undefined;
            const isProfit = hasPnl && pnl > 0;
            const isLoss   = hasPnl && pnl < 0;

            return (
              <div
                key={key}
                onClick={() => handleDateClick(day)}
                className="min-h-[84px] p-2 flex flex-col justify-between cursor-pointer group relative transition-colors"
                style={{
                  borderBottom: '1px solid var(--border-muted)',
                  borderRight:  '1px solid var(--border-muted)',
                  opacity: !isCurrentMonth ? 0.2 : 1,
                  backgroundColor: today
                    ? 'rgba(59,130,246,0.05)'
                    : isProfit
                    ? 'rgba(16,185,129,0.05)'
                    : isLoss
                    ? 'rgba(244,63,94,0.05)'
                    : undefined,
                  outline: today ? '1px solid rgba(59,130,246,0.2)' : undefined,
                  outlineOffset: '-1px',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = today ? 'rgba(59,130,246,0.05)' : isProfit ? 'rgba(16,185,129,0.05)' : isLoss ? 'rgba(244,63,94,0.05)' : '')}
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold leading-none" style={{ color: today ? '#60a5fa' : isCurrentMonth ? 'var(--text-muted)' : 'var(--text-faint)' }}>
                    {format(day, 'd')}
                  </span>
                  {note && (
                    <div className="text-indigo-400" title={note.content}>
                      <StickyNote className="w-3 h-3" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-end h-full mt-1">
                  {hasPnl ? (
                    <div>
                      <span className={`block text-sm font-bold font-mono leading-tight ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrencyWithSign(pnl, currency)}
                      </span>
                      <div className={`mt-1 h-1 rounded-full w-full ${isProfit ? 'bg-emerald-500/40' : 'bg-rose-500/40'}`} />
                    </div>
                  ) : (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-center">
                       <PlusCircle className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-[10px] pt-1" style={{ color: 'var(--text-muted)' }}>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 inline-block" /> Profit</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500/30 inline-block" /> Loss</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm ring-1 ring-blue-500/30 inline-block" /> Today</span>
          <span className="flex items-center gap-1.5"><StickyNote className="w-2.5 h-2.5 text-indigo-400" /> Note</span>
        </div>
        <span className="italic font-medium tracking-tight" style={{ color: 'var(--text-faint)' }}>Click date to add trade diary note</span>
      </div>

      {/* Note Modal */}
      {isNoteModalOpen && selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
               style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-overlay)' }}>
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/20 p-2 rounded-xl">
                  <StickyNote className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Daily Trade Diary</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{format(selectedDate, 'EEEE, dd MMMM yyyy')}</p>
                </div>
              </div>
              <button onClick={() => setIsNoteModalOpen(false)}
                      className="p-2 rounded-full transition-colors" style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.1)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>What happened today?</span>
                </div>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Today I feel..."
                  className="w-full h-48 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none shadow-inner"
                  style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setIsNoteModalOpen(false)}
                        className="flex-1 px-4 py-3 rounded-xl font-semibold transition-colors"
                        style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  Cancel
                </button>
                <button onClick={handleSaveNote}
                        className="flex-[2] px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-95">
                  <Save className="w-4 h-4" /> Save Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export const Dashboard: React.FC<DashboardProps> = ({ trades, account, balanceLogs, dailyNotes }) => {
  const [dayView, setDayView] = useState<'bar' | 'calendar'>('bar');

  const stats = useMemo(() => {
    const positions = groupTradesIntoLayers(trades);
    let winCount = 0, beCount = 0, netPnL = 0, totalWinSize = 0, totalLossSize = 0;
    const pnlByDateMap: Record<string, number> = {};
    let currentBalance = account.initialBalance, peakBalance = account.initialBalance, maxDrawdown = 0;

    // Split balance logs: Compensation is tracked separately so it can reduce netPnL
    const compensationTotal = balanceLogs
      .filter(b => b.type === 'Compensation')
      .reduce((sum, b) => sum + b.amount, 0);

    const timeline = [
      ...trades.map(t => ({ date: t.dateTime, pnl: t.pnl, type: 'trade' as const, obj: t })),
      ...balanceLogs.map(b => ({
        date: b.dateTime,
        // Compensation = positive credit to balance; Withdrawal = negative
        amount: b.type === 'Withdrawal' ? -b.amount : b.amount,
        type: 'balance' as const,
        obj: b
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const chartData: { date: string; balance: number; pnl: number }[] = [];
    if (timeline.length === 0) chartData.push({ date: format(new Date(), 'MMM dd HH:mm'), balance: currentBalance, pnl: 0 });

    timeline.forEach(event => {
      let currentPnl = 0;
      if (event.type === 'trade') {
        const pnl = event.pnl;
        currentPnl = pnl;
        currentBalance += pnl;
        netPnL += pnl;
        const tr = event.obj as Trade;
        const dateKey = format(parseISO(tr.dateTime), 'yyyy-MM-dd');
        pnlByDateMap[dateKey] = (pnlByDateMap[dateKey] ?? 0) + pnl;
      } else if (event.type === 'balance') {
        currentBalance += event.amount;
      }
      if (currentBalance > peakBalance) peakBalance = currentBalance;
      const drawdown = peakBalance - currentBalance;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      chartData.push({ date: format(parseISO(event.date), 'MMM dd HH:mm'), balance: currentBalance, pnl: currentPnl });
    });

    const beThreshold = account.currency.includes('IDR') || account.currency.includes('Rp') ? 20000 : 20;
    for (const pos of positions) {
      if (Math.abs(pos.totalPnl) < beThreshold) beCount++;
      else if (pos.totalPnl > 0) { winCount++; totalWinSize += pos.totalPnl; }
      else if (pos.totalPnl < 0) { totalLossSize += Math.abs(pos.totalPnl); }
    }

    // Net P&L = trading result + broker compensation received
    netPnL = positions.reduce((s, p) => s + p.totalPnl, 0) + compensationTotal;
    const lossCount = positions.length - winCount - beCount;
    const totalDecisiveTrades = winCount + lossCount;
    const winRate = totalDecisiveTrades > 0 ? (winCount / totalDecisiveTrades) * 100 : 0;
    const avgWin  = winCount  > 0 ? totalWinSize  / winCount  : 0;
    const avgLoss = lossCount > 0 ? totalLossSize / lossCount : 0;
    const dayPerformance = Object.keys(pnlByDateMap).sort().map(key => ({
      day: format(parseISO(key), 'MMM dd'),
      pnl: parseFloat(pnlByDateMap[key].toFixed(2))
    }));

    return { netPnL, winRate, totalTrades: positions.length, winCount, beCount, lossCount, currentBalance, avgWin, avgLoss, maxDrawdown, chartData, dayPerformance };
  }, [trades, account, balanceLogs]);

  // Tooltip bg adapts via inline style (CSS vars don't work in recharts contentStyle directly, so we use a fixed dark style)
  const tooltipStyle = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)', borderRadius: '8px' };
  const tooltipItemStyle = { color: 'var(--text-primary)' };

  return (
    <div className="space-y-6">
      {/* Top Value Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Balance */}
        <div className="card border-l-4 border-l-blue-500 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2" style={{ color: 'var(--text-muted)' }}>
            <span className="text-sm font-semibold uppercase">Total Balance</span>
            <Wallet className="w-5 h-5 opacity-50" />
          </div>
          <div className="text-3xl font-bold font-mono tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
            {formatCurrencyValue(stats.currentBalance, account.currency)}
          </div>
          <div className="text-xs text-blue-400/80">Account Equity · <span className="font-semibold">{account.currency}</span></div>
        </div>

        {/* Net PnL */}
        <div className={`card border-l-4 overflow-hidden relative ${stats.netPnL >= 0 ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            {stats.netPnL >= 0 ? <TrendingUp className="w-16 h-16"/> : <TrendingDown className="w-16 h-16"/>}
          </div>
          <div className="flex items-center justify-between mb-2" style={{ color: 'var(--text-muted)' }}>
            <span className="text-sm font-semibold uppercase">Net PnL</span>
            <Activity className="w-5 h-5 opacity-50" />
          </div>
          <div className={`text-3xl font-bold font-mono tracking-tight mb-1 ${stats.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrencyWithSign(stats.netPnL, account.currency)}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total accumulated profit/loss</div>
        </div>

        {/* Win Rate */}
        <div className="card border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between mb-2" style={{ color: 'var(--text-muted)' }}>
            <span className="text-sm font-semibold uppercase">Win Rate</span>
            <BarChart3 className="w-5 h-5 opacity-50" />
          </div>
          <div className="text-3xl font-bold font-mono tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
            {stats.winRate.toFixed(1)}%
          </div>
          <div className="w-full rounded-full h-1.5 mt-2" style={{ backgroundColor: 'var(--bg-base)' }}>
            <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${stats.winRate}%` }} />
          </div>
        </div>

        {/* Total Trades */}
        <div className="card border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between mb-2" style={{ color: 'var(--text-muted)' }}>
            <span className="text-sm font-semibold uppercase">Total Trades</span>
            <Layers className="w-5 h-5 opacity-50" />
          </div>
          <div className="text-3xl font-bold font-mono tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
            {stats.totalTrades}
          </div>
          <div className="text-xs text-amber-500/80">Total Trades</div>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equity Curve */}
        <div className="card lg:col-span-2">
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <Activity className="w-5 h-5 text-blue-500"/> Equity Curve
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-faint)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-faint)" fontSize={10} tickFormatter={(value: number) => `${getCurrencySymbol(account.currency)}${value}`} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`${getCurrencySymbol(account.currency)}${Number(value).toFixed(2)}`, 'Balance']}
                />
                <Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={3}
                  dot={{ r: 2, fill: '#3b82f6', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#60a5fa', stroke: 'var(--bg-surface)', strokeWidth: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="space-y-4">
          <div className="card flex flex-col justify-center h-full gap-4" style={{ backgroundColor: 'var(--bg-raised)' }}>
            <h3 className="font-semibold pb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
              <BarChart3 className="w-4 h-4 text-emerald-500"/> Performance Metrics
            </h3>

            <div className="flex justify-between items-center p-3 rounded-lg border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/10 p-2 rounded-md">
                  <TrendingUp className="w-4 h-4 text-emerald-500"/>
                </div>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Avg Profit</span>
              </div>
              <span className="font-mono text-emerald-400">{formatCurrencyValue(stats.avgWin, account.currency)}</span>
            </div>

            <div className="flex justify-between items-center p-3 rounded-lg border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="bg-rose-500/10 p-2 rounded-md">
                  <TrendingDown className="w-4 h-4 text-rose-500"/>
                </div>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Avg Loss</span>
              </div>
              <span className="font-mono text-rose-400">{formatCurrencyWithSign(-stats.avgLoss, account.currency)}</span>
            </div>

            {/* Profit / Loss Pie */}
            <div className="rounded-lg border p-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <p className="text-xs font-medium uppercase mb-3 text-center pl-12" style={{ color: 'var(--text-muted)' }}>Profit / Loss</p>
              <div className="flex items-center justify-between gap-2">
                <div className='flex flex-col gap-3'>
                  <div className="flex items-center gap-1.5">
                    <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-emerald-500" />
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-emerald-400 leading-none">{stats.winCount}</span>
                      <span className="text-[10px] text-emerald-600/80 mt-1 leading-none">Profit</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-1 bg-slate-400 rounded-sm" />
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-300 leading-none">{stats.beCount}</span>
                      <span className="text-[10px] text-slate-500 mt-1 leading-none">BE</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-rose-500" />
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-rose-400 leading-none">{stats.lossCount}</span>
                      <span className="text-[10px] text-rose-600/80 mt-1 leading-none">Loss</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-[80px]">
                  <ResponsiveContainer width="100%" height={100}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Profit', value: stats.winCount  || 0 },
                          { name: 'BE',     value: stats.beCount || 0 },
                          { name: 'Loss',   value: stats.lossCount || 0 },
                        ].filter(d => d.value > 0)}
                        startAngle={90} endAngle={450}
                        cx="50%" cy="50%"
                        innerRadius={28} outerRadius={44}
                        paddingAngle={3}
                        dataKey="value" strokeWidth={0}
                      >
                        {[
                          { name: 'Profit', value: stats.winCount },
                          { name: 'BE',     value: stats.beCount },
                          { name: 'Loss',   value: stats.lossCount }
                        ].filter(d => d.value > 0).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.name === 'Profit' ? '#10b981' : entry.name === 'BE' ? '#94a3b8' : '#f43f5e'} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: '11px' }}
                        itemStyle={tooltipItemStyle}
                        formatter={(value: any) => [`${value} trades`]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-[10px] text-center text-yellow-600 mt-1 pl-12">
                RR Estimate: 1:{stats.avgLoss ? (stats.avgWin / stats.avgLoss).toFixed(2) : '–'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Profitability Panel — Bar Chart ↔ Calendar */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <Layers className="w-5 h-5 text-indigo-500"/>
            {dayView === 'bar' ? 'Profitability by Date' : 'P&L Calendar'}
          </h3>
          <div className="flex gap-1 rounded-lg p-1 self-start sm:self-auto border" style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)' }}>
            <button
              onClick={() => setDayView('bar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                dayView === 'bar' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : ''
              }`}
              style={dayView !== 'bar' ? { color: 'var(--text-muted)' } : undefined}
            >
              <BarChart2 className="w-3.5 h-3.5" /> Bar Chart
            </button>
            <button
              onClick={() => setDayView('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                dayView === 'calendar' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : ''
              }`}
              style={dayView !== 'calendar' ? { color: 'var(--text-muted)' } : undefined}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Calendar
            </button>
          </div>
        </div>

        {dayView === 'bar' && (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.dayPerformance} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--text-faint)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-faint)" fontSize={10} tickFormatter={(val: number) => `${getCurrencySymbol(account.currency)}${val}`} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--hover-bg)', opacity: 0.4 }}
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`${getCurrencySymbol(account.currency)}${Number(value).toFixed(2)}`, 'PnL']}
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {stats.dayPerformance.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {dayView === 'calendar' && <PnLCalendar trades={trades} dailyNotes={dailyNotes} accountId={account.id} currency={account.currency} />}
      </div>
    </div>
  );
};
