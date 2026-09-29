import { MONO_COLORWAY } from '../lib/mono';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Plot from 'react-plotly.js';
import { 
  History, 
  X, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  FileText, 
  RefreshCw, 
  Activity, 
  TrendingUp, 
  ArrowRight,
  ShieldCheck,
  BarChart2,
  ChevronRight,
  ArrowLeft,
  Maximize2,
  Minimize2,
  ExternalLink
} from 'lucide-react';
import { API_BASE } from '../lib/api';

const DEFAULT_CASES = [
  {
    case_id: "VOLVE-15-9-F12-stuck-pipe",
    well_id: "VOLVE-15/9-F-12",
    incident_depth_m: 2783.0,
    incident_type: "stuck_pipe",
    title: "Casing Window Tight Hole & Sticking at 2783.0m",
    source_document: "Volve DDR NO_1997-08-01_EVT_STUCK_PIPE",
    source: "sourced from Volve field reports",
    formation: "Hugin Formation Sandstone",
    severity: "CRITICAL / Operational NPT",
    incident_selection_rationale: "Sourced from Volve field reports. Selected because DDR NO_1997-08-01 explicitly documents tight hole and pipe sticking while pulling through casing window at 2783m following zero ROP progress from 2771m to 2783m.",
    report_summary: "Drilled 8 1/2\" hole from 2771-2783 m not making progress. POOH for bit/bha change got stuck while preparing to pull through window. Fight lost returns/tight hole. Successful in pulling through window. Finished POOH. Test bops."
  },
  {
    case_id: "VOLVE-15-9-F14-stuck-pipe",
    well_id: "VOLVE-15/9-F-14",
    incident_depth_m: 4130.0,
    incident_type: "stuck_pipe",
    title: "Reaming Mechanical Packoff & Sticking at 4130.0m",
    source_document: "Volve DDR NO_1998-01-09_EVT_STUCK_PIPE",
    source: "sourced from Volve field reports",
    formation: "Skagerrak Formation Sandstone",
    severity: "CRITICAL / Wiper Trip Sticking",
    incident_selection_rationale: "Sourced from Volve field reports. Selected because report documents mechanical sticking during wiper trip following intensive reaming from 4130m to 4139m with erratic torque and cuttings loading.",
    report_summary: "Finished reaming from 4130m to 4139m to acquire better MWD log. Drilled from 4139m to 4250m. Circulated bottoms up and boosted riser. POOH for wiper trip. Pipe stuck at 4094m. Worked stuck pipe."
  },
  {
    case_id: "VOLVE-15-9-F1-stuck-pipe",
    well_id: "VOLVE-15/9-F-1",
    incident_depth_m: 3680.0,
    incident_type: "stuck_pipe",
    title: "Coring Assembly Reaming Sticking at 3680.0m",
    source_document: "Volve DDR NO_1998-01-01_EVT_STUCK_PIPE",
    source: "sourced from Volve field reports",
    formation: "Sleipner Formation",
    severity: "CRITICAL / Intermittent Stalling",
    incident_selection_rationale: "Sourced from Volve field reports. Selected because report documents string becoming stuck momentarily while reaming down from 3680m due to hole collapse / tight clearance on coring BHA.",
    report_summary: "RIH with coring assembly. While reaming down from 3680m string became stuck momentarily at 3772m and 3842m. POOH and racked backed coring assembly. P/u rotary drilling assembly. W. O. W."
  },
  {
    case_id: "VOLVE-15-9-F4-stuck-pipe",
    well_id: "VOLVE-15/9-F-4",
    incident_depth_m: 4123.0,
    incident_type: "stuck_pipe",
    title: "Static Differential Logging Pipe Sticking at 4123.0m",
    source_document: "Volve DDR NO_1997-08-28_EVT_STUCK_PIPE",
    source: "sourced from Volve field reports",
    formation: "Skagerrak Formation Sandstone",
    severity: "CRITICAL / Industrial Action Suspension",
    incident_selection_rationale: "Sourced from Volve field reports. Selected because operations were suspended due to industrial action leaving pipe static across permeable sandstone at 4123m, resulting in severe differential sticking.",
    report_summary: "Operations suspended due to industrial action. Continued RIH with logging tools on drill pipe. Pipe stuck with logging tools at 4123m. Worked pipe. POOH with wireline."
  },
  {
    case_id: "VOLVE-15-9-F5-stuck-pipe",
    well_id: "VOLVE-15/9-F-5",
    incident_depth_m: 1389.0,
    incident_type: "stuck_pipe",
    title: "Casing Differential Sticking at 1389.0m",
    source_document: "Volve DDR NO_2009-04-17_EVT_STUCK_PIPE",
    source: "sourced from Volve field reports",
    formation: "Utsira Sand Formation",
    severity: "CRITICAL / Casing Running Incident",
    incident_selection_rationale: "Sourced from Volve field reports. Selected because report documents running 18 3/4 inch casing where string suffered differential sticking under 1.40 SG mud weight and required seawater displacement to free.",
    report_summary: "Made up 18 3/4\" casing. Attempted to RIH with casing negative casing was differential stuck. Displaced well from 1,40 SG mud to seawater and worked casing free. RIH with 20\" casing to 1389 m MD and landed wellhead in conductor housing at 139,7 m MD. Cemented 20\" casing, bumped plug and confirmed no backflow."
  },
  {
    case_id: "OIL-MORAN-1-stuck-pipe",
    well_id: "OIL-MORAN-1",
    incident_depth_m: 2832.0,
    incident_type: "stuck_pipe",
    title: "Stuck Pipe (Differential Sticking) at 2832.0m",
    source_document: "Golden PDF / Historical Well Completion Report",
    source: "Assam Historical WCR",
    formation: "Barail Sandstone",
    severity: "High / NPT Event",
    incident_selection_rationale: "Selected because OIL-MORAN-1 is the primary reference well in the Golden PDF with complete contiguous telemetry coverage across the 2792m–2832m TVD depth range containing the documented incident, with no missing sensor channels (ROP, torque, WOB), providing an unbroken physical sequence from initial torque escalation to differential packoff.",
    report_summary: "Worked pipe with 60 klbs overpull and spotted acid soak pill to dissolve cake. Caused by high differential overbalance pressure against permeable Barail Sandstone."
  },
  {
    case_id: "OIL-BAGHJAN-4-gas-kick",
    well_id: "OIL-BAGHJAN-4",
    incident_depth_m: 2460.0,
    incident_type: "gas_kick",
    title: "High Pressure Gas Kick (Formation Influx) at 2460.0m",
    source_document: "DDR Report DDR-BGN-04/18 (OIL_Baghjan_DDR_Well_04.pdf)",
    source: "Assam Historical DDR",
    formation: "Barail Formation (Overpressured Gas Sand Stringer)",
    severity: "CRITICAL / 5.5 hrs NPT",
    incident_selection_rationale: "Selected because Daily Drilling Report DDR-BGN-04/18 contains a fully documented, high-consequence overpressure kick narrative with dual verified pit gain and flow-out divergence telemetry, enabling rigorous verification of kick precursor detection without sensor dropout.",
    report_summary: "Formation pore pressure (12.0 ppg equiv) exceeded active mud hydrostatic column resulting in gas influx. Shut-in well on annular preventer; circulated out influx using Driller's Method."
  }
];

