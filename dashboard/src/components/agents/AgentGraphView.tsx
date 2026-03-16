import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

import { useAgentStore } from '../../stores/agentStore';
import type { BackgroundTask, BackgroundTaskStatus } from '../../types';

// ──────────────────────────────────────────────
// Custom node component
// ──────────────────────────────────────────────

interface AgentNodeData {
  label: string;
  status: BackgroundTaskStatus;
  agent: string;
  selected: boolean;
  [key: string]: unknown;
}

const STATUS_COLORS: Record<BackgroundTaskStatus, string> = {
  running: 'border-cyan-400',
  completed: 'border-green-500',
  error: 'border-red-500',
  cancelled: 'border-gray-500',
  resumed: 'border-blue-400',
};

const STATUS_BG: Record<BackgroundTaskStatus, string> = {
  running: 'bg-cyan-950/60',
  completed: 'bg-green-950/60',
  error: 'bg-red-950/60',
  cancelled: 'bg-gray-900/60',
  resumed: 'bg-blue-950/60',
};

function AgentNode({ data }: NodeProps) {
  const d = data as AgentNodeData;
  const borderColor = STATUS_COLORS[d.status] ?? 'border-gray-600';
  const bg = STATUS_BG[d.status] ?? 'bg-gray-900/60';
  const isRunning = d.status === 'running';

  return (
    <div
      className={[
        'rounded-lg border-2 px-3 py-2 text-xs font-medium backdrop-blur-sm',
        'cursor-pointer transition-all duration-150',
        bg,
        borderColor,
        d.selected ? 'ring-2 ring-white/40 shadow-lg shadow-white/10' : '',
        isRunning ? 'animate-pulse-border' : '',
      ].join(' ')}
      style={{ width: 180, minHeight: 60 }}
    >
      <div className='text-[10px] text-gray-400 uppercase tracking-wide truncate'>
        {d.agent}
      </div>
      <div className='mt-0.5 text-white/90 truncate leading-snug' title={d.label}>
        {d.label.length > 60 ? d.label.slice(0, 57) + '…' : d.label}
      </div>
      {isRunning && (
        <span className='absolute top-1 right-1 h-2 w-2 rounded-full bg-cyan-400 animate-ping' />
      )}
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode };

// ──────────────────────────────────────────────
// Dagre layout helper
// ──────────────────────────────────────────────

const NODE_W = 180;
const NODE_H = 60;

function applyDagreLayout(
  rawNodes: Node[],
  rawEdges: Edge[],
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of rawNodes) {
    g.setNode(node.id, { width: NODE_W, height: NODE_H });
  }
  for (const edge of rawEdges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return rawNodes.map((node) => {
    const n = g.node(node.id);
    return {
      ...node,
      position: { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 },
    };
  });
}

// ──────────────────────────────────────────────
// Build nodes + edges from tasks
// ──────────────────────────────────────────────

function buildGraphElements(
  tasksById: Record<string, BackgroundTask>,
  taskOrder: string[],
  selectedTaskId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const rawNodes: Node[] = taskOrder
    .map((id) => tasksById[id])
    .filter((t): t is BackgroundTask => Boolean(t))
    .map((task) => ({
      id: task.sessionID,
      type: 'agentNode',
      position: { x: 0, y: 0 },
      data: {
        label: task.description || task.agent,
        status: task.status,
        agent: task.agent,
        selected: task.sessionID === selectedTaskId,
      },
    }));

  const edges: Edge[] = taskOrder
    .map((id) => tasksById[id])
    .filter((t): t is BackgroundTask => Boolean(t) && Boolean(t.parentSessionID))
    .map((task) => ({
      id: `e-${task.parentSessionID}-${task.sessionID}`,
      source: task.parentSessionID,
      target: task.sessionID,
      animated: task.status === 'running',
      style: { stroke: '#6b7280', strokeWidth: 1.5 },
    }));

  const nodes = applyDagreLayout(rawNodes, edges);
  return { nodes, edges };
}

// ──────────────────────────────────────────────
// Main component (default export for React.lazy)
// ──────────────────────────────────────────────

export default function AgentGraphView() {
  const tasksById = useAgentStore((s) => s.tasksById);
  const taskOrder = useAgentStore((s) => s.taskOrder);
  const selectedTaskId = useAgentStore((s) => s.selectedTaskId);
  const setSelectedTask = useAgentStore((s) => s.setSelectedTask);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Rebuild graph whenever tasks or selection change
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildGraphElements(
      tasksById,
      taskOrder,
      selectedTaskId,
    );
    setNodes(newNodes);
    setEdges(newEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksById, taskOrder, selectedTaskId]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedTask(node.id);
    },
    [setSelectedTask],
  );

  return (
    <div className='w-full h-full bg-gray-950'>
      <style>{`
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,0.4); }
          50%       { box-shadow: 0 0 0 4px rgba(34,211,238,0.15); }
        }
        .animate-pulse-border { animation: pulse-border 2s ease-in-out infinite; }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        className='bg-gray-950'
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color='#374151' />
        <Controls showInteractive={false} className='bg-gray-800 border-gray-700' />
      </ReactFlow>
    </div>
  );
}