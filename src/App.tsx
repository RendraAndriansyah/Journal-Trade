import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Dashboard } from './components/Dashboard';
import { TradeForm } from './components/TradeForm';
import { BalanceForm } from './components/BalanceForm';
import { ImportExport } from './components/ImportExport';
import { TradeHistory } from './components/TradeHistory';
import { db } from './db';
import { LayoutDashboard, PlusCircle, History, Wallet, Coins, FileJson, Table } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { calculatePips } from './utils/calculations';

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trade' | 'history' | 'balance' | 'import'>('dashboard');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountCurrency, setNewAccountCurrency] = useState('USD');

  const accounts = useLiveQuery(() => db.accounts.toArray());
  
  useEffect(() => {
    if (accounts?.length && !selectedAccountId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Fix: Force recalculate all pips using the new accurate XAU logic
  // because deduplication prevented re-imports from overwriting old massive pip calculations
  useEffect(() => {
    const fixPips = async () => {
      const allTrades = await db.trades.toArray();
      const updates = allTrades.map(t => {
        const accuratePips = calculatePips(t.entryPrice, t.closingPrice, t.type as 'Buy'|'Sell', t.pair);
        if (t.pips !== accuratePips) {
          return db.trades.update(t.id, { pips: accuratePips });
        }
        return Promise.resolve();
      });
      await Promise.all(updates);
    };
    fixPips();
  }, []);

  const activeAccount = accounts?.find(a => a.id === selectedAccountId);
  
  const trades = useLiveQuery(() => 
    selectedAccountId 
      ? db.trades.where('accountId').equals(selectedAccountId).toArray() 
      : []
  , [selectedAccountId]) || [];

  const balanceLogs = useLiveQuery(() => 
    selectedAccountId 
      ? db.balanceLogs.where('accountId').equals(selectedAccountId).toArray() 
      : []
  , [selectedAccountId]) || [];

  const deleteAccount = async () => {
    if (window.confirm('Are you sure you want to completely delete this account and all its data?')) {
      if (selectedAccountId) {
        await db.trades.where('accountId').equals(selectedAccountId).delete();
        await db.balanceLogs.where('accountId').equals(selectedAccountId).delete();
        await db.accounts.delete(selectedAccountId);
        setSelectedAccountId('');
        setActiveTab('dashboard');
      }
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName) return;
    const newId = uuidv4();
    await db.accounts.add({
      id: newId,
      name: newAccountName,
      currency: newAccountCurrency,
      initialBalance: 0,
      createdAt: new Date().toISOString()
    });
    setSelectedAccountId(newId);
    setShowAccountModal(false);
    setNewAccountName('');
    setNewAccountCurrency('USD');
  };

  if (!accounts) return <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0b0e14] text-gray-100 font-sans pb-16 md:pb-0">
      
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#151a23] border border-[#232936] rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Wallet className="w-5 h-5 text-blue-500" /> Create Account</h2>
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Account Name</label>
                <input required type="text" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} className="w-full bg-[#0b0e14] border border-[#232936] rounded-lg px-3 py-2 text-white outline-none" placeholder="e.g. My IDR Account" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Currency</label>
                <select value={newAccountCurrency} onChange={e => setNewAccountCurrency(e.target.value)} className="w-full bg-[#0b0e14] border border-[#232936] rounded-lg px-3 py-2 text-white outline-none">
                  <option value="USD">USD</option>
                  <option value="USDC">USDC</option>
                  <option value="IDR">IDR</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowAccountModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:bg-[#232936] rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[#151a23] border-b border-[#232936] sticky top-0 z-20">
        <div className="flex items-center gap-2 text-blue-500 font-bold text-lg">
          <Coins className="w-6 h-6" />
          <span>GoldJournal</span>
        </div>
        {accounts.length > 0 && (
          <div className="flex items-center gap-2">
            <select 
              value={selectedAccountId} 
              onChange={e => setSelectedAccountId(e.target.value)}
              className="bg-[#0b0e14] border border-[#232936] rounded-lg px-2 py-1 text-sm outline-none w-32 truncate"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
            <button onClick={() => setShowAccountModal(true)} className="p-1.5 bg-[#0b0e14] border border-[#232936] rounded-lg text-blue-400 hover:bg-[#232936]">
              <PlusCircle className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Sidebar Navigation for Desktop / Bottom Nav for Mobile */}
      <nav className={`fixed bottom-0 left-0 right-0 md:relative md:block md:w-64 bg-[#151a23] border-t md:border-t-0 md:border-r border-[#232936] flex-shrink-0 z-30 p-2 md:p-5 flex md:flex-col justify-around md:justify-start`}>
        <div className="hidden md:flex items-center justify-between mb-10 pb-5 border-b border-[#232936]">
          <div className="flex items-center gap-3 text-blue-500 font-bold text-xl">
            <div className="bg-blue-500/10 p-2 rounded-lg">
              <Coins className="w-6 h-6" />
            </div>
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">GoldJournal</span>
          </div>
        </div>

        {/* Desktop Account Selector */}
        <div className="hidden md:block mb-6">
          <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Active Account</label>
          <div className="flex items-center gap-2">
            <select 
              value={selectedAccountId} 
              onChange={e => setSelectedAccountId(e.target.value)}
              className="flex-1 bg-[#0b0e14] border border-[#232936] rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
            <button onClick={() => setShowAccountModal(true)} title="Add New Account" className="p-2.5 bg-[#0b0e14] border border-[#232936] rounded-lg text-blue-400 hover:bg-[#232936] transition-colors">
              <PlusCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex md:flex-col gap-1 md:gap-2 w-full">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 md:w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-lg transition-all ${
              activeTab === 'dashboard' 
                ? 'text-blue-400 md:bg-blue-600/10 md:border border-blue-500/20 md:shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                : 'text-gray-400 hover:bg-[#232936] hover:text-gray-200'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 md:w-5 md:h-5" />
            <span className="text-[10px] md:text-sm font-medium">Dashboard</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('trade')}
            className={`flex-1 md:w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-lg transition-all ${
              activeTab === 'trade' 
                ? 'text-blue-400 md:bg-blue-600/10 md:border border-blue-500/20 md:shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                : 'text-gray-400 hover:bg-[#232936] hover:text-gray-200'
            }`}
          >
            <PlusCircle className="w-5 h-5 md:w-5 md:h-5" />
            <span className="text-[10px] md:text-sm font-medium">Trade</span>
          </button>

          <button 
            onClick={() => setActiveTab('history')}
            className={`flex-1 md:w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-lg transition-all ${
              activeTab === 'history' 
                ? 'text-blue-400 md:bg-blue-600/10 md:border border-blue-500/20 md:shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                : 'text-gray-400 hover:bg-[#232936] hover:text-gray-200'
            }`}
          >
            <Table className="w-5 h-5 md:w-5 md:h-5" />
            <span className="text-[10px] md:text-sm font-medium">History</span>
          </button>

          <button 
            onClick={() => setActiveTab('balance')}
            className={`flex-1 md:w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-lg transition-all ${
              activeTab === 'balance' 
                ? 'text-blue-400 md:bg-blue-600/10 md:border border-blue-500/20 md:shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                : 'text-gray-400 hover:bg-[#232936] hover:text-gray-200'
            }`}
          >
            <Wallet className="w-5 h-5 md:w-5 md:h-5" />
            <span className="text-[10px] md:text-sm font-medium">Balance</span>
          </button>

          <button 
            onClick={() => setActiveTab('import')}
            className={`flex-1 md:w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-lg transition-all ${
              activeTab === 'import' 
                ? 'text-blue-400 md:bg-blue-600/10 md:border border-blue-500/20 md:shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                : 'text-gray-400 hover:bg-[#232936] hover:text-gray-200'
            }`}
          >
            <FileJson className="w-5 h-5 md:w-5 md:h-5" />
            <span className="text-[10px] md:text-sm font-medium">Sync Data</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto w-full">
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          
          <header className="flex justify-between items-center mb-6 md:mb-8 border-b border-[#232936] pb-4 md:pb-5 text-left">
            <div>
              <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {activeTab === 'dashboard' ? 'Analytics Dashboard' : activeTab === 'trade' ? 'Trade Entry Terminal' : activeTab === 'history' ? 'Trade Data Log' : activeTab === 'import' ? 'Sync Settings' : 'Balance Ledger'}
              </h1>
              <p className="text-gray-500 text-xs md:text-sm mt-1">{activeAccount?.name || 'No Account Selected'}</p>
            </div>
            
            {activeAccount && (
              <button 
                onClick={deleteAccount}
                className="text-gray-500 hover:text-rose-400 text-xs flex items-center gap-1.5 transition-colors bg-[#151a23] p-1.5 md:p-2 rounded-lg border border-[#232936]"
              >
                <History className="w-4 h-4"/> <span className="hidden sm:inline">Delete Account</span>
              </button>
            )}
          </header>

          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {!activeAccount || accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center h-[50vh] border border-[#232936] border-dashed rounded-xl bg-[#0b0e14]">
                <div className="bg-blue-600/10 p-4 rounded-full mb-4">
                  <Wallet className="w-8 h-8 text-blue-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-200 mb-2">Welcome to GoldJournal</h2>
                <p className="text-sm text-gray-500 mb-6 max-w-md">Your database is completely empty. Add your first trading account to begin logging trades or importing MT5 data!</p>
                <button 
                  onClick={() => setShowAccountModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.3)]"
                >
                  <PlusCircle className="w-5 h-5"/> Create First Account
                </button>
              </div>
            ) : activeTab === 'dashboard' ? (
              <Dashboard trades={trades} account={activeAccount} balanceLogs={balanceLogs} />
            ) : activeTab === 'trade' ? (
              <div className="max-w-3xl mx-auto">
                <TradeForm accountId={activeAccount.id} onTradeAdded={() => setActiveTab('dashboard')} />
              </div>
            ) : activeTab === 'history' ? (
              <div className="max-w-5xl mx-auto">
                <TradeHistory accountId={activeAccount.id} />
              </div>
            ) : activeTab === 'balance' ? (
              <div className="max-w-3xl mx-auto">
                <BalanceForm accountId={activeAccount.id} />
              </div>
            ) : activeTab === 'import' ? (
              <div className="max-w-3xl mx-auto">
                <ImportExport accountId={activeAccount.id} />
              </div>
            ) : null}
          </div>

        </div>
      </main>
      
    </div>
  );
}

export default App;
