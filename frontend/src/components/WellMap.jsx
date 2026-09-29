import React, { useState, useEffect, useMemo, useRef, useCallback } from'react';
import { Target, Box, ChevronDown, ChevronUp, Moon, Globe, Mountain, Compass, MapPin, AlertCircle, ShieldCheck, Radar, Radio, X } from'lucide-react';
import Map, { Marker, NavigationControl, Source, Layer, Popup } from'react-map-gl/maplibre';
import * as maplibregl from'maplibre-gl';
import axios from'axios';
import { API_BASE } from'../lib/api';
import'maplibre-gl/dist/maplibre-gl.css';
import Trajectory3DViewer from'./Trajectory3DViewer';
import SourceTag from'./SourceTag';
import { REGIONS_CONFIG, getRegionIdFromWellId } from'../lib/regionalGeology';
import defaultWells from'../data/defaultWells.json';

function filterWellsByRegion(allWells, region) {
 if (!Array.isArray(allWells) || allWells.length === 0) return [];
 if (!region || region === 'all') return allWells;
 return allWells.filter(w => {
 const wellId = w.well_id ||'';
 const reg = getRegionIdFromWellId(wellId);
 if (reg === region) return true;
 const field = (w.field_name ||'').toUpperCase();
 if (region === 'north_sea') {
 return field.includes('NORTH SEA') || field.includes('VOLVE') || /^\d+\/\d+/.test(wellId);
 }
 if (region === 'rajasthan') {
 return wellId.startsWith('OIL-RAJ-') || field.includes('RAJASTHAN');
 }
 if (region === 'kg') {
 return wellId.startsWith('OIL-KG-') || field.includes('KG');
 }
 if (region === 'mizoram') {
 return wellId.startsWith('OIL-MZ-') || field.includes('MIZORAM');
 }
 if (region === 'assam') {
 return reg === 'assam'&& !field.includes('NORTH SEA') && !field.includes('VOLVE') && !/^\d+\/\d+/.test(wellId);
 }
 return false;
 });
}

function getInitialWells(region ='all') {
 try {
 const cached = localStorage.getItem('agate_cached_wells_v2');
 if (cached) {
 const parsed = JSON.parse(cached);
 if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0]?.target_formation || parsed[0]?.surface_location)) {
 const filtered = filterWellsByRegion(parsed, region);
 if (filtered.length > 0) return filtered;
 }
 }
 } catch (e) {
 console.warn("Could not read wells from localStorage", e);
 }
 return filterWellsByRegion(defaultWells, region);
}

function createGeoJSONCircle(center, radiusInKm, points = 64) {
 const coords = { latitude: center[1], longitude: center[0] };
 const km = radiusInKm;
 const ret = [];
 const distanceX = km / (111.320 * Math.cos(coords.latitude * Math.PI / 180));
 const distanceY = km / 110.574;

 for (let i = 0; i < points; i++) {
 const theta = (i / points) * (2 * Math.PI);
 const x = distanceX * Math.cos(theta);
 const y = distanceY * Math.sin(theta);
 ret.push([coords.longitude + x, coords.latitude + y]);
 }
 ret.push(ret[0]); // Close polygon

 return {
 type: "FeatureCollection",
 features: [{
 type: "Feature",
 geometry: {
 type: "Polygon",
 coordinates: [ret]
 }
 }]
 };
}

function getCircleBoundingBox(center, radiusInKm) {
 const coords = { latitude: center[1], longitude: center[0] };
 const km = radiusInKm;
 const distanceX = km / (111.320 * Math.cos(coords.latitude * Math.PI / 180));
 const distanceY = km / 110.574;
 return [
 [coords.longitude - distanceX, coords.latitude - distanceY],
 [coords.longitude + distanceX, coords.latitude + distanceY]
 ];
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
 if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return Infinity;
 const R = 6371; // Earth radius in km
 const dLat = (lat2 - lat1) * Math.PI / 180;
 const dLon = (lon2 - lon1) * Math.PI / 180;
 const a = 
 Math.sin(dLat / 2) * Math.sin(dLat / 2) +
 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
 Math.sin(dLon / 2) * Math.sin(dLon / 2);
 const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
 return R * c;
}

