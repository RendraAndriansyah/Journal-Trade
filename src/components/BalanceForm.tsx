import { useState } from 'react';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { Wallet, Target, DollarSign, ListOrdered, ArrowUpCircle, ArrowDownCircle, ShieldCheck, Calendar, Edit3, Trash2, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO } from 'date-fns';
import type { BalanceLog } from '../types';

import { formatCurrencyWithSign } from '../utils/currency';

interface Props {
  accountId: string;
  currency: string;
}

export const BalanceForm = ({ accountId, currency }: Props) => {
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'Deposit' | 'Withdrawal' | 'Compensation'>('Deposit');
  const [note, setNote] = useState('');
  const [dateTime, setDateTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const balanceLogs = useLiveQuery(() => 
    db.balanceLogs.where('accountId').equals(accountId).reverse().sortBy('dateTime')
  , [accountId]) || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !accountId || !dateTime) return;

    const isoDateTime = new Date(dateTime).toISOString();

    if (editingId) {
      await db.balanceLogs.update(editingId, {
        dateTime: isoDateTime,
        type,
        amount: parseFloat(amount),
        note
      });
      setEditingId(null);
    } else {
      await db.balanceLogs.add({
        id: uuidv4(),
        accountId,
        dateTime: isoDateTime,
        type,
        amount: parseFloat(amount),
        note
      });
    }

    setAmount('');
    setNote('');
    setDateTime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  };

  const handleEdit = (log: BalanceLog) => {
    setEditingId(log.id);
    setType(log.type);
    setAmount(log.amount.toString());
    setNote(log.note || '');
    setDateTime(format(parseISO(log.dateTime), "yyyy-MM-dd'T'HH:mm"));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setAmount('');
    setNote('');
    setDateTime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this balance transaction?')) {
      await db.balanceLogs.delete(id);
      if (editingId === id) {
        handleCancelEdit();
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center space-x-2 mb-6 border-b border-[#232936] pb-4">
          <Wallet className="w-6 h-6 text-indigo-500" />
          <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            {editingId ? 'Edit Balance Transaction' : 'Log Balance Transaction'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label-text flex items-center gap-1.5"><Target className="w-4 h-4"/> Transaction Type</label>
              <div className="flex rounded-lg overflow-hidden border border-[#232936]">
                <button
                  type="button"
                  onClick={() => setType('Deposit')}
                  className={`flex-1 py-2 text-sm font-medium transition-all ${type === 'Deposit' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#0b0e14] text-gray-500 hover:text-gray-300'}`}
                >
                  <ArrowUpCircle className="w-4 h-4 inline mr-1"/> Deposit
                </button>
                <button
                  type="button"
                  onClick={() => setType('Withdrawal')}
                  className={`flex-1 py-2 text-sm font-medium transition-all border-l border-[#232936] ${type === 'Withdrawal' ? 'bg-rose-500/10 text-rose-400' : 'bg-[#0b0e14] text-gray-500 hover:text-gray-300'}`}
                >
                  <ArrowDownCircle className="w-4 h-4 inline mr-1"/> Withdrawal
                </button>
                <button
                  type="button"
                  onClick={() => setType('Compensation')}
                  className={`flex-1 py-2 text-sm font-medium transition-all border-l border-[#232936] ${type === 'Compensation' ? 'bg-amber-500/10 text-amber-400' : 'bg-[#0b0e14] text-gray-500 hover:text-gray-300'}`}
                >
                  <ShieldCheck className="w-4 h-4 inline mr-1"/> Compensation
                </button>
              </div>
              {type === 'Compensation' && (
                <p className="text-[11px] text-amber-500/70 mt-1.5">
                  Broker negative-balance protection payout (e.g. MT5 stop-out compensation).
                </p>
              )}
            </div>

            <div>
              <label className="label-text flex items-center gap-1.5"><Calendar className="w-4 h-4"/> Date &amp; Time</label>
              <input 
                type="datetime-local" 
                value={dateTime} 
                onChange={e => setDateTime(e.target.value)}
                className="input-field"
                required 
              />
            </div>
            
            <div>
              <label className="label-text flex items-center gap-1.5"><DollarSign className="w-4 h-4"/> Amount</label>
              <input 
                type="number" 
                step="0.01"
                min="0.01"
                value={amount} 
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 500.00"
                className="input-field"
                required 
              />
            </div>

            <div>
              <label className="label-text flex items-center gap-1.5"><ListOrdered className="w-4 h-4"/> Note (Optional)</label>
              <input 
                type="text" 
                value={note} 
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Funding account"
                className="input-field"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            {editingId && (
              <button 
                type="button" 
                onClick={handleCancelEdit}
                className="w-1/3 bg-[#232936] hover:bg-[#2c3343] text-gray-300 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            )}
            <button 
              type="submit" 
              className={`btn-primary shadow-lg shadow-blue-900/20 py-3 flex-1 cursor-pointer`}
            >
              {editingId ? 'Update Transaction' : 'Log Transaction'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
         <h3 className="text-gray-300 font-semibold mb-4 border-b border-[#232936] pb-3">Recent Transactions</h3>
         <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
           {balanceLogs.length === 0 ? (
             <div className="text-center text-gray-500 text-sm py-4">No transactions found.</div>
           ) : (
             balanceLogs.map((log: BalanceLog) => (
               <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-[#0b0e14] border border-[#232936] rounded-lg gap-3 sm:gap-0">
                 <div className="flex items-center gap-3">
                   <div className={`p-2 rounded-full ${
                     log.type === 'Deposit' ? 'bg-emerald-500/10 text-emerald-500'
                     : log.type === 'Compensation' ? 'bg-amber-500/10 text-amber-500'
                     : 'bg-rose-500/10 text-rose-500'
                   }`}>
                     {log.type === 'Deposit'
                       ? <ArrowUpCircle className="w-4 h-4"/>
                       : log.type === 'Compensation'
                         ? <ShieldCheck className="w-4 h-4"/>
                         : <ArrowDownCircle className="w-4 h-4"/>}
                   </div>
                   <div>
                     <div className="text-sm font-medium text-gray-200">{log.type}</div>
                     <div className="text-xs text-gray-500">{format(parseISO(log.dateTime), 'MMM dd, yyyy HH:mm')} &middot; {log.note || 'No description'}</div>
                   </div>
                 </div>
                 
                 <div className="flex items-center justify-between sm:justify-end gap-5">
                   <div className={`font-mono font-bold ${
                     log.type === 'Withdrawal' ? 'text-rose-400'
                     : log.type === 'Compensation' ? 'text-amber-400'
                     : 'text-emerald-400'
                   }`}>
                     {formatCurrencyWithSign(log.type === 'Withdrawal' ? -log.amount : log.amount, currency)}
                   </div>
                   <div className="flex items-center gap-2">
                     <button title="Edit" onClick={() => handleEdit(log)} className="p-1.5 text-gray-500 hover:text-blue-400 bg-[#151a23] rounded-lg border border-[#232936] transition-colors cursor-pointer"><Edit3 className="w-3.5 h-3.5"/></button>
                     <button title="Delete" onClick={() => handleDelete(log.id)} className="p-1.5 text-gray-500 hover:text-rose-400 bg-[#151a23] rounded-lg border border-[#232936] transition-colors cursor-pointer"><Trash2 className="w-3.5 h-3.5"/></button>
                   </div>
                 </div>
               </div>
             ))
           )}
         </div>
      </div>
    </div>
  );
};
