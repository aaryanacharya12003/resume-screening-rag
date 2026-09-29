import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, errMsg, Scan } from '../lib/api';
import { useToast } from './Toast';
import { ChangesView } from './Optimizer';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}
interface Proposal {
  text: string;
  changes: string[];
  removed: string[];
}

const GREETING =
  "Hi! Tell me anything you'd like on your resume (a result with numbers, a certification, a new job or project) and I'll add it in the right place. Not sure what's missing? Ask me.";
const STARTERS = ['What should I add?', 'Add a certification', 'Add results to my bullets', 'Add a new job'];

/** Chat that collects details from the candidate and proposes an updated resume to apply as a new version. */
export function ResumeAssistant({ scan }: { scan: Scan }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const original = scan.result.resumeText ?? '';

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turns, proposal, busy]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content }];
    setTurns(next);
    setInput('');
    setErr('');
    setBusy(true);
    try {
      // The greeting is local; the server only needs the real conversation (and any unapplied draft).
      const { data } = await api.post<{ reply: string; proposal?: Proposal }>(
        `/scans/${scan.id}/assistant`,
        { messages: next.slice(1), draft: proposal?.text },
        { timeout: 120_000 },
      );
      setTurns((t) => [...t, { role: 'assistant', content: data.reply }]);
      if (data.proposal) {
        setProposal(data.proposal);
        setShowDiff(false);
      }
    } catch (e) {
      setErr(errMsg(e));
      setTurns((t) => t.slice(0, -1));
      setInput(content);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!proposal) return;
    setApplying(true);
    try {
      const { data } = await api.post<Scan>(`/scans/${scan.id}/rescore`, { text: proposal.text }, { timeout: 120_000 });
      await qc.invalidateQueries({ queryKey: ['scans'] });
      toast(`New version saved and scored ${data.score}`);
      nav(`/app/scans/${data.id}`);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setApplying(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  return (
    <div className="assistant">
      <div className="assistant__log" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`assistant__msg assistant__msg--${t.role}`}>
            {t.content}
          </div>
        ))}
        {busy && (
          <div className="assistant__msg assistant__msg--assistant">
            <span className="spinner" /> Thinking…
          </div>
        )}
        {proposal && (
          <div className="assistant__proposal">
            <b>Proposed update</b>
            {proposal.changes.length > 0 && (
              <ul>
                {proposal.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
            {proposal.removed.length > 0 && (
              <p className="form-error small">
                Check before applying: this version no longer contains {proposal.removed.slice(0, 4).join(', ')}
                {proposal.removed.length > 4 ? '…' : ''}. Ask me to put anything back.
              </p>
            )}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn--accent btn--sm" onClick={apply} disabled={applying || busy}>
                {applying && <span className="spinner" />} Apply &amp; re-score
              </button>
              <button className="btn btn--light btn--sm" onClick={() => setShowDiff((v) => !v)}>
                {showDiff ? 'Hide changes' : 'Show changes'}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => setProposal(null)} disabled={applying}>
                Discard
              </button>
            </div>
            {showDiff && <ChangesView before={original} after={proposal.text} />}
            <p className="small muted">Keep chatting to add more; changes build on this draft until you apply it.</p>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {turns.length === 1 && (
        <div className="row" style={{ gap: 6 }}>
          {STARTERS.map((s) => (
            <button key={s} type="button" className="chip chip--plain" style={{ cursor: 'pointer', padding: '6px 12px' }} onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}
      {err && <div className="form-error">{err}</div>}
      <form className="assistant__form" onSubmit={submit}>
        <label htmlFor="assistant-input" className="sr-only">
          Message the resume assistant
        </label>
        <textarea
          id="assistant-input"
          className="textarea"
          rows={2}
          maxLength={2000}
          placeholder="e.g. I got the AWS Solutions Architect – Associate certification in March 2024"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          disabled={busy || applying}
        />
        <button className="btn btn--accent" disabled={busy || applying || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
