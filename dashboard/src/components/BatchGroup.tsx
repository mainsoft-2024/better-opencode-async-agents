import { useMemo, useState } from "react";
import type { BackgroundTask } from "../types";
import { TaskCard } from "./TaskCard";

type BatchGroupProps = {
  batchId: string;
  tasks: BackgroundTask[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
};

function truncateBatchId(batchId: string): string {
  if (batchId.length <= 12) return batchId;
  return `${batchId.slice(0, 12)}...`;
}

export function BatchGroup({
  batchId,
  tasks,
  selectedTaskId,
  onSelectTask,
}: BatchGroupProps) {
  const hasRunningTasks = useMemo(
    () => tasks.some((task) => task.status === "running"),
    [tasks],
  );
  const [isExpanded, setIsExpanded] = useState(hasRunningTasks);

  const totalTasks = tasks.length;
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status !== "running").length,
    [tasks],
  );
  const completionPercent =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/70">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/60"
      >
        <span className="text-xs text-gray-400">{isExpanded ? "▼" : "▶"}</span>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-100">
              {truncateBatchId(batchId)}
            </span>
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
              {totalTasks} task{totalTasks === 1 ? "" : "s"}
            </span>
            <span className="text-xs text-gray-500">{completionPercent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="space-y-2 border-t border-gray-800 px-3 py-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.sessionID}
              task={task}
              isSelected={selectedTaskId === task.sessionID}
              onClick={() => onSelectTask(task.sessionID)}
            />
          ))}
        </div>
      )}
    </section>
  );
}