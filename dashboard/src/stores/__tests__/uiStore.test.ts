import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('setLayoutMode updates layoutMode', () => {
    useUIStore.getState().setLayoutMode('narrow');

    expect(useUIStore.getState().layoutMode).toBe('narrow');
  });

  it('setPanelSizes updates array', () => {
    const nextSizes = [20, 60, 20];

    useUIStore.getState().setPanelSizes(nextSizes);

    expect(useUIStore.getState().panelSizes).toEqual(nextSizes);
  });

  it('toggleGraphMode flips boolean', () => {
    expect(useUIStore.getState().graphMode).toBe(false);

    useUIStore.getState().toggleGraphMode();
    expect(useUIStore.getState().graphMode).toBe(true);

    useUIStore.getState().toggleGraphMode();
    expect(useUIStore.getState().graphMode).toBe(false);
  });

  it('openFloatingPanel adds panel with defaults', () => {
    useUIStore.getState().openFloatingPanel('task-1');

    const panels = useUIStore.getState().floatingPanels;

    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({
      taskId: 'task-1',
      size: { width: 320, height: 240 },
      minimized: false,
      zIndex: 1,
    });
    expect(panels[0].id).toBeTypeOf('string');
  });

  it('closeFloatingPanel removes panel', () => {
    useUIStore.getState().openFloatingPanel('task-1');
    const panelId = useUIStore.getState().floatingPanels[0]?.id as string;

    useUIStore.getState().closeFloatingPanel(panelId);

    expect(useUIStore.getState().floatingPanels).toHaveLength(0);
  });

  it('updateFloatingPanel merges partial', () => {
    useUIStore.getState().openFloatingPanel('task-1');
    const panelId = useUIStore.getState().floatingPanels[0]?.id as string;

    useUIStore.getState().updateFloatingPanel(panelId, {
      minimized: true,
      position: { x: 300, y: 120 },
    });

    const updated = useUIStore.getState().floatingPanels[0];

    expect(updated.minimized).toBe(true);
    expect(updated.position).toEqual({ x: 300, y: 120 });
    expect(updated.size).toEqual({ width: 320, height: 240 });
  });
});