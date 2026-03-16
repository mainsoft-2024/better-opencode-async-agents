import { type ReactNode, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { motion } from 'framer-motion';
import { type Layout } from 'react-resizable-panels';
import { useUIStore } from '../../stores/uiStore';

interface DashboardLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  detail: ReactNode;
  header: ReactNode;
  bottomDrawer?: ReactNode;
}

const PANEL_IDS = ['sidebar', 'main', 'detail'] as const;

function layoutToSizes(layout: Layout): number[] {
  return PANEL_IDS.map((id) => layout[id] ?? 0);
}

export function DashboardLayout({
  sidebar,
  main,
  detail,
  header,
  bottomDrawer,
}: DashboardLayoutProps) {
  const layoutMode = useUIStore((state) => state.layoutMode);
  const panelSizes = useUIStore((state) => state.panelSizes);
  const setPanelSizes = useUIStore((state) => state.setPanelSizes);
  const timelineDrawerOpen = useUIStore((state) => state.timelineDrawerOpen);
  const setTimelineDrawerOpen = useUIStore((state) => state.setTimelineDrawerOpen);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (layoutMode === 'wide') {
    return (
      <div className="flex h-screen flex-col bg-gray-950 text-gray-100">
        <div className="flex-shrink-0">{header}</div>
        <Group
          orientation="horizontal"
          className="flex-1 overflow-hidden"
          onLayoutChanged={(layout) => setPanelSizes(layoutToSizes(layout))}
        >
          <Panel
            id="sidebar"
            defaultSize={panelSizes[0] ?? 25}
            minSize={15}
            className="overflow-hidden"
          >
            {sidebar}
          </Panel>

          <Separator className="w-1.5 bg-gray-800 transition-colors hover:bg-blue-500" />

          <Panel
            id="main"
            defaultSize={panelSizes[1] ?? 50}
            minSize={30}
            className="overflow-hidden"
          >
            {main}
          </Panel>

          <Separator className="w-1.5 bg-gray-800 transition-colors hover:bg-blue-500" />

          <Panel
            id="detail"
            defaultSize={panelSizes[2] ?? 25}
            minSize={15}
            className="overflow-hidden"
          >
            {detail}
          </Panel>
        </Group>
      </div>
    );
  }

  // Narrow mode — vertical stack
  return (
    <div className="flex h-screen flex-col bg-gray-950 text-gray-100">
      <div className="flex-shrink-0">{header}</div>

      {/* Collapsible sidebar */}
      <div className="flex-shrink-0">
        <button
          onClick={() => setSidebarCollapsed((c) => !c)}
          className="w-full border-b border-gray-800 px-4 py-2 text-left text-xs text-gray-400 hover:text-gray-200"
        >
          {sidebarCollapsed ? '▶ Show Sidebar' : '▼ Hide Sidebar'}
        </button>
        {!sidebarCollapsed && <div className="overflow-hidden">{sidebar}</div>}
      </div>

      {/* Main content */}
      <div className="min-h-0 flex-1 overflow-hidden">{main}</div>

      {/* Bottom drawer for timeline */}
      {bottomDrawer && (
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setTimelineDrawerOpen(!timelineDrawerOpen)}
            className="w-full border-t border-gray-800 bg-gray-900 px-4 py-1 text-center text-xs text-gray-400 hover:text-gray-200"
            aria-label="Toggle timeline drawer"
          >
            <span className="mx-auto block h-1 w-8 rounded-full bg-gray-600" />
          </button>
          <motion.div
            initial={false}
            animate={{ y: timelineDrawerOpen ? 0 : '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 overflow-hidden bg-gray-900"
          >
            {bottomDrawer}
          </motion.div>
        </div>
      )}
    </div>
  );
}