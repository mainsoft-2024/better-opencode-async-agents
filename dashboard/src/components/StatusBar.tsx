import type { StatsResponse } from "../types";

type StatusBarProps = {
  stats: StatsResponse | null;
  isConnected: boolean;
  instanceCount: number;
};

type StatItemProps = {
  label: string;
  value: number;
  tone?: "default" | "error" | "success";
};

function StatItem({ label, value, tone = "default" }: StatItemProps) {
  const toneClass =
    tone === "error"
      ? "text-red-300"
      : tone === "success"
        ? "text-green-300"
        : "text-gray-200";

  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/70 px-3 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-sm font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export function StatusBar({ stats, isConnected, instanceCount }: StatusBarProps) {
  const totalTasks = stats?.totalTasks ?? 0;
  const activeTasks = stats?.activeTasks ?? 0;
  const errorTasks = stats?.byStatus.error ?? 0;
  const completedTasks = stats?.byStatus.completed ?? 0;

  return (
    <header className="border-b border-gray-800 bg-gray-900 px-4 py-3 text-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-400" : "bg-red-400"}`}
>
          </span>
          <span className="text-sm font-medium">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          <span className="text-xs text-gray-400">Instances: {instanceCount}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatItem label="Total" value={totalTasks} />
          <StatItem label="Active" value={activeTasks} />
          <StatItem label="Error" value={errorTasks} tone="error" />
          <StatItem label="Completed" value={completedTasks} tone="success" />
        </div>
      </div>
    </header>
  );
}