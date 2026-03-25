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

interface DashboardProps {
  trades: Trade[];
  account: Account;
  balanceLogs: BalanceLog[];
}

// ─── P&L Calendar ───────────────────────────────────────────────────────────
const PnLCalendar = ({ trades }: { trades: Trade[] }) => {
  const [viewDate, setViewDate] = useState(new Date());

  // Build a map: "yyyy-MM-dd" → total PnL
  const pnlByDate = useMemo(() => {
    const map: Record<string, number> = {};
    trades.forEach(t => {
      const key = format(parseISO(t.dateTime), 'yyyy-MM-dd');
      map[key] = (map[key] ?? 0) + t.pnl;
    });
    return map;
  }, [trades]);

  // Calendar grid: start Monday of the first week of the month
  const monthStart = startOfMonth(viewDate);
  const monthEnd   = endOfMonth(viewDate);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 }); // Mon
  const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: 1 }); // Sun
  const allDays    = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setViewDate(d => subMonths(d, 1))}
          className="p-2 rounded-lg bg-[#0b0e14] border border-[#232936] text-gray-400 hover:text-white hover:bg-[#232936] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-gray-200 font-semibold text-sm">
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setViewDate(d => addMonths(d, 1))}
          className="p-2 rounded-lg bg-[#0b0e14] border border-[#232936] text-gray-400 hover:text-white hover:bg-[#232936] transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[560px]">
          {/* Day headers */}
          {DAY_HEADERS.map(h => (
            <div key={h} className="text-center text-xs font-semibold text-gray-500 uppercase pb-2 border-b border-[#232936]">
              {h}
            </div>
          ))}

          {/* Day cells */}
          {allDays.map(day => {
            const key   = format(day, 'yyyy-MM-dd');
            const pnl   = pnlByDate[key];
            const isCurrentMonth = isSameMonth(day, viewDate);
            const today = isToday(day);

            const hasPnl  = pnl !== undefined;
            const isProfit = hasPnl && pnl > 0;
            const isLoss   = hasPnl && pnl < 0;

            return (
              <div
                key={key}
                className={`min-h-[72px] p-2 border-b border-r border-[#1c2130] flex flex-col justify-between
                  ${!isCurrentMonth ? 'opacity-30' : ''}
                  ${today ? 'ring-1 ring-inset ring-blue-500/40 bg-blue-500/5' : ''}
                  ${isProfit ? 'bg-emerald-500/5' : isLoss ? 'bg-rose-500/5' : ''}
                `}
              >
                {/* Date number */}
                <span className={`text-xs font-semibold leading-none
                  ${today ? 'text-blue-400' : isCurrentMonth ? 'text-gray-400' : 'text-gray-600'}
                `}>
                  {format(day, 'd')}
                </span>

                {/* PnL value */}
                {hasPnl && (
                  <div className="mt-1">
                    <span className={`block text-xs font-bold font-mono leading-tight
                      ${isProfit ? 'text-emerald-400' : 'text-rose-400'}
                    `}>
                      {isProfit ? '+' : ''}${pnl.toFixed(2)}
                    </span>
                    {/* Micro color bar */}
                    <div className={`mt-1 h-1 rounded-full w-full
                      ${isProfit ? 'bg-emerald-500/50' : 'bg-rose-500/50'}
                    `} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/50 inline-block" /> Profit day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/50 inline-block" /> Loss day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm ring-1 ring-blue-500/50 inline-block" /> Today
        </span>
      </div>
    </div>
  );
};

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export const Dashboard: React.FC<DashboardProps> = ({ trades, account, balanceLogs }) => {
  const [dayView, setDayView] = useState<'bar' | 'calendar'>('bar');

  const stats = useMemo(() => {
    const positions = groupTradesIntoLayers(trades);

    let winCount = 0;
    let netPnL = 0;
    let totalWinSize = 0;
    let totalLossSize = 0;

    // Aggregate P&L by actual calendar date (yyyy-MM-dd), then sort chronologically
    const pnlByDateMap: Record<string, number> = {};

    let currentBalance = account.initialBalance;
    let peakBalance    = account.initialBalance;
    let maxDrawdown    = 0;

    const timeline = [
      ...trades.map(t => ({ date: t.dateTime, pnl: t.pnl, type: 'trade' as const, obj: t })),
      ...balanceLogs.map(b => ({ date: b.dateTime, amount: b.type === 'Withdrawal' ? -b.amount : b.amount, type: 'balance' as const, obj: b }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const chartData: { date: string; balance: number; pnl: number }[] = [];

    if (timeline.length === 0) {
      chartData.push({ date: format(new Date(), 'MMM dd HH:mm'), balance: currentBalance, pnl: 0 });
    }

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

      chartData.push({
        date: format(parseISO(event.date), 'MMM dd HH:mm'),
        balance: currentBalance,
        pnl: currentPnl
      });
    });

    for (const pos of positions) {
      if (pos.totalPnl > 0) {
        winCount++;
        totalWinSize += pos.totalPnl;
      } else if (pos.totalPnl < 0) {
        totalLossSize += Math.abs(pos.totalPnl);
      }
    }

    netPnL = positions.reduce((s, p) => s + p.totalPnl, 0);

    const lossCount = positions.length - winCount;
    const winRate   = positions.length > 0 ? (winCount / positions.length) * 100 : 0;
    const avgWin    = winCount  > 0 ? totalWinSize  / winCount  : 0;
    const avgLoss   = lossCount > 0 ? totalLossSize / lossCount : 0;

    // Sort date keys chronologically → build bar chart array with label "Mar 20", "Mar 23" …
    const dayPerformance = Object.keys(pnlByDateMap)
      .sort()                                              // lexicographic on yyyy-MM-dd = chronological
      .map(key => ({
        day: format(parseISO(key), 'MMM dd'),             // e.g. "Mar 20"
        pnl: parseFloat(pnlByDateMap[key].toFixed(2))
      }));

    return {
      netPnL, winRate, totalTrades: positions.length, winCount,
      lossCount, currentBalance, avgWin, avgLoss, maxDrawdown,
      chartData, dayPerformance
    };
  }, [trades, account, balanceLogs]);

  return (
    <div className="space-y-6">
      {/* Top Value Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card border-l-4 border-l-blue-500 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-sm font-semibold uppercase">Total Balance</span>
            <Wallet className="w-5 h-5 opacity-50" />
          </div>
          <div className="text-3xl font-bold font-mono tracking-tight text-white mb-1">
            ${stats.currentBalance.toFixed(2)}
          </div>
          <div className="text-xs text-blue-400/80">Account Equity · <span className="font-semibold">{account.currency}</span></div>
        </div>

        <div className={`card border-l-4 overflow-hidden relative ${stats.netPnL >= 0 ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            {stats.netPnL >= 0 ? <TrendingUp className="w-16 h-16"/> : <TrendingDown className="w-16 h-16"/>}
          </div>
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-sm font-semibold uppercase">Net PnL</span>
            <Activity className="w-5 h-5 opacity-50" />
          </div>
          <div className={`text-3xl font-bold font-mono tracking-tight mb-1 ${stats.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {stats.netPnL > 0 ? '+' : ''}${stats.netPnL.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">Total accumulated profit/loss</div>
        </div>

        <div className="card border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-sm font-semibold uppercase">Win Rate</span>
            <BarChart3 className="w-5 h-5 opacity-50" />
          </div>
          <div className="text-3xl font-bold font-mono tracking-tight text-white mb-1">
            {stats.winRate.toFixed(1)}%
          </div>
          <div className="w-full bg-[#0b0e14] rounded-full h-1.5 mt-2">
            <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${stats.winRate}%` }}></div>
          </div>
        </div>

        <div className="card border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-sm font-semibold uppercase">Total Trades</span>
            <Layers className="w-5 h-5 opacity-50" />
          </div>
          <div className="text-3xl font-bold font-mono tracking-tight text-white mb-1">
            {stats.totalTrades}
          </div>
          <div className="text-xs text-amber-500/80">Total Trades</div>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equity Curve */}
        <div className="card lg:col-span-2">
          <h3 className="text-gray-300 font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500"/> Equity Curve
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232936" vertical={false} />
                <XAxis dataKey="date" stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#4b5563" fontSize={10} tickFormatter={(value: number) => `$${value}`} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#151a23', borderColor: '#232936', borderRadius: '8px' }}
                  itemStyle={{ color: '#e5e7eb' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Balance']}
                />
                <Line
                  type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={3}
                  dot={{ r: 2, fill: '#3b82f6', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#60a5fa', stroke: '#151a23', strokeWidth: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Metrics + Donut */}
        <div className="space-y-4">
          <div className="card bg-[#0f121b] flex flex-col justify-center h-full gap-4">
            <h3 className="text-gray-300 font-semibold border-b border-[#232936] pb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-500"/> Performance Metrics
            </h3>

            <div className="flex justify-between items-center bg-[#151a23] p-3 rounded-lg border border-[#232936]">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/10 p-2 rounded-md">
                  <TrendingUp className="w-4 h-4 text-emerald-500"/>
                </div>
                <span className="text-sm text-gray-300">Avg Profit</span>
              </div>
              <span className="font-mono text-emerald-400">${stats.avgWin.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center bg-[#151a23] p-3 rounded-lg border border-[#232936]">
              <div className="flex items-center gap-3">
                <div className="bg-rose-500/10 p-2 rounded-md">
                  <TrendingDown className="w-4 h-4 text-rose-500"/>
                </div>
                <span className="text-sm text-gray-300">Avg Loss</span>
              </div>
              <span className="font-mono text-rose-400">-${stats.avgLoss.toFixed(2)}</span>
            </div>

            {/* Profit / Loss Pie */}
            <div className="bg-[#151a23] rounded-lg border border-[#232936] p-3">
              <p className="text-xs text-gray-400 font-medium uppercase mb-3 text-center">Profit / Loss</p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col items-center gap-0.5 min-w-[52px]">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mb-1" />
                  <span className="text-xs font-semibold text-emerald-400">{stats.winCount}</span>
                  <span className="text-[10px] text-emerald-600/80">Profit</span>
                </div>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height={100}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Profit', value: stats.winCount  || 0 },
                          { name: 'Loss',   value: stats.lossCount || 0 },
                        ]}
                        startAngle={90} endAngle={450}
                        cx="50%" cy="50%"
                        innerRadius={28} outerRadius={44}
                        paddingAngle={stats.winCount > 0 && stats.lossCount > 0 ? 3 : 0}
                        dataKey="value" strokeWidth={0}
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#f43f5e" />
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#151a23', borderColor: '#232936', borderRadius: '8px', fontSize: '11px' }}
                        itemStyle={{ color: '#e5e7eb' }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any) => [`${value} trades`]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col items-center gap-0.5 min-w-[52px]">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500 mb-1" />
                  <span className="text-xs font-semibold text-rose-400">{stats.lossCount}</span>
                  <span className="text-[10px] text-rose-600/80">Loss</span>
                </div>
              </div>
              <p className="text-[10px] text-center text-yellow-600 mt-1">
                RR Estimate: 1:{stats.avgLoss ? (stats.avgWin / stats.avgLoss).toFixed(2) : '–'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Profitability Panel — Bar Chart ↔ Calendar */}
      <div className="card">
        {/* Panel header + tab switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <h3 className="text-gray-300 font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-500"/>
            {dayView === 'bar' ? 'Profitability by Date' : 'P&L Calendar'}
          </h3>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-[#0b0e14] border border-[#232936] rounded-lg p-1 self-start sm:self-auto">
            <button
              onClick={() => setDayView('bar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                dayView === 'bar'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-[#151a23]'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> Bar Chart
            </button>
            <button
              onClick={() => setDayView('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                dayView === 'calendar'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-[#151a23]'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Calendar
            </button>
          </div>
        </div>

        {/* Bar Chart view */}
        {dayView === 'bar' && (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats.dayPerformance}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#232936" vertical={false} />
                <XAxis dataKey="day" stroke="#4b5563" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#4b5563" fontSize={10} tickFormatter={(val: number) => `$${val}`} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: '#1f2937', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: '#151a23', borderColor: '#232936', borderRadius: '8px' }}
                  itemStyle={{ color: '#e5e7eb' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'PnL']}
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

        {/* Calendar view */}
        {dayView === 'calendar' && <PnLCalendar trades={trades} />}
      </div>
    </div>
  );
};
