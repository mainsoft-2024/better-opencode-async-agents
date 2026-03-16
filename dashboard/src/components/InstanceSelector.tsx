import { useAgentStore, useConnectionStatusMap, useInstanceFilter, useInstancesById } from '../stores/agentStore';
import type { ConnectionStatus } from '../types';

function statusDotClass(status: ConnectionStatus | undefined): string {
  switch (status) {
    case 'connected': return 'bg-green-500';
    case 'connecting': return 'bg-yellow-400';
    case 'disconnected': return 'bg-red-500';
    case 'error': return 'bg-red-700';
    default: return 'bg-gray-500';
  }
}

export function InstanceSelector() {
  const instancesById = useInstancesById();
  const connectionStatus = useConnectionStatusMap();
  const selectedInstanceFilter = useInstanceFilter();
  const setInstanceFilter = useAgentStore((state) => state.setInstanceFilter);
  const tasksById = useAgentStore((state) => state.tasksById);

  const instances = Object.values(instancesById);

  // Count tasks per instance
  const taskCountByInstance: Record<string, number> = {};
  for (const key of Object.keys(tasksById)) {
    const colonIdx = key.indexOf(':');
    if (colonIdx === -1) continue;
    const iid = key.slice(0, colonIdx);
    taskCountByInstance[iid] = (taskCountByInstance[iid] ?? 0) + 1;
  }
  const totalTasks = Object.keys(tasksById).length;

  const handleToggle = (instanceId: string) => {
    setInstanceFilter(selectedInstanceFilter === instanceId ? null : instanceId);
  };

  return (
    <aside className="flex h-full flex-col border-r border-gray-800 bg-gray-900 text-gray-100">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <h2 className="text-sm font-semibold">Instances</h2>
      </div>

      <div className="space-y-1 overflow-y-auto p-2">
        {/* All Instances option */}
        <button
          type="button"
          onClick={() => setInstanceFilter(null)}
          className={[
            'flex w-full cursor-pointer items-center gap-2 rounded border px-2 py-2 text-xs transition',
            selectedInstanceFilter === null
              ? 'border-gray-500 bg-gray-700 text-white'
              : 'border-gray-800 bg-gray-950/40 text-gray-200 hover:bg-gray-800/70',
          ].join(' ')}
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-gray-400" />
          <span className="flex-1 truncate text-left font-medium">All Instances</span>
          <span className="rounded-full bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
            {totalTasks}
          </span>
        </button>

        {instances.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-400">No instances found.</p>
        ) : (
          instances.map((instance) => {
            const status = connectionStatus[instance.instanceId];
            const count = taskCountByInstance[instance.instanceId] ?? 0;
            const isSelected = selectedInstanceFilter === instance.instanceId;

            return (
              <button
                key={instance.instanceId}
                type="button"
                title={instance.directory}
                onClick={() => handleToggle(instance.instanceId)}
                className={[
                  'flex w-full cursor-pointer items-center gap-2 rounded border px-2 py-2 text-xs transition',
                  isSelected
                    ? 'border-gray-500 bg-gray-700 text-white'
                    : 'border-gray-800 bg-gray-950/40 text-gray-200 hover:bg-gray-800/70',
                ].join(' ')}
              >
                {/* Connection status dot */}
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDotClass(status)}`}
                />

                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1">
                    {/* Instance color pill */}
                    <span
                      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                      style={{ backgroundColor: instance.color }}
                    />
                    <span className="block truncate font-medium">{instance.instanceName}</span>
                  </span>
                  <span className="block truncate text-[10px] text-gray-400">
                    {instance.url}
                  </span>
                </span>

                {/* Task count badge */}
                <span className="rounded-full bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
                  {count}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}