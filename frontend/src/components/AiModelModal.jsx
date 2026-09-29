import React, { useState } from 'react';
import { X, Sparkles, Bot, Terminal, Cpu, CheckCircle2, AlertCircle, RefreshCw, Key, ShieldCheck, ShieldAlert } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../lib/api';

export default function AiModelModal({ isOpen, onClose, aiStatus, onRefreshStatus }) {
  const [testQuery, setTestQuery] = useState('Mitigate Barail high pressure kick');
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const handleTestSynthesis = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const resp = await axios.post(`${API_BASE}/api/ai/synthesize`, {
        query: testQuery,
        well_id: 'OIL-BAGHJAN-1',
        max_records: 3
      });
      setTestResult(resp.data);
    } catch (err) {
      setTestResult({
        status: 'error',
        summary: err.response?.data?.detail || err.message || 'Error connecting to AI service.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const getProviderIcon = (prov) => {
    switch (prov?.toLowerCase()) {
      case 'gemini':
        return <Sparkles size={16} className="text-cyan-400" />;
      case 'claude':
        return <Cpu size={16} className="text-amber-400" />;
      case 'openai':
        return <Bot size={16} className="text-emerald-400" />;
      case 'ollama':
        return <Terminal size={16} className="text-blue-400" />;
      default:
        return <ShieldCheck size={16} className="text-slate-400" />;
    }
  };

  const getProviderColor = (prov) => {
    switch (prov?.toLowerCase()) {
      case 'gemini':
        return 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300';
      case 'claude':
        return 'border-amber-500/40 bg-amber-950/30 text-amber-300';
      case 'openai':
        return 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300';
      case 'ollama':
        return 'border-blue-500/40 bg-blue-950/30 text-blue-300';
      default:
        return 'border-slate-700 bg-slate-900 text-slate-300';
    }
  };

  // Derives the badge from the REAL guardrail outcome returned by /api/ai/synthesize
  // (`guardrail_verified` / `guardrail_violations`). A pass is never assumed: on the
  // error path the response never reached the 4-gate validator at all.
  const getGuardrailState = (result) => {
    if (!result || result.status === 'error') {
      return {
        label: 'Not Validated — Request Failed',
        icon: <AlertCircle size={11} />,
        textClass: 'text-rose-400',
        boxClass: 'border-rose-500/40 bg-rose-950/20'
      };
    }
    if (result.guardrail_verified === true) {
      return {
        label: 'Guardrail Verified',
        icon: <CheckCircle2 size={11} />,
        textClass: 'text-emerald-400',
        boxClass: 'border-slate-800 bg-slate-900'
      };
    }
    if (result.guardrail_verified === false) {
      return {
        label: 'Guardrail Blocked — Fallback Answer',
        icon: <ShieldAlert size={11} />,
        textClass: 'text-rose-400',
        boxClass: 'border-rose-500/40 bg-rose-950/20'
      };
    }
    return {
      label: 'Guardrail Status Unknown',
      icon: <AlertCircle size={11} />,
      textClass: 'text-amber-400',
      boxClass: 'border-amber-500/40 bg-amber-950/20'
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-glow-cyan">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
                AI & LLM Model Architecture
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30 uppercase">
                  Multi-Provider
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Plug in your Gemini, Claude, OpenAI, or Ollama credentials seamlessly.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto custom-scrollbar space-y-4 text-xs">
          {/* Active Model Banner */}
          <div className={`p-3.5 rounded-xl border flex items-center justify-between ${getProviderColor(aiStatus?.active_provider)}`}>
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-slate-900/80 border border-current">
                {getProviderIcon(aiStatus?.active_provider)}
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider opacity-80 block">Active AI Engine</span>
                <span className="font-bold text-sm capitalize">
                  {aiStatus?.active_provider === 'offline' ? 'Deterministic Rules Engine' : `${aiStatus?.active_provider} (${aiStatus?.active_model})`}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button 
                onClick={onRefreshStatus}
                className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
                title="Refresh Status"
              >
                <RefreshCw size={13} />
              </button>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${aiStatus?.is_connected ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {aiStatus?.is_connected ? '● CONNECTED' : '○ STANDALONE ENGINE'}
              </span>
            </div>
          </div>

          {/* Supported Providers Grid */}
          <div>
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-2">
              Supported LLM Providers
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'gemini', name: 'Google Gemini', desc: 'gemini-1.5-flash / pro', free: 'Free Tier Available' },
                { id: 'claude', name: 'Anthropic Claude', desc: 'claude-3-5-haiku / sonnet', free: 'State-of-the-Art' },
                { id: 'openai', name: 'OpenAI', desc: 'gpt-4o-mini / gpt-4o', free: 'Fast & Versatile' },
                { id: 'ollama', name: 'Ollama (Local)', desc: 'llama3 / mistral / deepseek', free: 'Local Compute' },
              ].map(item => {
                const isReady = aiStatus?.available_providers?.includes(item.id);
                const isActive = aiStatus?.active_provider === item.id;
                return (
                  <div 
                    key={item.id} 
                    className={`p-2.5 rounded-xl border transition ${isActive ? 'bg-slate-800/90 border-cyan-500/50 shadow-inner' : isReady ? 'bg-slate-900/70 border-emerald-500/30' : 'bg-slate-900/40 border-slate-800 opacity-75'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        {getProviderIcon(item.id)} {item.name}
                      </span>
                      {isActive ? (
                        <span className="text-[9px] font-mono font-bold text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-500/30">ACTIVE</span>
                      ) : isReady ? (
                        <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-0.5"><CheckCircle2 size={10} /> Ready</span>
                      ) : (
                        <span className="text-[9px] font-mono text-slate-500">Unconfigured</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">{item.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Setup Instructions */}
          <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Key size={13} className="text-cyan-400" /> How to Connect Your API Key
            </span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Simply copy <code className="text-cyan-300 font-mono">.env.example</code> to <code className="text-cyan-300 font-mono">.env</code> in the project root and provide your preferred key:
            </p>
            <pre className="p-2 bg-slate-900 rounded-lg text-[10px] font-mono text-cyan-200 border border-slate-800 overflow-x-auto">
{`# Choose one in your .env:
GEMINI_API_KEY=AIzaSy...       # For Google Gemini
ANTHROPIC_API_KEY=sk-ant-...   # For Anthropic Claude
OPENAI_API_KEY=sk-proj-...     # For OpenAI
OLLAMA_ENDPOINT=http://localhost:11434/v1 # For Ollama`}
            </pre>
          </div>

          {/* Live Test Synthesis Box */}
          <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40 space-y-2">
            <span className="text-[11px] font-bold text-slate-300 block">
              Test Live Model Synthesis
            </span>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Ask drilling hazard question..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={handleTestSynthesis}
                disabled={isTesting}
                className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg font-medium transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isTesting ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                <span>Test</span>
              </button>
            </div>

            {testResult && (() => {
              const guardrail = getGuardrailState(testResult);
              const isError = testResult.status === 'error';
              const violations = testResult.guardrail_violations || [];
              return (
              <div className={`mt-2 p-2.5 rounded-lg border text-[11px] space-y-1.5 ${guardrail.boxClass}`}>
                <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
                  {isError ? (
                    <span className="text-rose-300">Synthesis request failed</span>
                  ) : (
                    <span className="capitalize text-cyan-300">Provider: {testResult.provider} ({testResult.model})</span>
                  )}
                  <span className={`flex items-center gap-1 shrink-0 ${guardrail.textClass}`}>
                    {guardrail.icon} {guardrail.label}
                  </span>
                </div>
                <p className={isError ? 'text-rose-200' : 'text-slate-300'}>{testResult.summary}</p>
                {violations.length > 0 && (
                  <ul className="list-disc list-inside text-rose-300/90 space-y-0.5">
                    {violations.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                )}
                {testResult.recommendations && testResult.recommendations.length > 0 && (
                  <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                    {testResult.recommendations.slice(0, 2).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
              );
            })()}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400">
          <span>Deterministic Guardrails Active</span>
          <button 
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
