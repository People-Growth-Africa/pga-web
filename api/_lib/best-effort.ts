import { waitUntil } from '@vercel/functions';

export function scheduleBestEffort(task: () => Promise<unknown>, label: string): void {
  const pending = Promise.resolve()
    .then(task)
    .catch(() => {
      console.error(`[${label}] background operation failed`);
    });

  try {
    waitUntil(pending);
  } catch {
    void pending;
  }
}
