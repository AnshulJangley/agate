// Configuration for regional geology, stratigraphy, and hazard mappings across India

export const REGIONS_CONFIG = {
  all: {
    id: "all",
    name: "Pan-India Portfolio",
    center: [22.5, 82.5], // Geographic center of India
    zoom: 4.8,
    badgeColor: "bg-cyan-950/60 text-cyan-300 border-cyan-500/30",
    markerColor: "#A6A6A6",
    isCalibrated: false,
    dataSource: "illustrative_uncalibrated",
    provenanceLabel: "Pan-India Portfolio — Mixed Calibration (Only Assam is Calibrated)",
    description: "Pan-India operational portfolio covering Upper Assam Shelf, Rajasthan Basin, KG Deepwater, and Mizoram Fold Belt. (Note: Outside of Assam, data is illustrative only).",
    defaultWell: "OIL-BAGHJAN-1"
  },
  assam: {
    id: "assam",
    name: "Upper Assam Shelf",
    center: [27.4, 95.2],
    zoom: 9.5,
    badgeColor: "bg-emerald-950/60 text-emerald-300 border-emerald-500/30",
    markerColor: "#A3A3A3",
    isCalibrated: true,
    dataSource: "volve_relabeled",
    provenanceLabel: "Volve Open Data & FORCE 2020 Benchmark — Calibrated with Eaton/Teale geomechanical physics rules",
    description: "Mature oilfield with severe thief-bed losses in Tipam sands and high-pressure gas kicks in Barail formation. (Calibrated with Volve & FORCE 2020 open data).",
    layers: [
      { from: 0, to: 1450, color: "#BBBBBB", label: "Tipam Sandstone", problemDescription: "Freshwater permeable sand reservoir, severe thief-bed mud loss", hazardType: "lost_circulation", severity: "high" },
      { from: 1450, to: 2000, color: "#585858", label: "Girujan Clay", problemDescription: "Sloughing/caving shale & tight hole", hazardType: "stuck_pipe", severity: "medium" },
      { from: 2000, to: 2400, color: "#9A9A9A", label: "Barail Formation", problemDescription: "Overpressured sand-shale (Known Kick Zone & differential sticking)", hazardType: "gas_kick", severity: "critical" },
      { from: 2400, to: 3500, color: "#808080", label: "Kopili Formation", problemDescription: "Deep marine shale transition, swelling reactive shale & packoff", hazardType: "stuck_pipe", severity: "high" }
    ],
    defaultWell: "OIL-BAGHJAN-1"
  },
  rajasthan: {
    id: "rajasthan",
    name: "Rajasthan Basin",
    center: [27.6, 71.4],
    zoom: 8.0,
    badgeColor: "bg-amber-950/60 text-amber-300 border-amber-500/40",
    markerColor: "#B1B1B1",
    isCalibrated: false,
    dataSource: "illustrative_uncalibrated",
    provenanceLabel: "Basin Geological Reference Model",
    description: "Desert basin with heavy oil, severe quartz sand abrasion, and cavernous Bilara carbonates. (Data is illustrative / uncalibrated).",
    layers: [
      { from: 0, to: 1200, color: "#D7D7D7", label: "Pariwar Formation", problemDescription: "Sand abrasion & severe filtration loss", hazardType: "wear", severity: "medium" },
      { from: 1200, to: 1800, color: "#A2A2A2", label: "Baisakhi Formation", problemDescription: "Tight hole & overpull risk", hazardType: "stuck_pipe", severity: "high" },
      { from: 1800, to: 2300, color: "#909090", label: "Jodhpur Sandstone", problemDescription: "Heavy oil viscous drag & differential sticking", hazardType: "stuck_pipe", severity: "high" },
      { from: 2300, to: 3500, color: "#A2A2A2", label: "Bilara Carbonates", problemDescription: "Massive cavernous lost circulation & extreme torque vibration", hazardType: "lost_circulation", severity: "critical" }
    ],
    defaultWell: "OIL-RAJ-BAGHEWALA-1"
  },
  kg: {
    id: "kg",
    name: "KG Deepwater",
    center: [16.35, 82.35],
    zoom: 8.5,
    badgeColor: "bg-sky-950/60 text-sky-300 border-sky-500/40",
    markerColor: "#7D7D7D",
    isCalibrated: false,
    dataSource: "illustrative_uncalibrated",
    provenanceLabel: "Basin Geological Reference Model",
    description: "Offshore deepwater basin with Shallow Water Flow, gumbo shale bit balling, and HPHT narrow margin. (Data is illustrative / uncalibrated).",
    layers: [
      { from: 0, to: 800, color: "#B1B1B1", label: "Shallow Marine Sediments", problemDescription: "Shallow Water Flow / gas hydrates / seafloor slumping", hazardType: "gas_kick", severity: "high" },
      { from: 800, to: 1800, color: "#585858", label: "Godavari Gumbo", problemDescription: "Gumbo bit balling & flowline plugging", hazardType: "stuck_pipe", severity: "high" },
      { from: 1800, to: 3200, color: "#727272", label: "Ravva Formation", problemDescription: "Narrow PP-FG safe drilling window & rapid gas influx", hazardType: "gas_kick", severity: "critical" },
      { from: 3200, to: 4500, color: "#676767", label: "Cretaceous Basement", problemDescription: "HPHT overpressures & high temperature thermal degradation", hazardType: "gas_kick", severity: "critical" }
    ],
    defaultWell: "OIL-KG-DEEPWATER-1"
  },
  mizoram: {
    id: "mizoram",
    name: "Mizoram Fold Belt",
    center: [23.72, 92.70],
    zoom: 8.5,
    badgeColor: "bg-purple-950/60 text-purple-300 border-purple-500/40",
    markerColor: "#7B7B7B",
    isCalibrated: false,
    dataSource: "illustrative_uncalibrated",
    provenanceLabel: "Basin Geological Reference Model",
    description: "Tectonically active fold belt with intense horizontal tectonic stress, dipping beds, and catastrophic stuck pipe. (Data is illustrative / uncalibrated).",
    layers: [
      { from: 0, to: 1500, color: "#B1B1B1", label: "Bokabil Formation", problemDescription: "Tectonic borehole ovalization & spalling", hazardType: "stuck_pipe", severity: "medium" },
      { from: 1500, to: 2500, color: "#6F6F6F", label: "Upper Bhuban", problemDescription: "High horizontal tectonic stress breakout", hazardType: "stuck_pipe", severity: "high" },
      { from: 2500, to: 3400, color: "#494949", label: "Middle Bhuban", problemDescription: "Steeply dipping bedding-plane packoff & catastrophic stuck pipe", hazardType: "stuck_pipe", severity: "critical" },
      { from: 3400, to: 4500, color: "#545454", label: "Disang Flysch", problemDescription: "Tectonic crushed rock overpressure & sudden wellbore collapse", hazardType: "gas_kick", severity: "high" }
    ],
    defaultWell: "OIL-MZ-AIZAWL-1"
  },
  north_sea: {
    id: "north_sea",
    name: "North Sea (FORCE 2020 & Volve)",
    center: [58.262, 8.043],
    zoom: 7.8,
    badgeColor: "bg-sky-950/60 text-sky-300 border-sky-500/40",
    markerColor: "#B1B1B1",
    isCalibrated: true,
    dataSource: "real_force2020",
    provenanceLabel: "FORCE 2020 Lithology Benchmark & Equinor Volve Open Data (159 Wells)",
    description: "Offshore North Sea Continental Shelf with 159 real benchmark wells including FORCE 2020 lithologies, formation tops, and Volve operations.",
    layers: [
      { from: 0, to: 2000, color: "#B1B1B1", label: "Tertiary Sediments", problemDescription: "Shallow gas hazard & reactive gumbo shales", hazardType: "gas_kick", severity: "medium" },
      { from: 2000, to: 2500, color: "#B1B1B1", label: "Cretaceous Chalk & Shales", problemDescription: "Tight hole & differential sticking risk", hazardType: "stuck_pipe", severity: "high" },
      { from: 2500, to: 3200, color: "#848484", label: "Jurassic Draupne & Heather", problemDescription: "Severe overpressure kick & thief-zone losses", hazardType: "lost_circulation", severity: "critical" },
      { from: 3200, to: 4500, color: "#7B7B7B", label: "Triassic Skagerrak Formation", problemDescription: "High quartz abrasion & hard-stringer bit vibration", hazardType: "wear", severity: "medium" }
    ],
    defaultWell: "16/7-6"
  }
};