const osmStyle ="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const satelliteStyle = {
 version: 8,
 sources: {'esri-satellite': {
 type: 'raster',
 tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
 tileSize: 256,
 attribution: 'Esri, Maxar, Earthstar Geographics'}
 },
 layers: [{ id: 'esri-satellite-layer', type: 'raster', source: 'esri-satellite', minzoom: 0, maxzoom: 19 }]
};

const terrainStyle = {
 version: 8,
 sources: {'opentopo': {
 type: 'raster',
 tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png','https://b.tile.opentopomap.org/{z}/{x}/{y}.png','https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],
 tileSize: 256,
 attribution: 'OpenTopoMap (CC-BY-SA)'}
 },
 layers: [{ id: 'opentopo-layer', type: 'raster', source: 'opentopo', minzoom: 0, maxzoom: 17 }]
};

const tacticalGridStyle = {
 version: 8,
 name: 'Tactical Edge Grid',
 sources: {},
 layers: [
 {
 id: 'background',
 type: 'background',
 paint: {'background-color': '#070b14'}
 }
 ]
};

export const BASEMAP_STORAGE_KEY ='agate_basemap_style';

export const BASEMAP_OPTIONS = [
 { id: 'dark', label: 'Dark', icon: Moon },
 { id: 'satellite', label: 'Satellite', icon: Globe },
 { id: 'terrain', label: 'Terrain', icon: Mountain },
 { id: 'edge_grid', label: 'Edge Grid', icon: Radar }
];

const REGION_THEME = {
 assam: {
 color: '#10B981',
 border: 'border-emerald-400',
 bg: 'bg-emerald-500',
 glow: 'shadow-[0_0_12px_rgba(16,185,129,0.7)]',
 label: 'Assam'},
 rajasthan: {
 color: '#F59E0B',
 border: 'border-amber-400',
 bg: 'bg-amber-500',
 glow: 'shadow-[0_0_12px_rgba(245,158,11,0.7)]',
 label: 'Rajasthan'},
 kg: {
 color: '#0284C7',
 border: 'border-sky-400',
 bg: 'bg-sky-500',
 glow: 'shadow-[0_0_12px_rgba(2,132,199,0.7)]',
 label: 'KG Deepwater'},
 mizoram: {
 color: '#8B5CF6',
 border: 'border-purple-400',
 bg: 'bg-purple-500',
 glow: 'shadow-[0_0_12px_rgba(139,92,246,0.7)]',
 label: 'Mizoram'}
};

