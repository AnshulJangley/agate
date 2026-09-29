import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Shared "active well" selection across every page.
 *
 * The cockpit used to own this in local state, which was fine when it was the
 * only screen. Now that each feature lives on its own route, the selection has
 * to outlive a route change - otherwise every navigation resets the well and
 * the engineer loses their place. Persisted to localStorage for the same reason.
 */

const STORAGE_KEY = 'agate_selected_well_v1';

export const DEFAULT_WELL = 'OIL-MORAN-1';

const WellContext = createContext(null);

export function WellProvider({ children }) {
  const [selectedWell, setSelectedWell] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_WELL;
    } catch {
      return DEFAULT_WELL;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, selectedWell);
    } catch {
      // Private browsing or blocked storage - the in-memory value still works.
    }
  }, [selectedWell]);

  return (
    <WellContext.Provider value={{ selectedWell, setSelectedWell }}>
      {children}
    </WellContext.Provider>
  );
}

export function useWell() {
  const ctx = useContext(WellContext);
  if (!ctx) {
    throw new Error('useWell must be used inside a WellProvider');
  }
  return ctx;
}

export default WellContext;
