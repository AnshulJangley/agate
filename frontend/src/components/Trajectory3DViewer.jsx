import { MONO_COLORWAY } from '../lib/mono';
import React, { useState, useEffect, useRef } from'react';
import axios from'axios';
import { API_BASE } from'../lib/api';
import Plot from'react-plotly.js';
import { 
 X, 
 Loader2, 
 RefreshCw, 
 Layers, 
 Compass, 
 AlertTriangle, 
 CheckCircle2, 
 ShieldAlert, 
 Eye, 
 EyeOff,
 Maximize2
} from'lucide-react';
import SourceTag, { getWellDataSource } from'./SourceTag';
import { REGIONS_CONFIG, getRegionalGeoLayers, getRegionIdFromWellId } from'../lib/regionalGeology';

// Helper to construct a flattened, irregular geological reservoir pool lens
const createReservoirLensMesh = (cx, cy, cz, rx, ry, rz, color, opacity, name) => {
 const Nu = 10;
 const Nv = 16;
 const x = [];
 const y = [];
 const z = [];
 const i = [];
 const j = [];
 const k = [];

 for (let uIdx = 0; uIdx <= Nu; uIdx++) {
 const u = (uIdx / Nu) * Math.PI;
 for (let vIdx = 0; vIdx < Nv; vIdx++) {
 const v = (vIdx / Nv) * 2 * Math.PI;
 // Realistic geological hydrocarbon pool lens: wider in X/Y, tapered at edges with subtle asymmetry
 const lensShape = 1.0 + 0.06 * Math.sin(3 * v) * Math.cos(2 * u);
 x.push(cx + rx * Math.sin(u) * Math.cos(v) * lensShape);
 y.push(cy + ry * Math.sin(u) * Math.sin(v) * lensShape);
 z.push(cz + rz * Math.cos(u));
 }
 }

 for (let uIdx = 0; uIdx < Nu; uIdx++) {
 for (let vIdx = 0; vIdx < Nv; vIdx++) {
 const nextV = (vIdx + 1) % Nv;
 const p0 = uIdx * Nv + vIdx;
 const p1 = uIdx * Nv + nextV;
 const p2 = (uIdx + 1) * Nv + vIdx;
 const p3 = (uIdx + 1) * Nv + nextV;

 i.push(p0, p1);
 j.push(p2, p3);
 k.push(p1, p2);
 }
 }

 return {
 type: 'mesh3d',
 name: name,
 x, y, z,
 i, j, k,
 color: color,
 opacity: opacity,
 showlegend: false,
 hoverinfo: 'skip'};
};

