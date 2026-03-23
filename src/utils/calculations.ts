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
  
  if (pair.toUpperCase().includes('XAU') || pair.toUpperCase().includes('GOLD')) {
    return parseFloat((diff / 0.10).toFixed(1));
  }
  
  // Basic fallback for standard forex pairs (usually 0.0001)
  return parseFloat((diff / 0.0001).toFixed(1));
};

export const calculatePnL = (pips: number, lotSize: number, pair: string = 'XAU/USD'): number => {
  if (pair.toUpperCase().includes('XAU') || pair.toUpperCase().includes('GOLD')) {
    // For 1 lot of XAU/USD (100 oz), 10 pips = $10. So 1 pip = $1 (Wait, user says 5025-5015 is 100 pips).
    // If difference is 10, pips = 100. For 1 lot, PnL = $1000. So PnL = pips * lotSize * 10
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

// ─── Position Grouping ────────────────────────────────────────────────────────
// Groups raw trade records into logical "positions" — partial closes that share
// the same open are merged into one position with aggregated PnL / lots.
export interface Position {
  trades: import('../types').Trade[];
  dateTime: string;
  pair: string;
  type: string;
  totalPnl: number;
  totalLots: number;
  entryPrice: number;
}

function extractOriginalLotsFromNote(note: string): number | null {
  const match = note.match(/Partial Close \([\d.]+\/([\d.]+) lots\)/);
  return match ? parseFloat(match[1]) : null;
}

export function groupTradesIntoPositions(trades: import('../types').Trade[]): Position[] {
  const partialGroups = new Map<string, import('../types').Trade[]>();
  const standalone: import('../types').Trade[] = [];

  for (const t of trades) {
    if (t.note && t.note.startsWith('Partial Close')) {
      const origLots = extractOriginalLotsFromNote(t.note);
      if (origLots !== null) {
        const key = `${t.dateTime}|${t.pair}|${t.type}|${origLots}`;
        if (!partialGroups.has(key)) partialGroups.set(key, []);
        partialGroups.get(key)!.push(t);
        continue;
      }
    }
    standalone.push(t);
  }

  const positions: Position[] = [];

  for (const t of standalone) {
    positions.push({
      trades: [t],
      dateTime: t.dateTime,
      pair: t.pair,
      type: t.type,
      totalPnl: t.pnl,
      totalLots: t.lotSize,
      entryPrice: t.entryPrice,
    });
  }

  for (const [, group] of partialGroups) {
    const totalLots = parseFloat(group.reduce((s, t) => s + t.lotSize, 0).toFixed(2));
    const totalPnl = parseFloat(group.reduce((s, t) => s + t.pnl, 0).toFixed(2));
    positions.push({
      trades: group,
      dateTime: group[0].dateTime,
      pair: group[0].pair,
      type: group[0].type,
      totalPnl,
      totalLots,
      entryPrice: group[0].entryPrice,
    });
  }

  return positions;
}

// ─── Layer Grouping ────────────────────────────────────────────────────────────
// Traders sometimes "layer" — opening multiple tickets in the same direction
// within a very short window (≤15 s). We treat those as one logical trade.
const LAYER_WINDOW_MS = 15_000;

export interface LayerGroup {
  positions: Position[];
  dateTime: string;   // earliest open time
  pair: string;
  type: string;
  totalPnl: number;
  totalLots: number;
  isLayer: boolean;   // true only when >1 position merged
}

function buildLayerGroup(positions: Position[]): LayerGroup {
  const totalLots = parseFloat(positions.reduce((s, p) => s + p.totalLots, 0).toFixed(2));
  const totalPnl  = parseFloat(positions.reduce((s, p) => s + p.totalPnl,  0).toFixed(2));
  return { positions, dateTime: positions[0].dateTime, pair: positions[0].pair,
    type: positions[0].type, totalPnl, totalLots, isLayer: positions.length > 1 };
}

export function groupPositionsIntoLayers(positions: Position[]): LayerGroup[] {
  if (positions.length === 0) return [];
  const sorted = [...positions].sort(
    (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
  );
  const layers: LayerGroup[] = [];
  let group: Position[] = [sorted[0]];
  let startMs = new Date(sorted[0].dateTime).getTime();
  for (let i = 1; i < sorted.length; i++) {
    const pos   = sorted[i];
    const posMs = new Date(pos.dateTime).getTime();
    if (pos.pair === group[0].pair && pos.type === group[0].type && posMs - startMs <= LAYER_WINDOW_MS) {
      group.push(pos);
    } else {
      layers.push(buildLayerGroup(group));
      group = [pos]; startMs = posMs;
    }
  }
  layers.push(buildLayerGroup(group));
  return layers;
}

/** Convenience: partial-close merge → layer merge in one call */
export function groupTradesIntoLayers(trades: import('../types').Trade[]): LayerGroup[] {
  return groupPositionsIntoLayers(groupTradesIntoPositions(trades));
}
