import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  FileText,
  FolderOpen,
  Loader2,
  ScanText,
  Upload,
} from 'lucide-react';
import { useWell } from '../context/WellContext';
import { getDocumentChunks, listDocuments, uploadReport } from '../lib/agateApi';

/**
 * Document library for the ingested corpus.
 *
 * The upload path is byte-identical to the API's: a re-upload of the same file
 * resolves to the existing document and reports `duplicate` rather than
 * creating a second copy. That status is surfaced here rather than being
 * dressed up as a fresh success - the previous absence of it is what let
 * dozens of duplicate rows accumulate unnoticed.
 */

function StatusPill({ status }) {
  const styles = {
    ingested: 'bg-emerald-500/15 text-emerald-300',
    duplicate: 'bg-amber-500/15 text-amber-300',
    failed: 'bg-rose-500/15 text-rose-300',
    error: 'bg-rose-500/15 text-rose-300',
    success: 'bg-emerald-500/15 text-emerald-300',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${styles[status] || 'bg-slate-700/40 text-slate-400'}`}>
      {status}
    </span>
  );
}

export default function DocumentsView() {
  const { selectedWell } = useWell();
  const [docs, setDocs] = useState([]);
  const [dataSource, setDataSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileRef = useRef(null);

  const [openDoc, setOpenDoc] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [chunksLoading, setChunksLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listDocuments();
      setDocs(data.documents || []);
      setDataSource(data.data_source);
      if (data.data_source !== 'postgres') {
        setError(data.error || 'Document listing did not come from the database.');
      }
    } catch (err) {
      setError(err.message || 'Could not load the document library.');
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);
    setError(null);
    try {
      const result = await uploadReport(file, selectedWell);
      setUploadResult(result);
      await load();
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function openDocument(doc) {
    setOpenDoc(doc);
    setChunks([]);
    setChunksLoading(true);
    try {
      const data = await getDocumentChunks(doc.id);
      setChunks(data.chunks || []);
    } catch (err) {
      setError(err.message || 'Could not load chunks.');
    } finally {
      setChunksLoading(false);
    }
  }

  return (
    <div className="flex h-full gap-4 p-5">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-100">
              <FolderOpen className="h-4 w-4 text-cyan-400" />
              Documents
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Ingested drilling reports. Each file is hashed; re-uploading the same content is a no-op.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {dataSource && (
              <span
                className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                  dataSource === 'postgres'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-amber-500/15 text-amber-300'
                }`}
              >
                {dataSource}
              </span>
            )}
            <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] text-cyan-300 transition-colors hover:bg-cyan-500/20">
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {uploading ? 'Ingesting…' : 'Upload report'}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.las"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </header>

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {uploadResult && (
          <div className="mb-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 text-[11px]">
            <div className="flex items-center gap-2">
              <StatusPill status={uploadResult.status} />
              <span className="text-slate-300">{uploadResult.message}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-slate-500 sm:grid-cols-4">
              <span>doc #{uploadResult.document_id ?? '—'}</span>
              <span>chunks {uploadResult.chunk_count ?? 0}</span>
              <span>incidents {uploadResult.extracted_count ?? 0}</span>
              <span>ocr {String(uploadResult.ocr_triggered ?? false)}</span>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60">
          {loading && (
            <div className="flex h-32 items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading library…
            </div>
          )}

          {!loading && docs.length === 0 && (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <FileText className="h-5 w-5 text-slate-700" />
              No documents ingested yet. Upload a DDR or WCR PDF to start building institutional memory.
            </div>
          )}

          {!loading && docs.length > 0 && (
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-950/95 text-[10px] uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Well</th>
                  <th className="px-3 py-2 font-medium">Chunks</th>
                  <th className="px-3 py-2 font-medium">OCR</th>
                  <th className="px-3 py-2 font-medium">Ingested</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => openDocument(d)}
                    className={`cursor-pointer border-t border-slate-800/70 transition-colors hover:bg-slate-800/40 ${
                      openDoc && openDoc.id === d.id ? 'bg-cyan-500/5' : ''
                    }`}
                  >
                    <td className="max-w-[280px] truncate px-3 py-2 text-slate-300" title={d.filename}>
                      {d.filename}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-400">{d.well_id || '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{d.chunk_count}</td>
                    <td className="px-3 py-2 text-slate-400">{d.ocr_triggered ? 'yes' : 'no'}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {(d.created_at || '').slice(0, 19).replace('T', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Chunk inspector */}
      <aside className="w-80 shrink-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        {!openDoc && (
          <p className="text-[11px] leading-relaxed text-slate-500">
            Select a document to inspect its extracted chunks and embedding coverage.
          </p>
        )}

        {openDoc && (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-600">Document</p>
              <p className="break-all text-[11px] text-slate-300">{openDoc.filename}</p>
            </div>

            <div className="grid grid-cols-2 gap-y-1 font-mono text-[10px] text-slate-500">
              <span>sha256</span>
              <span className="truncate text-slate-400">{(openDoc.sha256 || '').slice(0, 12)}…</span>
              <span>chars</span>
              <span className="text-slate-400">{openDoc.char_count}</span>
              <span>chunks</span>
              <span className="text-slate-400">{openDoc.chunk_count}</span>
            </div>

            <div className="border-t border-slate-800 pt-2">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
                <ScanText className="h-3 w-3" /> Chunks
              </p>

              {chunksLoading && (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </p>
              )}

              {!chunksLoading && chunks.length === 0 && (
                <p className="text-[11px] text-slate-500">No chunks stored for this document.</p>
              )}

              <ul className="space-y-2">
                {chunks.map((c) => (
                  <li key={c.chunk_index} className="rounded border border-slate-800 bg-slate-900/40 p-2">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-slate-600">
                      <span>#{c.chunk_index}</span>
                      <span className={c.embedded ? 'text-emerald-400' : 'text-amber-400'}>
                        {c.embedded ? 'embedded' : 'no vector'}
                      </span>
                    </div>
                    <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-slate-400">
                      {c.text}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