const Trajectory3DViewer = ({ isOpen, onClose, activeWellId, offsetWells = [], currentDepth, activeScenario, selectedRegion }) => {
 const [plotData, setPlotData] = useState([]);
 const [isLoading, setIsLoading] = useState(false);
 const [sceneError, setSceneError] = useState(null);
 const [theme, setTheme] = useState('dark');
 const [antiCollisionData, setAntiCollisionData] = useState(null);
 const [showOffsets, setShowOffsets] = useState(true);
 const [showFormations, setShowFormations] = useState(true);
 const [showClosestApproach, setShowClosestApproach] = useState(true);
 const [cameraRevision, setCameraRevision] = useState(0);
 const [currentCamera, setCurrentCamera] = useState({
 eye: { x: 1.5, y: 1.5, z: 0.5 },
 center: { x: 0, y: 0, z: -0.15 },
 up: { x: 0, y: 0, z: 1 }
 });
 const userCameraRef = useRef(null);
 const isInteractingRef = useRef(false);
 const pendingDepthRef = useRef(currentDepth);
 const [displayedDepth, setDisplayedDepth] = useState(currentDepth);

 // Keep pending depth updated without interrupting active user dragging
 useEffect(() => {
 pendingDepthRef.current = currentDepth;
 if (!isInteractingRef.current) {
 setDisplayedDepth(currentDepth);
 }
 }, [currentDepth]);

 const handleMouseDown = () => {
 isInteractingRef.current = true;
 };

 const handleMouseUp = () => {
 if (isInteractingRef.current) {
 isInteractingRef.current = false;
 setDisplayedDepth(pendingDepthRef.current);
 }
 };

 useEffect(() => {
 window.addEventListener('mouseup', handleMouseUp);
 return () => window.removeEventListener('mouseup', handleMouseUp);
 }, []);

 const handleRelayout = (event) => {
 if (event && event['scene.camera']) {
 userCameraRef.current = event['scene.camera'];
 }
 };

 // Cached raw data
 const rawDataRef = useRef({
 activeWell: null,
 offsets: [],
 antiCollision: null
 });

 const [stuckDepth, setStuckDepth] = useState(null);

 useEffect(() => {
 if (activeScenario === 'stuck_pipe') {
 if (stuckDepth === null && currentDepth !== null) {
 setStuckDepth(currentDepth);
 }
 } else {
 setStuckDepth(null);
 }
 }, [activeScenario]);

 const isGeo = theme === 'geo';

 // Compute explicit bounding box for geo theme with padding
 const geoBounds = React.useMemo(() => {
 if (!isGeo) return null;
 const { activeWell, offsets } = rawDataRef.current;
 const allXs = [];
 const allYs = [];
 if (activeWell?.trajectory?.x) {
 allXs.push(...activeWell.trajectory.x);
 allYs.push(...activeWell.trajectory.y);
 }
 offsets?.forEach(off => {
 if (off?.trajectory?.x) {
 allXs.push(...off.trajectory.x);
 allYs.push(...off.trajectory.y);
 }
 });
 if (allXs.length === 0 || allYs.length === 0) {
 return { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
 }
 const pad = 500;
 const minX = Math.min(...allXs) - pad;
 const maxX = Math.max(...allXs) + pad;
 const minY = Math.min(...allYs) - pad;
 const maxY = Math.max(...allYs) + pad;
 const maxSpan = Math.max(maxX - minX, maxY - minY, 1600);
 const midX = (minX + maxX) / 2;
 const midY = (minY + maxY) / 2;
 const halfSpan = maxSpan / 2;
 return {
 minX: Math.round(midX - halfSpan),
 maxX: Math.round(midX + halfSpan),
 minY: Math.round(midY - halfSpan),
 maxY: Math.round(midY + halfSpan)
 };
 }, [isGeo, plotData]);

 const liveBitTrace = React.useMemo(() => {
 const isStuck = activeScenario === 'stuck_pipe';
 const effectiveDepth = (isStuck && stuckDepth !== null) ? stuckDepth : displayedDepth;

 if (effectiveDepth === null || effectiveDepth === undefined || !rawDataRef.current.activeWell) return null;
 
 const activeWell = rawDataRef.current.activeWell;
 const traj = activeWell.trajectory;
 if (!traj || !traj.md || traj.md.length === 0) return null;

 const mdArray = traj.md;
 let idx0 = 0;
 let idx1 = 0;
 let t = 0;
 
 for (let i = 0; i < mdArray.length - 1; i++) {
 if (mdArray[i] <= effectiveDepth && mdArray[i+1] >= effectiveDepth) {
 idx0 = i;
 idx1 = i + 1;
 t = (effectiveDepth - mdArray[idx0]) / (mdArray[idx1] - mdArray[idx0] || 1);
 break;
 }
 }
 if (idx0 === 0 && idx1 === 0 && effectiveDepth > mdArray[mdArray.length - 1]) {
 idx0 = mdArray.length - 1;
 idx1 = mdArray.length - 1;
 t = 0;
 }

 const interpolate = (arr, i0, i1, frac) => arr[i0] + (arr[i1] - arr[i0]) * frac;
 
 const x = interpolate(traj.x, idx0, idx1, t);
 const y = interpolate(traj.y, idx0, idx1, t);
 const z = interpolate(traj.z, idx0, idx1, t);

 const markerColor = isStuck ? '#848484': '#9A9A9A';
 const markerSymbol = isStuck ? 'x': 'diamond';
 const markerSize = isStuck ? 16 : 14;

 return {
 type: 'scatter3d',
 mode: isStuck ? 'markers+text': 'markers',
 name: isStuck ? 'Stuck Pipe': 'Live Bit Position',
 x: [x],
 y: [y],
 z: [z],
 text: isStuck ? [`<b>STUCK PIPE</b><br>${effectiveDepth.toFixed(1)}m TVD`] : [''],
 textfont: { color: '#848484', size: 12, family: 'Inter', weight: 'bold'},
 textposition: 'middle right',
 marker: {
 size: markerSize,
 color: markerColor,
 symbol: markerSymbol,
 line: { color: '#FFFFFF', width: 2 }
 },
 showlegend: false,
 hovertemplate: 
 (isStuck ? ' <b>STUCK PIPE</b><br>': ' <b>Live Bit Position</b><br>') +'Depth: <b>%{z:.1f} m</b><br>'+' <extra></extra>'};
 }, [displayedDepth, stuckDepth, activeScenario, plotData]);

 useEffect(() => {
 if (!isOpen || !activeWellId) return;

 const fetchTrajectories = async () => {
 setIsLoading(true);
 setSceneError(null);
 try {
 // 1. Fetch Active Well Trajectory
 let activeTrajectory = null;
 let activeTrajectoryError = null;
 try {
 const activeRes = await axios.get(`${API_BASE}/api/wells/${activeWellId}/trajectory?is_active=true`);
 activeTrajectory = activeRes.data;
 } catch (e) {
 console.error("Failed to load active well trajectory", e);
 const detail = e?.response?.data?.detail;
 activeTrajectoryError = typeof detail === 'string'? detail : (e?.message ||'Request failed');
 }

 // 2. Fetch Offset Wells Trajectories (Scoped to same basin for realistic pad geometry)
 const activeRegion = getRegionIdFromWellId(activeWellId);
 const offsetList = offsetWells.filter(w => {
 if (!w.well_id || w.well_id === activeWellId) return false;
 return getRegionIdFromWellId(w.well_id) === activeRegion;
 });
 
 const offsetPromises = offsetList.map(async (w) => {
 try {
 const offsetRes = await axios.get(`${API_BASE}/api/wells/${w.well_id}/trajectory?is_active=false`);
 return offsetRes.data;
 } catch (e) {
 console.warn(`Could not load offset ${w.well_id}`, e);
 return null;
 }
 });
 const fetchedOffsets = await Promise.all(offsetPromises);
 const loadedOffsets = fetchedOffsets.filter(Boolean);

 // 3. Fetch Anti-Collision Analysis
 let antiCollision = null;
 try {
 const offsetIdsParam = offsetList.map(w => w.well_id).join(',');
 const acRes = await axios.get(`${API_BASE}/api/wells/${activeWellId}/anti-collision?offset_ids=${offsetIdsParam}`);
 antiCollision = acRes.data;
 setAntiCollisionData(antiCollision);
 } catch (e) {
 console.warn("Anti-collision endpoint error, calculating fallback", e);
 }

 rawDataRef.current = {
 activeWell: activeTrajectory,
 offsets: loadedOffsets,
 antiCollision: antiCollision
 };

 // Without the active well trajectory buildPlotTraces() returns early and the
 // modal renders an empty Plot, so this has to be reported rather than swallowed.
 if (!activeTrajectory) {
 setPlotData([]);
 setSceneError(`Could not load the directional survey for ${activeWellId}.`+
 (activeTrajectoryError ?`(${activeTrajectoryError})`: '')
 );
 return;
 }

 buildPlotTraces();
 } catch (error) {
 console.error("Failed to assemble 3D subsurface scene", error);
 setPlotData([]);
 setSceneError(error?.message ||'Unexpected error while assembling the 3D subsurface scene.');
 } finally {
 setIsLoading(false);
 }
 };

 fetchTrajectories();
 }, [isOpen, activeWellId, offsetWells]);

 // Rebuild plot traces whenever toggles change
 useEffect(() => {
 if (rawDataRef.current.activeWell) {
 buildPlotTraces();
 }
 }, [showOffsets, showFormations, showClosestApproach, theme]);

 const buildPlotTraces = () => {
 const { activeWell, offsets, antiCollision } = rawDataRef.current;
 if (!activeWell) return;

 const traces = [];

 // ----------------------------------------------------
 // 1. GROUND SURFACE REFERENCE PLANE at Z = 0 (Issue 4)
 // ----------------------------------------------------
 const planeExtent = 750;
 traces.push({
 type: 'mesh3d',
 name: 'Ground Surface (0m TVD)',
 x: [-planeExtent, planeExtent, planeExtent, -planeExtent],
 y: [-planeExtent, -planeExtent, planeExtent, planeExtent],
 z: [0, 0, 0, 0],
 i: [0, 0],
 j: [1, 2],
 k: [2, 3],
 opacity: 0.12,
 color: '#B1B1B1',
 showlegend: true,
 hoverinfo: 'name'});

 // Surface Grid Boundary line
 traces.push({
 type: 'scatter3d',
 mode: 'lines',
 name: 'Ground Perimeter',
 x: [-planeExtent, planeExtent, planeExtent, -planeExtent, -planeExtent],
 y: [-planeExtent, -planeExtent, planeExtent, planeExtent, -planeExtent],
 z: [0, 0, 0, 0, 0],
 line: { color: '#7D7D7D', width: 2, dash: 'dot'},
 showlegend: false,
 hoverinfo: 'none'});

 // ----------------------------------------------------
 // 2. SURFACE WELLHEAD MARKERS & LABELS (Issue 5)
 // ----------------------------------------------------
 const wellheadXs = [activeWell.surface?.x || 0];
 const wellheadYs = [activeWell.surface?.y || 0];
 const wellheadZs = [0];
 const wellheadTexts = [`Active: ${activeWell.well_id}`];
 const wellheadColors = ['#A6A6A6'];
 const wellheadSizes = [9];

 if (showOffsets) {
 offsets.forEach(off => {
 wellheadXs.push(off.surface?.x || 0);
 wellheadYs.push(off.surface?.y || 0);
 wellheadZs.push(0);
 wellheadTexts.push(off.well_id);
 wellheadColors.push('#A2A2A2');
 wellheadSizes.push(6);
 });
 }

 traces.push({
 type: 'scatter3d',
 mode: 'markers+text',
 name: 'Surface Wellheads',
 x: wellheadXs,
 y: wellheadYs,
 z: wellheadZs,
 text: wellheadTexts,
 textposition: 'top center',
 textfont: { color: '#E7E7E7', size: 11, family: 'Inter, sans-serif'},
 marker: {
 size: wellheadSizes,
 color: wellheadColors,
 symbol: 'diamond',
 line: { color: '#171717', width: 1.5 }
 },
 showlegend: true,
 hoverinfo: 'text'});

 // ----------------------------------------------------
 // 3. ACTIVE WELL TRAJECTORY WITH RISK GRADIENT (Issue 6 & 7)
 // ----------------------------------------------------
 const actTraj = activeWell.trajectory;
 const activeCustomData = actTraj.md.map((md, i) => [
 md,
 actTraj.z[i],
 actTraj.inclination[i],
 actTraj.azimuth[i],
 actTraj.risk_scores ? actTraj.risk_scores[i] : 0.2
 ]);

 traces.push({
 type: 'scatter3d',
 mode: 'lines+markers',
 name:`Active: ${activeWell.well_id}`,
 x: actTraj.x,
 y: actTraj.y,
 z: actTraj.z,
 text: actTraj.z.map(() =>`Active: ${activeWell.well_id}`),
 customdata: activeCustomData,
 hovertemplate: ' <b>%{text}</b><br>'+'Measured Depth (MD): <b>%{customdata[0]:.1f} m</b><br>'+'True Vertical Depth (TVD): <b>%{customdata[1]:.1f} m</b><br>'+'Inclination: <b>%{customdata[2]:.1f}°</b> | Azimuth: <b>%{customdata[3]:.1f}°</b><br>'+'ML Hazard Risk: <b>%{customdata[4]:.2f}</b><extra></extra>',
 line: {
 width: 7,
 color: '#B1B1B1'},
 marker: {
 size: 3.5,
 color: actTraj.risk_scores || actTraj.z.map(() => 0.2),
 cmin: 0.0,
 cmax: 1.0,
 colorscale: [
 // Tonal risk ramp: hue is gone, so severity is carried by brightness —
 // dim is safe, bright is severe. The bands were previously green/cyan/amber/red.
 [0.0,'#ACACAC'], // low risk
 [0.35,'#B1B1B1'],
 [0.65,'#B1B1B1'],
 [1.0,'#848484'] // high risk / kick or overpressure
 ],
 showscale: true,
 colorbar: {
 title: {
 text: 'ML Hazard<br>Risk Score',
 font: { color: '#D4D4D4', size: 11, family: 'Inter'}
 },
 tickvals: [0.1, 0.5, 0.9],
 ticktext: ['Low (Safe)','Moderate','Critical Hazard'],
 tickfont: { color: '#A2A2A2', size: 10 },
 len: 0.45,
 y: 0.5,
 thickness: 14,
 outlinecolor: '#404040'}
 }
 });

 // ----------------------------------------------------
 // 4. FORMATION TOPS ALONG TRAJECTORY (Issue 2)
 // ----------------------------------------------------
 if (showFormations && activeWell.formation_tops && activeWell.formation_tops.length > 0) {
 const formXs = [];
 const formYs = [];
 const formZs = [];
 const formTexts = [];
 const formColors = [];
 const formCustomData = [];

 activeWell.formation_tops.forEach(f => {
 formXs.push(f.x);
 formYs.push(f.y);
 formZs.push(f.z);
 formTexts.push(f.name);
 formColors.push(f.color);
 formCustomData.push([f.name, f.tvd, f.md, f.description]);

 // Small geological horizon ring around active trajectory at formation boundary
 const ringRadius = 110;
 const ringPts = 24;
 const rX = [];
 const rY = [];
 const rZ = [];
 for (let step = 0; step <= ringPts; step++) {
 const theta = (step / ringPts) * 2 * Math.PI;
 rX.push(f.x + ringRadius * Math.cos(theta));
 rY.push(f.y + ringRadius * Math.sin(theta));
 rZ.push(f.z);
 }
 traces.push({
 type: 'scatter3d',
 mode: 'lines',
 name:`${f.name} Horizon`,
 x: rX,
 y: rY,
 z: rZ,
 line: { color: f.color, width: 3, dash: 'dash'},
 opacity: 0.65,
 showlegend: false,
 hoverinfo: 'none'});
 });

 traces.push({
 type: 'scatter3d',
 mode: 'markers+text',
 name: 'Formation Tops',
 x: formXs,
 y: formYs,
 z: formZs,
 text: formTexts.map(name =>`▲ Top ${name}`),
 textposition: 'middle right',
 textfont: { color: '#FAFAFA', size: 11, family: 'Inter, sans-serif'},
 customdata: formCustomData,
 hovertemplate: ' <b>Stratigraphic Formation Top</b><br>'+'Formation: <b>%{customdata[0]}</b><br>'+'Depth TVD: <b>%{customdata[1]:.1f} m</b> (MD: %{customdata[2]:.1f} m)<br>'+'Geology Note: <i>%{customdata[3]}</i><extra></extra>',
 marker: {
 size: 8,
 color: formColors,
 symbol: 'circle',
 line: { color: '#FFFFFF', width: 2 }
 },
 showlegend: true
 });
 }

 // ----------------------------------------------------
 // 5. OFFSET WELL TRAJECTORIES (FANNING OUT) (Issue 1 & 10)
 // ----------------------------------------------------
 if (showOffsets) {
 offsets.forEach(off => {
 const oTraj = off.trajectory;
 const offsetCustom = oTraj.md.map((md, i) => [
 md,
 oTraj.z[i],
 oTraj.inclination[i],
 oTraj.azimuth[i]
 ]);

 traces.push({
 type: 'scatter3d',
 mode: 'lines',
 name:`Offset: ${off.well_id}`,
 x: oTraj.x,
 y: oTraj.y,
 z: oTraj.z,
 text: oTraj.z.map(() =>`Offset: ${off.well_id}`),
 customdata: offsetCustom,
 hovertemplate: ' <b>%{text}</b><br>'+'MD: <b>%{customdata[0]:.1f} m</b> | TVD: <b>%{customdata[1]:.1f} m</b><br>'+'Inc: <b>%{customdata[2]:.1f}°</b> | Az: <b>%{customdata[3]:.1f}°</b><extra></extra>',
 line: { width: 3.5, color: '#737373'},
 opacity: 0.75,
 showlegend: true
 });
 });
 }

 // ----------------------------------------------------
 // 6. ANTI-COLLISION CLOSEST APPROACH CONNECTOR (Issue 3 & 8)
 // ----------------------------------------------------
 if (showClosestApproach && antiCollision && antiCollision.closest_approach) {
 const ca = antiCollision.closest_approach;
 const actPt = ca.active_point;
 const offPt = ca.offset_point;
 const isAlert = ca.min_distance_m < 60;
 const isCaution = ca.min_distance_m < 120;
 const highlightColor = isAlert ? '#848484': (isCaution ? '#B1B1B1': '#A3A3A3');

 // 3D Connector Segment
 traces.push({
 type: 'scatter3d',
 mode: 'lines+markers+text',
 name:`Min Separation (${ca.min_distance_m}m)`,
 x: [actPt.x, offPt.x],
 y: [actPt.y, offPt.y],
 z: [actPt.z, offPt.z],
 line: {
 color: highlightColor,
 width: 6,
 dash: 'solid'},
 marker: {
 size: 7,
 color: highlightColor,
 symbol: 'diamond',
 line: { color: '#FFFFFF', width: 1.5 }
 },
 text: ['',`${ca.min_distance_m}m to ${ca.offset_well_id}`],
 textposition: 'top right',
 textfont: {
 color: highlightColor,
 size: 12,
 family: 'Inter, sans-serif'},
 hovertemplate: ' <b>Subsurface Closest Approach</b><br>'+'Active MD: <b>'+ actPt.md.toFixed(1) +'m</b> (TVD: '+ actPt.tvd.toFixed(1) +'m)<br>'+'Offset MD: <b>'+ offPt.md.toFixed(1) +'m</b> ('+ ca.offset_well_id +')<br>'+'3D Minimum Distance: <b>'+ ca.min_distance_m +'m</b><br>'+'Collision Hazard Status: <b>'+ ca.status +' </b><extra></extra>',
 showlegend: true
 });
 }

 // ----------------------------------------------------
 // 7. REALISTIC GEOLOGY LAYER SLABS (Realistic Geology Theme)
 // ----------------------------------------------------
 if (theme === 'geo') {
 const allXs = [];
 const allYs = [];
 if (activeWell?.trajectory?.x) {
 allXs.push(...activeWell.trajectory.x);
 allYs.push(...activeWell.trajectory.y);
 }
 offsets.forEach(off => {
 if (off?.trajectory?.x) {
 allXs.push(...off.trajectory.x);
 allYs.push(...off.trajectory.y);
 }
 });

 let minX = -1000, maxX = 1000, minY = -1000, maxY = 1000;
 if (allXs.length > 0 && allYs.length > 0) {
 const pad = 500;
 const rMinX = Math.min(...allXs) - pad;
 const rMaxX = Math.max(...allXs) + pad;
 const rMinY = Math.min(...allYs) - pad;
 const rMaxY = Math.max(...allYs) + pad;
 const maxSpan = Math.max(rMaxX - rMinX, rMaxY - rMinY, 1600);
 const midX = (rMinX + rMaxX) / 2;
 const midY = (rMinY + rMaxY) / 2;
 const halfSpan = maxSpan / 2;
 minX = Math.round(midX - halfSpan);
 maxX = Math.round(midX + halfSpan);
 minY = Math.round(midY - halfSpan);
 maxY = Math.round(midY + halfSpan);
 }

 const maxWellTVD = activeWell?.tvd_max || 3500;
 const regionGeoLayers = getRegionalGeoLayers(activeWellId, selectedRegion);
 const layers = regionGeoLayers.map(l => {
 if (l.to === 5000 && maxWellTVD > 5000) {
 return { ...l, to: maxWellTVD + 500 };
 }
 return l;
 });

 // 1. Mesh3d Slabs
 layers.forEach(layer => {
 const z0 = layer.from;
 const z1 = layer.to;
 traces.push({
 type: 'mesh3d',
 name: layer.label,
 x: [minX, maxX, maxX, minX, minX, maxX, maxX, minX],
 y: [minY, minY, maxY, maxY, minY, minY, maxY, maxY],
 z: [z0, z0, z0, z0, z1, z1, z1, z1],
 i: [0, 0, 4, 4, 0, 0, 3, 3, 0, 0, 1, 1],
 j: [1, 2, 5, 6, 1, 5, 2, 6, 3, 7, 2, 6],
 k: [2, 3, 6, 7, 5, 4, 6, 7, 7, 4, 6, 5],
 opacity: 0.35,
 color: layer.color,
 showlegend: false,
 hoverinfo: 'skip'});
 });

 // 2. Staggered Geological Stratum Annotations along the slab perimeter
 // Staggered Z-offset and repositioned along the outer boundary so they don't stack on each other or wellhead/borehole
 const labelX = [];
 const labelY = [];
 const labelZ = [];
 const labelTexts = [];
 layers.forEach((layer, idx) => {
 const midDepth = (layer.from + layer.to) / 2;
 const staggerX = (idx % 2 === 0 ? 0 : 70);
 labelX.push(minX + 90 + staggerX);
 labelY.push(maxY - 90 - staggerX);
 labelZ.push(midDepth);
 labelTexts.push(`Stratum: ${layer.label} (${layer.from}–${layer.to}m)`);
 });

 traces.push({
 type: 'scatter3d',
 mode: 'text',
 name: 'Geology Layer Annotations',
 x: labelX,
 y: labelY,
 z: labelZ,
 text: labelTexts,
 textposition: 'middle right',
 textfont: {
 color: '#292929',
 size: 11,
 family: 'Inter, sans-serif'},
 showlegend: false,
 hoverinfo: 'skip'});

 // 3. Oil Reservoir Visualization at the Terminal Depth of Each Well (only in geo theme)
 if (activeWell?.trajectory?.x?.length > 0) {
 const actLen = activeWell.trajectory.x.length;
 const actX = activeWell.trajectory.x[actLen - 1];
 const actY = activeWell.trajectory.y[actLen - 1];
 const actZ = activeWell.trajectory.z[actLen - 1];

 // Prominent reservoir lens for active well: amber glow halo + dark oil pool
 traces.push(createReservoirLensMesh(actX, actY, actZ, 95, 80, 22,'#909090', 0.28,'Active Reservoir Halo'));
 traces.push(createReservoirLensMesh(actX, actY, actZ, 80, 68, 18,'#1a1a1a', 0.76,'Active Reservoir Pool'));

 // Staggered non-overlapping text label for active reservoir target
 traces.push({
 type: 'scatter3d',
 mode: 'text',
 name: 'Active Reservoir Target',
 x: [actX],
 y: [actY],
 z: [actZ + 36],
 text: ['Reservoir Target'],
 textposition: 'bottom center',
 textfont: {
 color: '#494949',
 size: 11,
 family: 'Inter, sans-serif'},
 showlegend: false,
 hoverinfo: 'skip'});
 }

 // Field-wide reservoirs for offset wells (when"Offset Wells"checkbox is on)
 if (showOffsets && offsets && offsets.length > 0) {
 const offResX = [];
 const offResY = [];
 const offResZ = [];
 const offResTexts = [];

 offsets.forEach(off => {
 if (!off?.trajectory?.x || off.trajectory.x.length === 0) return;
 const oLen = off.trajectory.x.length;
 const oX = off.trajectory.x[oLen - 1];
 const oY = off.trajectory.y[oLen - 1];
 const oZ = off.trajectory.z[oLen - 1];

 // Smaller reservoir lens for offset wells
 traces.push(createReservoirLensMesh(oX, oY, oZ, 60, 52, 16,'#909090', 0.22,`${off.well_id} Reservoir Halo`));
 traces.push(createReservoirLensMesh(oX, oY, oZ, 50, 44, 13,'#1a1a1a', 0.74,`${off.well_id} Reservoir Pool`));

 offResX.push(oX);
 offResY.push(oY);
 offResZ.push(oZ + 28);
 offResTexts.push('Pay Zone');
 });

 if (offResX.length > 0) {
 traces.push({
 type: 'scatter3d',
 mode: 'text',
 name: 'Offset Reservoir Annotations',
 x: offResX,
 y: offResY,
 z: offResZ,
 text: offResTexts,
 textposition: 'bottom center',
 textfont: {
 color: '#585858',
 size: 9,
 family: 'Inter, sans-serif'},
 showlegend: false,
 hoverinfo: 'skip'});
 }
 }
 }

 setPlotData(traces);
 };

 // Camera control presets (Issue 9)
 const setCameraView = (type) => {
 let newCam = {
 eye: { x: 1.5, y: 1.5, z: 0.5 },
 center: { x: 0, y: 0, z: -0.15 },
 up: { x: 0, y: 0, z: 1 }
 };

 if (type === 'plan') {
 // Top-down looking straight down
 newCam = {
 eye: { x: 0, y: 0.001, z: 2.4 },
 center: { x: 0, y: 0, z: 0 },
 up: { x: 0, y: 1, z: 0 }
 };
 } else if (type === 'section-ew') {
 // Looking North (viewing East-West drift)
 newCam = {
 eye: { x: 0, y: 2.4, z: 0.05 },
 center: { x: 0, y: 0, z: -0.2 },
 up: { x: 0, y: 0, z: 1 }
 };
 } else if (type === 'section-ns') {
 // Looking East (viewing North-South drift)
 newCam = {
 eye: { x: 2.4, y: 0, z: 0.05 },
 center: { x: 0, y: 0, z: -0.2 },
 up: { x: 0, y: 0, z: 1 }
 };
 }

 userCameraRef.current = newCam;
 setCurrentCamera(newCam);
 setCameraRevision(prev => prev + 1);
 };

 // Memoize the Plotly layout with constant uirevision to preserve user rotation/zoom during streaming
 const plotLayout = React.useMemo(() => {
 return {
 colorway: MONO_COLORWAY,
 autosize: true,
 margin: { l: 0, r: 0, b: 0, t: 0 },
 paper_bgcolor: theme === 'geo'? '#E9E9E9': 'transparent',
 plot_bgcolor: theme === 'geo'? '#E9E9E9': 'transparent',
 uirevision: 'subsurface_3d_user_revision', // Constant uirevision keeps user's rotation, zoom, & pan stable across data updates
 scene: {
 xaxis: { 
 title: 'East (m)', 
 gridcolor: isGeo ? '#545454': '#404040', 
 zerolinecolor: isGeo ? '#404040': '#545454', 
 color: isGeo ? '#171717': '#A2A2A2',
 backgroundcolor: isGeo ? '#E9E9E9': 'transparent',
 showbackground: isGeo,
 range: isGeo && geoBounds ? [geoBounds.minX, geoBounds.maxX] : undefined
 },
 yaxis: { 
 title: 'North (m)', 
 gridcolor: isGeo ? '#545454': '#404040', 
 zerolinecolor: isGeo ? '#404040': '#545454', 
 color: isGeo ? '#171717': '#A2A2A2',
 backgroundcolor: isGeo ? '#E9E9E9': 'transparent',
 showbackground: isGeo,
 range: isGeo && geoBounds ? [geoBounds.minY, geoBounds.maxY] : undefined
 },
 zaxis: { 
 title: 'TVD Depth (m)', 
 autorange: 'reversed', 
 gridcolor: isGeo ? '#545454': '#404040', 
 zerolinecolor: isGeo ? '#404040': '#545454', 
 color: isGeo ? '#171717': '#A2A2A2',
 backgroundcolor: isGeo ? '#E9E9E9': 'transparent',
 showbackground: isGeo
 },
 aspectmode: isGeo ? 'manual': undefined,
 aspectratio: isGeo ? { x: 1.6, y: 1.6, z: 1.2 } : { x: 1, y: 1, z: 1.6 },
 camera: userCameraRef.current || (isGeo
 ? { eye: { x: 1.9, y: 1.9, z: 0.9 }, center: { x: 0, y: 0, z: 0 } }
 : currentCamera)
 },
 showlegend: true,
 legend: { 
 font: { color: '#D4D4D4', size: 10, family: 'Inter'}, 
 bgcolor: 'rgba(23, 23, 23, 0.75)',
 bordercolor: '#404040',
 borderwidth: 1,
 x: 0.01,
 y: 0.98,
 itemclick: 'toggle',
 itemdoubleclick: 'toggleothers'}
 };
 }, [theme, isGeo, geoBounds, cameraRevision]);

 if (!isOpen) return null;

 const ca = antiCollisionData?.closest_approach;

 return (
 <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md animate-in fade-in p-1 sm:p-4">
 <div className="bg-slate-900 border border-slate-700/80 w-full max-w-7xl h-[96vh] sm:h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
 
 {/* Header Bar with Controls */}
 <div className="flex flex-wrap justify-between items-center px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-slate-800 bg-slate-900/90 gap-2">
 <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
 <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 shrink-0">
 <Compass size={18} />
 </div>
 <div className="min-w-0">
 <h2 className="text-sm sm:text-base font-bold text-slate-100 flex flex-wrap items-center gap-1.5 sm:gap-2">
 <span>3D Directional Wellbore</span>
 <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono font-medium">
 {activeWellId}
 </span>
 <SourceTag source={activeWellId} compact={true} />
 </h2>
 <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
 Directional anti-collision monitoring with ML hazard score & stratigraphic tops
 </p>
 </div>
 </div>

 {/* Anti-collision Quick Badge */}
 {ca && (
 <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
 ca.status === 'CRITICAL'? 'bg-red-500/15 border-red-500/40 text-red-300 animate-pulse': ca.status === 'CAUTION'? 'bg-amber-500/15 border-amber-500/40 text-amber-300': 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'}`}>
 {ca.status === 'CRITICAL'? <ShieldAlert size={14} /> : <AlertTriangle size={14} />}
 <span><b>{ca.min_distance_m}m</b> to {ca.offset_well_id}</span>
 <span className="opacity-75">({ca.status})</span>
 </div>
 )}

 {/* Action & Close Controls */}
 <div className="flex items-center space-x-2">
 <button
 onClick={() => setTheme(t => t === 'dark'? 'geo': 'dark')}
 className="text-xs px-2.5 py-1.5 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800">
 {theme === 'dark'? 'Realistic': 'Dark'}
 </button>
 <button 
 onClick={onClose} 
 className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center" title="Close 3D View">
 <X size={20} />
 </button>
 </div>
 </div>

 {/* Secondary Toolbar: Camera & Layer Toggles */}
 <div className="flex items-center justify-between px-3 sm:px-6 py-2 bg-slate-950 border-b border-slate-800/80 text-xs text-slate-300 gap-2 overflow-x-auto max-w-full">
 {/* View Presets */}
 <div className="flex items-center space-x-1.5">
 <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
 <Maximize2 size={13} /> Camera:
 </span>
 <button 
 onClick={() => setCameraView('default')}
 className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors">
 <RefreshCw size={12} /> Reset 3D
 </button>
 <button 
 onClick={() => setCameraView('plan')}
 className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors">
 Plan (Top-Down)
 </button>
 <button 
 onClick={() => setCameraView('section-ew')}
 className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors">
 Section (E-W)
 </button>
 <button 
 onClick={() => setCameraView('section-ns')}
 className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors">
 Section (N-S)
 </button>
 </div>

 {/* Feature Toggles */}
 <div className="flex items-center space-x-3">
 <label className="flex items-center space-x-1.5 cursor-pointer select-none hover:text-white">
 <input 
 type="checkbox" checked={showOffsets} 
 onChange={(e) => setShowOffsets(e.target.checked)}
 className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 w-3.5 h-3.5"/>
 <span>Offset Wells ({offsetWells.filter(w => w.well_id !== activeWellId).length})</span>
 </label>

 <label className="flex items-center space-x-1.5 cursor-pointer select-none hover:text-white">
 <input 
 type="checkbox" checked={showFormations} 
 onChange={(e) => setShowFormations(e.target.checked)}
 className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 w-3.5 h-3.5"/>
 <span>Formation Tops</span>
 </label>

 <label className="flex items-center space-x-1.5 cursor-pointer select-none hover:text-white">
 <input 
 type="checkbox" checked={showClosestApproach} 
 onChange={(e) => setShowClosestApproach(e.target.checked)}
 className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 w-3.5 h-3.5"/>
 <span>Closest Approach Line</span>
 </label>
 </div>
 </div>

 {/* 3D Canvas Area */}
 <div 
 className={`flex-1 relative overflow-hidden ${theme === 'geo'? 'bg-[#E9E9E9]': 'bg-slate-950'}`}
 onMouseDown={handleMouseDown}
 >
 {/* Regional Hazard Card */}
 <div className="absolute top-4 left-4 z-20 w-72 glass-panel border border-slate-700/80 p-3 rounded-xl shadow-2xl bg-slate-900/85 backdrop-blur-md">
 <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
 <div className="flex items-center space-x-1.5">
 <Layers size={15} className="text-amber-400"/>
 <h3 className="font-bold text-xs text-white uppercase tracking-wider">{REGIONS_CONFIG[selectedRegion ||'Assam']?.name ||'Region'} Geo-Hazards</h3>
 </div>
 <SourceTag source={activeWellId} compact={true} />
 </div>
 <ul className="space-y-1.5 text-[10px] font-mono text-slate-300">
 {(REGIONS_CONFIG[selectedRegion ||'Assam']?.hazards || []).map((h, i) => (
 <li key={i} className="flex items-start space-x-1.5">
 <AlertTriangle size={12} className="text-rose-400 shrink-0 mt-0.5"/>
 <span>{h}</span>
 </li>
 ))}
 </ul>
 </div>

 {isLoading ? (
 <div className={`absolute inset-0 flex flex-col items-center justify-center text-slate-400 z-10 ${theme === 'geo'? 'bg-[#E9E9E9]/90': 'bg-slate-950/90'}`}>
 <Loader2 size={36} className="animate-spin mb-3 text-cyan-400"/>
 <p className="text-sm font-medium">Computing 3D Directional Trajectories & Anti-Collision Vectors...</p>
 <p className="text-xs text-slate-400 mt-1">Calculating minimum 3D Euclidean distances across subsurface depths</p>
 </div>
 ) : sceneError ? (
 <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 text-center z-10 ${theme === 'geo'? 'bg-[#E9E9E9]/95': 'bg-slate-950/95'}`}>
 <ShieldAlert size={36} className="mb-3 text-rose-400"/>
 <p className="text-sm font-semibold text-rose-300">3D subsurface scene could not be assembled</p>
 <p className="text-xs text-slate-400 mt-1.5 max-w-lg break-words">{sceneError}</p>
 <p className="text-[11px] text-slate-500 mt-2.5">
 No trajectory is being displayed. Do not treat this view as an anti-collision clearance.
 </p>
 </div>
 ) : (
 <Plot
 data={liveBitTrace ? [...plotData, liveBitTrace] : plotData}
 layout={plotLayout}
 onRelayout={handleRelayout}
 useResizeHandler={true}
 style={{ width: '100%', height: '100%'}}
 config={{
 responsive: true,
 displayModeBar: true,
 displaylogo: false,
 modeBarButtonsToRemove: ['toImage','sendDataToCloud']
 }}
 />
 )}
 </div>

 {/* Footer Legend Bar */}
 <div className="px-6 py-2 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400">
 <div className="flex items-center space-x-4">
 <div className="flex items-center gap-1.5">
 <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
 <span>Active Well Tube</span>
 </div>
 <div className="flex items-center gap-1.5">
 <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
 <span>Offset Trajectories</span>
 </div>
 {getRegionalGeoLayers(selectedRegion ||'Assam').slice(1, 4).map((layer, idx) => (
 <div key={idx} className="flex items-center gap-1.5">
 <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: layer.color }}></span>
 <span>{layer.label}</span>
 </div>
 ))}
 </div>
 <div className="text-slate-400">
 Rotate: <span className="text-slate-300">Left-Click + Drag</span> | Pan: <span className="text-slate-300">Right-Click + Drag</span> | Zoom: <span className="text-slate-300">Scroll</span>
 </div>
 </div>
 </div>
 </div>
 );
};

export default Trajectory3DViewer;
