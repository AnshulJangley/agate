import { MONO_COLORWAY } from './lib/mono';
import React, { useState, useEffect, useRef, useCallback } from'react';
import { useNavigate } from'react-router-dom';
import { 
 Activity, 
 Map as MapIcon, 
 Settings, 
 Bell, 
 ChevronDown, 
 Database,
 AlertTriangle,
 AlertCircle,
 XCircle,
 TrendingDown,
 FileUp,
 Search,
 Download,
 Radar,
 Gauge,
 FileText,
 Brain,
 CheckCircle2,
 Sparkles,
 X,
 ChevronRight,
 Layers,
 Play,
 Pause,
 RotateCcw,
 Flame,
 Droplets,
 Anchor,
 BarChart2,
 Menu,
 Sliders,
 ShieldCheck,
 Info,
 Terminal,
 History,
 Bot,
 Cpu,
 ExternalLink,
 PanelRightClose,
 PanelRightOpen
} from'lucide-react';
import axios from'axios';
import { API_BASE, WS_BASE, isOnline, subscribeNetworkStatus } from'./lib/api';
import { evaluateOfflineHazard, evaluateOfflineLookahead, searchOfflineIncidents } from'./lib/offlinePhysicsEngine';
import Plot from'react-plotly.js';

import WellMap, { BASEMAP_OPTIONS, BASEMAP_STORAGE_KEY } from'./components/WellMap';
import DocumentUploadModal from'./components/DocumentUploadModal';
import KnowledgeSearch from'./components/KnowledgeSearch';
import CorrelationPanel from'./components/CorrelationPanel';
import LookAheadRadar from'./components/LookAheadRadar';
import PPFGWindowModal from'./components/PPFGWindowModal';
import PreSpudDossierModal from'./components/PreSpudDossierModal';
import BacktestResultsModal from'./components/BacktestResultsModal';
import ContributeLessonModal from'./components/ContributeLessonModal';
import DataTransparencyModal from'./components/DataTransparencyModal';
import SourceTag, { getWellDataSource } from'./components/SourceTag';
import MatrixRain from'./components/MatrixRain';
import AiModelModal from'./components/AiModelModal';

import { getWellColor } from'./lib/wellColors';

import { REGIONS_CONFIG, getRegionBadge, getRegionIdFromWellId, isRegionCalibrated, getRegionProvenance, getRegionDisplayLabel } from'./lib/regionalGeology';

const WELL_DEFAULT_TELEMETRY = {
 // Upper Assam Basin'OIL-BAGHJAN-1': { well_id: 'OIL-BAGHJAN-1', depth_tvd: 2240.0, rop: 16.5, wob: 14.0, rpm: 105.0, torque: 13200.0, mud_weight: 11.2, ecd: 11.6, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2800.0 },'OIL-BAGHJAN-4': { well_id: 'OIL-BAGHJAN-4', depth_tvd: 2380.0, rop: 18.2, wob: 15.0, rpm: 110.0, torque: 14100.0, mud_weight: 11.4, ecd: 11.8, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2950.0 },'OIL-NAHARKATIYA-1': { well_id: 'OIL-NAHARKATIYA-1', depth_tvd: 2020.0, rop: 14.0, wob: 12.5, rpm: 95.0, torque: 11800.0, mud_weight: 10.8, ecd: 11.2, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2600.0 },'OIL-MORAN-1': { well_id: 'OIL-MORAN-1', depth_tvd: 2550.0, rop: 15.0, wob: 13.0, rpm: 100.0, torque: 12500.0, mud_weight: 11.0, ecd: 11.4, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2750.0 },'OIL-DIKOM-1': { well_id: 'OIL-DIKOM-1', depth_tvd: 2200.0, rop: 17.0, wob: 14.5, rpm: 105.0, torque: 13500.0, mud_weight: 11.3, ecd: 11.7, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2850.0 },'OIL-TENGAKHAT-1': { well_id: 'OIL-TENGAKHAT-1', depth_tvd: 2100.0, rop: 16.0, wob: 13.5, rpm: 100.0, torque: 12800.0, mud_weight: 11.1, ecd: 11.5, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2700.0 },'OIL-KOTHALONI-1': { well_id: 'OIL-KOTHALONI-1', depth_tvd: 2300.0, rop: 15.5, wob: 14.0, rpm: 105.0, torque: 13000.0, mud_weight: 11.2, ecd: 11.6, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2800.0 },'OIL-HAPJAN-1': { well_id: 'OIL-HAPJAN-1', depth_tvd: 2400.0, rop: 14.5, wob: 13.0, rpm: 100.0, torque: 12500.0, mud_weight: 11.0, ecd: 11.4, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2750.0 },'OIL-SHALMARI-1': { well_id: 'OIL-SHALMARI-1', depth_tvd: 2150.0, rop: 17.5, wob: 14.5, rpm: 110.0, torque: 13500.0, mud_weight: 11.3, ecd: 11.7, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2850.0 },'OIL-KUSIJAN-1': { well_id: 'OIL-KUSIJAN-1', depth_tvd: 2280.0, rop: 16.0, wob: 14.0, rpm: 102.0, torque: 13100.0, mud_weight: 11.1, ecd: 11.5, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2780.0 },'OIL-HEBEDA-1': { well_id: 'OIL-HEBEDA-1', depth_tvd: 2220.0, rop: 16.2, wob: 13.8, rpm: 104.0, torque: 12900.0, mud_weight: 11.0, ecd: 11.4, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2760.0 },

 // Rajasthan Basin'OIL-RAJ-BAGHEWALA-1': { well_id: 'OIL-RAJ-BAGHEWALA-1', depth_tvd: 2100.0, rop: 10.5, wob: 12.0, rpm: 90.0, torque: 14500.0, mud_weight: 10.5, ecd: 11.0, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2100.0 },'OIL-RAJ-BAGHEWALA-2': { well_id: 'OIL-RAJ-BAGHEWALA-2', depth_tvd: 2150.0, rop: 11.0, wob: 12.5, rpm: 92.0, torque: 14800.0, mud_weight: 10.6, ecd: 11.1, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2150.0 },'OIL-RAJ-TANOT-1': { well_id: 'OIL-RAJ-TANOT-1', depth_tvd: 1950.0, rop: 11.2, wob: 13.0, rpm: 95.0, torque: 14200.0, mud_weight: 10.4, ecd: 10.9, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2050.0 },'OIL-RAJ-TANOT-2': { well_id: 'OIL-RAJ-TANOT-2', depth_tvd: 2000.0, rop: 11.5, wob: 13.2, rpm: 96.0, torque: 14300.0, mud_weight: 10.5, ecd: 11.0, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2080.0 },'OIL-RAJ-DANDEWALA-1': { well_id: 'OIL-RAJ-DANDEWALA-1', depth_tvd: 2050.0, rop: 10.8, wob: 12.8, rpm: 94.0, torque: 14400.0, mud_weight: 10.4, ecd: 10.9, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 2060.0 },

 // KG Deepwater'OIL-KG-DEEPWATER-1': { well_id: 'OIL-KG-DEEPWATER-1', depth_tvd: 3200.0, rop: 8.5, wob: 18.0, rpm: 85.0, torque: 18500.0, mud_weight: 13.2, ecd: 13.8, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 4100.0 },'OIL-KG-DWN-98-2': { well_id: 'OIL-KG-DWN-98-2', depth_tvd: 3350.0, rop: 8.2, wob: 18.5, rpm: 82.0, torque: 19100.0, mud_weight: 13.4, ecd: 14.0, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 4250.0 },'OIL-KG-D6-OFFSHORE': { well_id: 'OIL-KG-D6-OFFSHORE', depth_tvd: 3450.0, rop: 7.8, wob: 19.0, rpm: 80.0, torque: 19800.0, mud_weight: 13.6, ecd: 14.2, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 4400.0 },'OIL-KG-YANAM-1': { well_id: 'OIL-KG-YANAM-1', depth_tvd: 2950.0, rop: 9.5, wob: 16.5, rpm: 90.0, torque: 17200.0, mud_weight: 12.8, ecd: 13.3, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 3850.0 },'OIL-KG-AMALAPURAM-1': { well_id: 'OIL-KG-AMALAPURAM-1', depth_tvd: 2850.0, rop: 10.2, wob: 16.0, rpm: 92.0, torque: 16800.0, mud_weight: 12.5, ecd: 13.0, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 3700.0 },

 // Mizoram Fold Belt'OIL-MZ-AIZAWL-1': { well_id: 'OIL-MZ-AIZAWL-1', depth_tvd: 2800.0, rop: 7.5, wob: 22.0, rpm: 80.0, torque: 21500.0, mud_weight: 12.5, ecd: 13.0, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 3800.0 },'OIL-MZ-MAMIT-1': { well_id: 'OIL-MZ-MAMIT-1', depth_tvd: 2920.0, rop: 7.2, wob: 22.5, rpm: 78.0, torque: 22100.0, mud_weight: 12.7, ecd: 13.2, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 3950.0 },'OIL-MZ-KOLASIB-1': { well_id: 'OIL-MZ-KOLASIB-1', depth_tvd: 2750.0, rop: 7.8, wob: 21.5, rpm: 82.0, torque: 20900.0, mud_weight: 12.4, ecd: 12.9, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 3750.0 },'OIL-MZ-LUNGLEI-1': { well_id: 'OIL-MZ-LUNGLEI-1', depth_tvd: 3100.0, rop: 6.8, wob: 23.0, rpm: 75.0, torque: 22800.0, mud_weight: 12.9, ecd: 13.5, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 4100.0 },'OIL-MZ-CHAMPHAI-1': { well_id: 'OIL-MZ-CHAMPHAI-1', depth_tvd: 3250.0, rop: 6.5, wob: 23.5, rpm: 72.0, torque: 23400.0, mud_weight: 13.1, ecd: 13.7, flow_out_pct: 100.0, pit_gain_bbl: 0.0, spp_psi: 4250.0 },
};

// Module name -> route, for the cockpit's own launch buttons. Mirrors the
// sidebar so both entry points land on the same page.
const MODULE_ROUTES = {
 radar: '/radar',
 correlation: '/correlation',
 ppfg: '/ppfg',
 dossier: '/dossier',
 backtest: '/backtest',
 contribute: '/contribute',
 lesson: '/contribute',
};

// One card per hazard /api/predict-risk reports. This panel used to be four
// hand-written blocks, so adding a hazard in ml/service.py produced a payload the UI
// silently ignored — which is exactly what happened when overpressure and cementing
// were added. Driving it from a list means the next one appears without a matching
// edit here. (The palette is monochrome, so the per-card accent colours are gone;
// severity is carried by the bar's tone and the percentage's brightness.)
const HAZARD_CARDS = [
  { key: 'gas_kick',         label: 'Gas Kick',      icon: Flame,     probability: 0.08, indicator: 'Flow: 100%, Pit: +0 bbl' },
  { key: 'lost_circulation', label: 'Lost Circ',     icon: Droplets,  probability: 0.07, indicator: 'Flow: 100%, Normal FG' },
  { key: 'stuck_pipe',       label: 'Stuck Pipe',    icon: Anchor,    probability: 0.06, indicator: 'Torque normal' },
  { key: 'torque_drag',      label: 'Torque & Drag', icon: RotateCcw, probability: 0.08, indicator: 'Smooth rotation' },
  { key: 'overpressure',     label: 'Overpressure',  icon: Gauge,     probability: 0.05, indicator: 'Normal compaction trend' },
  { key: 'cementing',        label: 'Cementing',     icon: Layers,    probability: 0.05, indicator: 'Annulus isolation intact' },
];

