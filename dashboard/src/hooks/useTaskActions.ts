export function useTaskActions() {
  const restart = async (taskId: string, instanceUrl: string): Promise<unknown> => {
    const res = await fetch(`${instanceUrl}/v1/tasks/${taskId}/restart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return res.json();
  };

  const resume = async (taskId: string, message: string, instanceUrl: string): Promise<unknown> => {
    const res = await fetch(`${instanceUrl}/v1/tasks/${taskId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    return res.json();
  };

  const cancel = async (taskId: string, instanceUrl: string): Promise<unknown> => {
    const res = await fetch(`${instanceUrl}/v1/tasks/${taskId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return res.json();
  };

  return { restart, resume, cancel };
}