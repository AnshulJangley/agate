import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { WellProvider } from './context/WellContext';
import { API_BASE, isOnline, subscribeNetworkStatus } from './lib/api';

/**
 * Application shell: left navigation + the routed page.
 *
 * Backend reachability is polled here rather than in each page so the sidebar
 * status is the single place that answers "is the API up? " - and so pages can
 * stay focused on their own data.
 */

export default function AppShell() {
  const [backendConnected, setBackendConnected] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(() => isOnline());

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
        if (!cancelled) setBackendConnected(response.ok);
      } catch {
        if (!cancelled) setBackendConnected(false);
      }
    };

    check();
    const timer = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => subscribeNetworkStatus(setNetworkOnline), []);

  return (
    <WellProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-[#0B0B0B] text-slate-200">
        <Sidebar backendConnected={backendConnected} networkOnline={networkOnline} />
        <main className="min-w-0 flex-1 overflow-hidden">
          <Outlet context={{ backendConnected, networkOnline }} />
        </main>
      </div>
    </WellProvider>
  );
}
