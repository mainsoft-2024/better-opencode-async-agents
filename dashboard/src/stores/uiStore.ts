import { create } from 'zustand';

export interface FloatingPanelState {
  id: string;
  taskId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  minimized: boolean;
  zIndex: number;
}

type LayoutMode = 'wide' | 'narrow';

export interface UIStore {
  layoutMode: LayoutMode;
  panelSizes: number[];
  graphMode: boolean;
  timelineDrawerOpen: boolean;
  floatingPanels: FloatingPanelState[];
  setLayoutMode: (mode: LayoutMode) => void;
  setPanelSizes: (sizes: number[]) => void;
  toggleGraphMode: () => void;
  setTimelineDrawerOpen: (open: boolean) => void;
  openFloatingPanel: (taskId: string, position?: { x: number; y: number }) => void;
  updateFloatingPanel: (id: string, update: Partial<FloatingPanelState>) => void;
  closeFloatingPanel: (id: string) => void;
}

const DEFAULT_PANEL_SIZE = { width: 320, height: 240 };
const DEFAULT_PANEL_POSITION = { x: 100, y: 100 };

const createPanelId = () =>
  `panel_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const useUIStore = create<UIStore>()((set) => ({
  layoutMode: 'wide',
  panelSizes: [25, 50, 25],
  graphMode: false,
  timelineDrawerOpen: false,
  floatingPanels: [],

  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setPanelSizes: (sizes) => set({ panelSizes: sizes }),
  toggleGraphMode: () => set((state) => ({ graphMode: !state.graphMode })),
  setTimelineDrawerOpen: (open) => set({ timelineDrawerOpen: open }),

  openFloatingPanel: (taskId, position) =>
    set((state) => {
      const maxZIndex = state.floatingPanels.reduce(
        (max, panel) => Math.max(max, panel.zIndex),
        0,
      );

      return {
        floatingPanels: [
          ...state.floatingPanels,
          {
            id: createPanelId(),
            taskId,
            position: position ?? DEFAULT_PANEL_POSITION,
            size: DEFAULT_PANEL_SIZE,
            minimized: false,
            zIndex: maxZIndex + 1,
          },
        ],
      };
    }),

  updateFloatingPanel: (id, update) =>
    set((state) => ({
      floatingPanels: state.floatingPanels.map((panel) =>
        panel.id === id ? { ...panel, ...update } : panel,
      ),
    })),

  closeFloatingPanel: (id) =>
    set((state) => ({
      floatingPanels: state.floatingPanels.filter((panel) => panel.id !== id),
    })),
}));

export const useLayoutMode = () => useUIStore((state) => state.layoutMode);
export const useGraphMode = () => useUIStore((state) => state.graphMode);
export const useFloatingPanels = () => useUIStore((state) => state.floatingPanels);
export const usePanelSizes = () => useUIStore((state) => state.panelSizes);