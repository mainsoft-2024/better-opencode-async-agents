import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';

/**
 * Listens to viewport width changes and updates uiStore.layoutMode.
 * Returns the current layoutMode ('wide' | 'narrow').
 */
export function useBreakpoint() {
  const setLayoutMode = useUIStore.getState().setLayoutMode;
  const layoutMode = useUIStore((state) => state.layoutMode);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setLayoutMode(e.matches ? 'wide' : 'narrow');
    };

    // Set initial value
    handleChange(mql);

    // Listen for changes
    mql.addEventListener('change', handleChange);

    return () => {
      mql.removeEventListener('change', handleChange);
    };
  }, [setLayoutMode]);

  return layoutMode;
}