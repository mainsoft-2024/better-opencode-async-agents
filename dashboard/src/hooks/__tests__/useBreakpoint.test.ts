import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBreakpoint } from '../useBreakpoint';
import { useUIStore } from '../../stores/uiStore';

// Set up window.matchMedia mock in jsdom
function setMatchMedia(matches: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  const mql = {
    matches,
    media: '(min-width: 1024px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.push(listener as (e: MediaQueryListEvent) => void);
    },
    removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      const idx = listeners.indexOf(listener as (e: MediaQueryListEvent) => void);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    dispatchEvent: vi.fn(() => true),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn(() => mql),
  });
  return { mql, listeners };
}

describe('useBreakpoint', () => {
  beforeEach(() => {
    // Reset uiStore to default state
    useUIStore.setState({ layoutMode: 'wide' });
  });

  it('sets layoutMode to wide when viewport is >= 1024px', () => {
    setMatchMedia(true);

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('wide');
    expect(useUIStore.getState().layoutMode).toBe('wide');
  });

  it('sets layoutMode to narrow when viewport is < 1024px', () => {
    setMatchMedia(false);

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('narrow');
    expect(useUIStore.getState().layoutMode).toBe('narrow');
  });

  it('calls setLayoutMode on uiStore based on initial matchMedia result', () => {
    setMatchMedia(false);
    const setLayoutMode = vi.spyOn(useUIStore.getState(), 'setLayoutMode');

    renderHook(() => useBreakpoint());
    expect(setLayoutMode).toHaveBeenCalledWith('narrow');
  });

  it('responds to resize events and updates layoutMode', () => {
    const { listeners } = setMatchMedia(true);

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('wide');

    // Simulate resize to narrow
    act(() => {
      listeners.forEach((listener) => {
        listener({ matches: false } as MediaQueryListEvent);
      });
    });

    expect(useUIStore.getState().layoutMode).toBe('narrow');
  });

  it('registers and cleans up the change event listener', () => {
    const addEventSpy = vi.fn();
    const removeEventSpy = vi.fn();
    const { mql } = setMatchMedia(true);
    mql.addEventListener = addEventSpy;
    mql.removeEventListener = removeEventSpy;

    const { unmount } = renderHook(() => useBreakpoint());
    expect(addEventSpy).toHaveBeenCalledWith('change', expect.any(Function));

    unmount();
    expect(removeEventSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });
});