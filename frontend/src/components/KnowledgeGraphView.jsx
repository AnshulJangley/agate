import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Share2 } from 'lucide-react';
import { getGraphNeighbors, getGraphOverview, rebuildGraph } from '../lib/agateApi';

/**
 * Knowledge-graph view.
 *
 * Renders the persisted graph from /api/graph/overview - the same graph the
 * backend rebuilds deterministically from wells and events, plus the Document
 * nodes added by ingestion.
 *
 * The layout is a hand-rolled Fruchterman-Reingold simulation rather than a
 * graph library: the corpus is tens of nodes, so a dependency would cost more
 * than it saves. It runs once per data change, not per frame.
 */

const NODE_COLOURS = {
  Well: '#C1C1C1',
  Event: '#C8C8C8',
  Formation: '#9D9D9D',
  Hazard: '#9E9E9E',
  Intervention: '#BBBBBB',
  Outcome: '#A2A2A2',
  Document: '#B1B1B1',
};

const NODE_RADIUS = { Well: 9, Hazard: 8, Document: 8, Formation: 6, Intervention: 6, Outcome: 5, Event: 4 };
const FALLBACK_COLOUR = '#737373';

const WIDTH = 900;
const HEIGHT = 620;

function computeLayout(nodes, edges) {
  const positions = new Map();
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  // Deterministic seed ring - no randomness, so the same graph lays out the
  // same way on every render.
  nodes.forEach((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
    const radius = Math.min(WIDTH, HEIGHT) * 0.34;
    positions.set(node.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  });

  const count = Math.max(1, nodes.length);
  const k = Math.sqrt((WIDTH * HEIGHT) / count);
  let temperature = WIDTH / 12;

  for (let iter = 0; iter < 300; iter += 1) {
    const disp = new Map(nodes.map((n) => [n.id, { x: 0, y: 0 }]));

    // Repulsion between every pair.
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = positions.get(nodes[i].id);
        const b = positions.get(nodes[j].id);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const force = (k * k) / dist;
        const ux = dx / dist;
        const uy = dy / dist;
        disp.get(nodes[i].id).x += ux * force;
        disp.get(nodes[i].id).y += uy * force;
        disp.get(nodes[j].id).x -= ux * force;
        disp.get(nodes[j].id).y -= uy * force;
      }
    }

    // Attraction along edges.
    edges.forEach((edge) => {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) return;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = (dist * dist) / k;
      const ux = dx / dist;
      const uy = dy / dist;
      disp.get(edge.source).x -= ux * force;
      disp.get(edge.source).y -= uy * force;
      disp.get(edge.target).x += ux * force;
      disp.get(edge.target).y += uy * force;
    });

    nodes.forEach((node) => {
      const d = disp.get(node.id);
      const p = positions.get(node.id);
      const len = Math.hypot(d.x, d.y) || 0.01;
      p.x += (d.x / len) * Math.min(len, temperature);
      p.y += (d.y / len) * Math.min(len, temperature);
      p.x = Math.max(24, Math.min(WIDTH - 24, p.x));
      p.y = Math.max(24, Math.min(HEIGHT - 24, p.y));
    });

    temperature *= 0.97;
  }

  return positions;
}

