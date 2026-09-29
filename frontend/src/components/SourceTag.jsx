import React from 'react';
import { Database, ShieldCheck, Cpu, AlertCircle } from 'lucide-react';

/**
 * Reusable Data Provenance Badge component.
 * Displays verifiable data origin with explanatory tooltips:
 * - "synthetic_calibrated": Generated well/log data, calibrated to regional Indian stratigraphy
 * - "synthetic": Regional Geomechanical Synthetic Calibration
 * - "illustrative_uncalibrated": Illustrative / Not Yet Calibrated — architecture demonstration only, no real or Volve-analog data basis
 * - "incident_report_real": Real, publicly documented Indian drilling incident
 */
export const SOURCE_CONFIGS = {
  // Renamed from `volve_relabeled`. That key claimed the well and log data was
  // derived from Equinor's Volve open dataset; it was not. `data/raw/` is empty and
  // `scripts/03_build_well_logs.py` logs "No raw well logs found. Generating synthetic
  // well log data..." — the value was the platform's *default* provenance label, so
  // every unspecified well inherited a claim that had never been verified.
  // The old key is kept as an alias so any value still in a database resolves here.
  synthetic_calibrated: {
    label: "Synthetic · Assam-Calibrated",
    shortLabel: "Synthetic",
    bgColor: "bg-slate-500/15",
    textColor: "text-slate-300",
    borderColor: "border-slate-500/40",
    dotColor: "bg-slate-400",
    icon: Database,
    tooltip: "Data Provenance: Generated well, log and event data, calibrated to Upper Assam (Assam-Arakan) stratigraphy and stress regime. NOT real well data and NOT derived from any public dataset — no Equinor Volve or FORCE 2020 data was used. The two real, cited Indian incidents are the exception and carry their own Verified badge."
  },
  // The `force2020_relabeled` entry was removed rather than relabelled. It claimed the
  // FORCE 2020 log benchmark, which was never used, and it masked a second problem:
  // every badge in this file is assigned by *well-name string matching* (see
  // getWellDataSource) rather than by any recorded data lineage. The values below are
  // therefore descriptions of how a well was calibrated, not records of where its data
  // came from — which is why the tooltips now say "calibrated to", never "derived from".
  synthetic: {
    label: "Synthetic Calibrated",
    shortLabel: "Synthetic",
    bgColor: "bg-purple-500/15",
    textColor: "text-purple-300",
    borderColor: "border-purple-500/40",
    dotColor: "bg-purple-400",
    icon: Cpu,
    tooltip: "Data Provenance: Synthetically calibrated geomechanical model based on published Eaton / Teale physics rules for Upper Assam overpressure zones."
  },
  regional_calibrated: {
    label: "Regionally Calibrated",
    shortLabel: "Calibrated",
    bgColor: "bg-emerald-500/15",
    textColor: "text-emerald-300",
    borderColor: "border-emerald-500/40",
    dotColor: "bg-emerald-400",
    icon: ShieldCheck,
    tooltip: "Data Provenance: Regionally calibrated geomechanical model using basin offset logs, Eaton pore pressure, and Teale mechanical specific energy (MSE) physics rules."
  },
  illustrative_uncalibrated: {
    label: "Illustrative / Uncalibrated",
    shortLabel: "Illustrative",
    bgColor: "bg-rose-500/15",
    textColor: "text-rose-300",
    borderColor: "border-rose-500/40",
    dotColor: "bg-rose-400",
    icon: AlertCircle,
    tooltip: "Data Provenance: Subsurface geological reference model for exploratory basin wells."
  },
  incident_report_real: {
    label: "Real Incident Record",
    shortLabel: "Verified",
    bgColor: "bg-teal-500/15",
    textColor: "text-teal-200",
    borderColor: "border-teal-400/50",
    dotColor: "bg-teal-400",
    icon: ShieldCheck,
    tooltip: "Data Provenance: A real, publicly documented Indian drilling incident. Depth, root cause and mitigation are quoted from published sources (NGT Baghjan Expert Committee; OISD; SPE-206602-MS) — nothing in this record is generated."
  }
};

/**
 * Resolves the data provenance classification key for any given well ID or raw data source label.
 */
export const getWellDataSource = (wellIdOrSource) => {
  if (!wellIdOrSource) return "synthetic_calibrated";
  const str = String(wellIdOrSource).toLowerCase().trim();

  // Checked FIRST, and on the exact key. Everything below this line is a
  // well-name heuristic, and the final `return` is a catch-all — so without this
  // branch a real incident record falls through to "Volve (Relabeled)", which is
  // the one label that would be flatly false about it.
  if (str.includes("incident_report")) {
    return "incident_report_real";
  }

  // Regional expansion wells (Rajasthan, KG Deepwater, Mizoram) are illustrative only
  if (
    str.includes("raj") ||
    str.includes("baghewala") ||
    str.includes("tanot") ||
    str.includes("dandewala") ||
    str.includes("rajasthan") ||
    str.includes("jaisalmer") ||
    str.includes("kg") ||
    str.includes("deepwater") ||
    str.includes("yanam") ||
    str.includes("amalapuram") ||
    str.includes("mz") ||
    str.includes("aizawl") ||
    str.includes("mamit") ||
    str.includes("kolasib") ||
    str.includes("lunglei") ||
    str.includes("champhai") ||
    str.includes("mizoram") ||
    str.includes("illustrative") ||
    str.includes("uncalibrated")
  ) {
    return "illustrative_uncalibrated";
  }

  if (str.includes("regional_calibrated")) {
    return "regional_calibrated";
  }

  // "nahar" used to be tagged FORCE 2020. No FORCE 2020 data was ever used — the
  // tag was assigned by well-name string matching, not by data lineage — so those
  // wells get the same honest label as the rest of the seeded corpus.
  if (str.includes("nahar") || str.includes("force")) {
    return "synthetic_calibrated";
  }

  if (str.includes("dikom") || str.includes("baghjan-4") || str.includes("baghjan-5") || str.includes("synth")) {
    return "synthetic";
  }

  return "synthetic_calibrated";
};

// Legacy keys kept as aliases: rows in the database and values baked into older
// builds still carry these names, and they must resolve to the corrected labels
// rather than fall through to the catch-all.
SOURCE_CONFIGS.volve_relabeled = SOURCE_CONFIGS.synthetic_calibrated;
SOURCE_CONFIGS.force2020_relabeled = SOURCE_CONFIGS.synthetic_calibrated;

const SourceTag = ({ source, compact = false, showIcon = true, className = "" }) => {
  const normalizedKey = getWellDataSource(source);
  const config = SOURCE_CONFIGS[normalizedKey] || SOURCE_CONFIGS.synthetic_calibrated;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono font-medium tracking-tight transition-all duration-150 cursor-help select-none ${config.bgColor} ${config.textColor} ${config.borderColor} ${className}`}
      title={config.tooltip}
    >
      {showIcon && <Icon size={10} className="shrink-0 opacity-80" />}
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor} shrink-0`}></span>
      <span>{compact ? config.shortLabel : config.label}</span>
    </span>
  );
};

export default SourceTag;
