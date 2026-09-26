import { FormEvent, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg, isUpgradeError } from '../lib/api';

interface Message { role: 'me' | 'ai'; text: string; sources?: string[] }

const SUGGESTIONS = [
  'What are the strongest achievements?',
  'Can they lead a team?',
  'Which required skills are missing?',
  'How many years of relevant experience?',
];

/** RAG chat over one scan's resume + job description vectors. */
export function ChatPanel({ sessionId, enabled }: { sessionId: string; enabled: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setMessages((m) => [...m, { role: 'me', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const { data } = await api.post('/chat', { sessionId, question: q });
      setMessages((m) => [...m, { role: 'ai', text: data.answer, sources: data.sources }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'ai', text: isUpgradeError(e) ? 'Chat is a Pro feature. Upgrade to ask questions.' : errMsg(e) },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => logRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }), 50);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  if (!enabled) {
    return (
      <div className="locked">
        <b>Ask the AI recruiter anything about this resume</b>
        <span className="muted small">Answers are grounded in your resume and job description (RAG).</span>
        <Link className="btn btn--accent btn--sm" to="/app/billing">Unlock with Pro →</Link>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat__log" ref={logRef}>
        {messages.length === 0 && (
          <div className="empty" style={{ padding: 20 }}>
            <span className="hand">ask me anything ↓</span>
            <div className="suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.role}`}>
            {m.text}
            {m.sources && m.sources.length > 0 && (
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                {m.sources.map((s, i) => <span key={i} className="chip chip--plain">{s}</span>)}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="bubble bubble--ai"><span className="spinner" /></div>}
      </div>
      <form className="row" onSubmit={submit} style={{ flexWrap: 'nowrap' }}>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Do they have AWS experience?" aria-label="Question" />
        <button className="btn btn--accent" disabled={loading || !input.trim()}>Ask</button>
      </form>
    </div>
  );
}
