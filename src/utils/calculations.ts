export const calculatePips = (
  entryPrice: number,
  closingPrice: number,
  type: 'Buy' | 'Sell',
  pair: string = 'XAU/USD'
): number => {
  // For Gold (XAU/USD), standard pip is typically 0.10 price movement
  // (though some brokers use 0.01 for points). 
  // User specifies: 1 pip = 0.10 price movement.
  let diff = 0;
  if (type === 'Buy') {
    diff = closingPrice - entryPrice;
  } else {
    diff = entryPrice - closingPrice;
  }
  
  if (pair === 'XAU/USD') {
    return parseFloat((diff / 0.10).toFixed(1));
  }
  
  // Basic fallback for standard forex pairs (usually 0.0001)
  return parseFloat((diff / 0.0001).toFixed(1));
};

export const calculatePnL = (pips: number, lotSize: number, pair: string = 'XAU/USD'): number => {
  if (pair === 'XAU/USD') {
    // For 1 lot of XAU/USD (100 oz), 1 pip = $10.
    return parseFloat((pips * lotSize * 10).toFixed(2));
  }
  // Fallback rough estimate for other pairs
  return parseFloat((pips * lotSize * 10).toFixed(2));
};

export const calculateRRRatio = (
  entryPrice: number,
  slPrice: number,
  tpPrice: number,
  type: 'Buy' | 'Sell'
): number | null => {
  if (!slPrice || !tpPrice) return null;
  
  let risk = 0;
  let reward = 0;

  if (type === 'Buy') {
    risk = entryPrice - slPrice;
    reward = tpPrice - entryPrice;
  } else {
    risk = slPrice - entryPrice;
    reward = entryPrice - tpPrice;
  }

  if (risk <= 0 || reward <= 0) return null;

  return parseFloat((reward / risk).toFixed(2));
};