function shortLabel(node) {
  const name = node.name || node.id || '';
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

export default function KnowledgeGraphView() {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [hidden, setHidden] = useState(() => new Set());
  const [selected, setSelected] = useState(null);
  const [neighbours, setNeighbours] = useState(null);
  const [hovered, setHovered] = useState(null);
  const svgRef = useRef(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getGraphOverview();
      setGraph(data);
      if (data && data.data_source && data.data_source !== 'postgres') {
        setError(data.error || 'Graph data did not come from the database.');
      }
    } catch (err) {
      setError(err.message || 'Could not load the knowledge graph.');
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const { nodes, edges } = useMemo(() => {
    const allNodes = (graph && graph.nodes) || [];
    const allEdges = (graph && graph.edges) || [];
    const visible = allNodes.filter((n) => !hidden.has(n.label));
    const visibleIds = new Set(visible.map((n) => n.id));
    const keptEdges = allEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
    return { nodes: visible, edges: keptEdges };
  }, [graph, hidden]);

  const positions = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);

  const labels = useMemo(() => {
    const counts = new Map();
    ((graph && graph.nodes) || []).forEach((n) => {
      counts.set(n.label, (counts.get(n.label) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [graph]);

  async function selectNode(node) {
    setSelected(node);
    setNeighbours(null);
    try {
      const result = await getGraphNeighbors(node.id, 1);
      setNeighbours(result);
    } catch {
      setNeighbours({ nodes: [], edges: [], found: false });
    }
  }

  async function handleRebuild() {
    setRebuilding(true);
    try {
      await rebuildGraph();
      await load();
    } catch (err) {
      setError(err.message || 'Rebuild failed.');
    } finally {
      setRebuilding(false);
    }
  }

  function toggleLabel(label) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const dataSource = graph && graph.data_source;
  const staleSource = dataSource && dataSource !== 'postgres';

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-100">
            <Share2 className="h-4 w-4 text-cyan-400" />
            Knowledge Graph
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Entities and relationships persisted from wells, offset-well events and ingested documents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dataSource && (
            <span
              className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                staleSource ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
              }`}
              title="Where this payload came from"
            >
              {dataSource}
            </span>
          )}
          <button
            type="button"
            onClick={handleRebuild}
            disabled={rebuilding}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-50"
          >
            {rebuilding ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Rebuild
          </button>
        </div>
      </header>

      {/* Legend / filters */}
      <div className="flex flex-wrap gap-1.5">
        {labels.map(([label, count]) => {
          const off = hidden.has(label);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleLabel(label)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                off
                  ? 'border-slate-800 text-slate-600'
                  : 'border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: off ? '#404040' : NODE_COLOURS[label] || FALLBACK_COLOUR }}
              />
              {label}
              <span className="text-slate-500">{count}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Canvas */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading graph…
            </div>
          )}

          {!loading && nodes.length === 0 && !error && (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              No nodes to display. Try Rebuild.
            </div>
          )}

          {!loading && nodes.length > 0 && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-full w-full"
              role="img"
              aria-label={`Knowledge graph with ${nodes.length} nodes and ${edges.length} edges`}
            >
              {edges.map((edge, index) => {
                const a = positions.get(edge.source);
                const b = positions.get(edge.target);
                if (!a || !b) return null;
                const active =
                  selected && (edge.source === selected.id || edge.target === selected.id);
                return (
                  <line
                    key={`${edge.source}-${edge.target}-${index}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={active ? '#C1C1C1' : '#292929'}
                    strokeWidth={active ? 1.6 : 0.8}
                    opacity={selected && !active ? 0.25 : 0.9}
                  />
                );
              })}

              {nodes.map((node) => {
                const p = positions.get(node.id);
                if (!p) return null;
                const radius = NODE_RADIUS[node.label] || 5;
                const colour = NODE_COLOURS[node.label] || FALLBACK_COLOUR;
                const isSelected = selected && selected.id === node.id;
                const dim = selected && !isSelected;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${p.x},${p.y})`}
                    onClick={() => selectNode(node)}
                    onMouseEnter={() => setHovered(node)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: 'pointer', opacity: dim ? 0.3 : 1 }}
                  >
                    {isSelected && (
                      <circle r={radius + 5} fill="none" stroke={colour} strokeWidth={1} opacity={0.5} />
                    )}
                    <circle r={radius} fill={colour} fillOpacity={0.85} stroke={colour} strokeWidth={1} />
                    {(node.label === 'Well' || node.label === 'Document' || isSelected) && (
                      <text
                        x={radius + 4}
                        y={3}
                        fontSize={9}
                        fill="#A2A2A2"
                        className="pointer-events-none select-none"
                      >
                        {shortLabel(node)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] text-slate-600">
            {nodes.length} nodes · {edges.length} edges
            {hidden.size > 0 ? ` · ${hidden.size} label(s) hidden` : ''}
          </div>

          {hovered && (
            <div className="pointer-events-none absolute right-3 top-3 max-w-[240px] rounded-md border border-slate-700 bg-slate-900/95 px-2.5 py-1.5 text-[10px] text-slate-300">
              <div className="font-mono text-cyan-300">{hovered.id}</div>
              <div className="text-slate-500">{hovered.label}</div>
            </div>
          )}
        </div>

        {/* Inspector */}
        <aside className="w-72 shrink-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          {!selected && (
            <p className="text-[11px] leading-relaxed text-slate-500">
              Select a node to inspect it and its immediate neighbourhood.
            </p>
          )}

          {selected && (
            <div className="space-y-3">
              <div>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                  style={{
                    background: `${NODE_COLOURS[selected.label] || FALLBACK_COLOUR}22`,
                    color: NODE_COLOURS[selected.label] || FALLBACK_COLOUR,
                  }}
                >
                  {selected.label}
                </span>
                <h2 className="mt-1.5 break-all font-mono text-xs text-slate-200">{selected.id}</h2>
              </div>

              {Object.entries(selected)
                .filter(([k]) => !['id', 'label', 'type'].includes(k))
                .map(([key, value]) => (
                  <div key={key}>
                    <p className="text-[10px] uppercase tracking-wider text-slate-600">{key}</p>
                    <p className="break-words text-[11px] text-slate-300">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </p>
                  </div>
                ))}

              <div className="border-t border-slate-800 pt-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-600">Neighbours</p>
                {!neighbours && (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </p>
                )}
                {neighbours && neighbours.found === false && (
                  <p className="mt-1 text-[11px] text-slate-500">Not found in the persisted graph.</p>
                )}
                {neighbours && neighbours.found !== false && (
                  <ul className="mt-1 space-y-1">
                    {(neighbours.nodes || [])
                      .filter((n) => n.id !== selected.id)
                      .map((n) => (
                        <li key={n.id} className="flex items-center gap-1.5 text-[11px]">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: NODE_COLOURS[n.label] || FALLBACK_COLOUR }}
                          />
                          <span className="truncate text-slate-400">{n.id}</span>
                        </li>
                      ))}
                    {(neighbours.nodes || []).length <= 1 && (
                      <li className="text-[11px] text-slate-500">No neighbours.</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
