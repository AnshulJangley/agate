import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../lib/api';
import { 
  BookOpen, 
  Send, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Brain, 
  Sparkles,
  Clock,
  ShieldAlert,
  Maximize2,
  Minimize2,
  ExternalLink
} from 'lucide-react';

const ContributeLessonModal = ({ isOpen, onClose, activeWellId = 'OIL-BAGHJAN-1', onLessonContributed, isFullScreen: propFullScreen = false }) => {
  const [formData, setFormData] = useState({
    well_id: activeWellId,
    event_type: 'Lost Circulation',
    formation: 'Barail Formation',
    depth_tvd: 2450.0,
    severity: 'HIGH',
    root_cause: '',
    mitigation_applied: '',
    npt_hours: 4.0
  });

  const [isFullScreen, setIsFullScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return propFullScreen || p.get('fullscreen') === 'true' || p.get('module') === 'lesson' || p.get('module') === 'contribute';
    }
    return propFullScreen;
  });

  useEffect(() => {
    if (propFullScreen) setIsFullScreen(true);
  }, [propFullScreen]);

  const handleToggleFullscreen = () => {
    if (!isFullScreen) {
      setIsFullScreen(true);
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      setIsFullScreen(false);
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Close or exit tab on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        if (typeof window !== 'undefined' && window.location.search.includes(' module=')) {
          window.close();
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.root_cause || !formData.mitigation_applied) {
      setError('Please provide both the root cause and mitigation applied.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Correction #3: Exact match with backend route /api/events/contribute
      const res = await axios.post(`${API_BASE}/api/events/contribute`, {
        ...formData,
        well_id: activeWellId,
        depth_tvd: parseFloat(formData.depth_tvd),
        npt_hours: parseFloat(formData.npt_hours || 0)
      });

      setResult(res.data);
      if (onLessonContributed) {
        onLessonContributed(res.data);
      }
    } catch (err) {
      console.error('Failed to contribute lesson: ', err);
      setError(err.response?.data?.detail || 'Failed to submit lesson to institutional memory.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setFormData({
      well_id: activeWellId,
      event_type: 'Lost Circulation',
      formation: 'Barail Formation',
      depth_tvd: 2450.0,
      severity: 'HIGH',
      root_cause: '',
      mitigation_applied: '',
      npt_hours: 4.0
    });
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200 ${isFullScreen ? 'p-0 w-screen h-screen' : 'p-2 sm:p-4'}`}>
      <div className={`bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col ${isFullScreen ? 'w-screen h-screen rounded-none border-none max-h-none h-full' : 'w-full max-w-2xl rounded-xl max-h-[96vh] sm:max-h-[92vh]'}`}>
        
        {/* Header */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center gap-2">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20 text-purple-400 shrink-0">
              <Brain size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-sm sm:text-lg font-bold text-white tracking-wide truncate">
                  Contribute Field Lesson
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono">
                  {activeWellId}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
                Log real-time operational experience directly into the institutional vector knowledge base
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {/* Toggle Fullscreen */}
            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              title={isFullScreen ? "Window Mode" : "Full Screen"}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Pop out to New Tab */}
            <button
              onClick={() => window.open(`${window.location.origin}${window.location.pathname}?module=contribute&well=${encodeURIComponent(activeWellId)}&fullscreen=true`, '_blank')}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              title="Open in Dedicated Browser Tab (Full Screen)"
            >
              <ExternalLink size={16} />
            </button>

            <button 
              onClick={() => {
                if (typeof window !== 'undefined' && window.location.search.includes(' module=')) {
                  window.close();
                }
                onClose();
              }}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              title="Close View"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1">
          {result ? (
            <div className="py-8 px-4 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={36} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Lesson Learned Vectorized Successfully!</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {result.message}
                </p>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 max-w-md mx-auto text-left text-xs font-mono space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Event Record ID:</span>
                  <span className="text-white">#{result.event_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Target Well:</span>
                  <span className="text-cyan-400">{result.well_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Embedding Dimensions:</span>
                  <span className="text-emerald-400 font-bold">{result.embedding_dimensions}-dim BGE Vector</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Searchable Status:</span>
                  <span className="text-emerald-400 font-bold flex items-center space-x-1">
                    <Sparkles size={12} />
                    <span>Live in RAG Database</span>
                  </span>
                </div>
              </div>

              <div className="pt-4 flex justify-center space-x-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition"
                >
                  Log Another Event
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              
              {error && (
                <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-red-200 flex items-center space-x-2">
                  <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Event Type */}
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Incident / Event Type *</label>
                  <select
                    value={formData.event_type}
                    onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-cyan-500 outline-none"
                  >
                    <option value="Lost Circulation">Lost Circulation (Partial/Total)</option>
                    <option value="Gas Kick">Gas Kick / Formation Influx</option>
                    <option value="Differential Sticking">Differential Pipe Sticking</option>
                    <option value="Mechanical Packoff">Mechanical Packoff / Tight Hole</option>
                    <option value="Severe Torque Spikes">Severe Torque Spikes / Stick-Slip</option>
                    <option value="Cementing Channeling">Cementing Losses / Channeling</option>
                    <option value="Bit Balling">Shale Swelling / Bit Balling</option>
                  </select>
                </div>

                {/* Formation */}
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Stratigraphic Formation *</label>
                  <select
                    value={formData.formation}
                    onChange={(e) => setFormData({ ...formData, formation: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-cyan-500 outline-none"
                  >
                    <option value="Tipam Sandstone">Tipam Sandstone (Freshwater / Thief)</option>
                    <option value="Girujan Clay">Girujan Clay (Swelling Clay)</option>
                    <option value="Barail Formation">Barail Formation (Overpressured Kick Zone)</option>
                    <option value="Kopili Formation">Kopili Formation (Deep Marine Fissile Shale)</option>
                    <option value="Basement / General">Basement / Unconformity</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Depth TVD */}
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Depth TVD (m) *</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.depth_tvd}
                    onChange={(e) => setFormData({ ...formData, depth_tvd: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:border-cyan-500 outline-none"
                    required
                  />
                </div>

                {/* Severity */}
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Severity *</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-cyan-500 outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>

                {/* NPT Hours */}
                <div>
                  <label className="block text-slate-400 mb-1 font-medium flex items-center space-x-1">
                    <Clock size={12} className="text-amber-400" />
                    <span>NPT Hours</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.npt_hours}
                    onChange={(e) => setFormData({ ...formData, npt_hours: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              {/* Root Cause */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">
                  Technical Root Cause Analysis *
                </label>
                <textarea
                  rows="3"
                  placeholder="e.g. Drilling through depleted sandstone reservoir at 2,450m with 11.8 ppg mud weight. Differential pressure exceeded 2,200 psi causing pipe sticking during survey connection."
                  value={formData.root_cause}
                  onChange={(e) => setFormData({ ...formData, root_cause: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-600 focus:border-cyan-500 outline-none resize-none"
                  required
                />
              </div>

              {/* Mitigation Applied */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium text-emerald-400">
                  Field Mitigation & Successful Remediation Applied *
                </label>
                <textarea
                  rows="3"
                  placeholder="e.g. Spotted 35 bbl pipe-lax surfactant soaking pill across BHA. Worked pipe with 40 klbs overpull and rotated slowly at 15 RPM. Freed in 3.5 hrs. Maintained 50 gpm circulation."
                  value={formData.mitigation_applied}
                  onChange={(e) => setFormData({ ...formData, mitigation_applied: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-600 focus:border-cyan-500 outline-none resize-none"
                  required
                />
              </div>

              {/* Info notice */}
              <div className="p-3 bg-purple-950/20 border border-purple-900/30 rounded-lg text-[11px] text-purple-200/90 flex items-center space-x-2">
                <Sparkles size={14} className="text-purple-400 flex-shrink-0" />
                <span>
                  This entry will be embedded using BAAI/bge-small-en-v1.5 and added to the semantic RAG index for immediate offset well look-ahead retrieval across nearby rigs.
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center space-x-1.5 transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                      <span>Embedding & Committing...</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>Commit to Institutional Memory</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          )}
        </div>

      </div>
    </div>
  );
};

export default ContributeLessonModal;
