import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { buildAgentTree } from '../../utils/buildAgentTree';
import { useAgentStore } from '../../stores/agentStore';
import { useUIStore } from '../../stores/uiStore';
import type { AgentTreeNode, BackgroundTaskStatus } from '../../types';

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<BackgroundTaskStatus, string> = {
  running: 'bg-cyan-400',
  completed: 'bg-green-400',
  error: 'bg-red-400',
  cancelled: 'bg-gray-400',
  resumed: 'bg-yellow-400',
};

interface StatusDotProps { status: BackgroundTaskStatus }

function StatusDot({ status }: StatusDotProps) {
  const color = STATUS_COLORS[status] ?? 'bg-gray-400';
  const pulse = status === 'running' ? 'animate-pulse' : '';
  return (
    <span
      data-testid={`status-dot-${status}`}
      className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${color} ${pulse}`}
    />
  );
}

// ── Chevron icon ──────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 text-gray-400 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      fill='none'
      viewBox='0 0 24 24'
      stroke='currentColor'
      strokeWidth={2}
    >
      <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
    </svg>
  );
}

// ── Pop-out icon ──────────────────────────────────────────────────────────────

function PopOutIcon() {
  return (
    <svg className='h-3 w-3' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
      <path strokeLinecap='round' strokeLinejoin='round' d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' />
    </svg>
  );
}

// ── Tree Node ─────────────────────────────────────────────────────────────────

const TRUNCATE_LEN = 30;

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
}

interface TreeNodeProps {
  node: AgentTreeNode;
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  onPopOut: (id: string) => void;
}

const TreeNode = React.memo(function TreeNode({
  node,
  selectedTaskId,
  onSelect,
  onPopOut,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(node.isExpanded);
  const { task, children } = node;
  const isSelected = selectedTaskId === task.sessionID;
  const hasChildren = children.length > 0;

  const label = task.agent || 'agent';
  const desc = truncate(task.description || '', TRUNCATE_LEN);

  return (
    <div>
      {/* Row */}
      <div
        data-testid='tree-node'
        className={[
          'group flex items-center gap-1 py-1 pr-2 cursor-pointer select-none',
          'hover:bg-gray-800/50 rounded',
          isSelected ? 'bg-blue-900/30 border-l-2 border-blue-500 pl-0' : 'border-l-2 border-transparent',
        ].join(' ')}
        style={{ paddingLeft: `${node.depth * 16 + (isSelected ? 0 : 2)}px` }}
        onClick={() => onSelect(task.sessionID)}
      >
        {/* Chevron — always reserve space */}
        <button
          aria-label={hasChildren ? (expanded ? 'Collapse' : 'Expand') : undefined}
          className='flex items-center justify-center w-4 h-4 flex-shrink-0'
          onClick={(e) => {
            if (!hasChildren) return;
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {hasChildren && <ChevronIcon open={expanded} />}
        </button>

        <StatusDot status={task.status} />

        <span className='text-xs text-gray-300 font-medium min-w-0 truncate'>
          {label}
        </span>
        {desc && (
          <span className='text-xs text-gray-500 min-w-0 truncate flex-1'>{desc}</span>
        )}

        {/* Pop-out button — visible on hover */}
        <button
          aria-label='Open floating panel'
          data-testid='popout-btn'
          className='ml-auto opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-200 flex-shrink-0 transition-opacity'
          onClick={(e) => {
            e.stopPropagation();
            onPopOut(task.sessionID);
          }}
        >
          <PopOutIcon />
        </button>
      </div>

      {/* Children */}
      {hasChildren && (
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key='children'
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              {children.map((child) => (
                <TreeNode
                  key={child.task.sessionID}
                  node={child}
                  selectedTaskId={selectedTaskId}
                  onSelect={onSelect}
                  onPopOut={onPopOut}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
});

// ── AgentTreeView ─────────────────────────────────────────────────────────────

export function AgentTreeView() {
  const tasksById = useAgentStore((s) => s.tasksById);
  const tasks = Object.values(tasksById);
  const selectedTaskId = useAgentStore((s) => s.selectedTaskId);
  const setSelectedTask = useAgentStore((s) => s.setSelectedTask);
  const openFloatingPanel = useUIStore((s) => s.openFloatingPanel);

  const tree = buildAgentTree(tasks);

  if (tree.length === 0) {
    return (
      <div className='flex items-center justify-center h-full text-gray-500 text-xs p-4'>
        No agents running
      </div>
    );
  }

  return (
    <div className='overflow-auto h-full py-1'>
      {tree.map((node) => (
        <TreeNode
          key={node.task.sessionID}
          node={node}
          selectedTaskId={selectedTaskId}
          onSelect={setSelectedTask}
          onPopOut={openFloatingPanel}
        />
      ))}
    </div>
  );
}