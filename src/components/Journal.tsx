import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { BookOpen, Calendar, Trash2, PenTool, Clock, Bookmark, Star } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface JournalProps {
  accountId: string;
}

export const Journal: React.FC<JournalProps> = ({ accountId }) => {
  const [noteType, setNoteType] = useState<'daily' | 'important'>('daily');
  const [content, setContent] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const allNotes = useLiveQuery(
    () => db.dailyNotes.where('accountId').equals(accountId).reverse().sortBy('date'),
    [accountId]
  ) || [];

  const visibleNotes = allNotes.filter(n => noteType === 'important' ? n.type === 'important' : (!n.type || n.type === 'daily'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !accountId) return;

    await db.dailyNotes.add({
      id: uuidv4(),
      accountId,
      date,
      type: noteType,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    setContent('');
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this journal entry?')) {
      await db.dailyNotes.delete(id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab bar */}
      <div className="flex gap-1 p-1 mb-2 rounded-xl border" style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)' }}>
        <button
          onClick={() => setNoteType('daily')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            noteType === 'daily'
              ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.08)]'
              : 'hover:bg-[var(--hover-bg)]'
          }`}
          style={noteType !== 'daily' ? { color: 'var(--text-muted)' } : undefined}
        >
          <BookOpen className="w-4 h-4" /> Daily Journal
        </button>
        <button
          onClick={() => setNoteType('important')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            noteType === 'important'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.08)]'
              : 'hover:bg-[var(--hover-bg)]'
          }`}
          style={noteType !== 'important' ? { color: 'var(--text-muted)' } : undefined}
        >
          <Bookmark className="w-4 h-4" /> Important Reminder
        </button>
      </div>

      <div className="card">
        <div className="flex items-center space-x-2 mb-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          {noteType === 'important' ? <Bookmark className="w-6 h-6 text-blue-500" /> : <PenTool className="w-6 h-6 text-amber-500" />}
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {noteType === 'important' ? 'Write Important Note' : 'Write Journal Entry'}
          </h2>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-text flex items-center gap-1.5"><Calendar className="w-4 h-4"/> Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="input-field" 
              required 
            />
          </div>
          <div>
            <label className="label-text flex items-center gap-1.5">
              {noteType === 'important' ? <Star className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
              {noteType === 'important' ? 'Important Reminder / Rule' : 'Moment & Experience'}
            </label>
            <textarea 
              value={content} 
              onChange={e => setContent(e.target.value)} 
              placeholder={noteType === 'important' ? "Note a vital rule or key mistake you don't want to repeat in the future..." : "What did you learn today? Any psychological impacts during your trade?"}
              className="input-field min-h-[120px] resize-y" 
              required 
            />
          </div>
          <button type="submit" className={`btn-primary w-full shadow-lg py-3 mt-2 ${noteType === 'important' ? 'bg-blue-600 hover:bg-blue-700' : ''}`} style={noteType !== 'important' ? { backgroundColor: '#d97706', borderColor: '#b45309' } : undefined}>
            {noteType === 'important' ? 'Save Important Note' : 'Save Journal Entry'}
          </button>
        </form>
      </div>

      <div className="space-y-4">
        {visibleNotes.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-dashed" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-base)' }}>
            <p style={{ color: 'var(--text-muted)' }}>
              {noteType === 'important' ? 'No important notes yet. Save your key rules here to remember them!' : 'No journal entries yet. Start writing your experience!'}
            </p>
          </div>
        ) : (
          visibleNotes.map((note) => (
            <div key={note.id} className="card relative transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
              <button 
                onClick={() => handleDelete(note.id)}
                className="absolute top-4 right-4 p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                title="Delete Entry"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
                <Calendar className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold">{formatDate(note.date)}</span>
                <span className="text-xs ml-2 opacity-50 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {new Date(note.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {note.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
