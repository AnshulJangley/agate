import React, { useState, useEffect } from'react';
import axios from'axios';
import { API_BASE } from'../lib/api';
import SourceTag, { getWellDataSource } from'./SourceTag';
import { evaluateOfflineLookahead } from'../lib/offlinePhysicsEngine';
import { getWellColor } from'../lib/wellColors';
import { getRegionDisplayLabel } from'../lib/regionalGeology';
import { 
 Radar, 
 AlertTriangle, 
 ShieldAlert, 
 Layers, 
 CheckCircle2, 
 ArrowRight, 
 Sliders, 
 RefreshCw, 
 X,
 Compass,
 Zap,
 Info,
 HardDrive,
 Maximize2,
 Minimize2,
 ExternalLink
} from'lucide-react';

const WELL_DEFAULT_DEPTHS = {'OIL-BAGHJAN-1': 2240,'OIL-BAGHJAN-4': 2260,'OIL-NAHARKATIYA-1': 1920,'OIL-MORAN-1': 2460,'OIL-DIKOM-1': 2120,'OIL-TENGAKHAT-1': 1990,'OIL-KOTHALONI-1': 2200,'OIL-HAPJAN-1': 2230,'OIL-SHALMARI-1': 2080,'OIL-KUSIJAN-1': 2280,'OIL-HEBEDA-1': 2220,'OIL-RAJ-BAGHEWALA-1': 2100,'OIL-RAJ-BAGHEWALA-2': 2150,'OIL-RAJ-DANDEWALA-1': 2050,'OIL-RAJ-TANOT-1': 1950,'OIL-RAJ-TANOT-2': 2000,'OIL-KG-DEEPWATER-1': 3200,'OIL-KG-DWN-98-2': 3350,'OIL-KG-D6-OFFSHORE': 3450,'OIL-KG-YANAM-1': 2950,'OIL-KG-AMALAPURAM-1': 2850,'OIL-MZ-AIZAWL-1': 2800,'OIL-MZ-CHAMPHAI-1': 3250,'OIL-MZ-KOLASIB-1': 2750,'OIL-MZ-LUNGLEI-1': 3100,'OIL-MZ-MAMIT-1': 2920,
};