export const getRegionIdFromWellId = (wellId) => {
  if (!wellId) return "assam";
  const upper = String(wellId).toUpperCase();
  if (upper.includes("OIL-RAJ") || upper.includes("BAGHEWALA") || upper.includes("TANOT") || upper.includes("DANDEWALA")) return "rajasthan";
  if (upper.includes("OIL-KG") || upper.includes("DEEPWATER") || upper.includes("DWN") || upper.includes("YANAM") || upper.includes("AMALAPURAM")) return "kg";
  if (upper.includes("OIL-MZ") || upper.includes("AIZAWL") || upper.includes("MAMIT") || upper.includes("KOLASIB") || upper.includes("LUNGLEI") || upper.includes("CHAMPHAI")) return "mizoram";
  if (upper.includes("VOLVE") || upper.includes("FORCE") || upper.includes("SYNTH-") || /^\d+\/\d+/.test(upper)) return "north_sea";
  return "assam";
};

export const isRegionCalibrated = (wellIdOrRegion) => {
  const regionId = REGIONS_CONFIG[wellIdOrRegion] ? wellIdOrRegion : getRegionIdFromWellId(wellIdOrRegion);
  const config = REGIONS_CONFIG[regionId] || REGIONS_CONFIG.assam;
  return config.isCalibrated;
};

