import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, Info, Newspaper } from 'lucide-react';
import { useState } from 'react';

const newsData = [
  {
    id: 'nfp',
    name: 'Non-Farm Payrolls (NFP)',
    country: '🇺🇸 USA',
    description: 'Measures the change in the number of employed people during the previous month, excluding the farming industry. Highly volatile.',
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
  const [expandedId, setExpandedId] = useState<string | null>(newsData[0].id);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="card max-w-4xl mx-auto mb-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center space-x-2 mb-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <Newspaper className="w-6 h-6 text-purple-500" />
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Fundamental News Impact</h2>
      </div>

      <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Quick reference cheat sheet for high-impact economic events. Focuses on typical market reactions for the <strong>US Dollar (USD)</strong> and <strong>Gold (XAU)</strong>. Remember, markets can be unpredictable depending on the broader macroeconomic context.
      </p>

      <div className="space-y-4">
        {newsData.map((news) => {
          const isExpanded = expandedId === news.id;

          return (
            <div 
              key={news.id} 
              className={`rounded-xl border overflow-hidden transition-all duration-300 ${isExpanded ? 'shadow-md border-purple-500/30' : 'hover:border-purple-500/20'}`}
              style={{ backgroundColor: 'var(--bg-base)', borderColor: isExpanded ? '' : 'var(--border)' }}
            >
              {/* Header Toggle */}
              <button 
                onClick={() => toggleExpand(news.id)}
                className="w-full flex items-center justify-between p-4 text-left transition-colors"
                style={{ backgroundColor: isExpanded ? 'var(--bg-raised)' : 'transparent' }}
              >
                <div>
                  <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    {news.name}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{news.country} • Click to {isExpanded ? 'collapse' : 'expand'}</p>
                </div>
                <div className="p-2 rounded-full" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)' }}>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-purple-500" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </button>

              {/* Collapsible Content */}
              {isExpanded && (
                <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="mb-5 flex items-start gap-2 text-sm p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-purple-500" />
                    <span>{news.description}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Actual Higher Box */}
                    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                      <div className="text-xs uppercase font-bold tracking-wider mb-3 text-emerald-500 bg-emerald-500/10 inline-block px-2 py-1 rounded">
                        {news.actualHigher.condition}
                      </div>
                      <div className="flex gap-4 mb-3">
                        <div className="flex-1">
                          <div className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>USD Impact</div>
                          <div className={`font-semibold flex items-center gap-1.5 ${news.actualHigher.usd.includes('Bullish') ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {news.actualHigher.usd.includes('Bullish') ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            {news.actualHigher.usd}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>XAU/USD Impact</div>
                          <div className={`font-semibold flex items-center gap-1.5 ${news.actualHigher.gold.includes('Bullish') ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {news.actualHigher.gold.includes('Bullish') ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            {news.actualHigher.gold}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs italic leading-relaxed" style={{ color: 'var(--text-muted)' }}>"{news.actualHigher.reason}"</p>
                    </div>

                    {/* Actual Lower Box */}
                    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                      <div className="text-xs uppercase font-bold tracking-wider mb-3 text-rose-500 bg-rose-500/10 inline-block px-2 py-1 rounded">
                        {news.actualLower.condition}
                      </div>
                      <div className="flex gap-4 mb-3">
                        <div className="flex-1">
                          <div className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>USD Impact</div>
                          <div className={`font-semibold flex items-center gap-1.5 ${news.actualLower.usd.includes('Bullish') ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {news.actualLower.usd.includes('Bullish') ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            {news.actualLower.usd}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>XAU/USD Impact</div>
                          <div className={`font-semibold flex items-center gap-1.5 ${news.actualLower.gold.includes('Bullish') ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {news.actualLower.gold.includes('Bullish') ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            {news.actualLower.gold}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs italic leading-relaxed" style={{ color: 'var(--text-muted)' }}>"{news.actualLower.reason}"</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