const LookAheadRadar = ({ isOpen, onClose, activeWellId ='OIL-BAGHJAN-1', currentDepth = 2240.0, isFullScreen: propFullScreen = false }) => {
 const [targetWellId, setTargetWellId] = useState(activeWellId);
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(false);
 const [windowMeters, setWindowMeters] = useState(250);
 const [simulatedDepth, setSimulatedDepth] = useState(currentDepth);
 const [lastScanned, setLastScanned] = useState(null);
 const [scanNotice, setScanNotice] = useState(false);
 const [isOfflineEngine, setIsOfflineEngine] = useState(false);
 const [isFullScreen, setIsFullScreen] = useState(() => {
 if (typeof window !== 'undefined') {
 const p = new URLSearchParams(window.location.search);
 return propFullScreen || p.get('fullscreen') === 'true'|| p.get('module') === 'radar';
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
 if (e.key === 'Escape'&& isOpen) {
 if (typeof window !== 'undefined'&& window.location.search.includes(' module=')) {
 window.close();
 }
 onClose();
 }
 };
 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, [isOpen, onClose]);

 // Sync to initial well and depth when modal opens or activeWellId changes
 useEffect(() => {
 if (isOpen) {
 setTargetWellId(activeWellId);
 const baseD = WELL_DEFAULT_DEPTHS[activeWellId] || currentDepth || 2240.0;
 setSimulatedDepth(baseD);
 }
 }, [isOpen, activeWellId]);

 const handleWellChange = (newWellId) => {
 setTargetWellId(newWellId);
 const newBaseD = WELL_DEFAULT_DEPTHS[newWellId] || 2240.0;
 setSimulatedDepth(newBaseD);
 fetchLookAhead(newWellId, newBaseD);
 };

 const fetchLookAhead = async (overrideWell = null, overrideDepth = null) => {
 if (!isOpen) return;
 setLoading(true);
 const wellToUse = overrideWell || targetWellId;
 const depthToUse = overrideDepth !== null ? overrideDepth : simulatedDepth;
 const startTime = Date.now();

 try {
 const res = await axios.get(`${API_BASE}/api/wells/${wellToUse}/lookahead`, {
 params: {
 current_depth: depthToUse,
 window_meters: windowMeters,
 _t: Date.now() // Cache-busting parameter
 },
 timeout: 3000
 });
 setData(res.data);
 setIsOfflineEngine(false);
 const now = new Date();
 setLastScanned(now.toLocaleTimeString());
 setScanNotice(true);
 setTimeout(() => setScanNotice(false), 2500);
 } catch (err) {
 console.warn('Network lookahead fetch failed; activating onboard offline physics engine: ', err.message);
 const fallbackData = evaluateOfflineLookahead(wellToUse, depthToUse, windowMeters);
 setData(fallbackData);
 setIsOfflineEngine(true);
 const now = new Date();
 setLastScanned(`${now.toLocaleTimeString()} (Offline Edge)`);
 setScanNotice(true);
 setTimeout(() => setScanNotice(false), 2500);
 } finally {
 // Ensure the scan animation is visibly perceived (minimum 400ms)
 const elapsed = Date.now() - startTime;
 const delay = Math.max(0, 450 - elapsed);
 setTimeout(() => {
 setLoading(false);
 }, delay);
 }
 };

 useEffect(() => {
 if (isOpen) {
 fetchLookAhead();
 }
 }, [isOpen, targetWellId, simulatedDepth, windowMeters]);

 if (!isOpen) return null;

 const distToNext = data?.distance_to_next_formation_m;
 const nextFormation = data?.next_formation;
 const currentRisk = data?.current_ml_risk || {};
 const upcomingFormations = data?.upcoming_formations || [];
 const offsetEvents = data?.events || [];
 const recommendations = data?.recommendations || [];

 const ml = data?.ml_risk_assessment || {};
 const riskScore = ml.risk_score !== undefined ? ml.risk_score : 0.45;
 const isHighRisk = riskScore > 0.65;
 const isModerateRisk = riskScore >= 0.35 && riskScore <= 0.65;

 const riskColor = isHighRisk ? '#848484': (isModerateRisk ? '#B1B1B1': '#A3A3A3');
 const riskLabel = isHighRisk ? 'CRITICAL AHEAD': (isModerateRisk ? 'ELEVATED HAZARD': 'SAFE CORRIDOR');

 return (
 <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200 ${isFullScreen ? 'p-0 w-screen h-screen': 'p-2 sm:p-4'}`}>
 <div className={`bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col ${isFullScreen ? 'w-screen h-screen rounded-none border-none max-h-none h-full': 'w-full max-w-5xl rounded-xl max-h-[96vh] sm:max-h-[92vh]'}`}>
 
 {/* Header */}
 <div className="px-3 sm:px-6 py-3 sm:py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center gap-2">
 <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
 <div className="p-1.5 sm:p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
 <Radar size={22} className={loading ? "animate-spin": ""} />
 </div>
 <div className="min-w-0">
 <div className="flex items-center space-x-2 flex-wrap gap-y-1">
 <h3 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
 Ahead-of-the-Bit Hazard Radar
 </h3>
 
 {/* Active Well Selector */}
 <select
 value={targetWellId}
 onChange={(e) => handleWellChange(e.target.value)}
 className="bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-mono font-bold rounded-lg px-2 py-1 outline-none hover:border-cyan-500 focus:border-cyan-400 cursor-pointer transition max-w-[140px] truncate" title="Switch Target Well for Offset Radar Analysis">
 <optgroup label={getRegionDisplayLabel('assam','Upper Assam')}>
 <option value="OIL-BAGHJAN-1">BAGHJAN-1</option>
 <option value="OIL-BAGHJAN-4">BAGHJAN-4</option>
 <option value="OIL-NAHARKATIYA-1">NAHARKATIYA-1</option>
 <option value="OIL-MORAN-1">MORAN-1</option>
 <option value="OIL-DIKOM-1">DIKOM-1</option>
 <option value="OIL-TENGAKHAT-1">TENGAKHAT-1</option>
 <option value="OIL-KOTHALONI-1">KOTHALONI-1</option>
 <option value="OIL-HAPJAN-1">HAPJAN-1</option>
 <option value="OIL-SHALMARI-1">SHALMARI-1</option>
 <option value="OIL-KUSIJAN-1">KUSIJAN-1</option>
 <option value="OIL-HEBEDA-1">HEBEDA-1</option>
 </optgroup>
 <optgroup label={getRegionDisplayLabel('rajasthan')}>
 <option value="OIL-RAJ-BAGHEWALA-1">BAGHEWALA-1</option>
 <option value="OIL-RAJ-BAGHEWALA-2">BAGHEWALA-2</option>
 <option value="OIL-RAJ-TANOT-1">TANOT-1</option>
 <option value="OIL-RAJ-TANOT-2">TANOT-2</option>
 <option value="OIL-RAJ-DANDEWALA-1">DANDEWALA-1</option>
 </optgroup>
 <optgroup label={getRegionDisplayLabel('kg')}>
 <option value="OIL-KG-DEEPWATER-1">KG-DEEPWATER-1</option>
 <option value="OIL-KG-DWN-98-2">KG-DWN-98/2</option>
 <option value="OIL-KG-D6-OFFSHORE">KG-D6-OFFSHORE</option>
 <option value="OIL-KG-YANAM-1">KG-YANAM-1</option>
 <option value="OIL-KG-AMALAPURAM-1">KG-AMALAPURAM-1</option>
 </optgroup>
 <optgroup label={getRegionDisplayLabel('mizoram')}>
 <option value="OIL-MZ-AIZAWL-1">MZ-AIZAWL-1</option>
 <option value="OIL-MZ-CHAMPHAI-1">MZ-CHAMPHAI-1</option>
 <option value="OIL-MZ-KOLASIB-1">MZ-KOLASIB-1</option>
 <option value="OIL-MZ-LUNGLEI-1">MZ-LUNGLEI-1</option>
 <option value="OIL-MZ-MAMIT-1">MZ-MAMIT-1</option>
 </optgroup>
 </select>

 <SourceTag source={targetWellId} compact={true} />

 <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
 {Math.round(simulatedDepth)}m
 </span>
 {isOfflineEngine && (
 <span className="flex items-center space-x-1 text-[10px] bg-cyan-950/80 text-cyan-400 border border-cyan-700/50 px-2 py-0.5 rounded-full font-mono">
 <HardDrive size={10} />
 <span>Rig Edge Offline</span>
 </span>
 )}
 {scanNotice && (
 <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
 Updated
 </span>
 )}
 </div>
 <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
 Proactive offset well correlation scanning {windowMeters}m ahead of the current bit position
 {lastScanned && <span className="ml-2 font-mono text-slate-500">• Last scan: {lastScanned}</span>}
 </p>
 </div>
 </div>

 <div className="flex items-center space-x-2 shrink-0">
 {/* Prominent Refresh Button */}
 <button 
 onClick={() => fetchLookAhead()}
 disabled={loading}
 className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-white font-medium text-xs flex items-center space-x-1.5 transition shadow-sm disabled:opacity-50 min-h-[36px]" title="Trigger active radar horizon sweep">
 <RefreshCw size={13} className={loading ? 'animate-spin text-cyan-400': ''} />
 <span className="hidden sm:inline">{loading ? 'Scanning...': 'Re-scan Radar'}</span>
 <span className="sm:hidden">{loading ? '...': 'Scan'}</span>
 </button>

 {/* Toggle Fullscreen Button */}
 <button
 onClick={handleToggleFullscreen}
 className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer" title={isFullScreen ? "Exit Fullscreen (Window Mode)": "Expand to Full Screen"}
 >
 {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
 </button>

 {/* Pop out to New Tab */}
 <button
 onClick={() => window.open(`${window.location.origin}${window.location.pathname}?module=radar&well=${encodeURIComponent(targetWellId)}&fullscreen=true`,'_blank')}
 className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition min-h-[36px] min-w-[36px] flex items-center justify-center" title="Open in Dedicated Browser Tab (Full Screen)">
 <ExternalLink size={16} />
 </button>

 <button 
 onClick={() => {
 if (typeof window !== 'undefined'&& window.location.search.includes(' module=')) {
 window.close();
 }
 onClose();
 }}
 className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition min-h-[36px] min-w-[36px] flex items-center justify-center" title="Close View">
 <X size={18} />
 </button>
 </div>
 </div>

 {/* Controls Bar */}
 <div className="px-3 sm:px-6 py-2.5 sm:py-3 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
 <div className="flex items-center space-x-4">
 <div className="flex items-center space-x-2 text-slate-300">
 <Sliders size={14} className="text-cyan-400"/>
 <span>Look-Ahead Horizon:</span>
 <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-md p-1">
 {[150, 250, 350, 500].map(dist => (
 <button
 key={dist}
 onClick={() => setWindowMeters(dist)}
 className={`px-2.5 py-1 rounded font-medium transition ${
 windowMeters === dist 
 ? 'bg-cyan-500 text-slate-950 font-bold': 'text-slate-400 hover:text-white'}`}
 >
 +{dist}m
 </button>
 ))}
 </div>
 </div>

 <div className="flex items-center space-x-2 text-slate-300">
 <span>Simulated Bit Depth:</span>
 <input 
 type="range" min="1000" max="3200" step="20" value={simulatedDepth}
 onChange={(e) => setSimulatedDepth(parseFloat(e.target.value))}
 className="w-32 accent-cyan-500 cursor-pointer"/>
 <span className="font-mono text-cyan-400 font-bold w-14">{Math.round(simulatedDepth)}m</span>
 <button
 onClick={() => {
 const targetD = currentDepth || 2240.0;
 setSimulatedDepth(targetD);
 fetchLookAhead(targetD);
 }}
 className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition" title="Reset to current live telemetry bit depth">
 Sync Live
 </button>
 </div>
 </div>

 {/* Quick Metrics */}
 <div className="flex items-center space-x-4 font-mono">
 <span className="text-slate-400">
 Scan Range: <strong className="text-white">{Math.round(simulatedDepth)}m → {Math.round(simulatedDepth + windowMeters)}m</strong>
 </span>
 <span className="text-slate-400">
 Correlated Offset Incidents: <strong className="text-amber-400">{data?.horizon_events_count || 0}</strong>
 </span>
 </div>
 </div>

 {/* Content Body */}
 <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
 
 {/* Top Row: Predictive Horizon Status Card */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 
 {/* Horizon Threat Gauge */}
 <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
 <div>
 <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">Unified ML Hazard Forecast</span>
 <div className="flex items-baseline justify-between mt-2">
 <span className="text-2xl font-black font-mono" style={{ color: riskColor }}>
 {(riskScore * 100).toFixed(0)}%
 </span>
 <span className="text-xs px-2.5 py-1 rounded-full font-bold border" style={{ color: riskColor, borderColor:`${riskColor}50`, backgroundColor:`${riskColor}15`}}>
 {riskLabel}
 </span>
 </div>
 <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-3">
 <div 
 className="h-full transition-all duration-500 rounded-full" style={{ width:`${Math.min(100, Math.max(5, riskScore * 100))}%`, backgroundColor: riskColor }}
 />
 </div>
 </div>
 <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
 <span>Primary Ahead Threat:</span>
 <span className="font-bold text-slate-200 uppercase">{ml.dominant_threat ||'NORMAL'}</span>
 </div>
 </div>

 {/* Upcoming Formation Top */}
 <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
 <div>
 <span className="text-xs uppercase tracking-wider text-slate-400 font-medium flex items-center space-x-1.5">
 <Layers size={14} className="text-amber-400"/>
 <span>Next Stratigraphic Transition</span>
 </span>
 
 {data?.next_formation ? (
 <div className="mt-2">
 <div className="text-lg font-bold text-white">
 {data.next_formation}
 </div>
 <div className="flex items-center space-x-2 mt-1">
 <span className="text-sm font-mono text-cyan-400 font-bold">
 {data.distance_to_next_formation_m > 0 ?`In ${data.distance_to_next_formation_m}m`: 'Penetrated'}
 </span>
 <span className="text-xs text-slate-400">
 (Top at {data.upcoming_formations?.[0]?.tvd_top || 2400}m TVD)
 </span>
 </div>
 </div>
 ) : (
 <div className="mt-3 text-sm text-slate-400">
 No major stratigraphic boundary in immediate {windowMeters}m horizon
 </div>
 )}
 </div>

 <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
 {data?.upcoming_formations?.[0]?.primary_risk ? (
 <span className="text-amber-300/90 font-medium">
 {data.upcoming_formations[0].primary_risk}
 </span>
 ) : (
 <span>Consistent formation lithology</span>
 )}
 </div>
 </div>

 {/* Historical Incident Breakdown */}
 <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
 <div>
 <span className="text-xs uppercase tracking-wider text-slate-400 font-medium flex items-center space-x-1.5">
 <Compass size={14} className="text-cyan-400"/>
 <span>Offset Well Incidents in Horizon</span>
 </span>

 <div className="grid grid-cols-3 gap-2 mt-3 text-center">
 <div className="p-2 rounded-lg bg-red-950/30 border border-red-900/40">
 <span className="text-xs text-red-400 block font-medium">Kicks</span>
 <strong className="text-lg font-mono text-red-300">{data?.kick_events_count || 0}</strong>
 </div>
 <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-900/40">
 <span className="text-xs text-amber-400 block font-medium">Losses</span>
 <strong className="text-lg font-mono text-amber-300">{data?.loss_events_count || 0}</strong>
 </div>
 <div className="p-2 rounded-lg bg-purple-950/30 border border-purple-900/40">
 <span className="text-xs text-purple-400 block font-medium">Stuck</span>
 <strong className="text-lg font-mono text-purple-300">{data?.stuck_events_count || 0}</strong>
 </div>
 </div>
 </div>

 <div className="mt-3 pt-2 text-[11px] text-slate-400 text-center">
 Total Correlated Offset Incidents: <strong className="text-white font-mono">{data?.horizon_events_count || 0}</strong>
 </div>
 </div>

 </div>

 {/* Driller Proactive Advisory Action Plan */}
 <div className="p-5 rounded-xl bg-slate-950/90 border border-slate-800">
 <div className="flex items-center space-x-2 mb-4">
 <Zap size={18} className="text-amber-400"/>
 <h3 className="text-sm font-bold text-white uppercase tracking-wider">
 Proactive Driller Advisory & Preventive Checklist
 </h3>
 <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
 Mandatory Prior to {Math.round(simulatedDepth + 100)}m
 </span>
 </div>

 <div className="space-y-2.5">
 {data?.advisory_actions?.map((adv, idx) => {
 const isCrit = adv.priority === 'CRITICAL'|| adv.priority === 'HIGH';
 return (
 <div 
 key={idx}
 className={`p-3.5 rounded-lg border flex items-start space-x-3 transition ${
 isCrit 
 ? 'bg-red-950/20 border-red-900/50 text-red-100': 'bg-slate-900/80 border-slate-800 text-slate-200'}`}
 >
 <div className="mt-0.5">
 {isCrit ? (
 <ShieldAlert size={18} className="text-red-400 flex-shrink-0"/>
 ) : (
 <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0"/>
 )}
 </div>
 <div className="flex-1 text-xs">
 <div className="flex items-center space-x-2 mb-1">
 <span className="font-mono font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
 {adv.category}
 </span>
 <span className={`text-[10px] font-bold uppercase ${isCrit ? 'text-red-400': 'text-emerald-400'}`}>
 {adv.priority} PRIORITY
 </span>
 </div>
 <p className="leading-relaxed font-medium">{adv.action}</p>
 </div>
 </div>
 );
 })}
 </div>
 </div>

 {/* Correlated Historical Incidents in the Upcoming Horizon */}
 <div className="p-5 rounded-xl bg-slate-950/90 border border-slate-800">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center space-x-2">
 <AlertTriangle size={18} className="text-cyan-400"/>
 <h3 className="text-sm font-bold text-white uppercase tracking-wider">
 Nearby Offset Incidents in This Depth Corridor ({Math.round(simulatedDepth)}m – {Math.round(simulatedDepth + windowMeters)}m)
 </h3>
 </div>
 <span className="text-xs text-slate-400">
 Institutional Memory RAG Query
 </span>
 </div>

 {data?.events && data.events.length > 0 ? (
 <div className="space-y-3">
 {data.events.map((ev, i) => (
 <div key={i} className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-xs hover:border-slate-700 transition">
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center space-x-2">
 <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono border ${getWellColor(ev.well_id).badge}`}>
 {ev.well_id}
 </span>
 {ev.offset_distance_km !== undefined && ev.offset_distance_km > 0 && (
 <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800 text-cyan-300 font-mono font-semibold">
 {ev.offset_distance_km} km offset
 </span>
 )}
 {!ev.is_offset && (
 <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono">
 Target Well Run
 </span>
 )}
 <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono">
 {ev.formation} @ {ev.depth_tvd}m TVD
 </span>
 <span className="text-xs px-2 py-0.5 rounded font-bold uppercase" style={{
 backgroundColor: ev.severity === 'CRITICAL'? '#EF444420': '#F59E0B20',
 color: ev.severity === 'CRITICAL'? '#848484': '#B1B1B1',
 borderColor: ev.severity === 'CRITICAL'? '#EF444450': '#F59E0B50'}}>
 {ev.event_type}
 </span>
 </div>
 <span className="font-mono text-slate-400 text-[11px]">
 NPT: <strong className="text-amber-400">{ev.npt_hours ?`${ev.npt_hours}h`: '4.0h'}</strong>
 </span>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
 {/* Cause in RED */}
 <div className="p-2.5 rounded-md bg-rose-950/25 border border-rose-500/30 text-rose-200">
 <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-1 font-mono">
 <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
 Cause / Root Failure:
 </div>
 <span className="text-rose-100 leading-relaxed font-sans block">{ev.root_cause}</span>
 </div>

 {/* Mitigation in GREEN */}
 <div className="p-2.5 rounded-md bg-emerald-950/25 border border-emerald-500/30 text-emerald-200">
 <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-1 font-mono">
 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
 Field Mitigation:
 </div>
 <span className="text-emerald-100 leading-relaxed font-sans block">
 {ev.mitigation || ev.mitigation_applied ||"Adjusted drilling parameters, conditioned mud weight, and monitored standpipe pressure."}
 </span>
 </div>
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="py-8 text-center text-slate-400 text-xs">
 No major NPT events recorded in offset wells within the immediate {windowMeters}m depth corridor.
 </div>
 )}
 </div>

 </div>

 {/* Footer */}
 <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
 <div className="flex items-center space-x-2">
 <Info size={14} className="text-cyan-400"/>
 <span>Look-Ahead Radar updates in real-time as bit advances via WITSML telemetry feed.</span>
 </div>
 <button
 onClick={onClose}
 className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition">
 Close Radar
 </button>
 </div>

 </div>
 </div>
 );
};

export default LookAheadRadar;