export const getRegionProvenance = (wellIdOrRegion) => {
  const regionId = REGIONS_CONFIG[wellIdOrRegion] ? wellIdOrRegion : getRegionIdFromWellId(wellIdOrRegion);
  const config = REGIONS_CONFIG[regionId] || REGIONS_CONFIG.assam;
  return {
    isCalibrated: config.isCalibrated,
    provenanceLabel: config.provenanceLabel,
    dataSource: config.dataSource,
    name: config.name
  };
};

export const getRegionalGeoLayers = (wellId, selectedRegion) => {
  let regionKey = selectedRegion;
  
  if (!regionKey || regionKey === 'all') {
    regionKey = getRegionIdFromWellId(wellId);
  }
  
  const regionConfig = REGIONS_CONFIG[regionKey];
  return regionConfig?.layers || REGIONS_CONFIG.assam.layers;
};

export const getRegionBadge = (wellId, selectedRegion) => {
  let regionKey = selectedRegion;
  if (!regionKey || regionKey === 'all') {
    regionKey = getRegionIdFromWellId(wellId);
  }
  return REGIONS_CONFIG[regionKey] || REGIONS_CONFIG.assam;
};

/**
 * Returns a dynamically formatted display label for a region reflecting its calibration status:
 * e.g., "Rajasthan Basin (Illustrative)", "Upper Assam Shelf (Calibrated)"
 * Prevents UI desynchronization with regional data provenance configuration.
 */
export const getRegionDisplayLabel = (regionKey, customName = null) => {
  const reg = REGIONS_CONFIG[regionKey];
  if (!reg) return regionKey;
  const name = customName || reg.name;
  const status = reg.isCalibrated ? 'Calibrated' : 'Illustrative';
  return `${name} (${status})`;
};
