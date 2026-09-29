import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../lib/api';
import SourceTag, { getWellDataSource } from './SourceTag';
import { generateOfflineDossier } from '../lib/offlinePhysicsEngine';
import { getWellColor } from '../lib/wellColors';
import { 
  FileText, 
  Printer, 
  Download, 
  X, 
  ShieldAlert, 
  Compass, 
  Layers, 
  CheckCircle2, 
  AlertTriangle,
  Building2,
  Calendar,
  MapPin,
  RefreshCw,
  Maximize2,
  Minimize2,
  ExternalLink
} from 'lucide-react';

const PreSpudDossierModal = ({ isOpen, onClose, activeWellId = 'OIL-BAGHJAN-1', isFullScreen: propFullScreen = false }) => {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return propFullScreen || p.get('fullscreen') === 'true' || p.get('module') === 'dossier';
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

  const fetchDossier = async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/wells/${activeWellId}/pre-spud-dossier`, { timeout: 3000 });
      setDossier(res.data);
    } catch (err) {
      console.warn('API Pre-Spud Dossier unreachable, generating local Rig Edge Dossier: ', err);
      const offlineDossier = generateOfflineDossier(activeWellId);
      setDossier(offlineDossier);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDossier();
  }, [isOpen, activeWellId]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const meta = dossier?.report_metadata || {};
  const target = dossier?.target_well || {};
  const exec = dossier?.executive_summary || {};
  const antiCollision = dossier?.anti_collision_clearance || [];
  const casingProg = dossier?.casing_and_mud_program || [];
  const formBreakdown = dossier?.formation_hazard_breakdown || {};

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200 print:p-0 print:bg-white print:static ${isFullScreen ? 'p-0 w-screen h-screen' : 'p-2 sm:p-4'}`}>
      <div className={`bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col print:max-h-none print:border-none print:shadow-none print:bg-white print:text-black ${isFullScreen ? 'w-screen h-screen rounded-none border-none max-h-none h-full' : 'w-full max-w-5xl rounded-xl max-h-[96vh] sm:max-h-[94vh]'}`}>
        
        {/* Header - Screen only */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center gap-2 print:hidden">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20 text-cyan-400 shrink-0">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-sm sm:text-lg font-bold text-white tracking-wide truncate">
                  Pre-Spud Offset Dossier
                </h2>
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold border ${getWellColor(activeWellId).badge}`}>
                  {activeWellId}
                </span>
                <SourceTag source={activeWellId} compact={true} />
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold hidden sm:inline">
                  OFFICIAL DOSSIER
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
                Automated multi-source historical offset intelligence compiled for drilling superintendents
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            <button 
              onClick={handlePrint}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center space-x-1 sm:space-x-1.5 transition shadow-lg shadow-cyan-500/20 min-h-[36px] cursor-pointer"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">Print / Save PDF</span>
              <span className="sm:hidden">Print</span>
            </button>
            <button 
              onClick={fetchDossier}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              title="Reload Dossier"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>

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
              onClick={() => window.open(`${window.location.origin}${window.location.pathname}?module=dossier&well=${encodeURIComponent(activeWellId)}&fullscreen=true`, '_blank')}
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

        {/* Printable Document Scroll Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-8 space-y-4 sm:space-y-6 print:overflow-visible print:p-0">
          
          {/* Institutional Document Header */}
          <div className="border-b-2 border-slate-700 pb-4 sm:pb-5 print:border-black">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-mono font-bold tracking-widest text-cyan-400 uppercase block print:text-slate-600">
                  AGATE PLATFORM
                </span>
                <h1 className="text-2xl font-black text-white mt-1 print:text-black tracking-tight">
                  PRE-SPUD OFFSET WELL HAZARD & DRILLING INTELLIGENCE DOSSIER
                </h1>
                <p className="text-xs text-slate-400 print:text-slate-600 mt-1">
                  Document ID: <strong className="font-mono text-slate-200 print:text-black">{meta.document_id || 'AGATE-DOSSIER-2026'}</strong> • Classification: RESTRICTED
                </p>
              </div>

              <div className="text-right text-xs font-mono text-slate-400 print:text-slate-600">
                <div>Generated: {meta.generated_at}</div>
                <div>Operational Radius: {target.search_radius_km || 25} km</div>
              </div>
            </div>
          </div>

          {/* Section 1: Target Well Operational Summary */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 print:bg-slate-50 print:border-slate-300">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 print:text-cyan-800 mb-3 flex items-center space-x-1.5">
              <MapPin size={14} />
              <span>Section 1: Target Well Specifications</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-400 print:text-slate-600 block">Well Identifier:</span>
                <strong className={`font-mono text-sm px-2 py-0.5 rounded border inline-block mt-0.5 ${getWellColor(target.well_id).badge}`}>{target.well_id}</strong>
              </div>
              <div>
                <span className="text-slate-400 print:text-slate-600 block">Field / Basin:</span>
                <strong className="text-white print:text-black text-sm">{target.field_name} (Assam)</strong>
              </div>
              <div>
                <span className="text-slate-400 print:text-slate-600 block">Planned Target Depth:</span>
                <strong className="text-cyan-400 print:text-black text-sm">{target.planned_td_tvd_m}m TVD ({Math.round(target.planned_td_md_m || 3700)}m MD)</strong>
              </div>
              <div>
                <span className="text-slate-400 print:text-slate-600 block">Kelly Bushing (KB):</span>
                <strong className="text-white print:text-black text-sm">+{target.kb_elevation_m}m MSL</strong>
              </div>
            </div>
          </div>

          {/* Section 2: Executive Risk Summary Callout */}
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/40 text-xs print:bg-amber-50 print:border-amber-300">
            <div className="flex items-start space-x-3">
              <ShieldAlert size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300 print:text-amber-900 font-bold block mb-1 uppercase tracking-wide">
                  Executive Pre-Spud Risk Warning:
                </strong>
                <p className="text-slate-200 print:text-black leading-relaxed">
                  {exec.key_primary_threat || 'Primary threat: Overpressured Barail Formation between 2,200m and 2,650m TVD with potential gas kicks and loss zones.'}
                </p>
                <div className="flex flex-wrap gap-4 mt-3 font-mono text-[11px] text-slate-300 print:text-slate-700">
                  <span>Offset Wells Evaluated: <strong>{exec.offset_wells_analyzed || 0}</strong></span>
                  <span>Historical NPT Events: <strong>{exec.historical_incidents_recorded || 0}</strong></span>
                  <span>Total Offset NPT: <strong className="text-amber-400 print:text-black">{exec.total_offset_npt_hours || 0} hrs</strong></span>
                  <span>Closest Subsurface Approach: <strong className="text-emerald-400 print:text-black">{exec.closest_approach_distance_m}m</strong> (<span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getWellColor(exec.closest_approach_offset_well).badge}`}>{exec.closest_approach_offset_well}</span>)</span>
                </div>
                {exec.mitigation_wilson_stats && (
                  <div className="mt-2.5 pt-2.5 border-t border-amber-900/30 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-amber-200">Historical Mitigation Success Rate (Wilson 95% CI):</span>
                    <span className="font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                      {exec.mitigation_wilson_stats.display_insight || `${(exec.mitigation_wilson_stats.point_estimate * 100).toFixed(0)}% (95% CI: ${(exec.mitigation_wilson_stats.ci_lower * 100).toFixed(0)}%-${(exec.mitigation_wilson_stats.ci_upper * 100).toFixed(0)}%, n=${exec.mitigation_wilson_stats.sample_size})`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Recommended Casing and Mud Program */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 print:text-black mb-3 flex items-center space-x-1.5">
              <Layers size={14} className="text-amber-400" />
              <span>Section 2: Offset-Derived Casing & Mud Weight Program</span>
            </h3>

            <div className="overflow-x-auto border border-slate-800 rounded-lg print:border-slate-300">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 text-slate-400 print:bg-slate-100 print:text-black border-b border-slate-800 print:border-slate-300 font-mono">
                  <tr>
                    <th className="py-2.5 px-3">Casing String</th>
                    <th className="py-2.5 px-3">Planned Shoe TVD</th>
                    <th className="py-2.5 px-3">Formation Seat</th>
                    <th className="py-2.5 px-3">Recommended Mud Weight</th>
                    <th className="py-2.5 px-3">Operational Objective</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 print:divide-slate-200">
                  {casingProg.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 print:hover:bg-transparent">
                      <td className="py-2.5 px-3 font-bold text-white print:text-black">{c.string}</td>
                      <td className="py-2.5 px-3 font-mono text-cyan-300 print:text-black">{c.planned_depth_tvd}</td>
                      <td className="py-2.5 px-3 text-slate-300 print:text-black">{c.formation}</td>
                      <td className="py-2.5 px-3 font-mono text-amber-300 print:text-black">{c.mud_weight}</td>
                      <td className="py-2.5 px-3 text-slate-400 print:text-slate-700">{c.objective}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: 3D Directional Anti-Collision Clearance */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 print:text-black mb-3 flex items-center space-x-1.5">
              <Compass size={14} className="text-cyan-400" />
              <span>Section 3: Directional Borehole Anti-Collision Clearance</span>
            </h3>

            <div className="overflow-x-auto border border-slate-800 rounded-lg print:border-slate-300">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 text-slate-400 print:bg-slate-100 print:text-black border-b border-slate-800 print:border-slate-300 font-mono">
                  <tr>
                    <th className="py-2.5 px-3">Offset Well</th>
                    <th className="py-2.5 px-3">Minimum Distance</th>
                    <th className="py-2.5 px-3">Separation Factor (SF)</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Active Bit MD</th>
                    <th className="py-2.5 px-3">Offset Well MD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 print:divide-slate-200 font-mono">
                  {antiCollision.map((ac, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 print:hover:bg-transparent">
                      <td className="py-2 px-3 font-bold font-mono">
                        <span className={`px-2 py-0.5 rounded text-xs border ${getWellColor(ac.offset_well_id).badge}`}>
                          {ac.offset_well_id}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-bold text-cyan-400 print:text-black">{ac.min_distance_m} m</td>
                      <td className="py-2 px-3 text-slate-300 print:text-black">{ac.separation_factor}</td>
                      <td className="py-2 px-3">
                        <span 
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border print:border-none"
                          style={{
                            backgroundColor: `${ac.color}20`,
                            color: ac.color,
                            borderColor: `${ac.color}50`
                          }}
                        >
                          {ac.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400 print:text-black">{Math.round(ac.active_depth_md || 0)} m</td>
                      <td className="py-2 px-3 text-slate-400 print:text-black">{Math.round(ac.offset_depth_md || 0)} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5: Historical NPT Events Breakdown by Stratigraphic Horizon */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 print:text-black mb-3 flex items-center space-x-1.5">
              <AlertTriangle size={14} className="text-red-400" />
              <span>Section 4: Historical Offset Incidents by Stratigraphic Horizon</span>
            </h3>

            <div className="space-y-4">
              {Object.entries(formBreakdown).map(([formName, evList]) => {
                if (!evList || evList.length === 0) return null;
                return (
                  <div key={formName} className="border border-slate-800 rounded-lg p-3.5 bg-slate-950/40 print:bg-slate-50 print:border-slate-300">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="font-bold text-sm text-cyan-300 print:text-cyan-900">{formName}</span>
                      <div className="flex items-center space-x-2">
                        {dossier?.formation_wilson_stats?.[formName] && (
                          <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                            Mitigation: {dossier.formation_wilson_stats[formName].display_insight}
                          </span>
                        )}
                        <span className="text-xs text-slate-400 font-mono">
                          {evList.length} incident(s)
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {evList.map((ev, idx) => {
                        const wellTheme = getWellColor(ev.well_id);
                        return (
                          <div key={idx} className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs print:bg-white print:border-slate-300">
                            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] mb-2.5">
                              <div className="flex items-center space-x-2">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${wellTheme.badge}`}>
                                  {ev.well_id}
                                </span>
                                <span className="text-slate-300 print:text-slate-800 font-semibold">
                                  • {ev.event_type}
                                </span>
                              </div>
                              <span className="text-amber-400 print:text-amber-800 font-semibold">{ev.depth_tvd}m TVD ({ev.npt_hours}h NPT)</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                              {/* Cause in RED */}
                              <div className="p-2.5 rounded-md bg-rose-950/25 border border-rose-500/30 text-rose-200 print:bg-rose-50 print:border-rose-300 print:text-rose-900">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400 print:text-rose-700 flex items-center gap-1.5 mb-1 font-mono">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  Cause:
                                </div>
                                <div className="text-rose-100 print:text-rose-950 leading-relaxed">
                                  {ev.root_cause || 'Formation instability and pressure differential.'}
                                </div>
                              </div>

                              {/* Mitigation and Reason in GREEN */}
                              <div className="p-2.5 rounded-md bg-emerald-950/25 border border-emerald-500/30 text-emerald-200 print:bg-emerald-50 print:border-emerald-300 print:text-emerald-900">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 print:text-emerald-700 flex items-center gap-1.5 mb-1 font-mono">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Mitigation & Operational Reason:
                                </div>
                                <div className="text-emerald-100 print:text-emerald-950 leading-relaxed">
                                  {ev.mitigation_applied || 'Standard LCM pill, mud weight conditioning, and flow check.'}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sign-off Box */}
          <div className="pt-6 border-t-2 border-slate-700 print:border-black grid grid-cols-3 gap-6 text-xs text-slate-400 print:text-slate-600">
            <div>
              <span className="block mb-6">Prepared By:</span>
              <div className="border-b border-slate-600 pb-1 font-mono text-slate-300 print:text-black">AGATE Autonomous AI</div>
              <span className="text-[10px]">Lead Drilling Engineer (Operations)</span>
            </div>
            <div>
              <span className="block mb-6">Geological Review:</span>
              <div className="border-b border-slate-600 pb-1 font-mono text-slate-300 print:text-black">Assam Shelf Subsurface Group</div>
              <span className="text-[10px]">Senior Geologist / Petrophysicist</span>
            </div>
            <div>
              <span className="block mb-6">Operations Approval:</span>
              <div className="border-b border-slate-600 pb-1 font-mono text-slate-300 print:text-black">Pending Rig Mobilization</div>
              <span className="text-[10px]">Drilling Superintendent, OIL</span>
            </div>
          </div>

        </div>

        {/* Footer - Screen only */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400 print:hidden">
          <span>Official AGATE Decision Support Document.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition"
          >
            Close Dossier
          </button>
        </div>

      </div>
    </div>
  );
};

export default PreSpudDossierModal;
