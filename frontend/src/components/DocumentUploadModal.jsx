import React, { useState, useRef } from'react';
import axios from'axios';
import { API_BASE } from'../lib/api';
import { parseOfflineLasOrPdf } from'../lib/offlinePhysicsEngine';
import { 
 UploadCloud, 
 File, 
 X, 
 CheckCircle, 
 Loader2, 
 Layers, 
 Eye, 
 Sparkles, 
 FileSpreadsheet,
 AlertTriangle,
 ShieldCheck,
 HardDrive
} from'lucide-react';

const DocumentUploadModal = ({ 
 isOpen, 
 onClose, 
 activeWellId ='OIL-BAGHJAN-1',
 onUploadSuccess,
 availableWells = ['OIL-BAGHJAN-1','OIL-BAGHJAN-4','OIL-NAHARKATIYA-1','OIL-MORAN-1','OIL-DIKOM-1','OIL-TENGAKHAT-1','OIL-KOTHALONI-1','OIL-HAPJAN-1','OIL-SHALMARI-1']
}) => {
 const [file, setFile] = useState(null);
 const [targetWell, setTargetWell] = useState(activeWellId);
 const [isUploading, setIsUploading] = useState(false);
 const [uploadResult, setUploadResult] = useState(null);
 const [errorMsg, setErrorMsg] = useState(null);
 const [isOfflineEngine, setIsOfflineEngine] = useState(false);
 const fileInputRef = useRef(null);

 React.useEffect(() => {
 if (activeWellId) {
 setTargetWell(activeWellId);
 }
 }, [activeWellId, isOpen]);

 if (!isOpen) return null;

 const detectWellFromFile = (filename) => {
 const lower = filename.toLowerCase();
 if (lower.includes('well_04') || lower.includes('baghjan_4') || lower.includes('baghjan-4')) {
 return'OIL-BAGHJAN-4';
 }
 if (lower.includes('baghjan')) {
 return'OIL-BAGHJAN-1';
 }
 if (lower.includes('hapjan')) {
 return'OIL-HAPJAN-1';
 }
 if (lower.includes('naharkatiya') || lower.includes('nhk')) {
 return'OIL-NAHARKATIYA-1';
 }
 if (lower.includes('moran')) {
 return'OIL-MORAN-1';
 }
 if (lower.includes('dikom')) {
 return'OIL-DIKOM-1';
 }
 if (lower.includes('tengakhat')) {
 return'OIL-TENGAKHAT-1';
 }
 if (lower.includes('kothaloni')) {
 return'OIL-KOTHALONI-1';
 }
 if (lower.includes('shalmari')) {
 return'OIL-SHALMARI-1';
 }
 return activeWellId ||'OIL-BAGHJAN-1';
 };

 const handleDragOver = (e) => {
 e.preventDefault();
 e.stopPropagation();
 };

 const handleDrop = (e) => {
 e.preventDefault();
 e.stopPropagation();
 if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
 const droppedFile = e.dataTransfer.files[0];
 setFile(droppedFile);
 setTargetWell(detectWellFromFile(droppedFile.name));
 setUploadResult(null);
 setErrorMsg(null);
 }
 };

 const handleUpload = async () => {
 if (!file) return;
 setIsUploading(true);
 setErrorMsg(null);
 
 const formData = new FormData();
 formData.append('file', file);
 formData.append('well_id', targetWell || activeWellId ||'OIL-BAGHJAN-1');

 try {
 const res = await axios.post(`${API_BASE}/api/upload-report`, formData, {
 headers: {'Content-Type': 'multipart/form-data'},
 timeout: 120000 // Increased timeout to 120 seconds for LLM extraction
 });
 setUploadResult(res.data);
 setIsOfflineEngine(false);
 if (onUploadSuccess) {
 onUploadSuccess(res.data, targetWell || activeWellId);
 }
 } catch (error) {
 console.warn('Network upload unreachable or offline, engaging local Rig Edge document engine: ', error.message);
 try {
 const offlineRes = await parseOfflineLasOrPdf(file, targetWell || activeWellId ||'OIL-BAGHJAN-1');
 setUploadResult(offlineRes);
 setIsOfflineEngine(true);
 if (onUploadSuccess) {
 onUploadSuccess(offlineRes, targetWell || activeWellId);
 }
 } catch (offlineErr) {
 console.error('Offline parser also failed: ', offlineErr);
 setErrorMsg('Failed to process file locally.');
 }
 } finally {
 setIsUploading(false);
 }
 };

 const handleReset = () => {
 setFile(null);
 setUploadResult(null);
 setErrorMsg(null);
 };

 const isLas = file?.name?.toLowerCase().endsWith('.las');

 return (
 <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in">
 <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[96vh] sm:max-h-[90vh]">
 
 {/* Header */}
 <div className="flex justify-between items-center px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-950 gap-2">
 <div className="flex items-center space-x-2 sm:space-x-2.5 min-w-0">
 <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
 <UploadCloud size={18} />
 </div>
 <div className="min-w-0">
 <h2 className="text-sm sm:text-base font-bold text-white truncate">
 Ingest Drilling Report / LAS Log
 </h2>
 <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
 AI OCR entity extraction for WCRs/DDRs and Log ASCII Standard (.las) curves
 </p>
 </div>
 </div>
 <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white transition rounded-lg hover:bg-slate-800 min-h-[36px] min-w-[36px] flex items-center justify-center">
 <X size={18} />
 </button>
 </div>
 
 {/* Body */}
 <div className="p-3 sm:p-6 overflow-y-auto flex-1 space-y-3 sm:space-y-4">
 
 {!uploadResult ? (
 <>
 {!file ? (
 <div 
 className="border-2 border-dashed border-slate-700 rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500/60 hover:bg-slate-800/40 transition-all text-center px-4" onDragOver={handleDragOver}
 onDrop={handleDrop}
 onClick={() => fileInputRef.current?.click()}
 >
 <input 
 type="file" ref={fileInputRef} 
 className="hidden" accept=".pdf,.las" onChange={(e) => {
 if (e.target.files && e.target.files.length > 0) {
 const selected = e.target.files[0];
 setFile(selected);
 setTargetWell(detectWellFromFile(selected.name));
 setErrorMsg(null);
 }
 }} 
 />
 <UploadCloud size={44} className="text-cyan-400 mb-3"/>
 <p className="text-slate-200 font-semibold text-sm mb-1">
 Drag and drop PDF report or LAS well log file
 </p>
 <p className="text-slate-400 text-xs">
 Supports Daily Drilling Reports (PDF), Well Completion Reports (PDF with OCR), and Log ASCII Standard (.las)
 </p>
 </div>
 ) : (
 <div className="space-y-3">
 <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
 <div className="flex items-center space-x-3">
 <div className="p-2.5 rounded-lg bg-slate-800 text-cyan-400">
 {isLas ? <FileSpreadsheet size={24} /> : <File size={24} />}
 </div>
 <div>
 <p className="text-white font-bold text-sm">{file.name}</p>
 <p className="text-slate-400 text-xs font-mono">
 {(file.size / 1024 / 1024).toFixed(2)} MB • {isLas ? 'Log ASCII Standard': 'PDF Document'}
 </p>
 </div>
 </div>
 <button 
 onClick={() => setFile(null)}
 className="text-xs px-3 py-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition">
 Change File
 </button>
 </div>

 {/* Target Well Selector */}
 <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
 <div>
 <p className="text-xs font-semibold text-slate-200">Associate Incidents with Well:</p>
 <p className="text-[11px] text-slate-500">Target institutional offset well memory</p>
 </div>
 <select
 value={targetWell}
 onChange={(e) => setTargetWell(e.target.value)}
 className="bg-slate-900 text-cyan-300 border border-slate-700 text-xs rounded-lg px-3 py-1.5 outline-none font-medium focus:border-cyan-500">
 {availableWells.map(w => (
 <option key={w} value={w}>{w}</option>
 ))}
 </select>
 </div>
 </div>
 )}

 {errorMsg && (
 <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-red-300 text-xs flex items-center space-x-2">
 <AlertTriangle size={16} className="text-red-400 flex-shrink-0"/>
 <span>{errorMsg}</span>
 </div>
 )}
 </>
 ) : (
 /* Live Extracted Entities Review Table */
 <div className="space-y-4">
 
 {/* Extraction Banner */}
 <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-xl flex items-start justify-between">
 <div className="flex items-start space-x-3">
 <CheckCircle size={22} className="text-emerald-400 flex-shrink-0 mt-0.5"/>
 <div>
 <h4 className="text-sm font-bold text-white">{uploadResult.message}</h4>
 <div className="flex flex-wrap items-center gap-2 mt-1.5 font-mono text-xs">
 <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
 File: {uploadResult.filename}
 </span>
 
 <span className="px-2.5 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-400 text-[11px] font-bold uppercase">
 DD Report
 </span>

 {isOfflineEngine && (
 <span className="flex items-center space-x-1 text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-700/50 px-2 py-0.5 rounded font-mono font-bold">
 <HardDrive size={10} />
 <span>Rig Edge Onboard Parser</span>
 </span>
 )}

 {/* OCR Triggered Badge (Correction #6) */}
 {uploadResult.file_type === 'pdf'&& (
 <span className={`px-2.5 py-0.5 rounded font-bold uppercase text-[11px] border ${
 uploadResult.ocr_triggered 
 ? 'bg-amber-950 border-amber-800 text-amber-300': 'bg-cyan-950 border-cyan-800 text-cyan-300'}`}>
 {uploadResult.ocr_triggered 
 ? 'OCR Fallback Triggered (Scanned Document)': 'Native Digital Text Parsed'}
 </span>
 )}

 {uploadResult.file_type === 'las'&& (
 <span className="px-2.5 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300 text-[11px] font-bold">
 Curves: {uploadResult.curves_identified?.join(',') ||'GR, RES, DT'}
 </span>
 )}
 </div>
 </div>
 </div>
 </div>

 {/* Extracted Incidents Table for PDF */}
 {uploadResult.events && uploadResult.events.length > 0 && (
 <div>
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center space-x-2">
 <Eye size={16} className="text-cyan-400"/>
 <h5 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
 AI-Extracted Operational Incidents ({uploadResult.events.length})
 </h5>
 </div>
 {uploadResult.guardrail_verified !== false && (
 <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 shadow-inner">
 <ShieldCheck size={11} className="text-emerald-400"/>
 <span> Guardrail Verified</span>
 </span>
 )}
 </div>

 <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-60 overflow-y-auto">
 <table className="w-full text-left text-xs border-collapse">
 <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0 font-mono">
 <tr>
 <th className="py-2 px-3">Event Type</th>
 <th className="py-2 px-3">Formation</th>
 <th className="py-2 px-3">Depth (TVD)</th>
 <th className="py-2 px-3">Severity</th>
 <th className="py-2 px-3">Mitigation Applied</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-800/60 font-mono">
 {uploadResult.events.map((ev, idx) => (
 <tr key={idx} className="hover:bg-slate-800/40">
 <td className="py-2 px-3 font-bold text-white">{ev.event_type}</td>
 <td className="py-2 px-3 text-cyan-300">{ev.formation}</td>
 <td className="py-2 px-3 text-slate-300">{ev.depth_tvd}m</td>
 <td className="py-2 px-3">
 <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-amber-300">
 {ev.severity}
 </span>
 </td>
 <td className="py-2 px-3 text-slate-300 max-w-xs truncate">{ev.mitigation_applied}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 </div>
 )}

 </div>

 {/* Footer */}
 <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex justify-between items-center text-xs">
 <span className="text-slate-400">Target well: <strong className="text-white font-mono">{activeWellId}</strong></span>
 
 <div className="flex items-center space-x-3">
 <button 
 onClick={uploadResult ? handleReset : onClose}
 className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800 transition font-medium">
 {uploadResult ? 'Upload Another': 'Cancel'}
 </button>

 {!uploadResult && (
 <button 
 onClick={handleUpload}
 disabled={!file || isUploading}
 className={`px-5 py-2 rounded-lg font-bold text-slate-950 flex items-center space-x-2 transition ${
 !file || isUploading 
 ? 'bg-slate-700 cursor-not-allowed opacity-70 text-slate-400': 'bg-cyan-500 hover:bg-cyan-400 shadow-lg shadow-cyan-500/20'}`}
 >
 {isUploading ? (
 <>
 <Loader2 size={16} className="animate-spin"/>
 <span>Parsing & Extracting...</span>
 </>
 ) : (
 <span>Ingest Document</span>
 )}
 </button>
 )}

 {uploadResult && (
 <button 
 onClick={() => {
 if (onUploadSuccess) {
 onUploadSuccess(uploadResult, targetWell);
 }
 onClose();
 }}
 className="px-5 py-2 rounded-lg font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-500/20 flex items-center space-x-2">
 <CheckCircle size={16} />
 <span>Apply & View on Dashboard</span>
 </button>
 )}
 </div>
 </div>

 </div>
 </div>
 );
};

export default DocumentUploadModal;