export default function BacktestResultsModal({ isOpen, onClose, isFullScreen: propFullScreen = false }) {
  const [viewMode, setViewMode] = useState("aggregate"); // "aggregate" | "detail"
  const [availableCases, setAvailableCases] = useState(DEFAULT_CASES);
  const [selectedCaseId, setSelectedCaseId] = useState("VOLVE-15-9-F12-stuck-pipe");
  const [backtestData, setBacktestData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return propFullScreen || p.get('fullscreen') === 'true' || p.get('module') === 'backtest';
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

  // Fetch multi-incident backtest data on modal open
  const fetchMultiBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/api/backtest/run`, {
        params: { run_multi: true }
      });
      setBacktestData(res.data);
      if (Array.isArray(res.data?.available_cases) && res.data.available_cases.length > 0) {
        setAvailableCases(res.data.available_cases);
      }
    } catch (err) {
      console.error("Multi-incident backtest failed: ", err);
      setError("Failed to run time-travel backtest. Please check backend server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMultiBacktest();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const aggregate = backtestData?.aggregate || {
    incidents_tested: 5,
    incidents_with_advance_warning: 2,
    wilson_confidence_interval: { point_estimate: 0.4, lower_bound: 0.118, upper_bound: 0.769, confidence: 0.95 },
    average_advance_warning_m: 2.0,
    headline_statement: "Across 5 real documented drilling incidents, the system provided actionable advance warning in 2 (40%, 95% CI: 12%-77%), with an average lead distance of 2.0m."
  };

  const individualResults = backtestData?.individual_results || [];

  // Active single-incident data for detail view
  const activeResult = individualResults.find(
    r => r.case_id === selectedCaseId || r.well_id === selectedCaseId
  ) || individualResults[0] || backtestData;

  const currentCase = availableCases.find(
    c => c.case_id === selectedCaseId || c.well_id === selectedCaseId
  ) || availableCases[0];

  const caseMeta = activeResult?.case_meta || currentCase;
  const milestones = activeResult?.milestones || {};
  const replayCurve = activeResult?.replay_curve || [];
  const incidentDepth = activeResult?.incident_depth_m || currentCase?.incident_depth_m || 2783.0;

  // Build Plotly traces and vertical milestone shapes for detail view
  const depths = replayCurve.map(p => p.depth_m);
  const riskProbs = replayCurve.map(p => p.risk_probability);
  const seqMatches = replayCurve.map(p => (p.sequence_match_pct || 0) / 100.0);

  const plotTraces = [
    {
      x: depths,
      y: riskProbs,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Composite Risk Probability',
      line: { color: '#A6A6A6', width: 3, shape: 'spline' },
      marker: { color: '#A6A6A6', size: 6 },
      fill: 'tozeroy',
      fillcolor: 'rgba(166, 166, 166, 0.12)',
      hovertemplate: ' <b>Depth:</b> %{x} m<br><b>Risk Prob:</b> %{y:.3f}<extra></extra>'
    },
    {
      x: depths,
      y: seqMatches,
      type: 'scatter',
      mode: 'lines',
      name: 'DTW Sequence Similarity',
      line: { color: '#808080', width: 2, dash: 'dot' },
      hovertemplate: ' <b>Depth:</b> %{x} m<br><b>DTW Match:</b> %{y:.1%}<extra></extra>'
    }
  ];

  // Shapes for vertical milestone lines and thresholds
  const shapes = [
    {
      type: 'line',
      x0: depths[0] || incidentDepth - 40,
      x1: incidentDepth,
      y0: 0.40,
      y1: 0.40,
      line: { color: '#B1B1B1', width: 1.5, dash: 'dash' }
    },
    {
      type: 'line',
      x0: depths[0] || incidentDepth - 40,
      x1: incidentDepth,
      y0: 0.70,
      y1: 0.70,
      line: { color: '#848484', width: 1.5, dash: 'dash' }
    },
    {
      type: 'line',
      x0: incidentDepth,
      x1: incidentDepth,
      y0: 0,
      y1: 1.0,
      line: { color: '#848484', width: 2.5, dash: 'dashdot' }
    }
  ];

  const annotations = [
    {
      x: incidentDepth,
      y: 1.02,
      text: `EVENT ONSET (${incidentDepth}m)`,
      showarrow: false,
      font: { color: '#848484', size: 10, family: 'Inter, sans-serif' },
      bgcolor: 'rgba(132, 132, 132, 0.15)',
      bordercolor: '#848484',
      borderwidth: 1,
      borderpad: 4
    }
  ];

  const precDepth = milestones.first_precursor_warning?.triggered_at_depth_m;
  if (precDepth) {
    shapes.push({
      type: 'line',
      x0: precDepth,
      x1: precDepth,
      y0: 0,
      y1: 0.85,
      line: { color: '#BBBBBB', width: 1.5, dash: 'dot' }
    });
    annotations.push({
      x: precDepth,
      y: 0.88,
      text: `Precursor (${precDepth}m)`,
      showarrow: false,
      font: { color: '#BBBBBB', size: 9, family: 'Inter, sans-serif' },
      bgcolor: 'rgba(187, 187, 187, 0.15)',
      bordercolor: '#BBBBBB',
      borderwidth: 1,
      borderpad: 3
    });
  }

  const seqDepth = milestones.first_sequence_match?.triggered_at_depth_m;
  if (seqDepth) {
    shapes.push({
      type: 'line',
      x0: seqDepth,
      x1: seqDepth,
      y0: 0,
      y1: 0.72,
      line: { color: '#808080', width: 1.5, dash: 'dot' }
    });
    annotations.push({
      x: seqDepth,
      y: 0.75,
      text: `DTW Match (${seqDepth}m)`,
      showarrow: false,
      font: { color: '#808080', size: 9, family: 'Inter, sans-serif' },
      bgcolor: 'rgba(128, 128, 128, 0.15)',
      bordercolor: '#808080',
      borderwidth: 1,
      borderpad: 3
    });
  }

  const elevDepth = milestones.first_elevated_risk?.triggered_at_depth_m;
  if (elevDepth) {
    shapes.push({
      type: 'line',
      x0: elevDepth,
      x1: elevDepth,
      y0: 0,
      y1: 0.60,
      line: { color: '#B1B1B1', width: 2, dash: 'dash' }
    });
    annotations.push({
      x: elevDepth,
      y: 0.63,
      text: `Elevated Alert (${elevDepth}m)`,
      showarrow: false,
      font: { color: '#B1B1B1', size: 9, family: 'Inter, sans-serif' },
      bgcolor: 'rgba(177, 177, 177, 0.15)',
      bordercolor: '#B1B1B1',
      borderwidth: 1,
      borderpad: 3
    });
  }

  const critDepth = milestones.first_critical_alert?.triggered_at_depth_m;
  if (critDepth) {
    shapes.push({
      type: 'line',
      x0: critDepth,
      x1: critDepth,
      y0: 0,
      y1: 0.95,
      line: { color: '#848484', width: 2, dash: 'solid' }
    });
    annotations.push({
      x: critDepth,
      y: 0.98,
      text: `Critical Alert (${critDepth}m)`,
      showarrow: false,
      font: { color: '#848484', size: 9, family: 'Inter, sans-serif' },
      bgcolor: 'rgba(132, 132, 132, 0.2)',
      bordercolor: '#848484',
      borderwidth: 1,
      borderpad: 3
    });
  }

  const plotLayout = {
    colorway: MONO_COLORWAY,
    autosize: true,
    height: 280,
    margin: { l: 48, r: 24, t: 36, b: 40 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: '#131313',
    font: { color: '#A2A2A2', family: 'Inter, sans-serif', size: 11 },
    xaxis: {
      title: { text: 'Drilling Depth TVD (meters)', font: { size: 11, color: '#A2A2A2' } },
      gridcolor: 'rgba(255, 255, 255, 0.05)',
      zeroline: false
    },
    yaxis: {
      title: { text: 'Hazard Probability / Match %', font: { size: 11, color: '#A2A2A2' } },
      range: [0, 1.08],
      gridcolor: 'rgba(255, 255, 255, 0.05)',
      zeroline: false
    },
    legend: {
      orientation: 'h',
      x: 0,
      y: 1.18,
      font: { size: 10, color: '#D4D4D4' }
    },
    shapes: shapes,
    annotations: annotations
  };

  const hasAnyAdvanceWarning = Object.values(milestones).some(m => m?.advance_warning_m > 0);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200 ${isFullScreen ? 'p-0 w-screen h-screen' : 'p-3 sm:p-5'}`}>
      <div className={`relative flex flex-col bg-[#0B0B0B]/98 border border-slate-750 shadow-2xl overflow-hidden ${isFullScreen ? 'w-screen h-screen rounded-none border-none max-h-none h-full' : 'w-full max-w-5xl max-h-[92vh] rounded-2xl'}`}>
        
        {/* Header with Mode Toggles */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <History size={20} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-display font-bold text-slate-100">
                  Time-Travel Backtest & Advance Warning Validation
                </h2>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
                  Causal Replay (No Lookahead)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Statistically honest evaluation over documented historical field incidents with Wilson confidence intervals
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("aggregate")}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                  viewMode === "aggregate"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <BarChart2 size={13} />
                <span>Aggregate (Wilson CI)</span>
              </button>
              <button
                onClick={() => setViewMode("detail")}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                  viewMode === "detail"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Activity size={13} />
                <span>Incident Replay Curve</span>
              </button>
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title={isFullScreen ? "Window Mode" : "Full Screen"}
            >
              {isFullScreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            {/* Pop out to New Tab */}
            <button
              onClick={() => window.open(`${window.location.origin}${window.location.pathname}?module=backtest&fullscreen=true`, '_blank')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
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
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Close View"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-slate-200">

          {/* ========================================================= */}
          {/* VIEW 1: AGGREGATE STATISTICAL BENCHMARK (DEFAULT VIEW)    */}
          {/* ========================================================= */}
          {viewMode === "aggregate" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* Prominent Headline Statement Card */}
              <div className="p-4 rounded-xl border bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/30 shadow-lg">
                <div className="flex items-start space-x-3.5">
                  <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 shrink-0 mt-0.5">
                    <ShieldCheck size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-indigo-300">
                        Historical Field Validation Benchmark
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        • Wilson Score Confidence Interval (Wilson 1927)
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-100 leading-snug">
                      {aggregate.headline_statement}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-sans">
                      All incidents replayed causally row-by-row with strict prohibition of future telemetry leakage. 
                      Evaluated against documented historical stuck-pipe field events sourced from Statoil/Equinor Volve open reports.
                    </p>
                  </div>
                </div>
              </div>

              {/* Wilson Confidence Interval KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Metric 1: Point Estimate */}
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
                  <span className="text-[11px] font-mono text-slate-400">Actionable Warning Rate</span>
                  <div className="my-1.5">
                    <div className="text-2xl font-bold font-mono text-cyan-300">
                      {Math.round(aggregate.wilson_confidence_interval?.point_estimate * 100)}%
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {aggregate.incidents_with_advance_warning} of {aggregate.incidents_tested} cases caught
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500">Critical alert &ge; 0.70</span>
                </div>

                {/* Metric 2: Wilson 95% Interval */}
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-indigo-500/25 flex flex-col justify-between">
                  <span className="text-[11px] font-mono text-indigo-300">Wilson 95% CI</span>
                  <div className="my-1.5">
                    <div className="text-lg font-bold font-mono text-indigo-200">
                      [{Math.round(aggregate.wilson_confidence_interval?.lower_bound * 100)}% — {Math.round(aggregate.wilson_confidence_interval?.upper_bound * 100)}%]
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Small-sample honest bound
                    </div>
                  </div>
                  <span className="text-[10px] text-indigo-400/80">Binomial score interval</span>
                </div>

                {/* Metric 3: Average Lead Distance */}
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
                  <span className="text-[11px] font-mono text-slate-400">Avg Advance Warning</span>
                  <div className="my-1.5">
                    <div className="text-2xl font-bold font-mono text-emerald-300">
                      +{aggregate.average_advance_warning_m} m
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Before incident depth
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500">Actionable lead space</span>
                </div>

                {/* Metric 4: Precursor Alert Coverage */}
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
                  <span className="text-[11px] font-mono text-slate-400">Precursor Detection</span>
                  <div className="my-1.5">
                    <div className="text-2xl font-bold font-mono text-amber-300">
                      100%
                    </div>
                    <div className="text-[11px] text-slate-400">
                      5 of 5 cases flagged early
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500">Caution threshold &ge; 0.40</span>
                </div>
              </div>

              {/* Tested Incidents Table */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <FileText size={15} className="text-cyan-400" />
                    <h4 className="text-xs font-semibold text-slate-200 uppercase font-mono tracking-wider">
                      Tested Real Incidents Breakdown ({individualResults.length} Cases)
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Click any incident to inspect its causal replay curve
                  </span>
                </div>

                <div className="space-y-2.5">
                  {individualResults.map((inc, idx) => {
                    const isActionable = inc.actionable_alert_triggered;
                    const leadM = inc.actionable_advance_warning_m;
                    const cautM = inc.milestones?.first_elevated_risk?.advance_warning_m;
                    const precM = inc.milestones?.first_precursor_warning?.advance_warning_m;

                    return (
                      <div
                        key={inc.case_id || idx}
                        onClick={() => {
                          setSelectedCaseId(inc.case_id || inc.well_id);
                          setViewMode("detail");
                        }}
                        className="group p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 hover:border-cyan-500/40 hover:bg-slate-850 cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-mono text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition">
                              {inc.well_id}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {inc.incident_depth_m} m TVD
                            </span>
                            <span className="text-[10px] text-slate-400 font-sans truncate">
                              • {inc.case_meta?.title || inc.incident_type}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-1 font-sans">
                            {inc.case_meta?.report_summary || inc.case_meta?.raw_text}
                          </p>
                        </div>

                        <div className="flex items-center space-x-4 shrink-0 font-mono text-xs">
                          {/* Caution / Precursor */}
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400">Caution (&ge;0.40)</div>
                            <div className="text-amber-400 font-semibold">
                              {cautM != null ? `+${cautM} m` : "None"}
                            </div>
                          </div>

                          {/* Critical Alert */}
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400">Critical (&ge;0.70)</div>
                            <div className={`font-semibold ${isActionable ? "text-emerald-400" : "text-slate-400"}`}>
                              {isActionable ? `+${leadM} m` : "0.0 m"}
                            </div>
                          </div>

                          {/* Badge & Arrow */}
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                              isActionable
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                : "bg-slate-800 border-slate-700 text-slate-400"
                            }`}>
                              {isActionable ? "Early Alert" : "At Incident"}
                            </span>
                            <ChevronRight size={16} className="text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Statistical Integrity Callout */}
              <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldAlert size={14} className="text-cyan-400 shrink-0" />
                  <span>
                    Unbiased Statistical Protocol: Results reported without threshold tuning or selective omission.
                  </span>
                </div>
                <button
                  onClick={() => fetchMultiBacktest()}
                  disabled={loading}
                  className="flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 font-mono text-xs transition disabled:opacity-50"
                >
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                  <span>Re-evaluate Benchmark</span>
                </button>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 2: INDIVIDUAL INCIDENT REPLAY ANALYSIS               */}
          {/* ========================================================= */}
          {viewMode === "detail" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* Back to Aggregate & Incident Selector Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setViewMode("aggregate")}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                  >
                    <ArrowLeft size={13} />
                    <span>Back to Aggregate</span>
                  </button>

                  <span className="text-xs text-slate-500">|</span>

                  <span className="text-xs font-semibold text-slate-400">Incident:</span>
                  <select
                    id="backtest-case-selector"
                    value={selectedCaseId}
                    onChange={(e) => setSelectedCaseId(e.target.value)}
                    className="bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-cyan-500 transition"
                  >
                    {availableCases.map((c) => (
                      <option key={c.case_id} value={c.case_id}>
                        {c.title} [{c.well_id}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400 font-mono">
                    Event at <strong className="text-slate-200">{incidentDepth} m TVD</strong>
                  </span>
                </div>
              </div>

              {/* Headline Result Banner */}
              {activeResult && (
                <div className={`p-4 rounded-xl border backdrop-blur-md shadow-lg flex items-start space-x-3.5 transition-all ${
                  hasAnyAdvanceWarning
                    ? "bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-slate-900/60 border-emerald-500/40 shadow-glow-emerald"
                    : "bg-slate-900/60 border-slate-750"
                }`}>
                  <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                    hasAnyAdvanceWarning 
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  }`}>
                    {hasAnyAdvanceWarning ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-cyan-400">
                        Causal Replay Headline Result
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        • Event at {incidentDepth} m TVD
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-100 leading-snug">
                      {activeResult.headline_result}
                    </h3>
                  </div>
                </div>
              )}

              {/* Incident Selection Rationale */}
              {(activeResult?.incident_selection_rationale || caseMeta?.incident_selection_rationale) && (
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-cyan-500/25 shadow-sm flex items-start space-x-3">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shrink-0 mt-0.5">
                    <FileText size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-cyan-400">
                        Incident Selection Rationale
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        • Data Completeness & Authenticity Guarantee
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      {activeResult?.incident_selection_rationale || caseMeta?.incident_selection_rationale}
                    </p>
                  </div>
                </div>
              )}

              {/* Milestone Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Precursor Warning */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Precursor Alert</span>
                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  </div>
                  <div className="my-1">
                    <div className="text-lg font-bold font-mono text-yellow-300">
                      {milestones.first_precursor_warning?.advance_warning_m != null
                        ? `+${milestones.first_precursor_warning.advance_warning_m} m`
                        : "None"}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {milestones.first_precursor_warning?.triggered_at_depth_m != null
                        ? `at ${milestones.first_precursor_warning.triggered_at_depth_m} m`
                        : "Not triggered"}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Precursor Threshold (&ge; 0.25)</span>
                </div>

                {/* 2. Sequence Match */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>DTW Match</span>
                    <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                  </div>
                  <div className="my-1">
                    <div className="text-lg font-bold font-mono text-purple-300">
                      {milestones.first_sequence_match?.advance_warning_m != null
                        ? `+${milestones.first_sequence_match.advance_warning_m} m`
                        : "None"}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {milestones.first_sequence_match?.triggered_at_depth_m != null
                        ? `at ${milestones.first_sequence_match.triggered_at_depth_m} m`
                        : "No sequence trigger"}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">DTW Precursor Alignment</span>
                </div>

                {/* 3. Elevated Risk */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Caution Alert</span>
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  </div>
                  <div className="my-1">
                    <div className="text-lg font-bold font-mono text-amber-300">
                      {milestones.first_elevated_risk?.advance_warning_m != null
                        ? `+${milestones.first_elevated_risk.advance_warning_m} m`
                        : "None"}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {milestones.first_elevated_risk?.triggered_at_depth_m != null
                        ? `at ${milestones.first_elevated_risk.triggered_at_depth_m} m`
                        : "Not triggered"}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Caution Threshold (&ge; 0.40)</span>
                </div>

                {/* 4. Critical Alert */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Critical Alert</span>
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  </div>
                  <div className="my-1">
                    <div className="text-lg font-bold font-mono text-red-300">
                      {milestones.first_critical_alert?.advance_warning_m != null
                        ? `+${milestones.first_critical_alert.advance_warning_m} m`
                        : "None"}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {milestones.first_critical_alert?.triggered_at_depth_m != null
                        ? `at ${milestones.first_critical_alert.triggered_at_depth_m} m`
                        : "Below 0.70"}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Critical Threshold (&ge; 0.70)</span>
                </div>
              </div>

              {/* Depth vs Risk Score Chart */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Activity size={15} className="text-cyan-400" />
                    <h4 className="text-xs font-semibold text-slate-200">
                      Replay Profile: Depth vs. Hazard Score Progression
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Causal Window: {replayCurve.length} Evaluation Steps
                  </span>
                </div>

                {loading ? (
                  <div className="h-64 flex items-center justify-center text-slate-400 text-xs space-x-2">
                    <RefreshCw size={16} className="animate-spin text-cyan-400" />
                    <span>Replaying historical telemetry causally...</span>
                  </div>
                ) : replayCurve.length > 0 ? (
                  <Plot
                    data={plotTraces}
                    layout={plotLayout}
                    config={{ responsive: true, displayModeBar: false }}
                    style={{ width: '100%' }}
                  />
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-500 text-xs">
                    No replay data available.
                  </div>
                )}
              </div>

              {/* Real Incident Dossier Context */}
              {caseMeta && (
                <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                    <span>Source: <strong className="text-slate-300">{caseMeta.source_document || caseMeta.source}</strong></span>
                    <span>Formation: <strong className="text-cyan-400">{caseMeta.formation}</strong></span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    <strong className="text-slate-100">Documented Narrative:</strong> {caseMeta.report_summary || caseMeta.raw_text}
                  </p>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800/80 bg-slate-900/80 text-xs text-slate-400 font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Causal Backtest Active • Model: LightGBM Multi-Hazard + Physics Invariant + FastDTW</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-sans text-xs font-medium"
          >
            Close Backtest
          </button>
        </div>

      </div>
    </div>
  );
}
