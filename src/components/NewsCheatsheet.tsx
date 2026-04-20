import React from 'react';
import { ArrowDownRight, ArrowUpRight, Newspaper, Activity } from 'lucide-react';

const newsData = [
  {
    id: 'nfp',
    name: 'Non-Farm Payrolls (NFP)',
    country: '🇺🇸 USA',
    description: 'Measures the change in the number of employed people during the previous month, excluding the farming industry. Highly volatile.',
    volatilityLevel: 'High',
    pipPrediction: '300-800 pips (Directional burst)',
    actualHigher: {
      condition: 'Actual > Forecast',
      usd: 'Bullish (Up)',
      gold: 'Bearish (Down)',
      reason: 'More jobs indicate a strong economy, increasing expectations of higher interest rates by the Fed.'
    },
    actualLower: {
      condition: 'Actual < Forecast',
      usd: 'Bearish (Down)',
      gold: 'Bullish (Up)',
      reason: 'Fewer jobs indicate economic weakness, leading to expectations of lower rates or stimulus.'
    }
  },
  {
    id: 'cpi',
    name: 'Consumer Price Index (CPI)',
    country: '🇺🇸 USA',
    description: 'Measures the change in the price of goods and services purchased by consumers. Primary indicator of overall inflation.',
    volatilityLevel: 'Extreme',
    pipPrediction: '400-1000 pips (Explosive momentum)',
    actualHigher: {
      condition: 'Actual > Forecast',
      usd: 'Bullish (Up)',
      gold: 'Bearish (Down)',
      reason: 'High inflation usually forces the central bank to hike interest rates to combat rising prices.'
    },
    actualLower: {
      condition: 'Actual < Forecast',
      usd: 'Bearish (Down)',
      gold: 'Bullish (Up)',
      reason: 'Lower inflation gives the central bank room to cut rates or keep them low.'
    }
  },
  {
    id: 'fomc',
    name: 'Interest Rate Decision (FOMC)',
    country: '🇺🇸 USA',
    description: 'The Federal Reserve decides on the benchmark interest rate. Includes the FOMC Press Conference.',
    volatilityLevel: 'Extreme',
    pipPrediction: '500-1200 pips (Multi-stage volatility)',
    actualHigher: {
      condition: 'Rate Hike (Hawkish)',
      usd: 'Bullish (Up)',
      gold: 'Bearish (Down)',
      reason: 'Higher yields attract foreign investment, increasing currency demand and hurting non-yielding assets like Gold.'
    },
    actualLower: {
      condition: 'Rate Cut (Dovish)',
      usd: 'Bearish (Down)',
      gold: 'Bullish (Up)',
      reason: 'Lower yields reduce currency attractiveness, pushing investors toward Gold as a safe haven.'
    }
  },
  {
    id: 'retail',
    name: 'Retail Sales',
    country: '🇺🇸 USA',
    description: 'Measures the change in the total value of sales at the retail level. Excellent indicator of consumer spending.',
    volatilityLevel: 'Medium',
    pipPrediction: '150-300 pips (Steady drift)',
    actualHigher: {
      condition: 'Actual > Forecast',
      usd: 'Bullish (Up)',
      gold: 'Bearish (Down)',
      reason: 'Strong spending signals a healthy, growing economy.'
    },
    actualLower: {
      condition: 'Actual < Forecast',
      usd: 'Bearish (Down)',
      gold: 'Bullish (Up)',
      reason: 'Weak spending signals economic slowdown.'
    }
  },
  {
    id: 'jobless',
    name: 'Initial Jobless Claims',
    country: '🇺🇸 USA',
    description: 'Number of individuals who filed for unemployment insurance for the first time. (Inverse impact)',
    volatilityLevel: 'Medium',
    pipPrediction: '150-350 pips (Brief spike)',
    actualHigher: {
      condition: 'Actual > Forecast',
      usd: 'Bearish (Down)',
      gold: 'Bullish (Up)',
      reason: 'Higher claims mean more unemployed people, pointing to a weakening economy.'
    },
    actualLower: {
      condition: 'Actual < Forecast',
      usd: 'Bullish (Up)',
      gold: 'Bearish (Down)',
      reason: 'Lower claims indicate a strong job market running at full capacity.'
    }
  },
  {
    id: 'ppi',
    name: 'Producer Price Index (PPI)',
    country: '🇺🇸 USA',
    description: 'Measures the change in the price of goods and services sold by producers. Leading indicator of consumer inflation.',
    volatilityLevel: 'Medium',
    pipPrediction: '150-400 pips (Moderate reaction)',
    actualHigher: {
      condition: 'Actual > Forecast',
      usd: 'Bullish (Up)',
      gold: 'Bearish (Down)',
      reason: 'Higher production costs are usually passed on to consumers, indicating impending inflation.'
    },
    actualLower: {
      condition: 'Actual < Forecast',
      usd: 'Bearish (Down)',
      gold: 'Bullish (Up)',
      reason: 'Lower producer costs ease overall inflation concerns.'
    }
  }
];