export default function WellMap({ 
 activeWellId, 
 onSelectWell, 
 selectedRegion ='all',
 onSelectRegion,
 currentDepth, 
 activeScenario,
 is3DViewerOpen: external3DOpen,
 setIs3DViewerOpen: setExternal3DOpen,
 basemapStyle: externalBasemapStyle,
 onBasemapChange: externalOnBasemapChange
}) {
 const mapRef = useRef(null);
 const initialConfig = REGIONS_CONFIG[selectedRegion] || REGIONS_CONFIG.assam;

 const [viewState, setViewState] = useState({
 longitude: initialConfig.center[1],
 latitude: initialConfig.center[0],
 zoom: initialConfig.zoom || 8,
 pitch: 25
 });

 const [internalBasemapStyle, setInternalBasemapStyle] = useState(() => {
 try {
 const saved = localStorage.getItem(BASEMAP_STORAGE_KEY);
 if (saved && ['dark','satellite','terrain'].includes(saved)) {
 return saved;
 }
 } catch (e) {
 console.warn("Could not read basemapStyle from localStorage", e);
 }
 return'satellite';
 });

 const basemapStyle = externalBasemapStyle !== undefined ? externalBasemapStyle : internalBasemapStyle;

 const [wells, setWells] = useState(() => getInitialWells(selectedRegion));
 const [radius, setRadius] = useState(50);
 const [isCollapsed, setIsCollapsed] = useState(false);
 const [position, setPosition] = useState({ x: 24, y: 150 });
 const [isDragging, setIsDragging] = useState(false);
 const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
 const [internal3DOpen, setInternal3DOpen] = useState(false);
 const is3DViewerOpen = external3DOpen !== undefined ? external3DOpen : internal3DOpen;
 const setIs3DViewerOpen = setExternal3DOpen || setInternal3DOpen;

 const [popupWell, setPopupWell] = useState(null);

 const [searchCoords, setSearchCoords] = useState({ 
 lat: initialConfig.center[0], 
 lon: initialConfig.center[1] 
 });

 // 1. Fetch nearby/regional wells whenever region or search parameters change
 useEffect(() => {
 // Immediately display cached/preloaded wells for zero-latency initial render
 const instantWells = getInitialWells(selectedRegion);
 if (instantWells && instantWells.length > 0) {
 setWells(instantWells);
 }

 const fetchWells = async () => {
 const active = instantWells.find(w => w.well_id === activeWellId);
 const centerLat = active?.surface_location?.lat ?? searchCoords.lat;
 const centerLon = active?.surface_location?.lon ?? searchCoords.lon;

 const runClientFilter = () => {
 const allLoaded = getInitialWells(selectedRegion);
 // Keep all loaded regional wells so the entire basin portfolio remains visible on the map,
 // while wellsWithDistance evaluates isInsideRadius for highlighting in-radius offsets.
 setWells(allLoaded);
 };

 // If offline, bypass network call immediately
 if (typeof navigator !== 'undefined'&& !navigator.onLine) {
 runClientFilter();
 return;
 }

 try {
 const params = {
 region: selectedRegion ||'all'};
 if (selectedRegion && selectedRegion !== 'all') {
 params.lat = centerLat;
 params.lon = centerLon;
 // Provide a generous radius so the full regional portfolio is available on the interactive canvas
 params.radius_km = selectedRegion === 'north_sea'? 800 : 400;
 } else {
 params.radius_km = 3000; // Return all across India and North Sea
 }
 const response = await axios.get(`${API_BASE}/api/wells/nearby`, { params, timeout: 2500 });
 if (response.data && Array.isArray(response.data) && response.data.length > 0) {
 setWells(response.data);
 if (selectedRegion === 'all'|| !selectedRegion) {
 try {
 localStorage.setItem('agate_cached_wells_v2', JSON.stringify(response.data));
 } catch (e) {
 // ignore quota errors
 }
 }
 }
 } catch (err) {
 console.warn("Using offline client-side wells for region: ", err?.message);
 runClientFilter();
 }
 };
 fetchWells();
 }, [selectedRegion, searchCoords.lat, searchCoords.lon, radius, activeWellId]);

 // Center map helper: smoothly animates and centers camera on a target well
 const centerOnWell = useCallback((wellOrId, customZoom = 11) => {
 if (!wellOrId) return;

 const targetId = typeof wellOrId === 'string'? wellOrId : wellOrId.well_id;
 const wellObj = typeof wellOrId === 'object'? wellOrId : wells.find(w => w.well_id === targetId);

 const doFly = (lon, lat) => {
 const targetZoom = Math.max(customZoom, 10.5);
 const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
 if (map && map.flyTo) {
 map.flyTo({
 center: [lon, lat],
 zoom: targetZoom,
 duration: 1000,
 essential: true
 });
 }
 setViewState(prev => ({
 ...prev,
 latitude: lat,
 longitude: lon,
 zoom: targetZoom
 }));
 setSearchCoords({ lat, lon });
 };

 if (wellObj?.surface_location) {
 const { lat, lon } = wellObj.surface_location;
 if (lat !== undefined && lon !== undefined) {
 doFly(lon, lat);
 return;
 }
 }

 // Fallback: if not yet in local wells array, use regional calibrated center coordinates
 const regKey = getRegionIdFromWellId(targetId);
 const regConfig = REGIONS_CONFIG[regKey];
 if (regConfig?.center) {
 doFly(regConfig.center[1], regConfig.center[0], 9.5);
 }
 }, [wells]);

 // 2. Synchronize search radius & fallback camera when region changes
 useEffect(() => {
 const config = REGIONS_CONFIG[selectedRegion] || REGIONS_CONFIG.all;
 if (config) {
 const targetLat = config.center[0];
 const targetLon = config.center[1];
 const targetZoom = config.zoom || 8;

 setRadius(selectedRegion === 'all'? 1200 : (selectedRegion === 'north_sea'? 80 : 40));

 // If active well already belongs to this region, let centerOnWell handle camera
 const activeWellRegion = getRegionIdFromWellId(activeWellId);
 const wellBelongsToRegion = activeWellRegion === selectedRegion;
 
 if (!activeWellId || !wellBelongsToRegion) {
 setSearchCoords({ lat: targetLat, lon: targetLon });
 setViewState(prev => ({
 ...prev,
 latitude: targetLat,
 longitude: targetLon,
 zoom: targetZoom
 }));

 const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
 if (map && map.flyTo) {
 map.flyTo({
 center: [targetLon, targetLat],
 zoom: targetZoom,
 duration: 1000,
 essential: true
 });
 }
 }
 }
 }, [selectedRegion, activeWellId]);

 const lastCenteredWellIdRef = useRef(null);

 // 3. Center automatically on active well whenever activeWellId changes OR when wells load
 useEffect(() => {
 if (!activeWellId) {
 lastCenteredWellIdRef.current = null;
 return;
 }
 if (wells.length === 0) return;
 
 if (lastCenteredWellIdRef.current === activeWellId) return;

 const active = wells.find(w => w.well_id === activeWellId);
 if (active && active.surface_location) {
 setPopupWell(active);
 centerOnWell(active, 11);
 lastCenteredWellIdRef.current = activeWellId;
 }
 }, [activeWellId, wells, centerOnWell]);

 const activeWell = useMemo(() => {
 return wells.find(w => w.well_id === activeWellId);
 }, [wells, activeWellId]);

 // Active center coordinates for the inspection radius (selected wellhead has priority)
 const radiusCenter = useMemo(() => {
 if (activeWell?.surface_location?.lat !== undefined && activeWell?.surface_location?.lon !== undefined) {
 return {
 lat: Number(activeWell.surface_location.lat),
 lon: Number(activeWell.surface_location.lon)
 };
 }
 return searchCoords;
 }, [activeWell, searchCoords]);

 const circleGeoJSON = useMemo(() => {
 if (!radiusCenter || radiusCenter.lat === undefined || radiusCenter.lon === undefined) return null;
 return createGeoJSONCircle([radiusCenter.lon, radiusCenter.lat], radius);
 }, [radiusCenter, radius]);

 // Calculate exact distance of every well to the active radius search center
 const wellsWithDistance = useMemo(() => {
 return wells.map(w => {
 const loc = w.surface_location;
 if (!loc || typeof loc !== 'object'|| loc.lat === undefined || loc.lon === undefined) {
 return { ...w, distanceKm: Infinity, isInsideRadius: false };
 }
 const dist = calculateDistanceKm(radiusCenter.lat, radiusCenter.lon, loc.lat, loc.lon);
 const isInside = dist <= radius;
 return {
 ...w,
 distanceKm: dist,
 isInsideRadius: isInside
 };
 });
 }, [wells, radiusCenter, radius]);

 const innerWells = useMemo(() => {
 return wellsWithDistance.filter(w => w.isInsideRadius && w.well_id !== activeWellId);
 }, [wellsWithDistance, activeWellId]);

 const nearestOffset = useMemo(() => {
 if (innerWells.length === 0) return null;
 const sorted = [...innerWells].sort((a, b) => a.distanceKm - b.distanceKm);
 return sorted[0];
 }, [innerWells]);

 const setAsActiveRig = () => {
 const active = wells.find(w => w.well_id === activeWellId);
 if (active && active.surface_location) {
 const newCoords = {
 lat: active.surface_location.lat,
 lon: active.surface_location.lon
 };
 setSearchCoords(newCoords);
 const map = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
 if (map && map.flyTo) {
 map.flyTo({ center: [newCoords.lon, newCoords.lat], zoom: 11, duration: 800 });
 }
 setViewState(prev => ({ ...prev, latitude: newCoords.lat, longitude: newCoords.lon, zoom: 11 }));
 }
 };

 const handlePointerDown = (e) => {
 if (e.target.tagName.toLowerCase() === 'input'|| e.target.tagName.toLowerCase() === 'button') {
 return;
 }
 setIsDragging(true);
 setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
 e.target.setPointerCapture(e.pointerId);
 };

 const handlePointerMove = (e) => {
 if (!isDragging) return;
 setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
 };

 const handlePointerUp = (e) => {
 setIsDragging(false);
 if (e.target.hasPointerCapture(e.pointerId)) {
 e.target.releasePointerCapture(e.pointerId);
 }
 };

 const handleBasemapChange = (styleId) => {
 if (externalOnBasemapChange) {
 externalOnBasemapChange(styleId);
 } else {
 setInternalBasemapStyle(styleId);
 }
 try {
 localStorage.setItem(BASEMAP_STORAGE_KEY, styleId);
 } catch (e) {
 console.warn("Could not save basemapStyle to localStorage", e);
 }
 };

 const currentMapStyle = useMemo(() => {
 switch (basemapStyle) {
 case'satellite':
 return satelliteStyle;
 case'terrain':
 return terrainStyle;
 case'edge_grid':
 return tacticalGridStyle;
 case'dark':
 default:
 return osmStyle;
 }
 }, [basemapStyle]);

 const hideBorders = (map) => {
 if (!map || !map.getLayer) return;
 const borderLayers = ['boundary_county','boundary_state','boundary_country_outline','boundary_country_inner'];
 borderLayers.forEach(layer => {
 if (map.getLayer(layer)) {
 map.setLayoutProperty(layer,'visibility','none');
 }
 });
 };

 const handleMapLoad = (evt) => {
 const map = evt.target;
 hideBorders(map);
 if (map.on) {
 map.on('style.load', () => hideBorders(map));
 }
 };

 return (
 <div className="relative w-full h-full flex-1 overflow-hidden">
 <Map
 mapLib={maplibregl}
 ref={mapRef}
 onLoad={handleMapLoad}
 {...viewState}
 onMove={evt => setViewState(evt.viewState)}
 mapStyle={currentMapStyle}
 style={{ width: '100%', height: '100%'}}
 >
 <NavigationControl position="bottom-right"/>

 {/* Radius Polygon - Project B style: cyan dashed line + subtle translucent cyan fill */}
 {circleGeoJSON && (
 <>
 <Source id="radius-source-fill" type="geojson" data={circleGeoJSON}>
 <Layer 
 id="radius-fill" type="fill" paint={{'fill-color': '#00f0ff','fill-opacity': 0.06
 }} 
 />
 </Source>
 <Source id="radius-source-line" type="geojson" data={circleGeoJSON}>
 <Layer 
 id="radius-line" type="line" paint={{'line-color': '#00f0ff','line-width': 1.5,'line-dasharray': [6, 4]
 }} 
 />
 </Source>
 </>
 )}

 {/* Regional Well Markers with Project B Color Scheme:
 - Selected well: Bright green (#22c55e)
 - Inside radius: Bright yellow (#facc15)
 - Outside radius: Sky blue (#38bdf8)
 */}
 {wellsWithDistance.map(well => {
 const loc = well.surface_location;
 if (!loc || typeof loc !== 'object'|| loc.lat === undefined || loc.lon === undefined) return null;
 
 const isActive = well.well_id === activeWellId;
 const isInside = well.isInsideRadius;
 
 return (
 <Marker 
 key={well.well_id || well.id} 
 longitude={loc.lon} 
 latitude={loc.lat}
 anchor="center" onClick={e => {
 e.originalEvent.stopPropagation();
 onSelectWell(well.well_id);
 setPopupWell(well);
 centerOnWell(well, 11.5);
 }}
 >
 <div className="relative flex items-center justify-center cursor-pointer group transition-all duration-300">
 {isActive && (
 <>
 <span className="animate-ping absolute inline-flex h-9 w-9 rounded-full bg-[#22c55e] opacity-50"></span>
 <span className="absolute inline-flex h-7 w-7 rounded-full bg-[#22c55e]/25 border border-[#22c55e]/80"></span>
 </>
 )}

 {!isActive && isInside && (
 <span className="absolute inline-flex h-6 w-6 rounded-full bg-[#facc15]/20 border border-[#facc15]/60 animate-pulse"></span>
 )}
 
 <div className={`relative z-10 rounded-full border-2 transition-all transform group-hover:scale-125 flex items-center justify-center
 ${isActive 
 ? 'bg-[#22c55e] border-white w-5 h-5 shadow-[0_0_18px_rgba(34,197,94,0.95)] ring-2 ring-[#22c55e]/60': isInside 
 ? 'bg-[#facc15] border-white/90 w-4 h-4 shadow-[0_0_12px_rgba(250,204,21,0.9)] ring-2 ring-[#facc15]/50': 'bg-[#38bdf8] border-[#bae6fd]/90 w-3 h-3 shadow-[0_0_8px_rgba(56,189,248,0.7)] hover:scale-125'}`}>
 {isActive ? (
 <div className="w-1.5 h-1.5 rounded-full bg-slate-950"></div>
 ) : isInside ? (
 <div className="w-1.5 h-1.5 rounded-full bg-slate-950/80"></div>
 ) : (
 <div className="w-1 h-1 rounded-full bg-[#082f49]"></div>
 )}
 </div>
 </div>
 </Marker>
 );
 })}

 {/* Project B Well Details Popup Card */}
 {popupWell && popupWell.surface_location && (
 <Popup
 longitude={popupWell.surface_location.lon}
 latitude={popupWell.surface_location.lat}
 anchor="bottom" offset={16}
 closeButton={false}
 closeOnClick={false}
 className="cyber-well-popup">
 <div className="bg-[#141414]/95 border border-cyan-400/80 rounded-xl p-3.5 text-slate-100 font-mono text-[11px] leading-relaxed shadow-[0_12px_36px_rgba(0,0,0,0.9)] min-w-[270px] max-w-[340px] select-text backdrop-blur-md">
 {/* Header */}
 <div className="flex items-start justify-between pb-2 border-b border-cyan-500/30 mb-2.5">
 <div className="min-w-0 pr-2">
 <div className="flex items-center gap-1.5 flex-wrap">
 <span className="font-bold text-cyan-300 text-sm tracking-wide">{popupWell.well_id}</span>
 {popupWell.is_synthetic ? (
 <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold tracking-wider uppercase">Synthetic Twin</span>
 ) : (
 <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold tracking-wider uppercase">Field Record</span>
 )}
 </div>
 <div className="text-[10px] text-slate-400 truncate mt-0.5">
 {popupWell.field_name ||'Exploration Field'} • {popupWell.operator || (popupWell.well_id?.startsWith('OIL-') ? 'Oil India Limited (OIL)': 'Offshore Asset')}
 </div>
 </div>
 <button 
 type="button" onClick={(e) => {
 e.stopPropagation();
 setPopupWell(null);
 }}
 className="text-slate-400 hover:text-white transition px-1.5 py-0.5 text-xs font-bold leading-none cursor-pointer rounded hover:bg-slate-800" title="Close popup">
 
 </button>
 </div>
 
 {/* Detailed Attributes */}
 <details className="text-[11px] group">
 <summary className="cursor-pointer text-slate-300 font-medium flex items-center justify-between hover:text-white transition-colors outline-none py-0.5 select-none list-none [&::-webkit-details-marker]:hidden">
 <span>Well Details & Provenance</span>
 <span className="text-slate-500 transition-transform group-open:rotate-180 text-[10px] ml-2">▼</span>
 </summary>
 <div className="space-y-1.5 mt-2 pt-2 border-t border-slate-800/80">
 <div className="flex justify-between items-baseline">
 <span className="text-slate-400">Provenance:</span> 
 <span className="text-cyan-200 font-medium text-right truncate max-w-[180px]" title={popupWell.source || popupWell.data_source}>
 {(popupWell.source || popupWell.data_source ||'OIL Deep Exploration Asset').replace(/_/g,'')}
 </span>
 </div>
 <div className="flex justify-between items-baseline">
 <span className="text-slate-400">Target Formation:</span> 
 <span className="text-amber-300 font-medium text-right truncate max-w-[170px]" title={popupWell.target_formation ||'Barail Sandstone'}>
 {popupWell.target_formation ||'Barail Sandstone'}
 </span>
 </div>
 <div className="flex justify-between items-baseline">
 <span className="text-slate-400">Stratigraphy:</span> 
 <span className="text-slate-200 font-medium">
 {popupWell.formation_count !== undefined ? popupWell.formation_count : 5} mapped tops
 </span>
 </div>
 <div className="flex justify-between items-baseline">
 <span className="text-slate-400">Total Depth:</span> 
 <span className="text-slate-100 font-semibold">
 {popupWell.total_depth_m ?`${Math.round(popupWell.total_depth_m)} m`: popupWell.total_depth_tvd ?`${Math.round(popupWell.total_depth_tvd)} m`: '3520 m'} TVD
 </span>
 </div>
 {popupWell.primary_hazard && (
 <div className="pt-1 pb-0.5 border-t border-slate-800/80">
 <span className="text-slate-400 block text-[10px] mb-0.5">Primary Hazard:</span> 
 <span className="text-rose-400 font-semibold text-[10.5px] leading-tight block bg-rose-950/40 border border-rose-900/50 rounded px-1.5 py-1">
 {popupWell.primary_hazard}
 </span>
 </div>
 )}
 <div className="pt-1 border-t border-slate-800/80">
 <span className="text-slate-400 block text-[10px]">BHA Assembly:</span>
 <span className="text-slate-300 text-[10px] leading-tight block mt-0.5 break-words">
 {popupWell.bha_type ||'Steerable Motor BHA (1.5° PDM + MWD)'}
 </span>
 </div>
 </div>
 </details>
 </div>
 </Popup>
 )}
 </Map>

 {/* Floating Control Card (Draggable / Mobile Responsive) */}
 <div 
 className={`absolute w-80 max-w-[calc(100vw-32px)] glass-panel border border-slate-750 shadow-glass rounded-2xl p-3.5 sm:p-4 z-10 transition-all ${isDragging ? 'cursor-grabbing': 'cursor-grab'}`}
 style={{ top: Math.max(60, position.y), left: Math.max(12, position.x), touchAction: 'none'}}
 onPointerDown={handlePointerDown}
 onPointerMove={handlePointerMove}
 onPointerUp={handlePointerUp}
 onPointerCancel={handlePointerUp}
 >
 <div className="flex items-center justify-between mb-2">
 <h3 className="font-display font-bold text-slate-100 flex items-center text-xs sm:text-sm">
 <Target size={16} className="mr-2 text-cyan-400"/>
 Regional Exploration Map
 </h3>
 <div className="flex items-center space-x-1.5">
 <span className="bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
 {wells.length} Wells
 </span>
 <button
 onClick={() => setIsCollapsed(!isCollapsed)}
 className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title={isCollapsed ? "Expand Search Controls": "Collapse Search Controls"}
 >
 {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
 </button>
 </div>
 </div>

 {!isCollapsed && (
 <div className="space-y-3 pt-1">
 {/* Region Indicator Pill */}
 <div className="flex flex-col space-y-1.5 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
 <div className="flex items-center justify-between text-[11px]">
 <span className="text-slate-400 flex items-center">
 <Compass size={13} className="mr-1.5 text-cyan-400"/>
 Active Basin:
 </span>
 <span className="font-semibold text-slate-200 capitalize">
 {REGIONS_CONFIG[selectedRegion]?.name ||"Pan-India Portfolio"}
 </span>
 </div>
 {selectedRegion !== 'all'&& (
 <div className="flex items-center space-x-1.5 text-[9.5px] font-sans text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-0.5 leading-snug">
 <ShieldCheck size={11} className="text-emerald-400 shrink-0"/>
 <span>Regionally Calibrated Geomechanics</span>
 </div>
 )}
 </div>

 {selectedRegion !== 'all'&& (
 <div className="space-y-2">
 <div className="flex justify-between items-center text-xs font-mono text-slate-400">
 <span className="flex items-center text-slate-300">
 <Radar size={13} className="mr-1.5 text-cyan-400 animate-spin" style={{ animationDuration: '6s'}} />
 Inspection Radius:
 </span>
 <span className="text-cyan-400 font-bold bg-cyan-950/70 border border-cyan-500/40 px-2 py-0.5 rounded text-[11px]">
 {radius.toFixed(0)} km
 </span>
 </div>

 {/* Quick Operational Presets for Field Engineers */}
 <div className="grid grid-cols-3 gap-1.5 pt-0.5">
 {[
 { label: 'Pad (15km)', val: 15 },
 { label: 'Cluster (40km)', val: 40 },
 { label: selectedRegion === 'north_sea'? 'Basin (100km)': 'Basin (60km)', val: selectedRegion === 'north_sea'? 100 : 60 }
 ].map(preset => (
 <button
 key={preset.val}
 type="button" onClick={() => setRadius(preset.val)}
 className={`text-[10px] py-1 px-1.5 rounded-lg border font-mono transition-all text-center ${
 Math.abs(radius - preset.val) < 2
 ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 font-bold shadow-[0_0_8px_rgba(166, 166, 166,0.4)]': 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'}`}
 >
 {preset.label}
 </button>
 ))}
 </div>

 <input 
 type="range" min="10.0" max={selectedRegion === 'north_sea'|| selectedRegion === 'all'? 300.0 : 120.0} 
 step="5.0" value={radius}
 onChange={(e) => setRadius(parseFloat(e.target.value))}
 className="w-full accent-cyan-400 bg-slate-800 rounded-lg appearance-none cursor-pointer h-1.5 mt-1"/>

 {/* Live Dynamic Inspection HUD */}
 <div className="bg-slate-900/90 border border-slate-750 rounded-xl p-2 space-y-1 text-[11px] font-mono">
 <div className="flex items-center justify-between">
 <span className="text-slate-400 flex items-center">
 <span className="w-2 h-2 rounded-full bg-[#facc15] shadow-[0_0_6px_rgba(250,204,21,0.8)] mr-1.5"></span>
 In-Radius Offsets:
 </span>
 <span className="text-amber-300 font-bold font-sans">
 {innerWells.length} of {wells.length > 0 ? wells.length - 1 : 0} Wells
 </span>
 </div>
 {nearestOffset && (
 <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/80 pt-1">
 <span className="truncate">Nearest: {nearestOffset.well_id.replace('OIL-','')}</span>
 <span className="text-emerald-400 font-semibold ml-1">
 {nearestOffset.distanceKm.toFixed(1)} km
 </span>
 </div>
 )}
 </div>

 {/* Map Rig Color Legend */}
 <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-300 px-1 pt-0.5">
 <span className="flex items-center">
 <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] mr-1 shadow-[0_0_6px_rgba(34,197,94,0.8)]"></span> Selected Well
 </span>
 <span className="flex items-center">
 <span className="w-2.5 h-2.5 rounded-full bg-[#facc15] mr-1 shadow-[0_0_6px_rgba(250,204,21,0.8)]"></span> Inside Radius
 </span>
 <span className="flex items-center">
 <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] mr-1 shadow-[0_0_6px_rgba(56,189,248,0.8)]"></span> Outside
 </span>
 </div>
 </div>
 )}

 <button 
 onClick={setAsActiveRig}
 className="w-full bg-slate-850 hover:bg-slate-800 active:bg-slate-750 text-slate-200 text-xs font-medium py-2.5 rounded-xl transition-colors border border-slate-700/80 flex items-center justify-center min-h-[40px] shadow-sm">
 <MapPin size={14} className="mr-2 text-emerald-400"/>
 Fly to Active Wellhead ({activeWellId ? activeWellId.replace('OIL-','') : 'None'})
 </button>
 
 <button 
 onClick={() => setIs3DViewerOpen(true)}
 className="w-full bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 active:scale-[0.99] text-cyan-300 text-xs font-semibold py-2.5 rounded-xl transition-all border border-cyan-500/40 shadow-glow-cyan flex items-center justify-center min-h-[40px]">
 <Box size={15} className="mr-2 text-cyan-400"/>
 View 3D Subsurface Trajectory
 </button>
 </div>
 )}
 </div>

 <Trajectory3DViewer 
 isOpen={is3DViewerOpen} 
 onClose={() => setIs3DViewerOpen(false)} 
 activeWellId={activeWellId} 
 offsetWells={wells} 
 currentDepth={currentDepth}
 activeScenario={activeScenario}
 selectedRegion={selectedRegion}
 />
 </div>
 );
}
