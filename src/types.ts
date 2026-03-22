export type TradeType = 'Buy' | 'Sell';

export interface Account {
  id: string;
  name: string; // e.g., "Main USD", "USDC (cent)"
  currency: string; // e.g., "USD", "USDC"
  initialBalance: number;
  createdAt: string;
}

export interface Trade {
  id: string;
  accountId: string;
  dateTime: string;
  pair: string;
  type: TradeType;
  entryPrice: number;
  closingPrice: number;
  slPrice?: number;
  tpPrice?: number;
  lotSize: number;
  pips: number;
  pnl: number;
  rrRatio?: number | null;
}

export interface BalanceLog {
  id: string;
  accountId: string;
  dateTime: string;
  type: 'Deposit' | 'Withdrawal';
  amount: number;
  note?: string;
}