export const NewsCheatsheet = () => {
  return (
    <div className="card w-full mx-auto mb-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center space-x-2 mb-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <Newspaper className="w-6 h-6 text-purple-500" />
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Fundamental News Impact</h2>
      </div>

      <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        A simplified cheat sheet for high-impact economic events and their typical market reactions specifically for <strong>Gold (XAU)</strong>.
      </p>

      <div className="overflow-x-auto rounded-xl border hide-scrollbar" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead style={{ backgroundColor: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}>
            <tr>
              <th className="p-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Indicator</th>
              <th className="p-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Predicted Range</th>
              <th className="p-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Scenario 1</th>
              <th className="p-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Scenario 2</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y" style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)' }}>
            {newsData.map((news) => (
              <tr key={news.id} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                {/* Indicator */}
                <td className="p-4 align-top w-1/4">
                  <div className="font-bold text-[14px] mb-1" style={{ color: 'var(--text-primary)' }}>{news.name}</div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Heat:</span>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${news.volatilityLevel === 'Extreme' ? 'bg-rose-500/10 text-rose-500' : news.volatilityLevel === 'High' ? 'bg-orange-500/10 text-orange-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      {news.volatilityLevel}
                    </span>
                  </div>
                </td>
                
                {/* Range */}
                <td className="p-4 align-top w-[15%]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Activity className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-bold text-amber-500">{news.pipPrediction.split(' ')[0]}</span>
                  </div>
                  <div className="text-[11px] text-amber-500/70 font-semibold">{news.pipPrediction.split(' ').slice(1).join(' ')}</div>
                </td>

                {/* Scenario 1 */}
                <td className="p-4 align-top w-[30%]">
                  <div className="text-[10px] uppercase font-bold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{news.actualHigher.condition}</div>
                  <div className={`font-bold flex items-center gap-1 mb-2 text-[14px] ${news.actualHigher.gold.includes('Bullish') ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {news.actualHigher.gold.includes('Bullish') ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {news.actualHigher.gold}
                  </div>
                  <p className="text-[12px] leading-relaxed whitespace-normal pr-4" style={{ color: 'var(--text-muted)', maxWidth: '350px' }}>
                    {news.actualHigher.reason}
                  </p>
                </td>

                {/* Scenario 2 */}
                <td className="p-4 align-top w-[30%]">
                  <div className="text-[10px] uppercase font-bold tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{news.actualLower.condition}</div>
                  <div className={`font-bold flex items-center gap-1 mb-2 text-[14px] ${news.actualLower.gold.includes('Bullish') ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {news.actualLower.gold.includes('Bullish') ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {news.actualLower.gold}
                  </div>
                  <p className="text-[12px] leading-relaxed whitespace-normal pr-4" style={{ color: 'var(--text-muted)', maxWidth: '350px' }}>
                    {news.actualLower.reason}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
