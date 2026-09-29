import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  AlertTriangle,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useWell } from '../context/WellContext';
import { getChatSession, listChatSessions, sendChat } from '../lib/agateApi';

/**
 * Assistant panel - multi-turn chat over the offset-well knowledge base.
 *
 * Guardrail state is reported from the response, never assumed. The previous
 * implementation of a similar panel rendered a green "Guardrail Verified" badge
 * unconditionally, including on error; this one distinguishes verified /
 * blocked / not-validated, and shows the violations when they exist.
 */

const SUGGESTIONS = [
  'What mitigation worked for stuck pipe in the Barail? ',
  'Which offset wells had losses in the Tipam sandstone? ',
  'What are the gas kick precedents near this well? ',
];

function GuardrailBadge({ verified, violations }) {
  if (verified) {
    return (
      <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
        <ShieldCheck className="h-3 w-3" /> Guardrail verified
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300"
      title={(violations || []).join('; ')}
    >
      <ShieldAlert className="h-3 w-3" />
      {(violations || []).length > 0 ? 'Guardrail blocked' : 'Not validated'}
    </span>
  );
}

function Message({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-[12px] leading-relaxed ${
          isUser
            ? 'bg-cyan-500/15 text-slate-100 ring-1 ring-inset ring-cyan-500/25'
            : 'bg-slate-900/80 text-slate-200 ring-1 ring-inset ring-slate-800'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-headings:mb-1 prose-headings:mt-2 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-slate-100">
            <ReactMarkdown>{message.content || ''}</ReactMarkdown>
          </div>
        )}

        {!isUser && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-800 pt-2">
            <GuardrailBadge
              verified={message.guardrail_verified}
              violations={message.guardrail_violations}
            />
            {message.mode && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  message.mode === 'live_llm'
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'bg-slate-700/40 text-slate-400'
                }`}
              >
                {message.mode === 'live_llm' ? message.provider || 'live' : 'offline rules'}
              </span>
            )}
            {typeof message.evidence_count === 'number' && (
              <span className="text-[10px] text-slate-500">
                {message.evidence_count} source{message.evidence_count === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}

        {!isUser && (message.citations || []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.citations.map((c, i) => (
              <span
                key={`${c.source_file}-${c.source_page}-${i}`}
                className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
                title={`${c.source_file} @ ${c.depth_tvd}m`}
              >
                [{c.source_page}] {c.well_id}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPanel() {
  const { selectedWell } = useWell();
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sessions, setSessions] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    listChatSessions()
      .then((rows) => setSessions(Array.isArray(rows) ? rows : []))
      .catch(() => setSessions([]));
  }, [sessionId]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function submit(text) {
    const question = (text || '').trim();
    if (!question || busy) return;

    setError(null);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setBusy(true);

    try {
      const reply = await sendChat({ message: question, sessionId, wellId: selectedWell });
      setSessionId(reply.session_id);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: reply.answer,
          citations: reply.citations,
          guardrail_verified: reply.guardrail_verified,
          guardrail_violations: reply.guardrail_violations,
          mode: reply.mode,
          provider: reply.provider,
          evidence_count: reply.evidence_count,
        },
      ]);
    } catch (err) {
      setError(err.message || 'The assistant request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function openSession(id) {
    try {
      const transcript = await getChatSession(id);
      setSessionId(id);
      setMessages(
        (transcript.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
          citations: m.citations,
          guardrail_verified: m.guardrail_verified,
          guardrail_violations: m.guardrail_violations,
          provider: m.provider,
        }))
      );
    } catch (err) {
      setError(err.message || 'Could not open that session.');
    }
  }

  function newSession() {
    setSessionId(null);
    setMessages([]);
    setError(null);
  }

  return (
    <div className="flex h-full gap-4 p-5">
      {/* Session rail */}
      <aside className="flex w-56 shrink-0 flex-col rounded-lg border border-slate-800 bg-slate-950/60 p-2">
        <button
          type="button"
          onClick={newSession}
          className="mb-2 flex items-center justify-center gap-1.5 rounded-md border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
        >
          <Plus className="h-3 w-3" /> New session
        </button>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="px-1 py-2 text-[11px] text-slate-600">No saved sessions yet.</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openSession(s.id)}
              className={`w-full rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                sessionId === s.id
                  ? 'bg-cyan-500/10 text-cyan-300 ring-1 ring-inset ring-cyan-500/30'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <span className="line-clamp-2">{s.title || `Session ${s.id}`}</span>
              <span className="text-[10px] text-slate-600">{s.message_count} messages</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mb-3">
          <h1 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-100">
            <MessageSquare className="h-4 w-4 text-cyan-400" />
            Assistant
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Grounded in indexed offset-well records and the knowledge graph for{' '}
            <span className="font-mono text-slate-400">{selectedWell}</span>.
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-[12px] text-slate-400">
                Ask about historical drilling experience on nearby wells — hazards, mitigations,
                formations, or depths. Answers cite the records they were grounded in.
              </p>
              <div className="mt-3 space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="block w-full rounded-md border border-slate-800 px-2.5 py-1.5 text-left text-[11px] text-slate-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Message key={i} message={m} />
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Retrieving offset-well evidence…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="mt-3 flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={2}
            placeholder="Ask about offset-well history…  (Enter to send, Shift+Enter for a new line)"
            className="min-h-0 flex-1 resize-none rounded-md border border-slate-800 bg-slate-950/80 px-3 py-2 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-[12px] text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send
          </button>
        </form>

        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-600">
          <WifiOff className="h-3 w-3" />
          Answers fall back to a deterministic rules engine when no model provider is reachable.
        </p>
      </div>
    </div>
  );
}