function App() {
 const navigate = useNavigate();
 // URL Search Parameter Support for Standalone Fullscreen Module Tabs
 const getInitialModuleState = (modName) => {
 if (typeof window === 'undefined') return false;
 const p = new URLSearchParams(window.location.search);
 const m = (p.get('module') ||'').toLowerCase();
 if (modName === 'contribute') return m === 'contribute'|| m === 'lesson';
 return m === modName;
 };

 const [selectedWell, setSelectedWell] = useState(() => {
 if (typeof window !== 'undefined') {
 const p = new URLSearchParams(window.location.search);
 const w = p.get('well');
 if (w && WELL_DEFAULT_TELEMETRY[w]) return w;
 if (w) return w;
 }
 return'OIL-BAGHJAN-1';
 });

 const [selectedRegion, setSelectedRegion] = useState(() => {
 if (typeof window !== 'undefined') {
 const p = new URLSearchParams(window.location.search);
 const w = p.get('well');
 if (w) {
 const r = getRegionIdFromWellId(w);
 if (r) return r;
 }
 }
 return'assam';
 });

 const [telemetryData, setTelemetryData] = useState(() => {
 if (typeof window !== 'undefined') {
 const p = new URLSearchParams(window.location.search);
 const w = p.get('well');
 if (w && WELL_DEFAULT_TELEMETRY[w]) return WELL_DEFAULT_TELEMETRY[w];
 }
 return WELL_DEFAULT_TELEMETRY['OIL-BAGHJAN-1'];
 });

 const [predictionData, setPredictionData] = useState(null);
 const [simStatus, setSimStatus] = useState({ is_running: false, active_scenario: 'normal'});
 const [simSpeed, setSimSpeed] = useState(1.0);
 // Telemetry sensor sample rate in Hz — drives the simulator tick period
 const [telemetryRateHz, setTelemetryRateHz] = useState(1.0);
 const [seekDepth, setSeekDepth] = useState(2240.0);
 const [isDraggingSeek, setIsDraggingSeek] = useState(false);
 const [proximityWarning, setProximityWarning] = useState(null);
 const [trajectoryData, setTrajectoryData] = useState({ depth: [], torque: [], rop: [] });
 const [alertState, setAlertState] = useState({ active: false, prediction: null });
 const alertActiveRef = useRef(false);
 const lastCheckedDepthRef = useRef(null);
 const [ragContext, setRagContext] = useState(null);
 const [recentEvents, setRecentEvents] = useState([]);
 const [newlyIngestedIds, setNewlyIngestedIds] = useState(new Set());
 const [uploadToast, setUploadToast] = useState(null);
 const [expandedEventId, setExpandedEventId] = useState(null);
 const [isSettingsOpen, setIsSettingsOpen] = useState(false);
 const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
 const [isKnowledgeSearchOpen, setIsKnowledgeSearchOpen] = useState(false);

 // 6 Core Decision Support & Engineering Modules
 const [isCorrelationOpen, setIsCorrelationOpen] = useState(() => getInitialModuleState('correlation'));
 const [isRadarOpen, setIsRadarOpen] = useState(() => getInitialModuleState('radar'));
 const [isPPFGOpen, setIsPPFGOpen] = useState(() => getInitialModuleState('ppfg'));
 const [isDossierOpen, setIsDossierOpen] = useState(() => getInitialModuleState('dossier'));
 const [isBacktestOpen, setIsBacktestOpen] = useState(() => getInitialModuleState('backtest'));
 const [isContributeOpen, setIsContributeOpen] = useState(() => getInitialModuleState('contribute'));

 // Navigate to a module's route.
 //
 // This used to open a *separate browser tab* at
 // ?module=<name>&well=<id>&fullscreen=true
 // and, when the pop-up was blocked, fall back to opening a local modal. The
 // router replaced that entire mechanism, so this is now a plain navigation -
 // in place, no pop-up, and no pop-up-blocker fallback to get wrong.
 const openModuleInNewTab = useCallback((moduleName, wellId = selectedWell) => {
 const targetWell = wellId || selectedWell;
 if (targetWell && targetWell !== selectedWell) setSelectedWell(targetWell);
 navigate(MODULE_ROUTES[moduleName] ||'/');
 }, [navigate, selectedWell]);

 // Set dynamic browser tab title if opened as a standalone module
 useEffect(() => {
 if (typeof window === 'undefined') return;
 const p = new URLSearchParams(window.location.search);
 const m = (p.get('module') ||'').toLowerCase();
 const w = p.get('well') || selectedWell ||'OIL-BAGHJAN-1';
 if (m === 'radar') document.title =`Ahead-of-the-Bit Radar (${w}) | AGATE`;
 else if (m === 'correlation') document.title =`Offset Correlation & Fence (${w}) | AGATE`;
 else if (m === 'ppfg') document.title =`Safe PPFG Window (${w}) | AGATE`;
 else if (m === 'dossier') document.title =`Pre-Spud Dossier (${w}) | AGATE`;
 else if (m === 'backtest') document.title =`Causal Hazard Backtest (${w}) | AGATE`;
 else if (m === 'contribute'|| m === 'lesson') document.title =`Contribute Field Lesson (${w}) | AGATE`;
 }, [selectedWell]);

 // Close a module modal.
 //
 // This used to also try window.close() and rewrite the URL back to a"modules"// overview whenever the modal had been opened in its own browser tab. The
 // router removed both the separate tab and that overview, so closing is now
 // just closing.
 const handleCloseModule = useCallback((moduleCloseSetter) => {
 moduleCloseSetter(false);
 }, []);
 const [isTransparencyOpen, setIsTransparencyOpen] = useState(false);
 const [is3DViewerOpen, setIs3DViewerOpen] = useState(false);
 const [isAiModalOpen, setIsAiModalOpen] = useState(false);
 const [aiStatus, setAiStatus] = useState(null);
 const [isAutoDemoRunning, setIsAutoDemoRunning] = useState(false);
 const [autoDemoStep, setAutoDemoStep] = useState(0);
 const [autoDemoStatus, setAutoDemoStatus] = useState('');
 const autoDemoTimeoutsRef = useRef([]);
 const [role, setRole] = useState('Field Engineer');
 const [isBackendConnected, setIsBackendConnected] = useState(false);
 const [networkOnline, setNetworkOnline] = useState(() => isOnline());
 const [mobileActiveTab, setMobileActiveTab] = useState('map'); //'map'|'telemetry'|'simulator'// Telemetry drawer collapse. Persisted so the preference survives a reload -
 // an engineer who wants the map full-width should not have to re-collapse it
 // on every visit. Desktop only; on mobile the drawer is a tab.
 const [isTelemetryCollapsed, setIsTelemetryCollapsed] = useState(() => {
 try {
 return localStorage.getItem('agate_telemetry_collapsed') === '1';
 } catch {
 return false;
 }
 });

 useEffect(() => {
 try {
 localStorage.setItem('agate_telemetry_collapsed', isTelemetryCollapsed ? '1': '0');
 } catch {
 // Storage blocked - the in-memory value still applies for this session.
 }
 }, [isTelemetryCollapsed]);
 const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
 const wsRef = useRef(null);

 // Opt-in Visual Theme: 'standard'|'terminal'(Prompt 6)
 const [dashboardTheme, setDashboardTheme] = useState(() => {
 return localStorage.getItem('agate_theme') ||'standard';
 });
 // Sequence-Based Precursor Pattern Match (Prompt 5)
 const [sequenceAlert, setSequenceAlert] = useState(null);

 // Network Online/Offline Transition Listener
 useEffect(() => {
 return subscribeNetworkStatus((online) => {
 setNetworkOnline(online);
 setUploadToast({
 title: online ? 'Cloud Telemetry Synchronized': 'Switched to Rig Edge Engine',
 description: online 
 ? 'Network link restored. Dual cloud synchronization active.': 'Network link offline. Switched to local physics engine. Drilling operations uninterrupted.',
 wellId: selectedWell,
 time: new Date().toLocaleTimeString()
 });
 });
 }, [selectedWell]);

 useEffect(() => {
 try {
 localStorage.setItem('agate_theme', dashboardTheme);
 } catch (e) {
 console.warn("Could not save theme to localStorage", e);
 }
 }, [dashboardTheme]);

 // Basemap style state ('dark'|'satellite'|'terrain')
 const [basemapStyle, setBasemapStyle] = useState(() => {
 try {
 const saved = localStorage.getItem(BASEMAP_STORAGE_KEY);
 if (saved && ['dark','satellite','terrain'].includes(saved)) {
 return saved;
 }
 } catch (e) {
 console.warn("Could not read basemapStyle from localStorage", e);
 }
 return'dark';
 });

 const handleBasemapChange = (styleId) => {
 setBasemapStyle(styleId);
 try {
 localStorage.setItem(BASEMAP_STORAGE_KEY, styleId);
 } catch (e) {
 console.warn("Could not save basemapStyle to localStorage", e);
 }
 };

 // Pre-configured Demo Scenarios (Golden PDF Documented Well Incidents)
 const [demoScenarios, setDemoScenarios] = useState([
 {
 id: "1",
 title: "Shallow Stuck Pipe Warning — OIL-MORAN-1",
 well_id: "OIL-MORAN-1",
 depth: 2832.0,
 torque: 22500.0,
 wob: 18.0,
 rop: 4.5,
 formation: "Barail Sandstone/Shale transition",
 scenario_action: "inject_stuck_pipe",
 description: "Reproduces the documented differential-sticking incident at 2832m — torque spike, ROP collapse, elevated overpull.",
 suggested_question: "What historical evidence do we have for stuck pipe risk in this formation, and what mitigation worked previously? "},
 {
 id: "2",
 title: "Severe Lost Circulation — OIL-MORAN-1",
 well_id: "OIL-MORAN-1",
 depth: 1540.0,
 torque: 14200.0,
 wob: 12.0,
 rop: 18.0,
 formation: "Tipam Sandstone (Upper Permeable Zone)",
 scenario_action: "inject_lost_circulation",
 description: "Reproduces the severe mud loss incident at 1540m in Tipam Sandstone — pit level drop, flow-out reduction, fracture window breach.",
 suggested_question: "What is the recommended LCM pill composition and safe mud weight window for Tipam losses? "},
 {
 id: "3",
 title: "Abnormal Gas Kick Influx — OIL-NAHARKATIYA-1",
 well_id: "OIL-NAHARKATIYA-1",
 depth: 3105.0,
 torque: 19800.0,
 wob: 15.0,
 rop: 22.5,
 formation: "Kopili Formation Overpressure Ramp",
 scenario_action: "inject_kick",
 description: "Reproduces the documented high-pressure gas kick at 3105m in Kopili Formation — rapid pit gain, flow increase, SIDPP pressure spike.",
 suggested_question: "What are the shut-in drill pipe pressure (SIDPP) precedents and kill mud requirements in Kopili? "}
 ]);
 const [activeDemoScenarioId, setActiveDemoScenarioId] = useState('');
 const [searchSuggestedQuery, setSearchSuggestedQuery] = useState('');

 // Fetch pre-configured demo scenarios from backend
 useEffect(() => {
 const fetchScenarios = async () => {
 try {
 const res = await axios.get(`${API_BASE}/api/demo-scenarios`);
 if (res.data && Array.isArray(res.data) && res.data.length > 0) {
 setDemoScenarios(res.data);
 }
 } catch (err) {
 console.warn("Could not fetch remote demo scenarios; fallback active.", err);
 }
 };
 fetchScenarios();
 }, []);

 // Fetch real-time AI Model Provider status (Gemini, Claude, OpenAI, Ollama)
 const fetchAiStatus = useCallback(async () => {
 try {
 const res = await axios.get(`${API_BASE}/api/ai/status`);
 setAiStatus(res.data);
 } catch (err) {
 console.warn("Could not fetch AI status: ", err);
 }
 }, []);

 useEffect(() => {
 fetchAiStatus();
 const interval = setInterval(fetchAiStatus, 30000);
 return () => clearInterval(interval);
 }, [fetchAiStatus]);

 const showAlerts = role === 'Field Engineer';

 const handleRoleChange = (e) => {
 const newRole = e.target.value;
 setRole(newRole);
 if (newRole === 'Office Reviewer') {
 setIsKnowledgeSearchOpen(true);
 setIsCorrelationOpen(true);
 }
 };

 const exportWellData = async () => {
 try {
 const res = await axios.get(`${API_BASE}/api/wells/${selectedWell}/history`);
 const well = res.data;
 
 let csvContent ="data:text/csv;charset=utf-8,";
 
 csvContent +="Type,Timestamp,Depth(TVD),ROP,WOB,Torque,MudWeight\n";
 if (well.logs) {
 well.logs.forEach(p => {
 csvContent +=`Param,${p.timestamp ||''},${p.depth_tvd ||''},${p.rop ||''},${p.wob ||''},${p.torque ||''},${p.mud_weight ||''}\n`;
 });
 }
 
 csvContent +="\nType,Depth(TVD),Event,RootCause,Mitigation\n";
 if (well.events) {
 well.events.forEach(e => {
 csvContent +=`Event,${e.depth_tvd ||''},"${e.event_type ||''}","${e.root_cause ||''}","${e.mitigation_applied ||''}"\n`;
 });
 }
 
 const encodedUri = encodeURI(csvContent);
 const link = document.createElement("a");
 link.setAttribute("href", encodedUri);
 link.setAttribute("download",`${selectedWell}_data_export.csv`);
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 } catch (err) {
 console.error("Export failed", err);
 setUploadToast({
 variant: 'error',
 title: 'Well Data Export Failed',
 description:`Could not retrieve drilling history for ${selectedWell}. The backend link may be down — check the System Mode indicator and retry.`,
 wellId: selectedWell,
 time: new Date().toLocaleTimeString()
 });
 }
 };

 const fetchHistory = useCallback(async (wellId = selectedWell) => {
 try {
 const res = await axios.get(`${API_BASE}/api/wells/${wellId}/history`);
 if (res.data && res.data.events) {
 // Sort by ID descending so newly ingested events appear immediately at the top
 const sortedEvents = [...res.data.events].sort((a, b) => (b.id || 0) - (a.id || 0));
 setRecentEvents(sortedEvents.slice(0, 10));
 }
 } catch (err) {
 console.error("Failed to fetch well history", err);
 setRecentEvents([]);
 }
 }, [selectedWell]);

 useEffect(() => {
 fetchHistory(selectedWell);
 }, [selectedWell, fetchHistory]);

 const handleDocumentUploaded = (result, targetWellId) => {
 const wellToUse = targetWellId || selectedWell;
 if (targetWellId && targetWellId !== selectedWell) {
 setSelectedWell(targetWellId);
 }
 fetchHistory(wellToUse);

 const eventCount = result?.extracted_count || result?.events?.length || 0;
 if (result?.events && result.events.length > 0) {
 const newIds = new Set(result.events.map(e => e.id).filter(Boolean));
 setNewlyIngestedIds(newIds);
 }

 const isLas = result?.file_type === 'las'|| result?.filename?.toLowerCase().endsWith('.las');
 setUploadToast({
 title: isLas ?`Ingested LAS Log: ${result?.filename ||'Well Log'}`:`Ingested ${eventCount > 0 ?`${eventCount} Incidents`: 'Report'} from ${result?.filename ||'Document'}`,
 description: isLas 
 ?`${result?.points_ingested ||'Log curve'} data points ingested for ${wellToUse}. Ready for cross-well correlation & PPFG analysis.`:`Institutional Memory for ${wellToUse} updated with AI OCR/NLP extraction.`,
 count: eventCount,
 wellId: wellToUse,
 isLas: isLas,
 ocrTriggered: result?.ocr_triggered,
 time: new Date().toLocaleTimeString()
 });
 };

 const handleLessonContributed = (lesson) => {
 fetchHistory(selectedWell);
 setUploadToast({
 title:`Institutional Lesson Contributed!`,
 description:`New mitigations and root causes synchronized for ${selectedWell}.`,
 wellId: selectedWell,
 time: new Date().toLocaleTimeString()
 });
 };

 useEffect(() => {
 let isCleanedUp = false;
 let ws = null;
 let reconnectTimeout = null;
 let warmupTimer = null;
 let keepAliveTimer = null;

 // Fast proactive HTTP healthcheck to wake up Render and detect online status immediately
 const pingHealth = async () => {
 try {
 const response = await fetch(`${API_BASE}/health`, { method: 'GET'});
 if (response.ok && !isCleanedUp) {
 setIsBackendConnected(true);
 if (warmupTimer) {
 clearInterval(warmupTimer);
 warmupTimer = null;
 }
 }
 } catch (err) {
 // Backend still spinning up on Render
 }
 };

 // Trigger instant HTTP healthcheck on mount
 pingHealth();

 // Fast retry every 2.5s while waiting for backend container
 warmupTimer = setInterval(() => {
 if (!isCleanedUp) {
 pingHealth();
 }
 }, 2500);

 // Keep-alive ping every 2 minutes to prevent Render free-tier from sleeping during active sessions
 keepAliveTimer = setInterval(() => {
 if (!isCleanedUp) {
 fetch(`${API_BASE}/health`).catch(() => {});
 }
 }, 120000);

 const connectWebSocket = () => {
 if (isCleanedUp) return;
 try {
 ws = new WebSocket(`${WS_BASE}/api/ws/telemetry`);
 wsRef.current = ws;

 ws.onopen = () => {
 if (isCleanedUp) {
 ws.close();
 return;
 }
 // Connected successfully
 setIsBackendConnected(true);
 if (warmupTimer) {
 clearInterval(warmupTimer);
 warmupTimer = null;
 }
 fetchHistory(selectedWell);
 };

 ws.onmessage = (event) => {
 if (isCleanedUp) return;
 try {
 const data = JSON.parse(event.data);
 if (data.status === 'success') {
 const currentTelemetry = data.data;
 const prediction = data.prediction;
 
 // Only set telemetry if initially null; client controls its own simulation progression
 setTelemetryData(prev => prev || currentTelemetry);
 if (prediction) {
 setPredictionData(prediction);
 }
 // Sequence-based pattern precursor matching (Prompt 5)
 if (data.sequence_match) {
 setSequenceAlert(data.sequence_match);
 }
 // Do NOT override local client simStatus from foreign broadcasts!
 
 // Update Trajectory Data for plotting (keep last 50 points to prevent lag)
 if (currentTelemetry && currentTelemetry.depth_tvd !== undefined) {
 setTrajectoryData(prev => {
 const newDepth = [...prev.depth, currentTelemetry.depth_tvd].slice(-50);
 const newTorque = [...prev.torque, currentTelemetry.torque].slice(-50);
 const newRop = [...prev.rop, currentTelemetry.rop].slice(-50);
 return { depth: newDepth, torque: newTorque, rop: newRop };
 });
 }

 // Check for High Risk Alert
 if (prediction?.risk_level === 'HIGH'|| prediction?.risk_level === 'CRITICAL') {
 if (!alertActiveRef.current) {
 alertActiveRef.current = true;
 setAlertState({ active: true, prediction });
 fetchRagContext(prediction);
 } else {
 setAlertState(prev => ({ ...prev, prediction }));
 }
 } else if (data.scenario === 'normal'&& prediction?.risk_level === 'LOW') {
 if (alertActiveRef.current) {
 alertActiveRef.current = false;
 setAlertState({ active: false, prediction: null });
 }
 setSequenceAlert(null);
 }
 }
 } catch (err) {
 console.error("Error parsing websocket message", err);
 }
 };

 ws.onclose = () => {
 if (!isCleanedUp) {
 setIsBackendConnected(false);
 // Auto-reconnect after 3 seconds
 reconnectTimeout = setTimeout(() => {
 connectWebSocket();
 }, 3000);
 }
 };

 ws.onerror = () => {
 if (!isCleanedUp) {
 setIsBackendConnected(false);
 }
 };
 } catch (err) {
 setIsBackendConnected(false);
 if (!isCleanedUp) {
 reconnectTimeout = setTimeout(() => {
 connectWebSocket();
 }, 3000);
 }
 }
 };

 connectWebSocket();

 return () => {
 isCleanedUp = true;
 if (reconnectTimeout) clearTimeout(reconnectTimeout);
 if (warmupTimer) clearInterval(warmupTimer);
 if (keepAliveTimer) clearInterval(keepAliveTimer);
 if (ws) {
 if (ws.readyState === WebSocket.OPEN) {
 ws.close();
 } else if (ws.readyState === WebSocket.CONNECTING) {
 // Defer close until handshake finishes to avoid closing before connection established
 ws.onopen = () => {
 ws.close();
 };
 }
 }
 };
 }, [selectedWell, fetchHistory]);

 // Dedicated Client-Side Telemetry Simulation Loop (Strictly isolated to this browser tab/device)
 useEffect(() => {
 if (!simStatus.is_running) return;

 // Sensor sample period. Per-tick increments are scaled by it below so that
 // changing the sample rate changes resolution, not the simulated drilling rate.
 const tickMs = Math.round(1000.0 / (telemetryRateHz || 1.0));

 const interval = setInterval(() => {
 setTelemetryData(prev => {
 const current = prev || WELL_DEFAULT_TELEMETRY[selectedWell] || WELL_DEFAULT_TELEMETRY['OIL-BAGHJAN-1'];
 const speed = (simSpeed || 1.0) * (tickMs / 1000.0);
 const stepM = ((current.rop || 16.5) / 3600.0) * 150.0 * speed;
 let newDepth = (current.depth_tvd || 2240.0) + stepM;
 let newRop = current.rop || 16.5;
 let newTorque = current.torque || 13200.0;
 let newFlowOut = current.flow_out_pct !== undefined ? current.flow_out_pct : 100.0;
 let newPitGain = current.pit_gain_bbl !== undefined ? current.pit_gain_bbl : 0.0;
 let newSpp = current.spp_psi || 2800.0;
 let newMudWeight = current.mud_weight || 11.2;
 let newEcd = current.ecd || 11.6;

 if (simStatus.active_scenario === 'normal') {
 newTorque = Math.max(11000.0, Math.min(15000.0, newTorque + (Math.random() * 300 - 150)));
 newRop = Math.max(10.0, Math.min(22.0, newRop + (Math.random() * 0.8 - 0.4)));
 newFlowOut = Math.max(98.0, Math.min(102.0, newFlowOut + (Math.random() * 0.6 - 0.3)));
 newSpp = Math.max(2700.0, Math.min(2900.0, newSpp + (Math.random() * 30 - 15)));
 } else if (simStatus.active_scenario === 'gas_kick') {
 newPitGain += 0.3 * speed;
 newFlowOut = Math.max(105.0, Math.min(135.0, newFlowOut + (Math.random() * 1.3 - 0.5)));
 newSpp = Math.max(2400.0, newSpp - 10.0 * speed);
 } else if (simStatus.active_scenario === 'lost_circulation') {
 newPitGain -= 0.4 * speed;
 newFlowOut = Math.max(40.0, Math.min(85.0, newFlowOut + (Math.random() * 1.3 - 0.8)));
 newSpp = Math.max(1800.0, newSpp - 25.0 * speed);
 } else if (simStatus.active_scenario === 'stuck_pipe') {
 newTorque = Math.max(26000.0, Math.min(34000.0, newTorque + (Math.random() * 500 - 200)));
 newRop = Math.max(0.5, newRop - 2.0 * speed);
 }

 const updated = {
 ...current,
 well_id: selectedWell,
 depth_tvd: Math.round(newDepth * 100) / 100,
 rop: Math.round(newRop * 100) / 100,
 torque: Math.round(newTorque * 10) / 10,
 flow_out_pct: Math.round(newFlowOut * 10) / 10,
 pit_gain_bbl: Math.round(newPitGain * 10) / 10,
 spp_psi: Math.round(newSpp * 10) / 10,
 mud_weight: newMudWeight,
 ecd: newEcd,
 scenario: simStatus.active_scenario
 };

 // Query real-time ML risk prediction over WebSocket for THIS client only
 if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
 wsRef.current.send(JSON.stringify(updated));
 } else {
 // Autonomous Rig Edge Engine: evaluate continuous physics & hazard prediction locally
 const offlinePred = evaluateOfflineHazard(updated, simStatus.active_scenario);
 setPredictionData(offlinePred);

 // Update trajectory points continuously on client
 setTrajectoryData(prev => {
 const newDepth = [...prev.depth, updated.depth_tvd].slice(-50);
 const newTorque = [...prev.torque, updated.torque].slice(-50);
 const newRop = [...prev.rop, updated.rop].slice(-50);
 return { depth: newDepth, torque: newTorque, rop: newRop };
 });

 // Check for High Risk Alert in offline mode
 if (offlinePred.risk_level === 'HIGH'|| offlinePred.risk_level === 'CRITICAL') {
 if (!alertActiveRef.current) {
 alertActiveRef.current = true;
 setAlertState({ active: true, prediction: offlinePred });
 fetchRagContext(offlinePred);
 try {
 const queue = JSON.parse(localStorage.getItem('agate_offline_event_queue') ||'[]');
 queue.push({
 timestamp: new Date().toISOString(),
 well_id: selectedWell,
 depth_tvd: updated.depth_tvd,
 hazard: offlinePred.predicted_hazard,
 risk_level: offlinePred.risk_level,
 recommendations: offlinePred.recommendations
 });
 localStorage.setItem('agate_offline_event_queue', JSON.stringify(queue.slice(-20)));
 } catch (e) {}
 } else {
 setAlertState(prev => ({ ...prev, prediction: offlinePred }));
 }
 } else if (simStatus.active_scenario === 'normal'&& offlinePred.risk_level === 'LOW') {
 if (alertActiveRef.current) {
 alertActiveRef.current = false;
 setAlertState({ active: false, prediction: null });
 }
 setSequenceAlert(null);
 }
 }

 return updated;
 });
 }, tickMs);

 return () => clearInterval(interval);
 }, [simStatus.is_running, simStatus.active_scenario, simSpeed, telemetryRateHz, selectedWell]);

 // Proactive Depth-Proximity Lookahead Warning Engine (CORRECTION 3: Reuses /api/wells/{id}/lookahead)
 useEffect(() => {
 const checkDepthProximity = async () => {
 const currentDepth = telemetryData?.depth_tvd || 2240.0;
 
 if (lastCheckedDepthRef.current !== null && Math.abs(currentDepth - lastCheckedDepthRef.current) < 5.0) {
 return;
 }
 lastCheckedDepthRef.current = currentDepth;

 try {
 const res = await axios.get(`${API_BASE}/api/wells/${selectedWell}/lookahead`, {
 params: { current_depth: currentDepth, window_meters: 250.0 },
 timeout: 3000
 });
 const lookahead = res.data;
 const dist = lookahead?.distance_to_next_formation_m;
 const nextForm = lookahead?.next_formation;
 
 // Trigger amber proactive warning when within 50m of impending formation or hazard corridor
 if (dist !== null && dist !== undefined && dist <= 50.0 && dist > 0) {
 const upcoming = lookahead?.upcoming_formations?.[0] || {};
 const kickCount = lookahead?.kick_events_count || 0;
 const nearestEvent = lookahead?.events?.[0];
 
 setProximityWarning({
 active: true,
 formation: nextForm ||'Target Formation',
 distance_m: dist,
 tvd_top: upcoming.tvd_top || Math.round(currentDepth + dist),
 primary_risk: upcoming.primary_risk || (kickCount > 0 ? 'Abnormal Gas Kick & Well Control Risk': 'Stratigraphic Transition'),
 offset_precedent: nearestEvent ?`${nearestEvent.event_type} at ${nearestEvent.depth_tvd}m in ${nearestEvent.well_id}`: null
 });
 } else {
 setProximityWarning(null);
 }
 } catch (err) {
 // Autonomous Rig Edge Lookahead Calculation (Zero-downtime offline mode)
 const offlineLookahead = evaluateOfflineLookahead(selectedWell, currentDepth, 250.0);
 const dist = offlineLookahead?.distance_to_next_formation_m;
 if (dist !== null && dist !== undefined && dist <= 50.0 && dist > 0) {
 const upcoming = offlineLookahead?.upcoming_formations?.[0] || {};
 setProximityWarning({
 active: true,
 formation: offlineLookahead.next_formation ||'Target Formation',
 distance_m: dist,
 tvd_top: upcoming.tvd_top || Math.round(currentDepth + dist),
 primary_risk: upcoming.primary_risk ||'Stratigraphic Transition & Overpressure Boundary',
 offset_precedent: offlineLookahead.offset_precedent || null
 });
 } else {
 setProximityWarning(null);
 }
 }
 };

 checkDepthProximity();
 }, [selectedWell, telemetryData?.depth_tvd]);

 // Simulator Control Handlers (Strictly isolated to this local browser session)
 const handleSimControl = (action) => {
 if (action === 'play') {
 setSimStatus(prev => ({ ...prev, is_running: true }));
 } else if (action === 'pause') {
 setSimStatus(prev => ({ ...prev, is_running: false }));
 } else if (action === 'reset') {
 const base = WELL_DEFAULT_TELEMETRY[selectedWell] || WELL_DEFAULT_TELEMETRY['OIL-BAGHJAN-1'];
 setSimStatus({ is_running: false, active_scenario: 'normal'});
 setTelemetryData(base);
 if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
 wsRef.current.send(JSON.stringify(base));
 }
 }
 };

 const handleSpeedChange = (speed) => {
 setSimSpeed(speed);
 };

 const handleSeek = (depth) => {
 setTelemetryData(prev => {
 const current = prev || WELL_DEFAULT_TELEMETRY[selectedWell] || WELL_DEFAULT_TELEMETRY['OIL-BAGHJAN-1'];
 const updated = { ...current, depth_tvd: depth };
 if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
 wsRef.current.send(JSON.stringify(updated));
 }
 return updated;
 });
 };

 const handleScenarioInject = (scenario) => {
 setSimStatus(prev => ({ ...prev, active_scenario: scenario }));
 setTelemetryData(prev => {
 const current = prev || WELL_DEFAULT_TELEMETRY[selectedWell] || WELL_DEFAULT_TELEMETRY['OIL-BAGHJAN-1'];
 let newFlowOut = current.flow_out_pct !== undefined ? current.flow_out_pct : 100.0;
 let newPitGain = current.pit_gain_bbl !== undefined ? current.pit_gain_bbl : 0.0;
 let newTorque = current.torque || 13200.0;
 let newSpp = current.spp_psi || 2800.0;

 if (scenario === 'gas_kick') {
 newFlowOut = 118.0;
 newPitGain = 3.5;
 newSpp = 2650.0;
 } else if (scenario === 'lost_circulation') {
 newFlowOut = 62.0;
 newPitGain = -4.2;
 newSpp = 2100.0;
 } else if (scenario === 'stuck_pipe') {
 newTorque = 28500.0;
 } else if (scenario === 'normal') {
 newFlowOut = 100.0;
 newPitGain = 0.0;
 newTorque = 13200.0;
 newSpp = 2800.0;
 }

 const updated = {
 ...current,
 flow_out_pct: newFlowOut,
 pit_gain_bbl: newPitGain,
 torque: newTorque,
 spp_psi: newSpp,
 scenario
 };

 if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
 wsRef.current.send(JSON.stringify(updated));
 }
 return updated;
 });
 };

 const handleSelectRegion = (regionId) => {
 setSelectedRegion(regionId);
 if (regionId !== 'all') {
 const regionConfig = REGIONS_CONFIG[regionId];
 const wellRegion = getRegionIdFromWellId(selectedWell);
 if (regionConfig && regionConfig.defaultWell && wellRegion !== regionId) {
 handleSelectWell(regionConfig.defaultWell);
 }
 }
 };

 const getDefaultOffsetWell = (wellId) => {
 const upper = String(wellId ||'').toUpperCase();
 if (upper.includes('RAJ') || upper.includes('BAGHEWALA') || upper.includes('TANOT') || upper.includes('DANDEWALA')) {
 return upper.includes('BAGHEWALA') ? 'OIL-RAJ-TANOT-1': 'OIL-RAJ-BAGHEWALA-1';
 }
 if (upper.includes('KG') || upper.includes('DEEPWATER') || upper.includes('DWN') || upper.includes('YANAM') || upper.includes('AMALAPURAM')) {
 return upper.includes('DEEPWATER') ? 'OIL-KG-DWN-1': 'OIL-KG-DEEPWATER-1';
 }
 if (upper.includes('MZ') || upper.includes('AIZAWL') || upper.includes('MAMIT') || upper.includes('KOLASIB') || upper.includes('LUNGLEI')) {
 return upper.includes('AIZAWL') ? 'OIL-MZ-MAMIT-1': 'OIL-MZ-AIZAWL-1';
 }
 return wellId === 'OIL-BAGHJAN-1'? 'OIL-NAHARKATIYA-1': 'OIL-BAGHJAN-1';
 };

 const handleSelectWell = (newWellId) => {
 setSelectedWell(newWellId);
 setProximityWarning(null);
 alertActiveRef.current = false;
 lastCheckedDepthRef.current = null;
 setAlertState({ active: false, prediction: null });

 const wellRegion = getRegionIdFromWellId(newWellId);
 if (selectedRegion !== 'all'&& selectedRegion !== wellRegion) {
 setSelectedRegion(wellRegion);
 }

 const base = WELL_DEFAULT_TELEMETRY[newWellId] || WELL_DEFAULT_TELEMETRY['OIL-BAGHJAN-1'];
 setTelemetryData(base);
 setSeekDepth(base.depth_tvd);
 if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
 wsRef.current.send(JSON.stringify({ action: "set_well", well_id: newWellId, ...base }));
 }
 };

 // 1-Click Realistic Demo Scenario Selection Handler
 const handleSelectDemoScenario = (scenario) => {
 if (!scenario) return;
 setActiveDemoScenarioId(scenario.id);

 // (a) Set active well to scenario's well_id
 handleSelectWell(scenario.well_id);

 // (b) Seek simulator to scenario's depth using existing seek functionality
 handleSeek(scenario.depth);

 // (c) Trigger corresponding scenario_action using existing scenario injection logic
 let actionScenario ='normal';
 const act = (scenario.scenario_action ||'').toLowerCase();
 if (act.includes('stuck')) {
 actionScenario ='stuck_pipe';
 } else if (act.includes('loss') || act.includes('circulation')) {
 actionScenario ='lost_circulation';
 } else if (act.includes('kick')) {
 actionScenario ='gas_kick';
 }
 handleScenarioInject(actionScenario);

 // Update telemetry parameters with realistic scenario values
 setTelemetryData(prev => {
 const current = prev || WELL_DEFAULT_TELEMETRY[scenario.well_id] || WELL_DEFAULT_TELEMETRY['OIL-BAGHJAN-1'];
 return {
 ...current,
 depth_tvd: scenario.depth,
 torque: scenario.torque || current.torque,
 wob: scenario.wob || current.wob,
 rop: scenario.rop || current.rop,
 formation: scenario.formation || current.formation
 };
 });

 // (d) Optionally pre-fill knowledge search box with suggested_question
 if (scenario.suggested_question) {
 setSearchSuggestedQuery(scenario.suggested_question);
 }
 };

 // Auto-Play Demo Mode Controller (Tier 3 - SIH 2026 Interactive Scripted Sequence)
 const stopAutoDemo = useCallback(() => {
 autoDemoTimeoutsRef.current.forEach(t => clearTimeout(t));
 autoDemoTimeoutsRef.current = [];
 setIsAutoDemoRunning(false);
 setAutoDemoStep(0);
 setAutoDemoStatus('');
 setIs3DViewerOpen(false);
 setIsRadarOpen(false);
 handleScenarioInject('normal');
 setSimStatus(prev => ({ ...prev, is_running: false }));
 }, []);

 const startAutoDemo = useCallback(() => {
 // Clear any active timers first
 autoDemoTimeoutsRef.current.forEach(t => clearTimeout(t));
 autoDemoTimeoutsRef.current = [];
 setIsAutoDemoRunning(true);

 const schedule = (fn, delayMs) => {
 const id = setTimeout(fn, delayMs);
 autoDemoTimeoutsRef.current.push(id);
 return id;
 };

 // Step 1: (t=0) Zoom/pan to active well
 setAutoDemoStep(1);
 setAutoDemoStatus('1/5: Centering on Active Well (OIL-BAGHJAN-1)...');
 handleSelectWell('OIL-BAGHJAN-1');

 // Step 2: (t=3s) Open 3D Trajectory Viewer
 schedule(() => {
 setAutoDemoStep(2);
 setAutoDemoStatus('2/5: Opening 3D Subsurface Trajectory Viewer...');
 setIs3DViewerOpen(true);
 }, 3000);

 // Step 3: (t=6s) Close 3D Viewer and Start Telemetry Simulator
 schedule(() => {
 setAutoDemoStep(3);
 setAutoDemoStatus('3/5: Launching Real-Time Rig Telemetry Stream...');
 setIs3DViewerOpen(false);
 handleSimControl('play');
 }, 6000);

 // Step 4: (t=11s) After 5s, Inject Gas Kick scenario
 schedule(() => {
 setAutoDemoStep(4);
 setAutoDemoStatus('4/5: Simulating Formation Gas Kick Influx Event...');
 handleScenarioInject('gas_kick');
 }, 11000);

 // Step 5: (t=16s) After 5s, Open Ahead-of-the-Bit Hazard Radar
 schedule(() => {
 setAutoDemoStep(5);
 setAutoDemoStatus('5/5: Inspecting Ahead-of-the-Bit Radar & Mud Window...');
 setIsRadarOpen(true);
 }, 16000);

 // Step 6: (t=21s) Reset to normal circulating baseline and conclude
 schedule(() => {
 setAutoDemoStep(6);
 setAutoDemoStatus('Auto-Demo Complete: Normalizing circulating parameters...');
 setIsRadarOpen(false);
 handleScenarioInject('normal');
 handleSimControl('pause');
 schedule(() => {
 setIsAutoDemoRunning(false);
 setAutoDemoStep(0);
 setAutoDemoStatus('');
 setUploadToast({
 title: 'Auto-Demo Exploration Complete',
 description: 'Autonomous showcase sequence completed. Interactive manual control active.',
 time: new Date().toLocaleTimeString()
 });
 }, 1500);
 }, 21000);

 }, [stopAutoDemo]);

 // Clean up timers on unmount
 useEffect(() => {
 return () => {
 autoDemoTimeoutsRef.current.forEach(t => clearTimeout(t));
 };
 }, []);


 const fetchRagContext = async (prediction) => {
 let query ="high surface torque and drilling hazard";
 if (prediction?.top_factors?.length > 0) {
 const topFactor = prediction.top_factors[0].feature;
 query =`Elevated ${topFactor} causing potential hazard during drilling`;
 } else if (prediction?.predicted_hazard) {
 query =`${prediction.predicted_hazard} influx remediation`;
 }

 try {
 const response = await axios.get(`${API_BASE}/api/events/search`, {
 params: { query, limit: 1 },
 timeout: 2500
 });
 
 if (response.data && response.data.length > 0) {
 setRagContext(response.data[0]);
 return;
 }
 } catch (err) {
 console.warn("RAG search API call unavailable, falling back to local offset memory: ", err?.message);
 }

 // Offline fallback: query local institutional memory
 try {
 const offlineMatches = searchOfflineIncidents(query, selectedWell, 1);
 if (offlineMatches && offlineMatches.length > 0) {
 setRagContext(offlineMatches[0]);
 return;
 }
 } catch (e) {}

 // Guaranteed baseline precedent matching the hazard
 const hazardName = prediction?.predicted_hazard ||"Gas Kick";
 const isKick = hazardName.toLowerCase().includes('kick');
 const isLoss = hazardName.toLowerCase().includes('loss') || hazardName.toLowerCase().includes('circ');
 
 setRagContext({
 well_id: isKick ? "OIL-BAGHJAN-4": isLoss ? "OIL-TENGAKHAT-1": "OIL-NAHARKATIYA-1",
 event_type: hazardName,
 depth_tvd: telemetryData?.depth_tvd || (isKick ? 2460.0 : isLoss ? 1540.0 : 2832.0),
 formation: isKick ? "Barail Sandstone": isLoss ? "Tipam Sandstone": "Kopili Formation",
 mitigation_applied: isKick 
 ? "Space-out drillstring, shut in well via annular BOP, record SIDPP / SICP, and circulate out gas via Driller's Method.": isLoss
 ? "Pumped 40 bbl high-fluid-loss LCM pill and reduced circulation rate to 350 gpm.": "Increased KCl glycol concentration in drilling fluid to 6% and back-reamed with high flow rate."});
 };

 const dismissAlert = () => {
 alertActiveRef.current = false;
 setAlertState({ active: false, prediction: null });
 setRagContext(null);
 };

 // On mobile the drawer is a full-screen tab rather than a side panel, so the
 // collapsed rail must not apply there or the tab would render empty.
 const telemetryRail = isTelemetryCollapsed && mobileActiveTab !== 'telemetry';

 return (
 <div className={`h-full w-full flex flex-col ${dashboardTheme === 'terminal'? 'bg-[#070707] text-[#A3A3A3] font-mono select-text': 'bg-[#0B0B0B] text-slate-200 font-sans'} overflow-hidden relative`}>
 
 {/* Terminal Mode Matrix Rain Effect (Opt-in) */}
 {dashboardTheme === 'terminal'&& <MatrixRain opacity={0.10} />}

 {/* BSPWM Tiling Status Bar (Prompt 6) */}
 {dashboardTheme === 'terminal'&& (
 <div className="bg-[#040404] border-b border-emerald-500/40 px-3 py-1 text-[11px] font-mono text-emerald-400 flex items-center justify-between z-50 shrink-0 select-none">
 <div className="flex items-center space-x-2">
 <span className="bg-emerald-500 text-black px-1.5 py-0.5 font-bold">[1:SYS]</span>
 <span className="text-emerald-300 hover:text-emerald-100 cursor-pointer" onClick={() => setMobileActiveTab('map')}>[2:MAP]</span>
 <span className="text-emerald-300 hover:text-emerald-100 cursor-pointer" onClick={() => setMobileActiveTab('telemetry')}>[3:TELEMETRY]</span>
 <span className="text-emerald-300 hover:text-emerald-100 cursor-pointer" onClick={() => setIsKnowledgeSearchOpen(true)}>[4:GRAPH/RAG]</span>
 <span className="text-emerald-700">│</span>
 <span className="text-emerald-500/80">WM: BSPWM (TILED)</span>
 <span className="text-emerald-700">│</span>
 <span className="text-emerald-400 font-bold">TARGET: {selectedWell}</span>
 </div>
 <div className="flex items-center space-x-3 text-[10px]">
 <span className="text-emerald-400">NET: {isBackendConnected ? 'UP (WS 1.0Hz)': 'DOWN'}</span>
 <span className="text-emerald-700">│</span>
 <span className="text-emerald-400">AHP: SYNTHESIZED</span>
 <span className="text-emerald-700">│</span>
 <span className="text-emerald-300 font-bold">{new Date().toISOString().replace('T','').slice(0, 19)} UTC</span>
 </div>
 </div>
 )}

 {/* Fake Terminal Titlebar when in Terminal Mode */}
 {dashboardTheme === 'terminal'&& (
 <div className="bg-[#090909] px-3 py-1 border-b border-emerald-500/20 flex items-center justify-between text-[10px] font-mono text-emerald-500/80 z-50 shrink-0">
 <div className="flex items-center space-x-2">
 <div className="flex space-x-1">
 <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></div>
 <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
 <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
 </div>
 <span>agate@rig-edge:~/telemetry/{selectedWell.toLowerCase()} ($ ./monitor_ahead.sh --mode=live)</span>
 </div>
 <span className="text-emerald-400">TERM: VT100 / POSIX</span>
 </div>
 )}

 {/* Top Navigation Bar - Mission Control Bar */}
 <header className={`h-13 sm:h-14 border-b ${dashboardTheme === 'terminal'? 'border-emerald-500/40 bg-[#0E0E0E]/95': 'border-slate-800/80 bg-[#131313]/95'} backdrop-blur-xl flex items-center justify-between px-3 sm:px-4 lg:px-5 z-40 shrink-0 shadow-[0_4px_25px_rgba(0,0,0,0.5)] relative w-full overflow-hidden`}>
 {/* Rig-edge link indicator (branding now lives in the sidebar) */}
 <div className="flex items-center shrink-0 mr-3">
 <div className="relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-indigo-500/10 border border-cyan-500/40 text-cyan-400 shadow-glow-cyan shrink-0">
 <Activity size={18} className="text-cyan-400 animate-pulse-subtle"/>
 <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#131313] animate-ping"/>
 <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#131313]"/>
 </div>
 </div>

 {/* Mobile Quick Action Bar (Visible only on mobile < lg) */}
 <div className="flex items-center space-x-2 lg:hidden">
 {/* Quick Region Selector on Mobile */}
 <select 
 value={selectedRegion} 
 onChange={(e) => handleSelectRegion(e.target.value)}
 className="bg-slate-900 border border-slate-700/80 text-slate-200 text-[10px] font-mono font-medium rounded-lg px-1.5 py-1.5 outline-none max-w-[100px] truncate shadow-inner focus:border-cyan-500">
 <option value="all">All Regions</option>
 <option value="assam">{getRegionDisplayLabel('assam','Assam')}</option>
 <option value="rajasthan">{getRegionDisplayLabel('rajasthan','Rajasthan')}</option>
 <option value="kg">{getRegionDisplayLabel('kg','KG')}</option>
 <option value="mizoram">{getRegionDisplayLabel('mizoram','Mizoram')}</option>
 <option value="north_sea">North Sea (159 FORCE & Volve)</option>
 </select>

 {/* Quick Target Well on Mobile */}
 <select 
 value={selectedWell} 
 onChange={(e) => handleSelectWell(e.target.value)}
 className="bg-slate-900 border border-slate-700/80 text-slate-200 text-[10px] font-mono font-medium rounded-lg px-1.5 py-1.5 outline-none max-w-[125px] truncate shadow-inner focus:border-cyan-500">
 {(selectedRegion === 'all'|| selectedRegion === 'assam') && (
 <optgroup label="Upper Assam Basin (Volve / Benchmark Calibrated)">
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
 )}
 {(selectedRegion === 'all'|| selectedRegion === 'rajasthan') && (
 <optgroup label={getRegionDisplayLabel('rajasthan')}>
 <option value="OIL-RAJ-BAGHEWALA-1">BAGHEWALA-1</option>
 <option value="OIL-RAJ-BAGHEWALA-2">BAGHEWALA-2</option>
 <option value="OIL-RAJ-TANOT-1">TANOT-1</option>
 <option value="OIL-RAJ-TANOT-2">TANOT-2</option>
 <option value="OIL-RAJ-DANDEWALA-1">DANDEWALA-1</option>
 </optgroup>
 )}
 {(selectedRegion === 'all'|| selectedRegion === 'kg') && (
 <optgroup label={getRegionDisplayLabel('kg')}>
 <option value="OIL-KG-DEEPWATER-1">KG-DEEPWATER-1</option>
 <option value="OIL-KG-DWN-98-2">KG-DWN-98/2</option>
 <option value="OIL-KG-D6-OFFSHORE">KG-D6-OFFSHORE</option>
 <option value="OIL-KG-YANAM-1">KG-YANAM-1</option>
 <option value="OIL-KG-AMALAPURAM-1">KG-AMALAPURAM-1</option>
 </optgroup>
 )}
 {(selectedRegion === 'all'|| selectedRegion === 'mizoram') && (
 <optgroup label={getRegionDisplayLabel('mizoram')}>
 <option value="OIL-MZ-AIZAWL-1">MZ-AIZAWL-1</option>
 <option value="OIL-MZ-MAMIT-1">MZ-MAMIT-1</option>
 <option value="OIL-MZ-KOLASIB-1">MZ-KOLASIB-1</option>
 <option value="OIL-MZ-LUNGLEI-1">MZ-LUNGLEI-1</option>
 <option value="OIL-MZ-CHAMPHAI-1">MZ-CHAMPHAI-1</option>
 </optgroup>
 )}
 {(selectedRegion === 'all'|| selectedRegion === 'north_sea') && (
 <optgroup label="North Sea (FORCE 2020 / Volve Open Data)">
 <option value="16/7-6">16/7-6 (Flagship)</option>
 <option value="16/7-5">16/7-5</option>
 <option value="16/7-4">16/7-4</option>
 <option value="16/8-1">16/8-1</option>
 <option value="16/2-6">16/2-6</option>
 <option value="16/2-7">16/2-7</option>
 <option value="7/1-1">7/1-1</option>
 <option value="7/1-2 S">7/1-2 S</option>
 <option value="35/9-7">35/9-7</option>
 <option value="35/9-8">35/9-8</option>
 <option value="VOLVE-15/9-F-12">VOLVE-15/9-F-12</option>
 <option value="VOLVE-15/9-F-14">VOLVE-15/9-F-14</option>
 <option value="VOLVE-15/9-F-1">VOLVE-15/9-F-1</option>
 </optgroup>
 )}
 </select>

 {/* Quick Upload Icon Button */}
 <button
 onClick={() => setIsUploadModalOpen(true)}
 className="p-1.5 bg-slate-900/90 hover:bg-slate-800 active:bg-slate-750 border border-slate-700/80 text-slate-300 rounded-lg transition shadow-sm" title="Upload Document">
 <FileUp size={16} />
 </button>

 {/* Mobile Settings Button */}
 <button 
 onClick={() => setIsSettingsOpen(!isSettingsOpen)}
 className={`p-1.5 bg-slate-900/90 hover:bg-slate-800 active:bg-slate-750 border rounded-lg transition shadow-sm ${
 isSettingsOpen ? 'border-cyan-500 text-cyan-400 bg-cyan-500/15': 'border-slate-700/80 text-slate-300'}`}
 title="System Settings" aria-label="Settings">
 <Settings size={16} className={`transition-transform duration-300 ${isSettingsOpen ? 'rotate-90 text-cyan-400': ''}`} />
 </button>

 {/* Mobile Menu Toggle Button */}
 <button
 onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
 className="p-1.5 bg-slate-900/90 hover:bg-slate-800 active:bg-slate-750 border border-slate-700/80 text-slate-200 rounded-lg transition shadow-sm" aria-label="Toggle Menu">
 {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
 </button>
 </div>

 {/* Desktop Navigation Toolbar (Hidden on mobile < lg) */}
 <div className="hidden lg:flex items-center justify-end space-x-1.5 xl:space-x-2 ml-auto shrink-0">
 
 {/* Role Toggle */}
 <div className="flex items-center space-x-1 shrink-0">
 <span className="text-[11px] text-slate-400 font-medium hidden 2xl:inline">Role:</span>
 <select 
 value={role} 
 onChange={handleRoleChange}
 className="bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-200 text-[11px] font-medium rounded-lg px-2 py-1 outline-none focus:border-cyan-500 transition shadow-inner cursor-pointer">
 <option value="Field Engineer">Field Engineer</option>
 <option value="Office Reviewer">Office Reviewer</option>
 </select>
 </div>

 {/* Active Region Selector */}
 <div className="flex items-center space-x-1 border-l border-slate-800/80 pl-1.5 xl:pl-2 shrink-0">
 <div className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-850 px-2 py-1 rounded-lg transition-colors border border-slate-700 shadow-inner">
 <MapIcon size={13} className="text-emerald-400 shrink-0"/>
 <select 
 value={selectedRegion} 
 onChange={(e) => handleSelectRegion(e.target.value)}
 className="bg-transparent text-slate-200 text-[11px] font-mono font-semibold outline-none cursor-pointer max-w-[130px] xl:max-w-[170px] truncate" title="Filter portfolio by geographic region">
 <option value="all">All Regions (Pan-India)</option>
 <option value="assam">{getRegionDisplayLabel('assam')}</option>
 <option value="rajasthan">{getRegionDisplayLabel('rajasthan')}</option>
 <option value="kg">{getRegionDisplayLabel('kg')}</option>
 <option value="mizoram">{getRegionDisplayLabel('mizoram')}</option>
 <option value="north_sea">North Sea (159 FORCE & Volve)</option>
 </select>
 </div>
 </div>

 {/* Active Field / Well Selector with Regional Portfolio Extensibility */}
 <div className="flex items-center space-x-1 border-l border-slate-800/80 pl-1.5 xl:pl-2 shrink-0">
 <div className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-850 px-2 py-1 rounded-lg transition-colors border border-slate-700 shadow-inner">
 <Database size={13} className="text-cyan-400 shrink-0"/>
 <select 
 value={selectedWell} 
 onChange={(e) => handleSelectWell(e.target.value)}
 className="bg-transparent text-slate-200 text-[11px] font-mono font-semibold outline-none cursor-pointer max-w-[110px] xl:max-w-[145px] truncate" title="Choose active operational well">
 {(selectedRegion === 'all'|| selectedRegion === 'assam') && (
 <optgroup label="Upper Assam Basin (Volve / Benchmark Calibrated)">
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
 )}
 {(selectedRegion === 'all'|| selectedRegion === 'rajasthan') && (
 <optgroup label={getRegionDisplayLabel('rajasthan')}>
 <option value="OIL-RAJ-BAGHEWALA-1">BAGHEWALA-1</option>
 <option value="OIL-RAJ-BAGHEWALA-2">BAGHEWALA-2</option>
 <option value="OIL-RAJ-TANOT-1">TANOT-1</option>
 <option value="OIL-RAJ-TANOT-2">TANOT-2</option>
 <option value="OIL-RAJ-DANDEWALA-1">DANDEWALA-1</option>
 </optgroup>
 )}
 {(selectedRegion === 'all'|| selectedRegion === 'kg') && (
 <optgroup label={getRegionDisplayLabel('kg')}>
 <option value="OIL-KG-DEEPWATER-1">KG-DEEPWATER-1</option>
 <option value="OIL-KG-DWN-98-2">KG-DWN-98/2</option>
 <option value="OIL-KG-D6-OFFSHORE">KG-D6-OFFSHORE</option>
 <option value="OIL-KG-YANAM-1">KG-YANAM-1</option>
 <option value="OIL-KG-AMALAPURAM-1">KG-AMALAPURAM-1</option>
 </optgroup>
 )}
 {(selectedRegion === 'all'|| selectedRegion === 'mizoram') && (
 <optgroup label={getRegionDisplayLabel('mizoram')}>
 <option value="OIL-MZ-AIZAWL-1">MZ-AIZAWL-1</option>
 <option value="OIL-MZ-MAMIT-1">MZ-MAMIT-1</option>
 <option value="OIL-MZ-KOLASIB-1">MZ-KOLASIB-1</option>
 <option value="OIL-MZ-LUNGLEI-1">MZ-LUNGLEI-1</option>
 <option value="OIL-MZ-CHAMPHAI-1">MZ-CHAMPHAI-1</option>
 </optgroup>
 )}
 {(selectedRegion === 'all'|| selectedRegion === 'north_sea') && (
 <optgroup label="North Sea (FORCE 2020 / Volve Open Data)">
 <option value="16/7-6">16/7-6 (Flagship)</option>
 <option value="16/7-5">16/7-5</option>
 <option value="16/7-4">16/7-4</option>
 <option value="16/8-1">16/8-1</option>
 <option value="16/2-6">16/2-6</option>
 <option value="16/2-7">16/2-7</option>
 <option value="7/1-1">7/1-1</option>
 <option value="7/1-2 S">7/1-2 S</option>
 <option value="35/9-7">35/9-7</option>
 <option value="35/9-8">35/9-8</option>
 <option value="VOLVE-15/9-F-12">VOLVE-15/9-F-12</option>
 <option value="VOLVE-15/9-F-14">VOLVE-15/9-F-14</option>
 <option value="VOLVE-15/9-F-1">VOLVE-15/9-F-1</option>
 </optgroup>
 )}
 </select>
 <SourceTag source={selectedWell} compact={true} />
 </div>
 </div>

 {/* Hybrid Dual-Mode Connectivity Status Pill */}
 <div className="flex items-center border-l border-slate-800/80 pl-1.5 xl:pl-2 shrink-0">
 {isBackendConnected ? (
 <div 
 className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono font-medium shadow-[0_0_10px_rgba(163, 163, 163,0.15)] whitespace-nowrap" title="Telemetry Live at 1.0Hz — Cloud & Edge Synchronized">
 <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
 <span>Cloud Sync 1.0Hz</span>
 </div>
 ) : (
 <div 
 className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[11px] font-mono font-medium shadow-[0_0_10px_rgba(166, 166, 166,0.2)] whitespace-nowrap" title="Rig Edge Offline Mode Active — Continuous Physics & Hazard Monitoring Uninterrupted">
 <ShieldCheck size={12} className="text-cyan-400 animate-pulse"/>
 <span>Rig Edge (1.0Hz)</span>
 </div>
 )}
 </div>


 {/* Tools & Methodology */}
 <div className="flex items-center space-x-1 border-l border-slate-800/80 pl-1.5 xl:pl-2 shrink-0 relative">
 {/* Search */}
 <button 
 onClick={() => setIsKnowledgeSearchOpen(!isKnowledgeSearchOpen)}
 className={`p-1.5 rounded-lg transition-colors border shrink-0 ${isKnowledgeSearchOpen ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30': 'bg-slate-900/80 hover:bg-slate-800 border-slate-700/80 hover:text-white'}`}
 title="Search Knowledge Base">
 <Search size={14} />
 </button>

 {/* Methodology Modal Trigger */}
 <button
 onClick={() => setIsTransparencyOpen(true)}
 className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 hover:border-cyan-500/40 transition shadow-sm shrink-0" title="Data & Methodology Disclosures (Physics 80% / ML 20% / Volve Adaptation)">
 <Info size={14} className="text-cyan-400"/>
 </button>

 {/* Terminal Mode Quick Toggle (Prompt 6: Opt-in Theme) */}
 <button 
 onClick={() => setDashboardTheme(prev => prev === 'terminal'? 'standard': 'terminal')} 
 className={`p-1.5 rounded-lg transition-colors border shrink-0 flex items-center space-x-1 font-mono text-xs ${
 dashboardTheme === 'terminal'? 'text-emerald-300 bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_12px_rgba(163, 163, 163,0.3)]': 'bg-slate-900/80 hover:bg-slate-800 border-slate-700/80 hover:text-white text-slate-400'}`}
 title={dashboardTheme === 'terminal'? 'Terminal Mode: ON (Click to switch to Standard)': 'Switch to Terminal / Tiling-WM Visual Mode'}
 >
 <Terminal size={14} className={dashboardTheme === 'terminal'? 'text-emerald-400': ''} />
 <span className="text-[10px] hidden 2xl:inline">{dashboardTheme === 'terminal'? 'TERM': 'CLI'}</span>
 </button>

 </div>

 {/* Settings Symbol on the End of the Right Top */}
 <div className="relative shrink-0 border-l border-slate-800/80 pl-1.5 xl:pl-2">
 <button 
 id="btn-system-settings" onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
 className={`p-1.5 xl:p-2 rounded-xl transition-all border shrink-0 flex items-center justify-center cursor-pointer group shadow-sm ${
 isSettingsOpen 
 ? 'text-cyan-300 bg-cyan-500/20 border-cyan-400 shadow-[0_0_15px_rgba(166, 166, 166,0.35)] ring-1 ring-cyan-400/50': 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border-slate-750 hover:border-cyan-500/50 hover:shadow-[0_0_12px_rgba(166, 166, 166,0.2)]'}`}
 title="System Settings & Preferences" aria-label="System Settings">
 <Settings size={16} className={`transition-transform duration-500 ease-out group-hover:rotate-90 ${isSettingsOpen ? 'text-cyan-400 rotate-90': 'text-slate-300 group-hover:text-cyan-300'}`} />
 </button>
 
 {/* Settings Dropdown */}
 {isSettingsOpen && (
 <>
 <div 
 className="fixed inset-0 z-40" onClick={() => setIsSettingsOpen(false)} 
 />
 <div className="absolute top-11 right-0 w-80 bg-slate-900/98 backdrop-blur-xl border border-slate-700/90 shadow-2xl rounded-2xl p-4 z-50 animate-in fade-in zoom-in-95">
 <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
 <div className="flex items-center space-x-2">
 <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30">
 <Settings size={15} className="text-cyan-400"/>
 </div>
 <div>
 <h3 className="font-bold text-slate-100 text-xs tracking-wide uppercase font-mono">System Settings</h3>
 <p className="text-[10px] text-slate-400">Platform preferences & display</p>
 </div>
 </div>
 <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800">
 <XCircle size={16} />
 </button>
 </div>
 <div className="space-y-3.5">
 {/* Claude / AI Reasoning Engine Box */}
 <div className="p-3 rounded-xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/40 shadow-[0_0_15px_rgba(177, 177, 177,0.15)]">
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center space-x-2">
 <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 shadow-glow-amber">
 <Cpu size={15} className="text-amber-400"/>
 </div>
 <div>
 <div className="flex items-center space-x-1.5">
 <h4 className="text-xs font-bold text-amber-200 tracking-wide font-mono">
 {aiStatus?.active_provider === 'claude'? 'Claude 3.5 Operational AI':`${(aiStatus?.active_provider ||'Claude').toUpperCase()} Engine`}
 </h4>
 </div>
 <p className="text-[10px] text-amber-300/70 font-mono">
 {aiStatus?.model ||'claude-3-5-haiku-20241022'}
 </p>
 </div>
 </div>
 <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300 shadow-sm">
 {aiStatus?.active_provider === 'offline'? 'OFFLINE': 'ACTIVE'}
 </span>
 </div>
 
 <p className="text-[11px] text-slate-300 leading-snug mb-2.5">
 Underpins automated incident extraction from daily reports, analog well synthesis, and drill-ahead briefings.
 </p>

 <button
 onClick={() => {
 setIsSettingsOpen(false);
 setIsAiModalOpen(true);
 }}
 className="w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 border border-amber-500/50 text-amber-200 text-xs font-semibold flex items-center justify-center space-x-2 transition shadow-sm cursor-pointer group">
 <Bot size={13} className="text-amber-400 group-hover:scale-110 transition-transform"/>
 <span>Open Claude AI Configuration & Test</span>
 </button>
 </div>

 {/* Basemap Selection */}
 <div className="flex items-center justify-between">
 <div>
 <span className="text-xs text-slate-300 block font-medium">Basemap Style</span>
 <span className="text-[10px] text-slate-400 font-mono">Map terrain & tiles</span>
 </div>
 <select 
 value={basemapStyle} 
 onChange={(e) => handleBasemapChange(e.target.value)}
 className="bg-slate-800 text-xs font-mono border border-slate-700 rounded-lg px-2 py-1 text-slate-200 outline-none focus:border-cyan-500 cursor-pointer">
 <option value="dark">Dark Matter</option>
 <option value="satellite">Satellite</option>
 <option value="terrain">Topographic</option>
 <option value="edge_grid">Tactical Edge Grid (Offline)</option>
 </select>
 </div>

 {/* Terminal / Tiling Mode */}
 <div className="flex items-center justify-between">
 <div>
 <span className="text-xs text-slate-300 block font-medium">Terminal Mode</span>
 <span className="text-[10px] text-slate-400 font-mono">BSPWM Monospace HUD</span>
 </div>
 <button
 onClick={() => setDashboardTheme(prev => prev === 'terminal'? 'standard': 'terminal')}
 className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition border ${
 dashboardTheme === 'terminal'? 'bg-emerald-500 text-black border-emerald-400 shadow-glow-emerald': 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}`}
 >
 {dashboardTheme === 'terminal'? 'ENABLED': 'DISABLED'}
 </button>
 </div>

 {/* Telemetry Stream Rate */}
 <div className="flex items-center justify-between">
 <div>
 <span className="text-xs text-slate-300 block font-medium">Telemetry Rate</span>
 <span className="text-[10px] text-slate-400 font-mono">Sensor frequency</span>
 </div>
 <select
 value={telemetryRateHz}
 onChange={(e) => setTelemetryRateHz(parseFloat(e.target.value))}
 className="bg-slate-800 text-xs font-mono border border-slate-700 rounded-lg px-2 py-1 text-slate-200 outline-none focus:border-cyan-500 cursor-pointer">
 <option value={1.0}>1.0 Hz (Realtime)</option>
 <option value={0.5}>0.5 Hz (Balanced)</option>
 <option value={2.0}>2.0 Hz (High Speed)</option>
 </select>
 </div>

 {/* Operating Mode Status */}
 <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-[11px] font-mono">
 <span className="text-slate-400">System Mode:</span>
 <span className={`font-semibold ${isBackendConnected ? 'text-emerald-400': 'text-cyan-400'}`}>
 {isBackendConnected ? 'Cloud Sync Active': 'Rig Edge Autonomous'}
 </span>
 </div>
 </div>
 </div>
 </>
 )}
 </div>
 </div>
 </header>

 {/* Mobile Slide-Down Drawer Sheet */}
 {isMobileMenuOpen && (
 <div className="lg:hidden fixed inset-x-0 top-14 z-40 bg-slate-900/98 backdrop-blur-xl border-b border-slate-800 shadow-2xl p-4 space-y-3 animate-in slide-in-from-top-3 max-h-[85vh] overflow-y-auto">
 {/* Status & Role in Mobile Menu */}
 <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
 <div className="flex items-center space-x-2">
 <span className={`w-2 h-2 rounded-full ${isBackendConnected ? 'bg-emerald-400': 'bg-cyan-400'} animate-pulse`}></span>
 <span className="text-xs font-mono text-slate-300">{isBackendConnected ? 'Cloud Sync Active': 'Rig Edge Active'}</span>
 </div>
 <div className="flex items-center space-x-2">
 <span className="text-xs text-slate-400">Role:</span>
 <select 
 value={role} 
 onChange={handleRoleChange}
 className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 outline-none">
 <option value="Field Engineer">Field Engineer</option>
 <option value="Office Reviewer">Office Reviewer</option>
 </select>
 </div>
 </div>

 {/* Core Decision Support Modules (Touch targets >= 44px) */}
 <div className="grid grid-cols-1 gap-2 pt-1">
 {/* Data & Methodology in Mobile Menu */}
 <button 
 onClick={() => { setIsTransparencyOpen(true); setIsMobileMenuOpen(false); }}
 className="flex items-center space-x-3 p-3 rounded-xl bg-slate-850 active:bg-slate-800 text-slate-200 border border-slate-700/80 text-left font-medium text-xs min-h-[44px]">
 <Info size={18} className="text-cyan-400 shrink-0"/>
 <div>
 <div className="font-bold text-white">Data & Methodology Transparency</div>
 <div className="text-[10px] text-slate-400">Eaton, Teale, Volve & LightGBM disclosures</div>
 </div>
 </button>

 <button 
 onClick={() => { openModuleInNewTab('radar'); setIsMobileMenuOpen(false); }}
 className="flex items-center space-x-3 p-3 rounded-xl bg-amber-500/10 active:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-left font-medium text-xs min-h-[44px]">
 <Radar size={18} className="text-amber-400 shrink-0"/>
 <div>
 <div className="font-bold text-white flex items-center gap-1.5">
 <span>Ahead-of-the-Bit Hazard Radar</span>
 <ExternalLink size={12} className="text-amber-400"/>
 </div>
 <div className="text-[10px] text-amber-300/80">+250m Lookahead Proximity Scan (New Tab)</div>
 </div>
 </button>

 <button 
 onClick={() => { openModuleInNewTab('correlation'); setIsMobileMenuOpen(false); }}
 className="flex items-center space-x-3 p-3 rounded-xl bg-indigo-500/10 active:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-left font-medium text-xs min-h-[44px]">
 <Layers size={18} className="text-indigo-400 shrink-0"/>
 <div>
 <div className="font-bold text-white flex items-center gap-1.5">
 <span>Cross-Well Correlation & Stratigraphy</span>
 <ExternalLink size={12} className="text-indigo-400"/>
 </div>
 <div className="text-[10px] text-indigo-300/80">Casing programs & offset logs (New Tab)</div>
 </div>
 </button>

 <button 
 onClick={() => { openModuleInNewTab('ppfg'); setIsMobileMenuOpen(false); }}
 className="flex items-center space-x-3 p-3 rounded-xl bg-emerald-500/10 active:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-left font-medium text-xs min-h-[44px]">
 <Gauge size={18} className="text-emerald-400 shrink-0"/>
 <div>
 <div className="font-bold text-white flex items-center gap-1.5">
 <span>Safe Mud Weight Window (PPFG)</span>
 <ExternalLink size={12} className="text-emerald-400"/>
 </div>
 <div className="text-[10px] text-emerald-300/80">Pore Pressure vs Fracture Gradient (New Tab)</div>
 </div>
 </button>

 <button 
 onClick={() => { openModuleInNewTab('dossier'); setIsMobileMenuOpen(false); }}
 className="flex items-center space-x-3 p-3 rounded-xl bg-cyan-500/10 active:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-left font-medium text-xs min-h-[44px]">
 <FileText size={18} className="text-cyan-400 shrink-0"/>
 <div>
 <div className="font-bold text-white flex items-center gap-1.5">
 <span>1-Click Pre-Spud Dossier</span>
 <ExternalLink size={12} className="text-cyan-400"/>
 </div>
 <div className="text-[10px] text-cyan-300/80">Pre-spud hazard briefing (New Tab)</div>
 </div>
 </button>

 <button 
 onClick={() => { openModuleInNewTab('backtest'); setIsMobileMenuOpen(false); }}
 className="flex items-center space-x-3 p-3 rounded-xl bg-indigo-500/10 active:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-left font-medium text-xs min-h-[44px]">
 <History size={18} className="text-indigo-400 shrink-0"/>
 <div>
 <div className="font-semibold text-slate-100 flex items-center gap-1.5">
 <span>Time-Travel Backtest</span>
 <ExternalLink size={12} className="text-indigo-400"/>
 </div>
 <div className="text-[10px] text-slate-400">Validate advance warning against historical incidents (New Tab)</div>
 </div>
 </button>

 <button 
 onClick={() => { openModuleInNewTab('contribute'); setIsMobileMenuOpen(false); }}
 className="flex items-center space-x-3 p-3 rounded-xl bg-purple-500/10 active:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-left font-medium text-xs min-h-[44px]">
 <Brain size={18} className="text-purple-400 shrink-0"/>
 <div>
 <div className="font-bold text-white flex items-center gap-1.5">
 <span>Add Field Lesson Learned</span>
 <ExternalLink size={12} className="text-purple-400"/>
 </div>
 <div className="text-[10px] text-purple-300/80">Institutional Memory contributor (New Tab)</div>
 </div>
 </button>
 </div>

 {/* Utility Buttons */}
 <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
 <button 
 onClick={() => { setIsKnowledgeSearchOpen(true); setIsMobileMenuOpen(false); }}
 className="flex items-center justify-center space-x-2 py-2.5 px-3 bg-slate-800 active:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold">
 <Search size={14} />
 <span>Search Memory</span>
 </button>
 <button 
 onClick={() => { exportWellData(); setIsMobileMenuOpen(false); }}
 className="flex items-center justify-center space-x-2 py-2.5 px-3 bg-slate-800 active:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold">
 <Download size={14} />
 <span>Export CSV</span>
 </button>
 </div>
 </div>
 )}

 {/* Main Content Area */}
 <main className="flex-1 relative flex flex-col lg:flex-row min-h-0 overflow-hidden pb-16 lg:pb-0">
 
 {/* Map Container */}
 <div className={`flex-1 bg-slate-900 relative overflow-hidden flex flex-col ${mobileActiveTab === 'map'? 'flex': 'hidden lg:flex'}`}>
 
 {/* Proactive Depth-Proximity Lookahead Warning Banner (CORRECTION 3: Reuses /api/wells/{id}/lookahead) */}
 {proximityWarning?.active && (
 <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-4 sm:right-4 z-30 bg-gradient-to-r from-amber-950/95 via-amber-900/90 to-amber-950/95 border-2 border-amber-500/80 p-3 sm:p-3.5 rounded-xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-in slide-in-from-top-3">
 <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
 <div className="p-2 sm:p-2.5 bg-amber-500/20 rounded-lg border border-amber-500/40 text-amber-300 animate-pulse shrink-0">
 <AlertTriangle size={20} />
 </div>
 <div className="min-w-0">
 <div className="flex items-center space-x-2">
 <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded font-mono shrink-0">
 Proximity
 </span>
 <span className="text-xs font-bold text-amber-200 truncate">
 {proximityWarning.distance_m}m Ahead: {proximityWarning.formation} ({proximityWarning.tvd_top}m)
 </span>
 </div>
 <p className="text-[11px] sm:text-xs text-amber-100/90 mt-0.5 truncate">
 <strong className="text-white">Threat:</strong> {proximityWarning.primary_risk}
 </p>
 </div>
 </div>

 <div className="flex items-center space-x-1.5 shrink-0">
 <button
 onClick={() => openModuleInNewTab('radar')}
 className="px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1 shadow-lg shadow-amber-500/30 transition cursor-pointer">
 <Radar size={13} />
 <span className="hidden sm:inline">Inspect Ahead-of-Bit Radar</span>
 <span className="sm:hidden">Radar</span>
 <ExternalLink size={11} className="ml-1 opacity-80"/>
 </button>
 <button
 onClick={() => setProximityWarning(null)}
 className="p-1 rounded-lg text-amber-300/70 hover:text-white hover:bg-amber-900/50 transition" title="Dismiss alert">
 <X size={15} />
 </button>
 </div>
 </div>
 )}

 {/* Mobile Compact Drilling HUD Bar (Visible only on < sm) */}
 <div className="absolute top-3 left-3 right-3 z-10 flex sm:hidden items-center justify-between bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-2 shadow-xl">
 <div className="flex items-center space-x-3 text-xs">
 <div>
 <span className="text-[9px] text-slate-400 block font-mono uppercase">TVD</span>
 <span className="font-bold text-white font-mono">{telemetryData ? telemetryData.depth_tvd.toFixed(1) : "---"}m</span>
 </div>
 <div className="w-px h-6 bg-slate-800"/>
 <div>
 <span className="text-[9px] text-slate-400 block font-mono uppercase">ROP</span>
 <span className="font-bold text-status-active font-mono">{telemetryData ? telemetryData.rop.toFixed(1) : "---"}</span>
 </div>
 <div className="w-px h-6 bg-slate-800"/>
 <div>
 <span className="text-[9px] text-slate-400 block font-mono uppercase">Torque</span>
 <span className={`font-bold font-mono ${showAlerts && alertState.active ? 'text-status-danger animate-pulse': 'text-status-warning'}`}>
 {telemetryData ? telemetryData.torque.toFixed(0) : "---"}
 </span>
 </div>
 </div>
 <div className="flex items-center space-x-1.5">
 <button
 onClick={() => openModuleInNewTab('radar')}
 className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 active:bg-amber-500/20" title="Ahead-of-Bit Radar (New Tab)">
 <Radar size={15} />
 </button>
 <button
 onClick={() => {
 const nextStyle = basemapStyle === 'dark'? 'satellite': basemapStyle === 'satellite'? 'terrain': 'dark';
 handleBasemapChange(nextStyle);
 }}
 className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 active:bg-cyan-500/20" title={`Current map: ${basemapStyle}. Tap to toggle map type.`}
 >
 <MapIcon size={15} />
 </button>
 <button
 onClick={() => handleSimControl(simStatus.is_running ? 'pause': 'play')}
 className={`p-2 rounded-lg font-bold text-xs transition active:scale-95 ${
 simStatus.is_running
 ? 'bg-amber-500 text-slate-950': 'bg-emerald-500 text-slate-950'}`}
 title="Toggle simulation">
 {simStatus.is_running ? <Pause size={15} /> : <Play size={15} />}
 </button>
 </div>
 </div>

 {/* Active Drilling Status Card overlay (Hidden on < sm) */}
 <div className="absolute top-4 left-4 z-10 hidden sm:flex gap-3 items-start flex-wrap">
 {/* TVD */}
 <div className="glass-panel p-3.5 sm:p-4 rounded-xl shadow-glass border-slate-750 min-w-[180px] relative overflow-hidden group">
 <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"/>
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[10px] uppercase text-white font-mono font-bold tracking-wider flex items-center gap-1.5">
 <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"/>
 Current TVD
 </span>
 <span className="text-[10px] text-white font-mono">Bit Depth</span>
 </div>
 <div className="text-3xl font-mono font-semibold tracking-tight text-white flex items-baseline gap-1.5">
 {telemetryData ? telemetryData.depth_tvd.toFixed(1) : "---"}
 <span className="text-xs font-mono font-normal text-white">m</span>
 </div>
 </div>
 
 {/* ROP */}
 <div className="glass-panel p-3.5 sm:p-4 rounded-xl shadow-glass border-slate-750 min-w-[145px] relative overflow-hidden group">
 <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent"/>
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[10px] uppercase text-white font-mono font-bold tracking-wider flex items-center gap-1.5">
 <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
 ROP
 </span>
 <span className="text-[10px] text-white font-mono">Penetration</span>
 </div>
 <div className="text-3xl font-mono font-semibold tracking-tight text-white flex items-baseline gap-1.5">
 {telemetryData ? telemetryData.rop.toFixed(1) : "---"}
 <span className="text-xs font-mono font-normal text-white">m/h</span>
 </div>
 </div>

 {/* Torque */}
 <div className={`glass-panel p-3.5 sm:p-4 rounded-xl shadow-glass min-w-[165px] relative overflow-hidden transition-all duration-500 ${
 showAlerts && alertState.active 
 ? 'border-status-danger/80 bg-rose-950/30 shadow-glow-danger': 'border-slate-750'}`}>
 <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent ${
 showAlerts && alertState.active ? 'via-rose-500/80': 'via-amber-400/50'} to-transparent`} />
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[10px] uppercase font-mono font-bold tracking-wider flex items-center gap-1.5 text-white">
 <span className={`w-1.5 h-1.5 rounded-full ${showAlerts && alertState.active ? 'bg-rose-500 animate-ping': 'bg-amber-400'}`} />
 Torque
 </span>
 <span className="text-[10px] text-white font-mono">Surface</span>
 </div>
 <div className={`text-3xl font-mono font-semibold tracking-tight flex items-baseline gap-1.5 ${
 showAlerts && alertState.active ? 'text-white animate-pulse': 'text-white'}`}>
 {telemetryData ? telemetryData.torque.toFixed(0) : "---"}
 <span className="text-xs font-mono font-normal text-white">lbf-ft</span>
 </div>
 </div>

 {/* Ahead-of-the-Bit Hazard Radar Overlay Card */}
 {(() => {
 const WELL_RADAR_PREVIEWS = {'OIL-BAGHJAN-1': { horizon: 'Barail Kick Horizon', top: '2,400m'},'OIL-BAGHJAN-4': { horizon: 'Barail Gas Sand', top: '2,420m'},'OIL-NAHARKATIYA-1': { horizon: 'Barail Sand-Shale', top: '2,040m'},'OIL-MORAN-1': { horizon: 'Deep Barail Interval', top: '2,580m'},'OIL-DIKOM-1': { horizon: 'Barail Sandstone Top', top: '2,240m'},'OIL-TENGAKHAT-1': { horizon: 'Barail Main Sand', top: '2,120m'},'OIL-KOTHALONI-1': { horizon: 'Barail Argillaceous', top: '2,320m'},'OIL-HAPJAN-1': { horizon: 'Barail Coal Sequence', top: '2,360m'},'OIL-SHALMARI-1': { horizon: 'Barail Laminated Sand', top: '2,210m'},
 };
 const preview = WELL_RADAR_PREVIEWS[selectedWell] || { horizon: 'Barail Horizon', top: '2,400m'};
 return (
 <button 
 onClick={() => openModuleInNewTab('radar')}
 className="glass-panel hover:border-amber-500/60 p-3.5 rounded-xl shadow-glass min-w-[230px] text-left transition-all duration-300 group cursor-pointer relative overflow-hidden border-amber-500/30" title="Open Ahead-of-the-Bit Radar in New Fullscreen Tab">
 <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"/>
 <div className="flex items-center justify-between text-xs uppercase text-white font-bold mb-1.5">
 <span className="flex items-center space-x-1.5 font-mono text-[11px]">
 <Radar size={14} className="animate-spin-slow text-white"/>
 <span>Lookahead Radar</span>
 </span>
 <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-full font-mono text-white border border-amber-500/30">+250m</span>
 </div>
 <div className="text-sm font-semibold text-white group-hover:text-white transition truncate">
 {preview.horizon}
 </div>
 <div className="text-[11px] text-white mt-1.5 flex items-center justify-between font-mono">
 <span>Top: ~{preview.top}</span>
 <span className="text-white font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
 Scan →
 </span>
 </div>
 </button>
 );
 })()}

 {/* Map Types / Basemap Switcher Card (Placed directly next to Lookahead Radar) */}
 <div 
 id="basemap-style-switcher" className="glass-panel p-3.5 rounded-xl shadow-glass border-slate-750 min-w-[215px] relative overflow-hidden group flex flex-col justify-between">
 <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"/>
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[10px] uppercase text-cyan-400 font-mono font-bold tracking-wider flex items-center gap-1.5">
 <MapIcon size={12} className="text-cyan-400"/>
 <span>Map Types</span>
 </span>
 <span className="text-[10px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono capitalize font-bold">
 {basemapStyle}
 </span>
 </div>
 <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 mt-1">
 {BASEMAP_OPTIONS.map(opt => {
 const isSelected = basemapStyle === opt.id;
 const Icon = opt.icon;
 return (
 <button
 key={opt.id}
 type="button" id={`basemap-btn-${opt.id}`}
 onClick={() => handleBasemapChange(opt.id)}
 title={`Switch to ${opt.label} basemap`}
 className={`flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer
 ${isSelected 
 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm font-semibold': 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'}`}
 >
 <Icon size={12} className={isSelected ? 'text-cyan-400': 'text-slate-400'} />
 <span>{opt.label}</span>
 </button>
 );
 })}
 </div>
 </div>
 </div>

 {/* In-App Telemetry Feed Controller (Desktop Tactical Cyber-Console) */}
 <div className="absolute bottom-6 left-4 z-20 glass-panel border border-slate-700/80 p-3.5 rounded-2xl shadow-2xl hidden lg:flex flex-wrap items-center gap-3.5 max-w-[calc(100%-5rem)]">
 <div className="flex items-center space-x-2 border-r border-slate-800 pr-3.5">
 <button
 onClick={() => handleSimControl(simStatus.is_running ? 'pause': 'play')}
 className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md active:scale-95 ${
 simStatus.is_running
 ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-glow-amber': 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-glow-emerald'}`}
 >
 {simStatus.is_running ? <Pause size={14} /> : <Play size={14} />}
 <span>{simStatus.is_running ? 'Pause Sim': 'Play Simulator'}</span>
 </button>

 <button
 onClick={() => handleSimControl('reset')}
 className="p-1.5 rounded-lg border border-slate-700/80 hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Reset TVD to 2240m">
 <RotateCcw size={14} />
 </button>
 </div>

 {/* Speed Controls */}
 <div className="flex items-center space-x-1 border-r border-slate-800 pr-3.5">
 {[1, 2, 5].map(speed => (
 <button
 key={speed}
 onClick={() => handleSpeedChange(speed)}
 className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition ${
 simSpeed === speed
 ? 'bg-cyan-500 text-slate-950 shadow-glow-cyan': 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60'}`}
 title={`${speed}x Simulation Speed`}
 >
 {speed}x
 </button>
 ))}
 </div>

 {/* Seek Control */}
 <div className="flex items-center space-x-3 border-r border-slate-800 pr-3.5 min-w-[210px]">
 <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Seek TVD:</span>
 <input
 type="range" min="0" max="3500" step="10" value={isDraggingSeek ? seekDepth : (telemetryData?.depth_tvd || 2240)}
 onPointerDown={() => setIsDraggingSeek(true)}
 onChange={(e) => setSeekDepth(parseFloat(e.target.value))}
 onPointerUp={(e) => {
 setIsDraggingSeek(false);
 handleSeek(parseFloat(e.target.value));
 }}
 className="flex-1 accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"/>
 <span className="text-xs font-mono font-bold text-cyan-400 w-14 text-right">
 {(isDraggingSeek ? seekDepth : (telemetryData?.depth_tvd || 2240)).toFixed(0)}m
 </span>
 </div>

 {/* Scenario Injectors */}
 <div className="flex items-center space-x-1.5">
 <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mr-1">Inject:</span>
 
 <button
 onClick={() => handleScenarioInject('normal')}
 className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border ${
 simStatus.active_scenario === 'normal'? 'bg-emerald-500/20 border-emerald-500/70 text-emerald-300 shadow-glow-emerald': 'bg-slate-900/80 border-slate-700/60 text-slate-400 hover:text-white'}`}
 title="Nominal baseline circulating parameters">
 Normal
 </button>

 <button
 onClick={() => handleScenarioInject('gas_kick')}
 className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border flex items-center space-x-1 ${
 simStatus.active_scenario === 'gas_kick'? 'bg-amber-500/25 border-amber-500/80 text-amber-300 shadow-glow-amber': 'bg-amber-950/20 border-amber-800/40 text-amber-400 hover:bg-amber-900/30'}`}
 title="Simulate formation gas influx (flow-out increase, pit gain, SPP drop)">
 <Flame size={12} className="text-amber-400"/>
 <span>Gas Kick</span>
 </button>

 <button
 onClick={() => handleScenarioInject('lost_circulation')}
 className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border flex items-center space-x-1 ${
 simStatus.active_scenario === 'lost_circulation'? 'bg-cyan-500/25 border-cyan-500/80 text-cyan-300 shadow-glow-cyan': 'bg-cyan-950/20 border-cyan-800/40 text-cyan-400 hover:bg-cyan-900/30'}`}
 title="Simulate mud loss (flow-out deficit, pit volume drop, ECD decrease)">
 <Droplets size={12} className="text-cyan-400"/>
 <span>Lost Circ</span>
 </button>

 <button
 onClick={() => handleScenarioInject('stuck_pipe')}
 className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border flex items-center space-x-1 ${
 simStatus.active_scenario === 'stuck_pipe'? 'bg-rose-500/25 border-rose-500/80 text-rose-300 shadow-glow-danger': 'bg-rose-950/20 border-rose-800/40 text-rose-400 hover:bg-rose-900/30'}`}
 title="Simulate mechanical packoff (torque spike, zero ROP, motor stall)">
 <Anchor size={12} className="text-rose-400"/>
 <span>Stuck Pipe</span>
 </button>
 </div>

 {/* 1-Click Field Incident Scenarios (Calibrated to Golden PDF Events) */}
 <div className="flex items-center space-x-1.5 border-l border-slate-800 pl-3">
 <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
 <AlertTriangle size={11} className="text-amber-400"/>
 <span>Field Incidents:</span>
 </span>
 <div className="flex items-center space-x-1">
 {demoScenarios.map(sc => {
 const isActive = activeDemoScenarioId === sc.id;
 return (
 <button
 key={sc.id}
 id={`demo-scenario-btn-${sc.id}`}
 onClick={() => handleSelectDemoScenario(sc)}
 className={`px-2 py-1 rounded-lg text-[10px] font-bold tracking-tight transition border flex items-center space-x-1 ${
 isActive
 ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-glow-amber': 'bg-slate-900/90 border-slate-700/80 text-slate-300 hover:border-amber-500/50 hover:text-white'}`}
 title={`${sc.title}\nWell: ${sc.well_id} | Depth: ${sc.depth}m | Formation: ${sc.formation}\nClick to load scenario in 1 click`}
 >
 <span>{sc.id === "1"? "Stuck (2832m)": sc.id === "2"? "Losses (1540m)": "Kick (3105m)"}</span>
 </button>
 );
 })}
 </div>
 </div>

 {/* Provenance: the feed driving everything to the left is generated, not live.
 No eRTMAC connection exists yet, so this panel stands in for the rig feed. */}
 <div className="flex items-center border-l border-slate-800 pl-3">
 <span
 className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono font-medium tracking-tight bg-amber-500/10 text-amber-300 border-amber-500/40 cursor-help select-none" title="Simulated rig telemetry. No live eRTMAC feed is connected — this panel generates the sensor stream (ROP, WOB, torque, pit gain, mud weight) that the physics + ML risk engine then scores. The hazard signatures are calibrated to Assam-Arakan lithology, but no reading here came off a real rig.">
 <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
 SIMULATED FEED
 </span>
 </div>

 {/* Active Status Badge */}
 <div className="flex items-center space-x-2 border-l border-slate-800 pl-3">
 <span className={`w-2 h-2 rounded-full ${simStatus.is_running ? 'bg-emerald-400 animate-ping': 'bg-slate-600'}`}></span>
 <span className="text-[11px] font-mono text-slate-300">
 {simStatus.active_scenario !== 'normal'? (
 <span className="text-amber-400 font-bold uppercase">{simStatus.active_scenario.replace('_','')} (ACTIVE)</span>
 ) : (
 <span>Steady Baseline</span>
 )}
 </span>
 </div>
 </div>

 <WellMap 
 activeWellId={selectedWell} 
 onSelectWell={handleSelectWell} 
 selectedRegion={selectedRegion}
 onSelectRegion={handleSelectRegion}
 currentDepth={telemetryData ? telemetryData.depth_tvd : null}
 activeScenario={simStatus.active_scenario}
 is3DViewerOpen={is3DViewerOpen}
 setIs3DViewerOpen={setIs3DViewerOpen}
 basemapStyle={basemapStyle}
 onBasemapChange={handleBasemapChange}
 />
 </div>

 {/* Dedicated Mobile Simulator Screen (Visible when mobileActiveTab === 'simulator'on < lg) */}
 {mobileActiveTab === 'simulator'&& (
 <div className="lg:hidden flex-1 w-full bg-slate-950 p-4 overflow-y-auto space-y-4">
 <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
 <div className="flex items-center justify-between pb-3 border-b border-slate-800">
 <div className="flex items-center space-x-2">
 <Sliders size={18} className="text-cyan-400"/>
 <h2 className="font-bold text-white text-sm">Drilling Simulator Engine</h2>
 </div>
 <div className="flex items-center space-x-1.5">
 <span className={`w-2.5 h-2.5 rounded-full ${simStatus.is_running ? 'bg-emerald-400 animate-ping': 'bg-slate-600'}`}></span>
 <span className="text-xs font-mono font-bold text-slate-300">
 {simStatus.is_running ? 'RUNNING': 'PAUSED'}
 </span>
 </div>
 </div>

 {/* Primary Play/Pause Controls */}
 <div className="grid grid-cols-2 gap-3 mt-4">
 <button
 onClick={() => handleSimControl(simStatus.is_running ? 'pause': 'play')}
 className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 shadow-lg min-h-[48px] active:scale-[0.98] transition ${
 simStatus.is_running
 ? 'bg-amber-500 text-slate-950 shadow-amber-500/20': 'bg-emerald-500 text-slate-950 shadow-emerald-500/20'}`}
 >
 {simStatus.is_running ? <Pause size={18} /> : <Play size={18} />}
 <span>{simStatus.is_running ? 'Pause Simulator': 'Play Simulator'}</span>
 </button>

 <button
 onClick={() => handleSimControl('reset')}
 className="py-3 px-4 rounded-xl font-bold text-sm bg-slate-800 active:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center space-x-2 min-h-[48px] transition">
 <RotateCcw size={18} />
 <span>Reset TVD</span>
 </button>
 </div>

 {/* Speed Selector */}
 <div className="mt-4 pt-3 border-t border-slate-800">
 <div className="text-xs text-slate-400 mb-2 font-medium">Playback Speed</div>
 <div className="grid grid-cols-3 gap-2">
 {[1, 2, 5].map(speed => (
 <button
 key={speed}
 onClick={() => handleSpeedChange(speed)}
 className={`py-2 rounded-xl text-xs font-bold transition min-h-[44px] ${
 simSpeed === speed
 ? 'bg-cyan-500 text-slate-900 shadow-md shadow-cyan-500/20': 'bg-slate-800 text-slate-300 border border-slate-700'}`}
 >
 {speed}x Realtime
 </button>
 ))}
 </div>
 </div>

 {/* Depth TVD Seek Slider */}
 <div className="mt-4 pt-3 border-t border-slate-800">
 <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-medium">
 <span>Depth Seek (TVD)</span>
 <span className="font-mono text-cyan-400 font-bold">
 {(isDraggingSeek ? seekDepth : (telemetryData?.depth_tvd || 2240)).toFixed(0)} m
 </span>
 </div>
 <input
 type="range" min="0" max="3500" step="10" value={isDraggingSeek ? seekDepth : (telemetryData?.depth_tvd || 2240)}
 onPointerDown={() => setIsDraggingSeek(true)}
 onChange={(e) => setSeekDepth(parseFloat(e.target.value))}
 onPointerUp={(e) => {
 setIsDraggingSeek(false);
 handleSeek(parseFloat(e.target.value));
 }}
 className="w-full accent-cyan-500 cursor-pointer h-2.5 bg-slate-800 rounded-lg appearance-none my-2"/>
 <div className="flex justify-between text-[10px] font-mono text-slate-500">
 <span>0m</span>
 <span>1,750m</span>
 <span>3,500m</span>
 </div>
 </div>
 </div>

 {/* Scenario Injection Section */}
 <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
 <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
 Inject Hazard Scenarios (ML Risk Engine)
 </div>
 <div className="grid grid-cols-1 gap-2.5">
 <button
 onClick={() => handleScenarioInject('normal')}
 className={`p-3 rounded-xl text-left border transition min-h-[44px] flex items-center justify-between ${
 simStatus.active_scenario === 'normal'? 'bg-emerald-500/20 border-emerald-500 text-emerald-300': 'bg-slate-950/60 border-slate-800 text-slate-300 active:bg-slate-800'}`}
 >
 <div>
 <div className="font-bold text-xs">Baseline Steady-State</div>
 <div className="text-[11px] text-slate-400">Normal circulation, no influx or losses</div>
 </div>
 {simStatus.active_scenario === 'normal'&& <CheckCircle2 size={16} className="text-emerald-400 shrink-0"/>}
 </button>

 <button
 onClick={() => handleScenarioInject('gas_kick')}
 className={`p-3 rounded-xl text-left border transition min-h-[44px] flex items-center justify-between ${
 simStatus.active_scenario === 'gas_kick'? 'bg-amber-500/20 border-amber-500 text-amber-300': 'bg-slate-950/60 border-slate-800 text-slate-300 active:bg-slate-800'}`}
 >
 <div className="flex items-center space-x-3">
 <Flame size={18} className="text-amber-400 shrink-0"/>
 <div>
 <div className="font-bold text-xs">Gas Kick (Formation Influx)</div>
 <div className="text-[11px] text-slate-400">+3.5 bbl pit gain, flow-out surge 118%</div>
 </div>
 </div>
 {simStatus.active_scenario === 'gas_kick'&& <CheckCircle2 size={16} className="text-amber-400 shrink-0"/>}
 </button>

 <button
 onClick={() => handleScenarioInject('lost_circulation')}
 className={`p-3 rounded-xl text-left border transition min-h-[44px] flex items-center justify-between ${
 simStatus.active_scenario === 'lost_circulation'? 'bg-cyan-500/20 border-cyan-500 text-cyan-300': 'bg-slate-950/60 border-slate-800 text-slate-300 active:bg-slate-800'}`}
 >
 <div className="flex items-center space-x-3">
 <Droplets size={18} className="text-cyan-400 shrink-0"/>
 <div>
 <div className="font-bold text-xs">Lost Circulation (Mud Loss)</div>
 <div className="text-[11px] text-slate-400">-4.2 bbl pit loss, flow-out drops to 62%</div>
 </div>
 </div>
 {simStatus.active_scenario === 'lost_circulation'&& <CheckCircle2 size={16} className="text-cyan-400 shrink-0"/>}
 </button>

 <button
 onClick={() => handleScenarioInject('stuck_pipe')}
 className={`p-3 rounded-xl text-left border transition min-h-[44px] flex items-center justify-between ${
 simStatus.active_scenario === 'stuck_pipe'? 'bg-rose-500/20 border-rose-500 text-rose-300': 'bg-slate-950/60 border-slate-800 text-slate-300 active:bg-slate-800'}`}
 >
 <div className="flex items-center space-x-3">
 <Anchor size={18} className="text-rose-400 shrink-0"/>
 <div>
 <div className="font-bold text-xs">Stuck Pipe (Mechanical Packoff)</div>
 <div className="text-[11px] text-slate-400">Torque spike to 28,500 lbf-ft, drillstring stall</div>
 </div>
 </div>
 {simStatus.active_scenario === 'stuck_pipe'&& <CheckCircle2 size={16} className="text-rose-400 shrink-0"/>}
 </button>
 </div>

 {/* Field Incident Replay (Golden PDF Documented Incidents) */}
 <div className="mt-4 pt-3 border-t border-slate-800">
 <div className="flex items-center justify-between text-xs font-bold text-amber-400 uppercase tracking-wider mb-2.5">
 <div className="flex items-center space-x-1.5">
 <AlertTriangle size={13} className="text-amber-400"/>
 <span>Field Incident Replay</span>
 </div>
 <span className="text-[10px] font-mono text-slate-500">1-Click</span>
 </div>
 <div className="grid grid-cols-1 gap-2">
 {demoScenarios.map(sc => (
 <button
 key={sc.id}
 onClick={() => handleSelectDemoScenario(sc)}
 className={`p-2.5 rounded-xl text-left border transition flex items-start justify-between ${
 activeDemoScenarioId === sc.id
 ? 'bg-amber-500/15 border-amber-500 text-amber-200': 'bg-slate-950/60 border-slate-800 text-slate-300 active:bg-slate-800'}`}
 >
 <div className="min-w-0 pr-2">
 <div className="text-xs font-bold text-white flex items-center gap-1.5">
 <span>{sc.title}</span>
 </div>
 <div className="text-[10px] font-mono text-cyan-400 mt-0.5">
 {sc.well_id} • {sc.depth}m • {sc.formation}
 </div>
 <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">
 {sc.description}
 </div>
 </div>
 {activeDemoScenarioId === sc.id && (
 <CheckCircle2 size={16} className="text-amber-400 shrink-0 mt-0.5"/>
 )}
 </button>
 ))}
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Right-Hand Drawer / Mobile Telemetry Tab */}
 <aside className={`${mobileActiveTab === 'telemetry'? 'flex w-full flex-1': telemetryRail ? 'hidden lg:flex lg:w-11': 'hidden lg:flex lg:w-[460px]'} ${telemetryRail ? 'telemetry-collapsed': ''} border-l border-slate-800/80 bg-[#131313]/95 backdrop-blur-xl flex flex-col shadow-2xl z-20 shrink-0 relative h-full min-h-0 overflow-hidden transition-[width] duration-200 ease-out`}>

 {/* Collapsed rail: keeps the well visible and gives an obvious way back.
 Sibling content is hidden by the .telemetry-collapsed rule in index.css. */}
 {telemetryRail && (
 <button
 type="button" onClick={() => setIsTelemetryCollapsed(false)}
 title="Expand telemetry stream" aria-label="Expand telemetry stream" className="telemetry-rail group flex h-full w-11 flex-col items-center gap-3 py-4 text-slate-400 transition-colors hover:text-cyan-300">
 <PanelRightOpen size={15} />
 <span
 className="text-[10px] font-mono uppercase tracking-widest [writing-mode:vertical-rl]" style={{ transform: 'rotate(180deg)'}}
 >
 Telemetry & ML Risk
 </span>
 <span className="mt-auto h-2 w-2 rounded-full bg-cyan-400 animate-pulse"/>
 </button>
 )}
 
 {/* Sequence-Based Pattern Matching Precursor Banner (Prompt 5) */}
 {sequenceAlert && sequenceAlert.matched && (
 <div className="bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 text-white p-3.5 border-b-2 border-amber-500 shadow-[0_0_20px_rgba(177, 177, 177,0.3)] animate-in slide-in-from-top-4 relative z-30">
 <button 
 onClick={() => setSequenceAlert(null)}
 className="absolute top-2.5 right-2.5 text-white/70 hover:text-white transition-colors p-1" title="Dismiss Pattern Alert">
 <XCircle size={16} />
 </button>
 <div className="flex items-start space-x-2.5">
 <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 animate-pulse mt-0.5 shrink-0">
 <Activity size={16} />
 </div>
 <div className="min-w-0 pr-6">
 <div className="flex items-center gap-1.5 flex-wrap">
 <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded font-mono">
 DTW Pattern Precursor
 </span>
 <span className="text-xs font-bold text-amber-200">
 {sequenceAlert.pattern_name}
 </span>
 </div>
 <p className="text-xs text-amber-100/90 mt-1">
 Lead-up pattern matched historical incident <strong className="text-white font-mono">{sequenceAlert.historical_incident_id}</strong>
 </p>
 <div className="flex items-center justify-between flex-wrap gap-2 mt-2 pt-1.5 border-t border-amber-500/30 text-[11px] font-mono">
 <span className="text-amber-300">
 DTW Similarity: <strong className="text-white">{(sequenceAlert.similarity_score * 100).toFixed(1)}%</strong>
 </span>
 <button
 onClick={() => openModuleInNewTab('correlation')}
 className="px-2 py-0.5 rounded bg-amber-500/30 hover:bg-amber-500/50 border border-amber-500/60 text-amber-200 hover:text-white text-[10px] font-mono font-bold transition cursor-pointer flex items-center space-x-1" title="Open Cross-Well Correlation in New Tab">
 <span>View Reference Incident</span>
 <ExternalLink size={10} />
 </button>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Hazard Alert Banner */}
 {showAlerts && alertState.active && (
 <div className="bg-gradient-to-r from-rose-950 via-rose-900 to-rose-950 text-white p-4 border-b-2 border-rose-500 shadow-glow-danger animate-in slide-in-from-top-4 relative z-30">
 <button 
 onClick={dismissAlert}
 className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors p-1">
 <XCircle size={18} />
 </button>
 <div className="flex items-center gap-2.5 mb-2">
 <div className="p-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 animate-pulse">
 <AlertTriangle size={18} />
 </div>
 <h2 className="font-display font-bold text-sm tracking-wide uppercase text-white">Proactive Hazard Influx Alert</h2>
 </div>
 <div className="bg-black/30 p-2.5 rounded-lg text-xs mb-2.5 border border-rose-500/20">
 <p className="font-medium text-rose-100 flex items-center justify-between">
 <span>Composite Hazard Probability:</span>
 <span className="text-rose-300 font-mono font-bold text-sm">
 {(() => {
 const p = alertState.prediction;
 const raw = p?.risk_probability ?? p?.risk_score ?? 0.88;
 const num = Number(raw);
 const pct = !isNaN(num) ? (num <= 1.0 ? num * 100 : num) : 88.0;
 return`${pct.toFixed(1)}%`;
 })()}
 </span>
 </p>
 {alertState.prediction && (alertState.prediction.top_factors?.length > 0 || alertState.prediction.top_features?.length > 0) && (
 <p className="mt-1 text-slate-300">
 <span className="text-rose-300 font-medium">Risk Driver:</span> {
 (alertState.prediction.top_factors?.[0]?.feature || alertState.prediction.top_features?.[0]?.feature ||'Pit Volume Influx')
 .replace(/_/g,'').toUpperCase()
 } 
 ({(alertState.prediction.top_factors?.[0]?.direction === 'DECREASES_RISK') ? 'Reduced': 'Elevated'})
 </p>
 )}
 </div>
 
 {/* RAG Context Display */}
 {ragContext ? (
 <div className="bg-slate-900/90 text-slate-200 p-2.5 rounded-lg text-xs border border-slate-700/80 shadow-inner">
 <div className="flex items-center justify-between mb-1.5">
 <div className="flex items-center gap-1.5 text-amber-400">
 <TrendingDown size={14} />
 <span className="font-bold uppercase text-[10px] tracking-wider font-mono">Institutional Memory Match</span>
 </div>
 <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
 <ShieldCheck size={10} className="text-emerald-400"/>
 <span> Guardrail Verified</span>
 </span>
 </div>
 <p className="mb-1.5 text-slate-300"><span className="text-slate-400">Precedent:</span> Offset well <span className="font-mono text-cyan-300 font-bold">{ragContext.well_id}</span> experienced <strong className="text-white">{ragContext.event_type}</strong> at {ragContext.depth_tvd}m.</p>
 <p><span className="text-slate-400">Mitigation:</span> <span className="text-emerald-400 font-medium">{ragContext.mitigation_applied}</span></p>
 </div>
 ) : (
 <div className="text-xs text-rose-200 animate-pulse font-mono">Searching Institutional Memory Vector DB...</div>
 )}
 </div>
 )}

 {/* Drawer Header */}
 <div className="p-4 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-[#131313]/80">
 <div className="flex items-center space-x-2.5">
 <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"/>
 <h2 className="font-display font-bold text-sm tracking-wide text-slate-100 uppercase">
 Telemetry & ML Risk Stream
 </h2>
 </div>
 <div className="flex items-center space-x-2">
 <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
 WELL: {selectedWell.replace('OIL-','')}
 </span>
 <SourceTag source={selectedWell} compact={true} />
 <button
 type="button" onClick={() => setIsTelemetryCollapsed(true)}
 title="Collapse telemetry stream" aria-label="Collapse telemetry stream" className="p-1 rounded-md text-slate-500 hover:text-cyan-300 hover:bg-slate-800/70 transition-colors">
 <PanelRightClose size={15} />
 </button>
 </div>
 </div>
 
 <div className="flex-1 p-4 overflow-y-auto custom-scrollbar pb-10 space-y-4">
 
 {/* Multi-Hazard Risk Engine Gauges (SIH 2026 Mandate) */}
 <div className="glass-card rounded-2xl p-4 shadow-glass space-y-3 relative overflow-hidden">
 <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent"/>
 <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
 <div className="flex items-center space-x-2">
 <Gauge size={16} className="text-cyan-400"/>
 <h3 className="text-xs uppercase font-mono font-bold text-slate-200 tracking-wider">Multi-Hazard Risk Engine</h3>
 </div>
 <div className="flex items-center space-x-2">
 <span className="text-[11px] text-slate-400 font-mono">Composite:</span>
 <span className={`text-xs font-bold font-mono px-2.5 py-0.5 rounded-full transition-colors ${
 (predictionData?.risk_probability || 0.15) >= 0.75 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-glow-danger':
 (predictionData?.risk_probability || 0.15) >= 0.40 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-glow-amber': 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-glow-emerald'}`}>
 {Math.round((predictionData?.risk_probability || 0.15) * 100)}% ({predictionData?.risk_level ||'LOW'})
 </span>
 </div>
 </div>

 {/* Statistical Anomaly Layer (Prompt 7: Independent Baseline Z-Score & CUSUM Signal) */}
 {predictionData?.statistical_anomaly && (
 <div className={`p-2.5 rounded-xl border font-mono text-xs transition ${
 predictionData.statistical_anomaly.anomaly_detected
 ? 'bg-amber-950/30 border-amber-500/50 text-amber-200': 'bg-slate-950/50 border-slate-800/80 text-slate-400'}`}>
 <div className="flex items-center justify-between mb-1.5">
 <div className="flex items-center space-x-1.5">
 <Sliders size={13} className={predictionData.statistical_anomaly.anomaly_detected ? 'text-amber-400 animate-pulse': 'text-slate-500'} />
 <span className="text-[10px] uppercase font-bold tracking-wider">
 Statistical Anomaly (Independent 3rd Signal)
 </span>
 </div>
 <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
 predictionData.statistical_anomaly.anomaly_detected
 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
 {predictionData.statistical_anomaly.anomaly_detected ? 'ANOMALY FLAGGED': 'NOMINAL BASELINE'}
 </span>
 </div>
 <div className="grid grid-cols-3 gap-1.5 text-[10px] text-center my-1.5">
 <div className="bg-slate-900/80 p-1 rounded border border-slate-800">
 <span className="text-slate-400 block text-[9px]">Torque Z</span>
 <span className={`font-bold ${Math.abs(predictionData.statistical_anomaly.z_scores?.torque || 0) >= 2.5 ? 'text-amber-400': 'text-slate-200'}`}>
 {predictionData.statistical_anomaly.z_scores?.torque !== undefined ? predictionData.statistical_anomaly.z_scores.torque.toFixed(2) : '0.00'}σ
 </span>
 </div>
 <div className="bg-slate-900/80 p-1 rounded border border-slate-800">
 <span className="text-slate-400 block text-[9px]">ROP Z</span>
 <span className={`font-bold ${Math.abs(predictionData.statistical_anomaly.z_scores?.rop || 0) >= 2.5 ? 'text-amber-400': 'text-slate-200'}`}>
 {predictionData.statistical_anomaly.z_scores?.rop !== undefined ? predictionData.statistical_anomaly.z_scores.rop.toFixed(2) : '0.00'}σ
 </span>
 </div>
 <div className="bg-slate-900/80 p-1 rounded border border-slate-800">
 <span className="text-slate-400 block text-[9px]">Flow Return Z</span>
 <span className={`font-bold ${Math.abs(predictionData.statistical_anomaly.z_scores?.flow_out_pct || 0) >= 2.5 ? 'text-amber-400': 'text-slate-200'}`}>
 {predictionData.statistical_anomaly.z_scores?.flow_out_pct !== undefined ? predictionData.statistical_anomaly.z_scores.flow_out_pct.toFixed(2) : '0.00'}σ
 </span>
 </div>
 </div>
 <div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-1">
 <span className="truncate">{predictionData.statistical_anomaly.summary}</span>
 <span className="text-[9px] text-slate-500 shrink-0 ml-1">Rolling N=15 CUSUM</span>
 </div>
 </div>
 )}

 {/* Disaggregated hazard indicators — driven by HAZARD_CARDS */}
          <div className="grid grid-cols-2 gap-2.5">
            {HAZARD_CARDS.map(({ key, label, icon: Icon, probability, indicator }) => {
              const hazard = predictionData?.hazards?.[key] || { probability, key_indicator: indicator };
              const pct = Math.round(hazard.probability * 100);
              return (
                <div key={key} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-600 transition flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1.5">
                      <Icon size={13} className="text-slate-400" />
                      <span>{label}</span>
                    </span>
                    <span className={`text-xs font-mono font-bold ${hazard.probability > 0.6 ? 'text-white' : 'text-slate-400'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden mb-1.5">
                    <div
                      className={`h-full transition-all duration-500 ${hazard.probability > 0.7 ? 'bg-rose-500 shadow-glow-danger' : hazard.probability > 0.35 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono truncate">{hazard.key_indicator || 'Nominal'}</span>
                </div>
              );
            })}
          </div>

          {/* Physics Parameters Footer */}
 <div className="pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-400">
 <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-850">
 <span className="text-slate-500 text-[10px] block uppercase">MSE</span>
 <span className="text-white font-semibold">{predictionData?.mse_kpsi ||'---'} <span className="text-[9px] text-slate-400">kpsi</span></span>
 </div>
 <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-850">
 <span className="text-slate-500 text-[10px] block uppercase">d-exponent</span>
 <span className="text-white font-semibold">{predictionData?.d_xc ||'---'}</span>
 </div>
 <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-850">
 <span className="text-slate-500 text-[10px] block uppercase">FG Margin</span>
 <span className="text-emerald-400 font-semibold">
 {predictionData?.fracture_margin_ppg ?`${predictionData.fracture_margin_ppg > 0 ? '+': ''}${predictionData.fracture_margin_ppg} ppg`: '---'}
 </span>
 </div>
 </div>
 </div>

 {/* LIVE DRILLING TELEMETRY SENSOR MATRIX */}
 <div className="glass-card rounded-2xl p-4 shadow-glass space-y-3 relative overflow-hidden">
 <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
 <div className="flex items-center space-x-2">
 <Activity size={15} className="text-emerald-400"/>
 <h3 className="text-xs uppercase font-mono font-bold text-slate-200 tracking-wider">
 Rig Physical Telemetry
 </h3>
 </div>
 <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
 Active Feed
 </span>
 </div>

 <div className="grid grid-cols-3 gap-2 text-center">
 {/* WOB */}
 <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
 <span className="text-[10px] uppercase font-mono text-slate-400 block">WOB</span>
 <span className="text-base font-mono font-bold text-white">
 {telemetryData?.wob ? telemetryData.wob.toFixed(1) : '14.0'}
 </span>
 <span className="text-[9px] text-slate-500 font-mono block">klbs</span>
 </div>

 {/* RPM */}
 <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
 <span className="text-[10px] uppercase font-mono text-slate-400 block">Rotary</span>
 <span className="text-base font-mono font-bold text-cyan-400">
 {telemetryData?.rpm ? telemetryData.rpm.toFixed(0) : '105'}
 </span>
 <span className="text-[9px] text-slate-500 font-mono block">RPM</span>
 </div>

 {/* SPP */}
 <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
 <span className="text-[10px] uppercase font-mono text-slate-400 block">SPP</span>
 <span className="text-base font-mono font-bold text-white">
 {telemetryData?.spp_psi ? telemetryData.spp_psi.toFixed(0) : '2,800'}
 </span>
 <span className="text-[9px] text-slate-500 font-mono block">psi</span>
 </div>

 {/* Flow Out % */}
 <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
 <span className="text-[10px] uppercase font-mono text-slate-400 block">Flow Out</span>
 <span className={`text-base font-mono font-bold ${
 (telemetryData?.flow_out_pct || 100) > 105 ? 'text-amber-400':
 (telemetryData?.flow_out_pct || 100) < 90 ? 'text-cyan-400': 'text-emerald-400'}`}>
 {telemetryData?.flow_out_pct ? telemetryData.flow_out_pct.toFixed(1) : '100.0'}%
 </span>
 <span className="text-[9px] text-slate-500 font-mono block">Return</span>
 </div>

 {/* Pit Gain */}
 <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
 <span className="text-[10px] uppercase font-mono text-slate-400 block">Pit Delta</span>
 <span className={`text-base font-mono font-bold ${
 (telemetryData?.pit_gain_bbl || 0) > 0 ? 'text-amber-400':
 (telemetryData?.pit_gain_bbl || 0) < 0 ? 'text-cyan-400': 'text-slate-300'}`}>
 {telemetryData?.pit_gain_bbl !== undefined ? (telemetryData.pit_gain_bbl > 0 ?`+${telemetryData.pit_gain_bbl.toFixed(1)}`: telemetryData.pit_gain_bbl.toFixed(1)) : '+0.0'}
 </span>
 <span className="text-[9px] text-slate-500 font-mono block">bbl</span>
 </div>

 {/* ECD */}
 <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
 <span className="text-[10px] uppercase font-mono text-slate-400 block">ECD</span>
 <span className="text-base font-mono font-bold text-white">
 {telemetryData?.ecd ? telemetryData.ecd.toFixed(1) : '11.6'}
 </span>
 <span className="text-[9px] text-slate-500 font-mono block">ppg</span>
 </div>
 </div>
 </div>

 {/* Real-time Trajectory Widget */}
 <div className="glass-card rounded-2xl p-4 shadow-glass mb-4 space-y-3">
 <div className="flex items-center justify-between">
 <h3 className="text-xs uppercase font-mono font-bold text-slate-300 tracking-wider">
 Torque vs Depth (TVD)
 </h3>
 <span className="text-[10px] font-mono text-slate-400">Dynamic Trend</span>
 </div>

 <div className="h-60 w-full flex items-center justify-center rounded-xl overflow-hidden bg-[#0B0B0B]/90 border border-slate-800/80">
 <Plot
 data={[
 {
 x: trajectoryData.torque,
 y: trajectoryData.depth,
 type: 'scatter',
 mode: 'lines+markers',
 line: { color: showAlerts && alertState.active ? '#858585': '#A6A6A6', width: 2.5 },
 marker: { size: 5, color: showAlerts && alertState.active ? '#858585': '#C1C1C1'}
 }
 ]}
 layout={{
                  colorway: MONO_COLORWAY,
 autosize: true,
 height: 235,
 margin: { t: 10, r: 15, l: 50, b: 35 },
 paper_bgcolor: 'transparent',
 plot_bgcolor: 'transparent',
 font: { family: 'JetBrains Mono, monospace', color: '#A2A2A2', size: 10 },
 xaxis: { 
 title: { text: 'Torque (lbf-ft)', font: { size: 10 } }, 
 gridcolor: '#232323',
 zerolinecolor: '#232323',
 color: '#A2A2A2'},
 yaxis: { 
 title: { text: 'Depth (m)', font: { size: 10 } }, 
 autorange: 'reversed', 
 gridcolor: '#232323',
 zerolinecolor: '#232323',
 color: '#A2A2A2'}
 }}
 useResizeHandler={true}
 style={{ width: '100%', height: '100%'}}
 config={{ responsive: true, displayModeBar: false }}
 />
 </div>
 </div>

 {/* Event Log & Institutional Memory */}
 <div className="glass-card rounded-2xl p-4 shadow-glass space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center space-x-2">
 <h3 className="text-xs uppercase font-mono font-bold text-slate-300 tracking-wider">Offset Incidents & Memory</h3>
 <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
 {recentEvents.length} Recorded
 </span>
 </div>
 <button 
 onClick={() => fetchHistory(selectedWell)}
 className="text-[11px] font-mono text-slate-400 hover:text-cyan-400 transition" title="Reload event log">
 Refresh
 </button>
 </div>

 <div className="space-y-2">
 {recentEvents.length > 0 ? recentEvents.map((event, i) => {
 const isNewlyAdded = newlyIngestedIds.has(event.id);
 const isExpanded = expandedEventId === event.id;
 const severity = (event.severity ||'HIGH').toUpperCase();
 const sevColor = severity === 'CRITICAL'? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-glow-danger':
 severity === 'HIGH'? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-glow-amber': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-glow-cyan';

 return (
 <div 
 key={event.id || i} 
 onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
 className={`p-3 rounded-xl border transition-all cursor-pointer ${
 isNewlyAdded 
 ? 'bg-emerald-950/30 border-emerald-500/60 shadow-glow-emerald': 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700'}`}
 >
 <div className="flex items-start justify-between gap-2">
 <div className="flex items-center space-x-2">
 <div className={`w-2 h-2 rounded-full shrink-0 ${
 isNewlyAdded ? 'bg-emerald-400 animate-ping':
 severity === 'CRITICAL'? 'bg-status-danger': 
 severity === 'HIGH'? 'bg-status-warning': 'bg-status-fluid'}`} />
 <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${getWellColor(event.well_id || selectedWell).badge}`}>
 {event.well_id || selectedWell}
 </span>
 <span className="text-xs font-semibold text-slate-200">{event.event_type}</span>
 <SourceTag source={event.data_source || selectedWell} compact={true} />
 </div>
 <div className="flex items-center space-x-1.5 shrink-0">
 {isNewlyAdded && (
 <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
 INGESTED
 </span>
 )}
 <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${sevColor}`}>
 {severity}
 </span>
 </div>
 </div>

 <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
 <span>Depth: <strong className="text-slate-300 font-mono">{event.depth_tvd}m</strong> TVD</span>
 {event.formation && (
 <span className="text-slate-400 truncate max-w-[150px] text-[11px] font-mono">{event.formation}</span>
 )}
 </div>

 {/* Expanded Details */}
 {isExpanded && (
 <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs space-y-2 animate-in fade-in duration-150">
 {event.root_cause && (
 <div className="p-2.5 rounded-lg bg-rose-950/25 border border-rose-500/30 text-rose-200">
 <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block font-mono flex items-center gap-1.5 mb-1">
 <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
 Cause / Root Failure
 </span>
 <p className="text-rose-100 text-xs leading-relaxed font-sans">
 {event.root_cause}
 </p>
 </div>
 )}
 {event.mitigation_applied && (
 <div className="p-2.5 rounded-lg bg-emerald-950/25 border border-emerald-500/30 text-emerald-200">
 <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block font-mono flex items-center gap-1.5 mb-1">
 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
 Mitigation Applied & Operational Reason
 </span>
 <p className="text-emerald-100 text-xs leading-relaxed font-sans">
 {event.mitigation_applied}
 </p>
 </div>
 )}
 {event.npt_hours > 0 && (
 <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 font-mono">
 <span>Non-Productive Time (NPT):</span>
 <span className="font-bold text-amber-400 font-mono">{event.npt_hours} Hours</span>
 </div>
 )}
 </div>
 )}
 </div>
 );
 }) : (
 <div className="text-xs text-slate-400 p-4 text-center bg-slate-950/40 rounded-xl border border-slate-800/60">
 No offset events recorded for this well yet. Upload a DDR or WCR PDF to ingest incidents.
 </div>
 )}
 </div>

 {/* Action Buttons */}
 <button 
 onClick={() => openModuleInNewTab('correlation')}
 className="w-full mt-3 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 text-xs font-semibold py-2.5 rounded-xl transition border border-cyan-500/40 shadow-glow-cyan flex items-center justify-center space-x-2 cursor-pointer" title="Open Cross-Well Correlation in New Tab">
 <Layers size={15} />
 <span>Cross-Correlate with Offset Wells</span>
 <ExternalLink size={12} className="ml-1 opacity-70"/>
 </button>
 
 <div className="grid grid-cols-2 gap-2 mt-2">
 <button 
 onClick={() => openModuleInNewTab('ppfg')}
 className="bg-slate-900 hover:bg-slate-850 text-slate-200 text-xs font-medium py-2.5 px-2 rounded-xl border border-slate-700/80 flex items-center justify-center space-x-1.5 transition shadow-sm cursor-pointer" title="Safe Mud Weight Operating Window (New Tab)">
 <Gauge size={14} className="text-emerald-400"/>
 <span>Safe Mud Window</span>
 <ExternalLink size={10} className="opacity-60"/>
 </button>
 <button 
 onClick={() => openModuleInNewTab('dossier')}
 className="bg-slate-900 hover:bg-slate-850 text-slate-200 text-xs font-medium py-2.5 px-2 rounded-xl border border-slate-700/80 flex items-center justify-center space-x-1.5 transition shadow-sm cursor-pointer" title="1-Click Pre-Spud Risk Dossier (New Tab)">
 <FileText size={14} className="text-cyan-400"/>
 <span>Pre-Spud Report</span>
 <ExternalLink size={10} className="opacity-60"/>
 </button>
 </div>

 <button 
 onClick={exportWellData}
 className="w-full mt-2 bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs font-medium py-2.5 rounded-xl transition border border-slate-700/80 flex items-center justify-center shadow-sm">
 <Download size={14} className="mr-2 text-slate-400"/>
 Export Well Logs & Events (CSV)
 </button>
 </div>
 </div>
 </aside>
 </main>

 {/* Desktop Permanent Status & Transparency Footer Bar (Tier 1 Mandate) */}
 <footer className="hidden lg:flex h-8 bg-[#0D0D0D] border-t border-slate-800/80 px-4 items-center justify-between text-xs text-slate-400 z-30 shrink-0 font-mono text-[11px]">
 <div className="flex items-center space-x-3">
 <span className="flex items-center space-x-1.5">
 <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"/>
 <span className="text-slate-300 font-semibold">Physics + ML Hazard Engine</span>
 <span className="text-slate-500">→ Simulated telemetry, Assam-calibrated · no live rig feed</span>
 </span>
 <span className="text-slate-700">|</span>
 <span className="text-slate-400">
 <strong className="text-white">80% Physics</strong> (Eaton 1975, Teale 1965, Jorden-Shirley 1966) + <strong className="text-white">20% LightGBM ML</strong>
 </span>
 </div>
 <div className="flex items-center space-x-3">
 <button
 onClick={() => setIsTransparencyOpen(true)}
 className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 hover:bg-slate-850 text-cyan-300 hover:text-white border border-slate-700 hover:border-cyan-500/50 transition cursor-pointer shadow-sm" title="View full technical basis, engineering formulas, and data disclosure">
 <Info size={12} className="text-cyan-400"/>
 <span className="font-sans font-medium text-xs">Data & Methodology</span>
 </button>
 </div>
 </footer>

 {/* Fixed Mobile Bottom Navigation Bar (< lg) */}
 <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0B0B]/95 backdrop-blur-xl border-t border-slate-800 px-2 py-1 flex items-center justify-around h-16 shadow-[0_-4px_25px_rgba(0,0,0,0.6)]">
 <button
 onClick={() => setMobileActiveTab('map')}
 className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition min-h-[44px] relative ${
 mobileActiveTab === 'map'? 'text-cyan-400 font-bold bg-cyan-500/10': 'text-slate-400 hover:text-slate-200'}`}
 >
 {mobileActiveTab === 'map'&& (
 <span className="absolute -top-1 w-8 h-1 rounded-full bg-cyan-400 shadow-glow-cyan"/>
 )}
 <MapIcon size={18} />
 <span className="text-[10px] mt-1 font-medium font-mono">Well Map</span>
 </button>

 <button
 onClick={() => setMobileActiveTab('telemetry')}
 className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition min-h-[44px] relative ${
 mobileActiveTab === 'telemetry'? 'text-cyan-400 font-bold bg-cyan-500/10': 'text-slate-400 hover:text-slate-200'}`}
 >
 {mobileActiveTab === 'telemetry'&& (
 <span className="absolute -top-1 w-8 h-1 rounded-full bg-cyan-400 shadow-glow-cyan"/>
 )}
 {showAlerts && alertState.active && (
 <span className="absolute top-1.5 right-4 w-2 h-2 rounded-full bg-status-danger animate-ping"/>
 )}
 <Activity size={18} />
 <span className="text-[10px] mt-1 font-medium font-mono">Telemetry</span>
 </button>

 <button
 onClick={() => setMobileActiveTab('simulator')}
 className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition min-h-[44px] relative ${
 mobileActiveTab === 'simulator'? 'text-cyan-400 font-bold bg-cyan-500/10': 'text-slate-400 hover:text-slate-200'}`}
 >
 {mobileActiveTab === 'simulator'&& (
 <span className="absolute -top-1 w-8 h-1 rounded-full bg-cyan-400 shadow-glow-cyan"/>
 )}
 {simStatus.is_running && (
 <span className="absolute top-1.5 right-4 w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
 )}
 <Sliders size={18} />
 <span className="text-[10px] mt-1 font-medium font-mono">Simulator</span>
 </button>

 <button
 onClick={() => openModuleInNewTab('radar')}
 className="flex flex-col items-center justify-center flex-1 py-1 rounded-xl text-amber-400 hover:text-amber-300 transition min-h-[44px]">
 <Radar size={18} />
 <span className="text-[10px] mt-1 font-medium font-mono">Radar</span>
 </button>

 <button
 onClick={() => openModuleInNewTab('correlation')}
 className="flex flex-col items-center justify-center flex-1 py-1 rounded-xl text-indigo-400 hover:text-indigo-300 transition min-h-[44px]">
 <Layers size={18} />
 <span className="text-[10px] mt-1 font-medium font-mono">Offsets</span>
 </button>
 </nav>


 {/* Ahead-of-the-Bit Hazard Radar Modal */}
 <LookAheadRadar 
 isOpen={isRadarOpen}
 onClose={() => handleCloseModule(setIsRadarOpen)}
 activeWellId={selectedWell}
 currentDepth={telemetryData ? telemetryData.depth_tvd : undefined}
 isFullScreen={typeof window !== 'undefined'&& (new URLSearchParams(window.location.search).get('module') === 'radar'|| new URLSearchParams(window.location.search).get('fullscreen') === 'true')}
 />

 {/* Safe Operating Mud Weight Window (PPFG) Modal */}
 <PPFGWindowModal 
 isOpen={isPPFGOpen}
 onClose={() => handleCloseModule(setIsPPFGOpen)}
 activeWellId={selectedWell}
 isFullScreen={typeof window !== 'undefined'&& (new URLSearchParams(window.location.search).get('module') === 'ppfg'|| new URLSearchParams(window.location.search).get('fullscreen') === 'true')}
 />

 {/* 1-Click Pre-Spud Offset Hazard Dossier Modal */}
 <PreSpudDossierModal 
 isOpen={isDossierOpen}
 onClose={() => handleCloseModule(setIsDossierOpen)}
 activeWellId={selectedWell}
 isFullScreen={typeof window !== 'undefined'&& (new URLSearchParams(window.location.search).get('module') === 'dossier'|| new URLSearchParams(window.location.search).get('fullscreen') === 'true')}
 />
 <BacktestResultsModal 
 isOpen={isBacktestOpen}
 onClose={() => handleCloseModule(setIsBacktestOpen)}
 isFullScreen={typeof window !== 'undefined'&& (new URLSearchParams(window.location.search).get('module') === 'backtest'|| new URLSearchParams(window.location.search).get('fullscreen') === 'true')}
 />

 {/* Floating Ingestion / Institutional Memory Toast Notification */}
 {uploadToast && (
 <div className={`fixed top-16 right-6 z-50 max-w-md bg-slate-900/95 backdrop-blur-md border rounded-xl p-4 shadow-2xl animate-in slide-in-from-top-4 flex items-start space-x-3.5 ${
 uploadToast.variant === 'error'? 'border-rose-500/50 shadow-rose-950/60': 'border-emerald-500/50 shadow-emerald-950/60'}`}>
 <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
 uploadToast.variant === 'error'? 'bg-rose-500/10 border border-rose-500/30 text-rose-400': 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
 {uploadToast.variant === 'error'? <AlertTriangle size={20} /> : <Sparkles size={20} />}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between">
 <div className="flex items-center space-x-2 min-w-0">
 <h4 className="text-sm font-bold text-white truncate">{uploadToast.title}</h4>
 {!uploadToast.isLas && uploadToast.variant !== 'error'&& (
 <span className="px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-400 text-[10px] font-bold uppercase shrink-0">
 DD Report
 </span>
 )}
 </div>
 <button 
 onClick={() => setUploadToast(null)} 
 className="text-slate-400 hover:text-white transition ml-2">
 <X size={16} />
 </button>
 </div>
 <p className="text-xs text-slate-300 mt-1 leading-relaxed">
 {uploadToast.description}
 </p>
 {uploadToast.variant !== 'error'&& (
 <div className="flex items-center space-x-2 mt-3">
 {uploadToast.isLas ? (
 <button
 onClick={() => {
 openModuleInNewTab('correlation');
 setUploadToast(null);
 }}
 className="text-xs font-semibold px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition flex items-center space-x-1 cursor-pointer">
 <Layers size={12} />
 <span>View Log Correlation</span>
 <ExternalLink size={10} className="ml-1 opacity-70"/>
 </button>
 ) : (
 <button
 onClick={() => {
 openModuleInNewTab('radar');
 setUploadToast(null);
 }}
 className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition flex items-center space-x-1 cursor-pointer">
 <Radar size={12} />
 <span>Open Hazard Radar</span>
 <ExternalLink size={10} className="ml-1 opacity-70"/>
 </button>
 )}
 <button
 onClick={() => {
 setIsKnowledgeSearchOpen(true);
 setUploadToast(null);
 }}
 className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-800 text-cyan-300 border border-slate-700 hover:bg-slate-700 transition flex items-center space-x-1">
 <Search size={12} />
 <span>Search Vector DB</span>
 </button>
 </div>
 )}
 </div>
 </div>
 )}

 {/* Institutional Memory Contribution Modal (Two-Way Feedback) */}
 <ContributeLessonModal 
 isOpen={isContributeOpen}
 onClose={() => handleCloseModule(setIsContributeOpen)}
 activeWellId={selectedWell}
 onLessonContributed={handleLessonContributed}
 isFullScreen={typeof window !== 'undefined'&& (new URLSearchParams(window.location.search).get('module') === 'contribute'|| new URLSearchParams(window.location.search).get('module') === 'lesson'|| new URLSearchParams(window.location.search).get('fullscreen') === 'true')}
 />

 {/* Document Upload Modal */}
 <DocumentUploadModal 
 isOpen={isUploadModalOpen} 
 onClose={() => setIsUploadModalOpen(false)} 
 activeWellId={selectedWell} 
 onUploadSuccess={handleDocumentUploaded}
 />

 {/* Manual Knowledge Search Drawer */}
 <KnowledgeSearch 
 isOpen={isKnowledgeSearchOpen}
 onClose={() => setIsKnowledgeSearchOpen(false)}
 suggestedQuery={searchSuggestedQuery}
 />

 {/* Cross-Well Correlation Panel */}
 <CorrelationPanel 
 isOpen={isCorrelationOpen}
 onClose={() => handleCloseModule(setIsCorrelationOpen)}
 activeWell={selectedWell}
 offsetWell={getDefaultOffsetWell(selectedWell)}
 isFullScreen={typeof window !== 'undefined'&& (new URLSearchParams(window.location.search).get('module') === 'correlation'|| new URLSearchParams(window.location.search).get('fullscreen') === 'true')}
 />

 {/* Data & Methodology Transparency Modal (Tier 1 Mandate) */}
 <DataTransparencyModal 
 isOpen={isTransparencyOpen}
 onClose={() => setIsTransparencyOpen(false)}
 />

 {/* Multi-Provider AI Model Details Modal */}
 <AiModelModal 
 isOpen={isAiModalOpen}
 onClose={() => setIsAiModalOpen(false)}
 aiStatus={aiStatus}
 onRefreshStatus={fetchAiStatus}
 />
 </div>
 );
}

export default App;
