import type { DiscoveredInstance } from "../types";

type InstanceSelectorProps = {
  instances: DiscoveredInstance[];
  selectedHosts: Set<string>;
  onToggle: (host: string) => void;
  onRefresh: () => void;
};

export function InstanceSelector({
  instances,
  selectedHosts,
  onToggle,
  onRefresh,
}: InstanceSelectorProps) {
  return (
    <aside className="flex h-full flex-col border-r border-gray-800 bg-gray-900 text-gray-100">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <h2 className="text-sm font-semibold">Instances</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 transition hover:bg-gray-700"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-1 overflow-y-auto p-2">
        {instances.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-400">No instances found.</p>
        ) : (
          instances.map((instance) => {
            const hostKey = instance.host;
            const checked = selectedHosts.has(hostKey);

            return (
              <label
                key={`${instance.host}:${instance.port}`}
                className="flex cursor-pointer items-start gap-2 rounded border border-gray-800 bg-gray-950/40 px-2 py-2 text-xs hover:bg-gray-800/70"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(hostKey)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-gray-600 bg-gray-800 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-100">{instance.name}</span>
                  <span className="block truncate text-gray-400">
                    {instance.host}:{instance.port}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
    </aside>
  );
}