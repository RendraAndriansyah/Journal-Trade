import Dexie, { type EntityTable } from 'dexie';
import type { Trade, Account, BalanceLog, DailyNote } from './types';

export class JournalDatabase extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  trades!: EntityTable<Trade, 'id'>;
  balanceLogs!: EntityTable<BalanceLog, 'id'>;
  dailyNotes!: EntityTable<DailyNote, 'id'>;

  constructor() {
    super('JournalTradeDatabase');
    this.version(2).stores({
      accounts: 'id, name',
      trades: 'id, accountId, dateTime',
      balanceLogs: 'id, accountId, dateTime',
      dailyNotes: 'id, accountId, date'
    });
  }
}

export const db = new JournalDatabase();
