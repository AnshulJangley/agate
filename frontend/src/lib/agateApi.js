/**
 * Client for the AGATE knowledge-layer endpoints added in Phases 2-4.
 *
 * Reuses the base URL resolution in lib/api.js so the local-rig / cloud
 * switching behaviour (and the offline story) stays in one place.
 *
 * Every graph/chat response carries a `data_source` field. Components should
 * surface it when it is not 'postgres' - this codebase degrades silently to
 * bundled JSON in several places, and a green response is not proof the
 * database was read.
 */

import { API_BASE } from './api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body && body.detail) detail = body.detail;
    } catch {
      // Non-JSON error body; the status line is all we have.
    }
    throw new Error(detail);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Knowledge graph (Phase 2)
// ---------------------------------------------------------------------------

export const getGraphOverview = () => request('/api/graph/overview');

export const getGraphStats = () => request('/api/graph/stats');

export const getGraphNode = (nodeRef) =>
  request(`/api/graph/node/${encodeURIComponent(nodeRef)}`);

export const getGraphNeighbors = (nodeRef, depth = 1) =>
  request(`/api/graph/neighbors/${encodeURIComponent(nodeRef)}?depth=${depth}`);

export const rebuildGraph = () =>
  request('/api/graph/rebuild', { method: 'POST' });

// ---------------------------------------------------------------------------
// Assistant chat (Phase 3)
// ---------------------------------------------------------------------------

export const sendChat = ({ message, sessionId = null, wellId = null, depthTvd = null }) =>
  request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      session_id: sessionId,
      well_id: wellId,
      depth_tvd: depthTvd,
    }),
  });

export const listChatSessions = () => request('/api/chat/sessions');

export const getChatSession = (sessionId) => request(`/api/chat/sessions/${sessionId}`);

// ---------------------------------------------------------------------------
// Documents (Phase 4)
// ---------------------------------------------------------------------------

export const listDocuments = () => request('/api/documents');

export const getDocumentChunks = (documentId, limit = 50) =>
  request(`/api/documents/${documentId}/chunks?limit=${limit}`);

export async function uploadReport(file, wellId) {
  const form = new FormData();
  form.append('file', file);
  if (wellId) form.append('well_id', wellId);

  // No Content-Type header - the browser must set the multipart boundary.
  const response = await fetch(`${API_BASE}/api/upload-report`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}
