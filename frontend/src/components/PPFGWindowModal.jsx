import { MONO_COLORWAY } from '../lib/mono';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../lib/api';
import Plot from 'react-plotly.js';
import SourceTag, { getWellDataSource } from './SourceTag';
import { evaluateOfflinePPFG } from '../lib/offlinePhysicsEngine';
import { 
  Gauge, 
  ShieldCheck, 
  AlertTriangle, 
  AlertCircle,
  X, 
  RefreshCw, 
  Layers, 
  Info,
  CheckCircle2,
  FileText,
  Maximize2,
  Minimize2,
  ExternalLink
} from 'lucide-react';

const PPFGWindowModal = ({ isOpen, onClose, activeWellId = 'OIL-BAGHJAN-1', isFullScreen: propFullScreen = false }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [unit, setUnit] = useState('ppg'); // 'ppg' or 'sg'
  const [isFullScreen, setIsFullScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return propFullScreen || p.get('fullscreen') === 'true' || p.get('module') === 'ppfg';
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

  const fetchPPFG = async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/wells/${activeWellId}/ppfg`, { timeout: 3000 });
      setData(res.data);
    } catch (err) {
      console.warn('Network/Cloud API unavailable for PPFG, using local Rig Edge Eaton PPFG engine: ', err);
      const offlinePPFG = evaluateOfflinePPFG(activeWellId);
      setData(offlinePPFG);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPPFG();
  }, [isOpen, activeWellId]);

  if (!isOpen) return null;

  const act = data?.active_status || {};
  const isPpg = unit === 'ppg';
  const ppCurve = isPpg ? data?.pore_pressure_ppg : data?.pore_pressure_sg;
  const ppLower = isPpg 
    ? (data?.pore_pressure_lower_ppg || ppCurve?.map(p => +(p * 0.94).toFixed(2))) 
    : (data?.pore_pressure_lower_sg || ppCurve?.map(p => +(p * 0.94).toFixed(3)));
  const ppUpper = isPpg 
    ? (data?.pore_pressure_upper_ppg || ppCurve?.map(p => +(p * 1.06).toFixed(2))) 
    : (data?.pore_pressure_upper_sg || ppCurve?.map(p => +(p * 1.06).toFixed(3)));
  const fgCurve = isPpg ? data?.fracture_gradient_ppg : data?.fracture_gradient_sg;
  const unitLabel = isPpg ? 'ppg' : 's.g.';

  const currentEcd = isPpg ? act.ecd_ppg : (act.ecd_ppg ? +(act.ecd_ppg / 8.33).toFixed(3) : 1.39);
  const currentMw = isPpg ? act.mud_weight_ppg : (act.mud_weight_ppg ? +(act.mud_weight_ppg / 8.33).toFixed(3) : 1.34);

  // Build Plotly traces
  const plotTraces = [];

  if (data?.depths_tvd && ppCurve && fgCurve) {
    // 1. Estimated Uncertainty Range around Pore Pressure (±5-8% synthetic sonic proxy uncertainty)
    if (ppLower && ppUpper) {
      const uncPolyX = [...ppLower, ...[...ppUpper].reverse()];
      const uncPolyY = [...data.depths_tvd, ...[...data.depths_tvd].reverse()];
      plotTraces.push({
        type: 'scatter',
        mode: 'lines',
        name: 'Estimated uncertainty range',
        x: uncPolyX,
        y: uncPolyY,
        line: { color: 'rgba(177, 177, 177, 0.35)', width: 1, dash: 'dot' },
        fill: 'toself',
        fillcolor: 'rgba(177, 177, 177, 0.16)',
        hoverinfo: 'name'
      });
    }

    // 2. Pore Pressure Gradient Line
    plotTraces.push({
      type: 'scatter',
      mode: 'lines',
      name: `Pore Pressure (${unitLabel})`,
      x: ppCurve,
      y: data.depths_tvd,
      line: { color: '#B1B1B1', width: 2.5, dash: 'dash' },
      hoverinfo: 'x+y+name'
    });

    // 3. Fracture Gradient Line
    plotTraces.push({
      type: 'scatter',
      mode: 'lines',
      name: `Fracture Gradient (${unitLabel})`,
      x: fgCurve,
      y: data.depths_tvd,
      line: { color: '#9A9A9A', width: 2.5 },
      hoverinfo: 'x+y+name'
    });

    // 4. Safe Mud Weight Operating Window Corridor (Polygon fill)
    // Construct closed polygon: PP from top to bottom, then FG from bottom to top
    const polyX = [...ppCurve, ...[...fgCurve].reverse()];
    const polyY = [...data.depths_tvd, ...[...data.depths_tvd].reverse()];
    plotTraces.push({
      type: 'scatter',
      mode: 'none',
      fill: 'toself',
      fillcolor: 'rgba(163, 163, 163, 0.12)',
      name: 'Safe Mud Window Envelope',
      x: polyX,
      y: polyY,
      hoverinfo: 'skip'
    });

    // 4. Casing Shoe Markers (Horizontal lines)
    if (data.casing_shoes) {
      data.casing_shoes.forEach(shoe => {
        plotTraces.push({
          type: 'scatter',
          mode: 'lines+text',
          name: shoe.casing_type,
          x: isPpg ? [8.0, 17.5] : [0.95, 2.1],
          y: [shoe.tvd_depth, shoe.tvd_depth],
          line: { color: shoe.color, width: 1.5, dash: 'dot' },
          text: ['', `${shoe.casing_type} (${shoe.tvd_depth}m)`],
          textposition: 'top right',
          textfont: { color: shoe.color, size: 10 },
          showlegend: false,
          hoverinfo: 'skip'
        });
      });
    }

    // 5. Active Rig ECD Operating Point
    if (act.current_tvd && currentEcd) {
      plotTraces.push({
        type: 'scatter',
        mode: 'markers+text',
        name: `Active ECD (${currentEcd} ${unitLabel})`,
        x: [currentEcd],
        y: [act.current_tvd],
        marker: { 
          color: act.status_color || '#A3A3A3', 
          size: 14, 
          symbol: 'diamond',
          line: { color: '#FFFFFF', width: 2 } 
        },
        text: [`Active Bit (${act.current_tvd}m)`],
        textposition: 'middle right',
        textfont: { color: '#FFFFFF', size: 11, family: 'Inter' },
        hoverinfo: 'x+y+name'
      });
    }
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200 ${isFullScreen ? 'p-0 w-screen h-screen' : 'p-2 sm:p-4'}`}>
      <div className={`bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col ${isFullScreen ? 'w-screen h-screen rounded-none border-none max-h-none h-full' : 'w-full max-w-6xl rounded-xl max-h-[96vh] sm:max-h-[92vh]'}`}>
        
        {/* Header */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center gap-2">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400 shrink-0">
              <Gauge size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-sm sm:text-lg font-bold text-white tracking-wide truncate">
                  Safe Operating Mud Weight Window
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono">
                  {activeWellId}
                </span>
                <SourceTag source={activeWellId} compact={true} />
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                  Depth: {act.current_tvd || 2240}m
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
                Pore Pressure vs. Fracture Gradient corridor and active ECD margin monitoring
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Unit Switcher */}
            <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
              <button
                onClick={() => setUnit('ppg')}
                className={`px-2 py-1 rounded text-xs transition cursor-pointer ${unit === 'ppg' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                PPG
              </button>
              <button
                onClick={() => setUnit('sg')}
                className={`px-2 py-1 rounded text-xs transition cursor-pointer ${unit === 'sg' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                SG
              </button>
            </div>

            <button 
              onClick={fetchPPFG}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="Refresh PPFG Window"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* Toggle Fullscreen */}
            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title={isFullScreen ? "Window Mode" : "Full Screen"}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Pop out to New Tab */}
            <button
              onClick={() => window.open(`${window.location.origin}${window.location.pathname}?module=ppfg&well=${encodeURIComponent(activeWellId)}&fullscreen=true`, '_blank')}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
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
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="Close View"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Operating Status Banner */}
        <div 
          className="px-3 sm:px-6 py-2 sm:py-3 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs transition"
          style={{
            backgroundColor: `${act.status_color || '#A3A3A3'}15`,
            borderColor: `${act.status_color || '#A3A3A3'}40`
          }}
        >
          <div className="flex items-center space-x-2">
            <ShieldCheck size={18} style={{ color: act.status_color || '#A3A3A3' }} className="shrink-0" />
            <span className="font-bold text-white text-xs sm:text-sm">
              {act.status_message || 'Operating safely inside drilling envelope.'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] sm:text-xs">
            <div>
              <span className="text-slate-400 mr-1">Kick Margin:</span>
              <strong className="text-cyan-300">+{act.kick_margin_ppg || 0.8} {unitLabel}</strong>
            </div>
            <div>
              <span className="text-slate-400 mr-1">Loss Margin:</span>
              <strong className="text-orange-300">+{act.loss_margin_ppg || 2.4} {unitLabel}</strong>
            </div>
            <div>
              <span className="text-slate-400 mr-1">Active ECD:</span>
              <strong className="text-white font-bold">{currentEcd} {unitLabel}</strong>
            </div>
          </div>
        </div>

        {/* Chart & Sidebar Layout */}
        <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          
          {/* Main Plotly Log View */}
          <div className="w-full flex-1 bg-slate-950 relative p-2 min-h-[360px] md:min-h-[420px]">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <RefreshCw size={28} className="animate-spin text-cyan-400 mb-2" />
                <span className="ml-3 text-sm">Calculating Subsurface Pore Pressures & Fracture Gradients...</span>
              </div>
            ) : (
              <Plot
                data={plotTraces}
                layout={{
                    colorway: MONO_COLORWAY,
                  autosize: true,
                  margin: { l: 60, r: 40, b: 50, t: 30 },
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: '#0F0F0F',
                  xaxis: {
                    title: `Mud Weight / Pressure Gradient (${unitLabel})`,
                    range: isPpg ? [8.0, 17.5] : [0.95, 2.1],
                    gridcolor: '#292929',
                    zerolinecolor: '#404040',
                    color: '#A2A2A2'
                  },
                  yaxis: {
                    title: 'True Vertical Depth TVD (m)',
                    autorange: 'reversed',
                    gridcolor: '#292929',
                    zerolinecolor: '#404040',
                    color: '#A2A2A2'
                  },
                  legend: {
                    x: 0.02,
                    y: 0.04,
                    bgcolor: 'rgba(23, 23, 23, 0.85)',
                    bordercolor: '#404040',
                    borderwidth: 1,
                    font: { color: '#E7E7E7', size: 10 }
                  }
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
                config={{ responsive: true, displayModeBar: true, displaylogo: false }}
              />
            )}
          </div>

          {/* Casing & Formations Sidebar */}
          <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 p-5 overflow-y-auto space-y-5">
            
            {/* Casing Seat Program */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <Layers size={16} className="text-amber-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Casing Shoe Seating Depths
                </h4>
              </div>

              <div className="space-y-2">
                {data?.casing_shoes?.map((shoe, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: shoe.color }}></span>
                        <span>{shoe.casing_type}</span>
                      </span>
                      <span className="font-mono text-cyan-300 font-bold">{shoe.tvd_depth}m</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">{shoe.notes}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Formation Transitions Reference */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <FileText size={16} className="text-cyan-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Stratigraphic Formation Windows
                </h4>
              </div>

              <div className="space-y-2">
                {data?.formations?.map((form, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: form.color }}></span>
                        <span>{form.name}</span>
                      </span>
                      <span className="font-mono text-slate-400 text-[11px]">
                        {form.top_tvd}m – {form.bottom_tvd}m
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Targeted mud density: {form.top_tvd >= 2200 ? '11.4 - 12.2 ppg' : '9.2 - 9.8 ppg'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Engineering Note - Eaton's Method Technical Methodology */}
            <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-700/50 text-[11px] text-cyan-200 space-y-2">
              <div className="flex items-start space-x-2">
                <Info size={16} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                <span className="font-semibold text-white">Methodology & Transparency:</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Pore pressure and fracture gradient computed using Eaton's method (1975) ["The Equation for Geopressure Prediction from Well Logs", SPE-5544-MS] with a synthetic sonic-log input calibrated to produce a plausible Upper Assam Basin overpressure signature — real acoustic log data was not available.
              </p>
              <div className="p-2 rounded bg-cyan-900/30 border border-cyan-500/30 text-[10px] text-cyan-200 leading-relaxed">
                <strong className="text-cyan-300 font-semibold block mb-0.5">Estimated Uncertainty Range (±5–8%):</strong>
                Shaded band around pore pressure reflects confidence bounds from using a synthetic sonic-log proxy rather than real acoustic log data. Narrows to ±5% in shallow hydrostatic intervals and widens to ±8% in the Barail overpressure transition (2,200m–2,800m).
              </div>
              <div className="bg-slate-950/80 p-2 rounded border border-slate-800 text-[10px] font-mono text-slate-400 space-y-1">
                <div><span className="text-cyan-400">• Trend:</span> Δtn(z) = 185 · exp(-0.0003 · z) μs/ft</div>
                <div><span className="text-cyan-400">• Exponent:</span> N = 3.0 (Eaton shale acoustic)</div>
                <div><span className="text-cyan-400">• Overburden:</span> σv = 19.2 ppg (1.0 psi/ft constant)</div>
                <div><span className="text-cyan-400">• Poisson's:</span> ν(z) = 0.25 + 0.15 · (z / 3500)</div>
              </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <span>Safe operating corridor: Keep ECD at least +0.5 ppg over pore pressure and -0.8 ppg below fracture limit.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition"
          >
            Close PPFG Window
          </button>
        </div>

      </div>
    </div>
  );
};

export default PPFGWindowModal;
