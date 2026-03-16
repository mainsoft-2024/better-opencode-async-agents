import React, { Suspense } from 'react';
import { useGraphMode, useUIStore } from '../../stores/uiStore';
import { AgentTreeView } from './AgentTreeView';

const LazyAgentGraphView = React.lazy(() => import('./AgentGraphView'));

export function AgentPane() {
  const graphMode = useGraphMode();
  const toggleGraphMode = useUIStore((s) => s.toggleGraphMode);

  return (
    <div className="flex h-full flex-col">
      {/* Toggle button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Agents</span>
        <button
          onClick={toggleGraphMode}
          className="text-[11px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          title={graphMode ? 'Switch to tree view' : 'Switch to graph view'}
        >
          {graphMode ? 'Tree' : 'Graph'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {graphMode ? (
          <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500 text-xs">Loading graph…</div>}>
            <LazyAgentGraphView />
          </Suspense>
        ) : (
          <AgentTreeView />
        )}
      </div>
    </div>
  );
}