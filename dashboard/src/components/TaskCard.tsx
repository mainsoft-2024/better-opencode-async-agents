import type { BackgroundTask, BackgroundTaskStatus } from "../types";

type TaskCardProps = {
  task: BackgroundTask;
  isSelected: boolean;
  onClick: () => void;
};

const STATUS_BADGE_STYLES: Record<BackgroundTaskStatus, string> = {
  running: "bg-blue-500/20 text-blue-300 border-blue-400/40",
  completed: "bg-green-500/20 text-green-300 border-green-400/40",
  error: "bg-red-500/20 text-red-300 border-red-400/40",
  cancelled: "bg-gray-500/20 text-gray-300 border-gray-400/40",
  resumed: "bg-yellow-500/20 text-yellow-300 border-yellow-400/40",
};

function formatDuration(startedAt: string, completedAt?: string, isRunning?: boolean): string {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return "-";

  const end = isRunning ? Date.now() : completedAt ? new Date(completedAt).getTime() : NaN;
  if (Number.isNaN(end)) return "-";

  const ms = Math.max(0, end - start);
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function TaskCard({ task, isSelected, onClick }: TaskCardProps) {
  const toolCalls = task.progress?.toolCalls ?? 0;
  const isRunning = task.status === "running";
  const duration = formatDuration(task.startedAt, task.completedAt, isRunning);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        isSelected
          ? "border-blue-400/70 bg-blue-500/10"
          : "border-gray-700 bg-gray-900 hover:border-gray-600 hover:bg-gray-800/80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${STATUS_BADGE_STYLES[task.status]}`}
            >
              {task.status}
            </span>
            <span className="rounded-full border border-gray-600 bg-gray-800 px-2 py-0.5 text-xs text-gray-200">
              {task.agent}
            </span>
            {task.pendingResume ? (
              <span className="rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
                pending resume
              </span>
            ) : null}
          </div>
          <p className="mt-2 truncate text-sm text-gray-200" title={task.description}>
            {task.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
        <span>duration: {duration}</span>
        <span>tools: {toolCalls}</span>
        <span className="truncate">id: {task.sessionID}</span>
      </div>
    </button>
  );
}