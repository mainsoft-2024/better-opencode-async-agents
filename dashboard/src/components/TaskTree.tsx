import { useMemo } from "react";
import type { BackgroundTask } from "../types";
import { BatchGroup } from "./BatchGroup";

type TaskTreeProps = {
  tasks: BackgroundTask[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
};

type TaskGroup = {
  batchId: string;
  tasks: BackgroundTask[];
  latestStartedAt: number;
};

export function TaskTree({ tasks, selectedTaskId, onSelectTask }: TaskTreeProps) {
  const groupedTasks = useMemo<TaskGroup[]>(() => {
    const groups = new Map<string, TaskGroup>();

    for (const task of tasks) {
      const startedAt = Number.isNaN(Date.parse(task.startedAt))
        ? 0
        : Date.parse(task.startedAt);
      const existing = groups.get(task.batchId);

      if (existing) {
        existing.tasks.push(task);
        existing.latestStartedAt = Math.max(existing.latestStartedAt, startedAt);
      } else {
        groups.set(task.batchId, {
          batchId: task.batchId,
          tasks: [task],
          latestStartedAt: startedAt,
        });
      }
    }

    return Array.from(groups.values()).sort(
      (a, b) => b.latestStartedAt - a.latestStartedAt,
    );
  }, [tasks]);

  if (groupedTasks.length === 0) {
    return (
      <div className="h-full overflow-y-auto rounded-lg border border-gray-800 bg-gray-950 p-4">
        <p className="text-sm text-gray-400">No tasks yet.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto rounded-lg border border-gray-800 bg-gray-950 p-3">
      <div className="space-y-3">
        {groupedTasks.map((group) => (
          <BatchGroup
            key={group.batchId}
            batchId={group.batchId}
            tasks={group.tasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
          />
        ))}
      </div>
    </div>
  );
}