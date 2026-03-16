import type { BackgroundTask } from '../types';
import type { AgentTreeNode } from '../types';

/**
 * Builds a hierarchical tree of AgentTreeNode from a flat list of BackgroundTask.
 * - Tasks with no parentSessionID (or whose parent isn't in the list) are root nodes.
 * - Children are sorted by startedAt descending (most recent first).
 * - depth starts at 0 for root nodes.
 */
export function buildAgentTree(tasks: BackgroundTask[]): AgentTreeNode[] {
  if (tasks.length === 0) return [];

  // Build a set of all sessionIDs for quick lookup
  const sessionIdSet = new Set(tasks.map(t => t.sessionID));

  // Build parent→children map
  const childrenMap = new Map<string, BackgroundTask[]>();
  for (const task of tasks) {
    if (task.parentSessionID && sessionIdSet.has(task.parentSessionID)) {
      const siblings = childrenMap.get(task.parentSessionID) ?? [];
      siblings.push(task);
      childrenMap.set(task.parentSessionID, siblings);
    }
  }

  // Sort children arrays by startedAt desc
  for (const [key, children] of childrenMap.entries()) {
    childrenMap.set(
      key,
      [...children].sort((a, b) => {
        const ta = new Date(a.startedAt).getTime();
        const tb = new Date(b.startedAt).getTime();
        return tb - ta; // most recent first
      })
    );
  }

  // Root tasks: no parentSessionID, or parentSessionID not in the task list (orphans)
  const rootTasks = tasks.filter(
    t => !t.parentSessionID || !sessionIdSet.has(t.parentSessionID)
  );

  // Sort roots by startedAt desc as well
  rootTasks.sort((a, b) => {
    const ta = new Date(a.startedAt).getTime();
    const tb = new Date(b.startedAt).getTime();
    return tb - ta;
  });

  function buildNode(task: BackgroundTask, depth: number): AgentTreeNode {
    const children = (childrenMap.get(task.sessionID) ?? []).map(child =>
      buildNode(child, depth + 1)
    );
    return {
      task,
      children,
      depth,
      isExpanded: true,
    };
  }

  return rootTasks.map(t => buildNode(t, 0));
}