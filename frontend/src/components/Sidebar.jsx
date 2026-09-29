import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  FileText,
  FolderOpen,
  Gauge,
  History,
  Info,
  LayoutDashboard,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Radar,
  Settings,
  Share2,
  Waves,
} from 'lucide-react';
import { useWell } from '../context/WellContext';

/**
 * Primary navigation.
 *
 * Replaces the old arrangement where every feature was a modal opened from a
 * header button (and some opened a second browser tab via query params). Each
 * entry is now a real route.
 *
 * Collapses to an icon rail. The width is owned here rather than by AppShell,
 * whose layout is a flex row with `main: flex-1` — so the sidebar only has to
 * change its own width and the routed page reflows on its own.
 */

const SECTIONS = [
  {
    title: 'Operate',
    items: [
      { to: '/', label: 'Command Center', icon: LayoutDashboard, end: true },
      { to: '/radar', label: 'Lookahead Radar', icon: Radar },
      { to: '/ppfg', label: 'PPFG Window', icon: Gauge },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { to: '/correlation', label: 'Cross-Well Correlation', icon: Waves },
      { to: '/dossier', label: 'Pre-Spud Dossier', icon: FileText },
      { to: '/backtest', label: 'Causal Backtest', icon: History },
    ],
  },
  {
    title: 'Knowledge',
    items: [
      { to: '/graph', label: 'Knowledge Graph', icon: Share2 },
      { to: '/documents', label: 'Documents', icon: FolderOpen },
      { to: '/assistant', label: 'Assistant', icon: MessageSquare },
      { to: '/contribute', label: 'Contribute Lesson', icon: PlusCircle },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/methodology', label: 'Data & Methodology', icon: Info },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const STORAGE_KEY = 'agate_sidebar_collapsed';

function StatusDot({ ok, label, collapsed }) {
  if (collapsed) {
    return (
      <span
        title={label}
        aria-label={label}
        className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`}
        style={{ boxShadow: ok ? '0 0 6px rgba(187, 187, 187,0.8)' : '0 0 6px rgba(158, 158, 158,0.8)' }}
      />
    );
  }
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`}
        style={{ boxShadow: ok ? '0 0 6px rgba(187, 187, 187,0.8)' : '0 0 6px rgba(158, 158, 158,0.8)' }}
      />
      <span className="text-slate-400">{label}</span>
    </div>
  );
}

/** 'OIL-BAGHJAN-1' -> 'BAG'. Used as the collapsed rail's well badge. */
function wellCode(wellId) {
  const tail = String(wellId || '').replace(/^OIL-/, '');
  return tail.split('-')[0].slice(0, 3).toUpperCase() || '---';
}

export default function Sidebar({ backendConnected, networkOnline }) {
  const { selectedWell } = useWell();

  // Read lazily so a storage failure (private window, blocked site data) still
  // yields a working sidebar rather than a crash.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* preference is a convenience; losing it is not worth failing over */
    }
  }, [collapsed]);

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-slate-800 bg-slate-950/80 transition-[width] duration-200 ease-out ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* Brand + collapse toggle */}
      <div className={`border-b border-slate-800 ${collapsed ? 'px-2 py-3' : 'px-4 py-4'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              aria-expanded={false}
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-cyan-300"
            >
              <PanelLeftOpen size={15} />
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 shrink-0 text-cyan-400" />
                <span className="font-display text-sm font-semibold tracking-wide text-slate-100">
                  AGATE
                </span>
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">
                Nearby Wells Intelligence
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              aria-expanded
              className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-cyan-300"
            >
              <PanelLeftClose size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Active well */}
      <div className={`border-b border-slate-800 ${collapsed ? 'flex justify-center px-1 py-3' : 'px-4 py-3'}`}>
        {collapsed ? (
          <span
            title={`Active well: ${selectedWell}`}
            className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-tight text-cyan-300"
          >
            {wellCode(selectedWell)}
          </span>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Active well</p>
            <p className="mt-0.5 truncate font-mono text-xs text-cyan-300" title={selectedWell}>
              {selectedWell}
            </p>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {SECTIONS.map((section, index) => (
          <div key={section.title} className="mb-4">
            {collapsed ? (
              // Section titles can't fit in the rail, so keep their grouping as a rule.
              // `first:hidden` would not work here — every section wraps its own
              // separator, so each one IS a first child and all of them would hide.
              index > 0 && <div className="mx-2 mb-2 border-t border-slate-800/80" />
            ) : (
              <p className="px-2 pb-1.5 text-[10px] uppercase tracking-widest text-slate-600">
                {section.title}
              </p>
            )}
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `mb-0.5 flex items-center rounded-md text-[12px] transition-colors ${
                    collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2 py-1.5'
                  } ${
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-300 ring-1 ring-inset ring-cyan-500/30'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`
                }
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Status */}
      <div
        className={`border-t border-slate-800 ${
          collapsed ? 'flex flex-col items-center gap-2 px-0 py-3' : 'space-y-1.5 px-4 py-3'
        }`}
      >
        <StatusDot
          ok={backendConnected}
          label={backendConnected ? 'Backend live' : 'Backend offline'}
          collapsed={collapsed}
        />
        <StatusDot
          ok={networkOnline}
          label={networkOnline ? 'Network up' : 'Network down'}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}
