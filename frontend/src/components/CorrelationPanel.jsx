import { MONO_COLORWAY } from '../lib/mono';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../lib/api';
import Plot from 'react-plotly.js';
import SourceTag, { getWellDataSource } from './SourceTag';
import { 
  evaluateOfflineCorrelation, 
  evaluateOfflineCasingCorrelation, 
  evaluateOfflineStratigraphicCrossSection 
} from '../lib/offlinePhysicsEngine';
import { 
  X, 
  Loader2, 
  Link2, 
  Columns, 
  Info, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  ShieldAlert, 
  Wrench, 
  Maximize2,
  Minimize2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

const ALL_REGIONAL_WELLS = {
  "Upper Assam Shelf": [
    'OIL-BAGHJAN-1', 'OIL-BAGHJAN-4', 'OIL-NAHARKATIYA-1', 'OIL-MORAN-1',
    'OIL-DIKOM-1', 'OIL-DULIAJAN-1', 'OIL-KUMCHAI-1', 'OIL-KHARSANG-1'
  ],
  "Rajasthan Basin": [
    'OIL-RAJ-BAGHEWALA-1', 'OIL-RAJ-TANOT-1', 'OIL-RAJ-DANDEWALA-1', 'OIL-RAJ-TAVRIWALA-1', 'OIL-RAJ-CHINNEWALA-1'
  ],
  "KG Deepwater": [
    'OIL-KG-DEEPWATER-1', 'OIL-KG-DWN-1', 'OIL-KG-YANAM-1', 'OIL-KG-AMALAPURAM-1', 'OIL-KG-GODAVARI-1'
  ],
  "Mizoram Fold Belt": [
    'OIL-MZ-AIZAWL-1', 'OIL-MZ-MAMIT-1', 'OIL-MZ-KOLASIB-1', 'OIL-MZ-LUNGLEI-1', 'OIL-MZ-CHAMPHAI-1'
  ]
};

const CorrelationPanel = ({ isOpen, onClose, activeWell, offsetWell, isFullScreen: propFullScreen = false }) => {
    const [activeTab, setActiveTab] = useState('dtw'); // 'dtw' | 'casing' | 'cross_section'
    
    // Fullscreen State
    const [isFullScreen, setIsFullScreen] = useState(() => {
        if (typeof window !== 'undefined') {
            const p = new URLSearchParams(window.location.search);
            return propFullScreen || p.get('fullscreen') === 'true' || p.get('module') === 'correlation';
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
    
    // Offset well selection state
    const [selectedOffset, setSelectedOffset] = useState(offsetWell || 'OIL-NAHARKATIYA-1');

    useEffect(() => {
        if (offsetWell) {
            setSelectedOffset(offsetWell);
        }
    }, [offsetWell]);

    const currentOffset = (selectedOffset && selectedOffset !== activeWell) ? selectedOffset : offsetWell;

    // DTW state
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isAligned, setIsAligned] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    // Casing & Cement state
    const [casingData, setCasingData] = useState(null);
    const [casingLoading, setCasingLoading] = useState(false);

    // Stratigraphic cross-section state
    const [stratData, setStratData] = useState(null);
    const [stratLoading, setStratLoading] = useState(false);

    // Fetch DTW
    useEffect(() => {
        if (!isOpen || activeTab !== 'dtw') return;

        const fetchCorrelation = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await axios.get(`${API_BASE}/api/correlate`, {
                    params: { active_well: activeWell, offset_well: currentOffset },
                    timeout: 3000
                });
                setData(response.data);
            } catch (err) {
                console.warn("API Correlation unavailable, engaging local Rig Edge correlation engine: ", err);
                const offlineCorr = evaluateOfflineCorrelation(activeWell, currentOffset);
                setData(offlineCorr);
                setError(null);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCorrelation();
    }, [isOpen, activeWell, currentOffset, activeTab]);

    // Fetch Casing & Cement
    useEffect(() => {
        if (!isOpen || activeTab !== 'casing') return;

        const fetchCasing = async () => {
            setCasingLoading(true);
            try {
                const res = await axios.get(`${API_BASE}/api/wells/casing-cement-correlation`, {
                    params: { active_well: activeWell },
                    timeout: 3000
                });
                setCasingData(res.data);
            } catch (err) {
                console.warn("API Casing unavailable, using local Rig Edge casing engine: ", err);
                const offlineCasing = evaluateOfflineCasingCorrelation(activeWell);
                setCasingData(offlineCasing);
            } finally {
                setCasingLoading(false);
            }
        };

        fetchCasing();
    }, [isOpen, activeWell, activeTab]);

    // Fetch Stratigraphic Cross-Section
    useEffect(() => {
        if (!isOpen || activeTab !== 'cross_section') return;

        const fetchStrat = async () => {
            setStratLoading(true);
            try {
                const res = await axios.get(`${API_BASE}/api/wells/stratigraphic-cross-section`, {
                    params: { active_well: activeWell },
                    timeout: 3000
                });
                setStratData(res.data);
            } catch (err) {
                console.warn("API Cross-section unavailable, using local Rig Edge cross-section: ", err);
                const offlineStrat = evaluateOfflineStratigraphicCrossSection(activeWell);
                setStratData(offlineStrat);
            } finally {
                setStratLoading(false);
            }
        };

        fetchStrat();
    }, [isOpen, activeWell, activeTab]);

    if (!isOpen) return null;

    // DTW plot data preparation
    const traces = [];
    const shapes = [];
    const annotations = [];
    
    if (data && activeTab === 'dtw') {
        // 1. Active Well Trace
        traces.push({
            x: data.active_gr,
            y: data.active_depths,
            name: activeWell,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#A6A6A6', width: 2 },
            xaxis: 'x',
            yaxis: 'y'
        });
        
        // 2. Offset Well Trace (Raw vs Aligned)
        let offsetGr = data.offset_gr;
        let offsetDepths = data.offset_depths;
        
        if (isAligned) {
            const alignedOffsetGr = [];
            const alignedOffsetDepths = [];
            data.mapping.forEach(([aIdx, oIdx]) => {
                alignedOffsetGr.push(data.offset_gr[oIdx]);
                alignedOffsetDepths.push(data.active_depths[aIdx]);
            });
            offsetGr = alignedOffsetGr;
            offsetDepths = alignedOffsetDepths;
        }

        traces.push({
            x: offsetGr,
            y: offsetDepths,
            name: currentOffset,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#B1B1B1', width: 2 },
            xaxis: 'x2',
            yaxis: 'y'
        });

        // 3. Shaded Formation Bands
        const numBands = 7;
        const step = Math.floor(data.mapping.length / numBands);
        const bandColors = ['#848484', '#9A9A9A', '#BBBBBB', '#ACACAC', '#858585', '#808080'];
        
        for (let i = 1; i < numBands; i++) {
            const [aIdx, oIdx] = data.mapping[i * step];
            const activeY = data.active_depths[aIdx];
            const rawOffsetY = data.offset_depths[oIdx];
            const offsetY = isAligned ? activeY : rawOffsetY;
            const dip = Math.round(rawOffsetY - activeY);
            const color = bandColors[(i - 1) % bandColors.length];
            
            shapes.push({
                type: 'line',
                xref: 'paper', x0: 0, x1: 1,
                yref: 'y', y0: activeY, y1: offsetY,
                line: { color: color, width: 2, dash: isAligned ? 'solid' : 'dot' },
                opacity: 0.65
            });

            annotations.push({
                xref: 'paper', x: 0.5,
                yref: 'y', y: (activeY + offsetY) / 2,
                text: isAligned ? `Layer ${i} Correlated` : `Layer ${i}: ${dip > 0 ? `+${dip}m dip` : `${dip}m dip`}`,
                showarrow: false,
                font: { size: 10, color: '#FAFAFA', family: 'monospace' },
                bgcolor: 'rgba(23, 23, 23, 0.85)',
                bordercolor: color,
                borderwidth: 1,
                borderpad: 3
            });
        }
    }

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200 ${isFullScreen ? 'p-0 w-screen h-screen' : 'p-2 sm:p-4'}`}>
            <div className={`bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col ${isFullScreen ? 'w-screen h-screen rounded-none border-none max-h-none h-full' : 'w-full max-w-6xl h-[96vh] sm:h-[92vh] rounded-xl'}`}>
                
                {/* Header with Navigation Tabs */}
                <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-950 border-b border-slate-800 flex flex-wrap justify-between items-center gap-3">
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                        <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-indigo-400 shrink-0">
                            <Layers size={18} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <h3 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                                    Offset Well Correlation
                                </h3>
                                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono">
                                    {activeWell}
                                </span>
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
                                Cross-well geological matching, casing program design, and stratigraphic fence correlation
                            </p>
                        </div>
                    </div>

                    {/* Tab Switcher */}
                    <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 space-x-1 overflow-x-auto max-w-full">
                        <button
                            onClick={() => setActiveTab('dtw')}
                            className={`whitespace-nowrap px-2.5 sm:px-3 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                                activeTab === 'dtw' 
                                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold' 
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            DTW Correlation
                        </button>
                        <button
                            onClick={() => setActiveTab('casing')}
                            className={`whitespace-nowrap px-2.5 sm:px-3 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                                activeTab === 'casing' 
                                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold' 
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Casing & Cement
                        </button>
                        <button
                            onClick={() => setActiveTab('cross_section')}
                            className={`whitespace-nowrap px-2.5 sm:px-3 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                                activeTab === 'cross_section' 
                                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold' 
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Stratigraphic Section
                        </button>
                    </div>

                    <div className="flex items-center space-x-2">
                        {activeTab === 'dtw' && (
                            <>
                                <button
                                    onClick={() => setIsAligned(!isAligned)}
                                    className={`px-2 sm:px-3 py-1.5 rounded text-[11px] sm:text-xs font-medium border transition flex items-center space-x-1 sm:space-x-1.5 ${
                                        isAligned 
                                            ? 'bg-cyan-950 border-cyan-500/60 text-cyan-300 shadow-[0_0_12px_rgba(166, 166, 166,0.3)]' 
                                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                                    }`}
                                >
                                    <Columns size={13} />
                                    <span className="hidden sm:inline">{isAligned ? 'Warped Depth (Aligned)' : 'Raw Measured Depth'}</span>
                                    <span className="sm:hidden">{isAligned ? 'Warped' : 'Raw MD'}</span>
                                </button>
                                <button
                                    onClick={() => setShowHelp(!showHelp)}
                                    className="p-1.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                                    title="Explanation"
                                >
                                    <HelpCircle size={15} />
                                </button>
                            </>
                        )}

                        {/* Fullscreen Toggle */}
                        <button
                            onClick={handleToggleFullscreen}
                            className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition min-h-[34px] min-w-[34px] flex items-center justify-center cursor-pointer"
                            title={isFullScreen ? "Window Mode" : "Full Screen"}
                        >
                            {isFullScreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                        </button>

                        {/* Pop out to New Tab */}
                        <button
                            onClick={() => window.open(`${window.location.origin}${window.location.pathname}?module=correlation&well=${encodeURIComponent(activeWell)}&fullscreen=true`, '_blank')}
                            className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition min-h-[34px] min-w-[34px] flex items-center justify-center cursor-pointer"
                            title="Open in Dedicated Browser Tab (Full Screen)"
                        >
                            <ExternalLink size={15} />
                        </button>

                        <button
                            onClick={() => {
                                if (typeof window !== 'undefined' && window.location.search.includes(' module=')) {
                                    window.close();
                                }
                                onClose();
                            }}
                            className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition min-h-[34px] min-w-[34px] flex items-center justify-center cursor-pointer"
                            title="Close View"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* TAB 1: DTW LOG CORRELATION */}
                {activeTab === 'dtw' && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {data && (
                            <>
                                <div className="bg-slate-950/70 border-b border-slate-800/80 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                                        <div className="flex items-center space-x-2">
                                            <span className="w-3.5 h-1 rounded bg-[#A6A6A6] inline-block shadow-[0_0_8px_rgba(166, 166, 166,0.6)]"></span>
                                            <span className="text-slate-400">Active Well:</span>
                                            <span className="font-semibold text-cyan-300 font-mono">{activeWell}</span>
                                            <SourceTag source={activeWell} compact={true} />
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="w-3.5 h-1 rounded bg-[#B1B1B1] inline-block shadow-[0_0_8px_rgba(177, 177, 177,0.6)]"></span>
                                            <span className="text-slate-400">Offset Well:</span>
                                            <select
                                                value={currentOffset}
                                                onChange={(e) => setSelectedOffset(e.target.value)}
                                                className="bg-slate-900 text-amber-300 font-mono font-semibold text-xs border border-slate-700 rounded px-2 py-1 focus:outline-none focus:border-amber-500 cursor-pointer"
                                            >
                                                {Object.entries(ALL_REGIONAL_WELLS).map(([basin, wells]) => (
                                                    <optgroup key={basin} label={basin} className="bg-slate-950 text-slate-300 font-sans">
                                                        {wells.filter(w => w !== activeWell).map(w => (
                                                            <option key={w} value={w} className="font-mono text-amber-200">
                                                                {w}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                            <SourceTag source={currentOffset} compact={true} />
                                        </div>
                                        <div className="h-4 w-px bg-slate-800 hidden md:block"></div>
                                        <div className="text-slate-300">
                                            <strong className="text-slate-100">DTW Alignment:</strong>
                                            <span className="text-slate-400 ml-1.5">
                                                {isAligned 
                                                    ? 'Formations flattened at matching horizon datums' 
                                                    : 'Tie-lines slope illustrates structural formation dip'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-slate-400 font-mono">
                                        DTW Distance: <span className="text-cyan-400 font-bold">{data.distance ? Math.round(data.distance) : 0}</span>
                                    </div>
                                </div>
                            </>
                        )}

                        {showHelp && (
                            <div className="bg-slate-900/95 border-b border-indigo-500/30 p-4 text-xs animate-in slide-in-from-top-2">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                                        <h6 className="text-cyan-400 font-semibold mb-1">1. Gamma Ray Curves</h6>
                                        <p className="text-slate-300 leading-relaxed">
                                            Shows rock radioactivity (0–120 API). Low GR marks permeable sandstone reservoirs; high GR marks dense shale seals.
                                        </p>
                                    </div>
                                    <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                                        <h6 className="text-amber-400 font-semibold mb-1">2. Colored Horizon Tie-Lines</h6>
                                        <p className="text-slate-300 leading-relaxed">
                                            Connects the identical geological horizon in both wells. Slope indicates regional dip and displacement across faults.
                                        </p>
                                    </div>
                                    <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                                        <h6 className="text-emerald-400 font-semibold mb-1">3. DTW Alignment</h6>
                                        <p className="text-slate-300 leading-relaxed">
                                            Stretches curves to align matching formations horizontally, allowing drillers to compare lithology and bed thickness.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        <div className="flex-1 relative bg-slate-950 p-4">
                            {isLoading ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                    <Loader2 size={32} className="animate-spin mb-4 text-cyan-400" />
                                    <p>Running FastDTW log correlation...</p>
                                </div>
                            ) : error ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400">
                                    <p>{error}</p>
                                </div>
                            ) : data ? (
                                <div className="w-full h-full bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                                    <Plot
                                        data={traces}
                                        revision={isAligned ? 1 : 0}
                                        layout={{
                                            colorway: MONO_COLORWAY,
                                            datarevision: isAligned ? 1 : 0,
                                            autosize: true,
                                            margin: { l: 60, r: 40, b: 50, t: 30 },
                                            paper_bgcolor: 'transparent',
                                            plot_bgcolor: 'transparent',
                                            hovermode: 'y unified',
                                            xaxis: { 
                                                domain: [0, 0.45],
                                                title: 'Active Well GR (API)', 
                                                gridcolor: '#404040', 
                                                zerolinecolor: '#404040', 
                                                color: '#A6A6A6'
                                            },
                                            xaxis2: { 
                                                domain: [0.55, 1],
                                                title: 'Offset Well GR (API)', 
                                                gridcolor: '#404040', 
                                                zerolinecolor: '#404040', 
                                                color: '#B1B1B1'
                                            },
                                            yaxis: { 
                                                title: 'Depth TVD (m)', 
                                                autorange: 'reversed', 
                                                gridcolor: '#404040', 
                                                zerolinecolor: '#404040', 
                                                color: '#A2A2A2',
                                                spikemode: 'across',
                                                spikedash: 'solid',
                                                spikecolor: '#737373',
                                                spikethickness: 1
                                            },
                                            shapes: shapes,
                                            annotations: annotations,
                                            showlegend: false
                                        }}
                                        useResizeHandler={true}
                                        style={{ width: '100%', height: '100%' }}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}

                {/* TAB 2: CASING & CEMENTING CORRELATION */}
                {activeTab === 'casing' && (
                    <div className="flex-1 overflow-y-auto p-6 bg-slate-950 space-y-6">
                        {casingLoading ? (
                            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                                <Loader2 size={32} className="animate-spin mb-4 text-cyan-400" />
                                <p>Loading casing and cementing programs...</p>
                            </div>
                        ) : casingData ? (
                            <>
                                {/* Recommended Engineering Best Practices Box */}
                                <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/50">
                                    <div className="flex items-center space-x-2 text-cyan-300 font-bold text-sm mb-2">
                                        <Wrench size={16} />
                                        <span>Engineering Casing & Cementing Guidelines for {activeWell}</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
                                        {casingData.recommended_practices?.map((rec, i) => (
                                            <div key={i} className="flex items-start space-x-2 bg-slate-900/60 p-2.5 rounded border border-slate-800">
                                                <CheckCircle2 size={14} className="text-cyan-400 mt-0.5 shrink-0" />
                                                <span>{rec}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Comparison across wells */}
                                <div className="space-y-6">
                                    {casingData.comparison?.map((well, wIdx) => (
                                        <div key={wIdx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                                            <div className="px-5 py-3 bg-slate-800/60 border-b border-slate-700/60 flex items-center justify-between">
                                                <div className="flex items-center space-x-3">
                                                    <span className={`w-3 h-3 rounded-full ${well.role.includes('Active') ? 'bg-cyan-400' : 'bg-amber-400'}`}></span>
                                                    <h4 className="font-bold text-white text-sm font-mono">{well.well_id}</h4>
                                                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">{well.role}</span>
                                                </div>
                                                <span className="text-xs text-slate-400 font-mono">Planned TD: {well.total_depth_tvd}m TVD</span>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left text-xs text-slate-300">
                                                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                                                        <tr>
                                                            <th className="px-4 py-2.5">Casing String</th>
                                                            <th className="px-3 py-2.5">Hole / OD</th>
                                                            <th className="px-3 py-2.5">Depth (TVD)</th>
                                                            <th className="px-3 py-2.5">Weight / Grade</th>
                                                            <th className="px-3 py-2.5">Shoe Formation</th>
                                                            <th className="px-3 py-2.5">TOC</th>
                                                            <th className="px-3 py-2.5">Slurry / Density</th>
                                                            <th className="px-3 py-2.5">LOT EMW</th>
                                                            <th className="px-4 py-2.5">Integrity & Offset Notes</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800/60">
                                                        {well.casing_strings?.map((cs, cIdx) => (
                                                            <tr key={cIdx} className="hover:bg-slate-800/40 transition">
                                                                <td className="px-4 py-3 font-semibold text-white">{cs.name}</td>
                                                                <td className="px-3 py-3 font-mono">{cs.hole_size_in}" / {cs.casing_od_in}" </td>
                                                                <td className="px-3 py-3 font-mono text-cyan-300">{cs.depth_tvd_m} m</td>
                                                                <td className="px-3 py-3 font-mono">{cs.weight_ppf}# {cs.grade}</td>
                                                                <td className="px-3 py-3">{cs.shoe_formation}</td>
                                                                <td className="px-3 py-3 font-mono text-slate-400">{cs.toc_tvd_m} m</td>
                                                                <td className="px-3 py-3">
                                                                    <div className="font-semibold text-slate-200">{cs.slurry_density_ppg} ppg</div>
                                                                    <div className="text-[11px] text-slate-400 truncate max-w-[160px]">{cs.slurry_type}</div>
                                                                </td>
                                                                <td className="px-3 py-3 font-mono font-bold text-amber-300">{cs.lot_emw_ppg} ppg</td>
                                                                <td className="px-4 py-3 text-slate-300 max-w-xs">
                                                                    {cs.integrity_notes.includes('WARNING') ? (
                                                                        <span className="text-amber-300 font-semibold">{cs.integrity_notes}</span>
                                                                    ) : (
                                                                        cs.integrity_notes
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : null}
                    </div>
                )}

                {/* TAB 3: STRATIGRAPHIC CROSS-SECTION (3 OFFSET WELLS FENCE DIAGRAM) */}
                {activeTab === 'cross_section' && (
                    <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex flex-col space-y-4">
                        {stratLoading ? (
                            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                                <Loader2 size={32} className="animate-spin mb-4 text-cyan-400" />
                                <p>Constructing 3-well stratigraphic fence diagram...</p>
                            </div>
                        ) : stratData ? (
                            <>
                                {/* Geological Summary Banner */}
                                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center justify-between">
                                    <div className="flex items-center space-x-2 text-slate-300">
                                        <Info size={15} className="text-cyan-400 shrink-0" />
                                        <span>{stratData.geological_summary}</span>
                                    </div>
                                    <span className="text-slate-400 font-mono text-[11px] shrink-0 ml-4">
                                        Orientation: {stratData.cross_section_orientation}
                                    </span>
                                </div>

                                {/* Fence Diagram Visual Canvas */}
                                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col">
                                    {/* Well Headers */}
                                    <div className="grid grid-cols-3 gap-8 mb-4 border-b border-slate-800 pb-3">
                                        {stratData.wells?.map((w, i) => (
                                            <div key={i} className={`text-center p-3 rounded-lg border ${w.is_active ? 'bg-cyan-950/40 border-cyan-500/50' : 'bg-slate-950/60 border-slate-800'}`}>
                                                <div className="flex items-center justify-center space-x-2">
                                                    <span className={`w-2.5 h-2.5 rounded-full ${w.is_active ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`}></span>
                                                    <h5 className="font-bold text-sm text-white font-mono">{w.name}</h5>
                                                </div>
                                                <div className="text-[11px] text-slate-400 mt-1 flex justify-center space-x-4 font-mono">
                                                    <span>KB: {w.kb_elevation_m}m</span>
                                                    <span>TD: {w.total_depth_tvd_m}m</span>
                                                    <span>Offset: {w.x_offset_km} km</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Stratigraphic Columns & Formations */}
                                    <div className="grid grid-cols-3 gap-8 flex-1 relative min-h-[420px]">
                                        {stratData.wells?.map((w, wIdx) => (
                                            <div key={wIdx} className="flex flex-col h-full space-y-1.5 relative">
                                                {w.formations?.map((form, fIdx) => {
                                                    const thickness = form.base_tvd - form.top_tvd;
                                                    // Calculate height percentage relative to well TD (~3600m)
                                                    const heightPct = Math.max(12, (thickness / 3600.0) * 100);
                                                    return (
                                                        <div 
                                                            key={fIdx} 
                                                            style={{ 
                                                                flexGrow: thickness,
                                                                borderLeftColor: form.color,
                                                                borderLeftWidth: '4px'
                                                            }}
                                                            className="rounded p-2.5 bg-slate-950/70 border border-slate-800 flex flex-col justify-between hover:bg-slate-800/60 transition group relative"
                                                        >
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <span className="font-bold text-xs" style={{ color: form.color }}>
                                                                        {form.name}
                                                                    </span>
                                                                    <div className="text-[10px] text-slate-400">
                                                                        {form.lithology}
                                                                    </div>
                                                                </div>
                                                                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                                                                    Top: {form.top_tvd}m
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] font-mono text-slate-500 mt-1 flex justify-between">
                                                                <span>Base: {form.base_tvd}m</span>
                                                                <span>Δ {Math.round(thickness)}m</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {/* Incidents on this column */}
                                                {w.incidents?.map((inc, incIdx) => (
                                                    <div 
                                                        key={incIdx} 
                                                        className="p-2 rounded bg-red-950/60 border border-red-500/40 text-[11px] text-red-200 mt-1 flex items-start space-x-1.5 shadow-lg"
                                                    >
                                                        <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
                                                        <div>
                                                            <div className="font-bold">{inc.type}</div>
                                                            <div className="text-[10px] text-red-300 font-mono">Depth: {inc.depth_tvd}m TVD ({inc.formation})</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Correlative Formation Tie-Lines Legend */}
                                    <div className="mt-6 pt-4 border-t border-slate-800/80">
                                        <h6 className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                                            Correlative Formation Horizons (Realistic 3D Theme Matching):
                                        </h6>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                            {stratData.tie_lines?.map((tl, tlIdx) => (
                                                <div key={tlIdx} className="p-2.5 rounded bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                                                    <div className="flex items-center space-x-2 mb-1">
                                                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tl.color }}></span>
                                                        <span className="font-bold text-white truncate">{tl.formation}</span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 leading-tight">
                                                        {tl.structural_dip_trend}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>
                )}

            </div>
        </div>
    );
};

export default CorrelationPanel;
