import Dexie, { type EntityTable } from 'dexie';
import type { Trade, Account, BalanceLog } from './types';

export class JournalDatabase extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  trades!: EntityTable<Trade, 'id'>;
  balanceLogs!: EntityTable<BalanceLog, 'id'>;

  constructor() {
    super('JournalTradeDatabase');
    this.version(1).stores({
      accounts: 'id, name',
      trades: 'id, accountId, dateTime',
      balanceLogs: 'id, accountId, dateTime'
    });
  }
}

export const db = new JournalDatabase();
