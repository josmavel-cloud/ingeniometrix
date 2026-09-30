const flushers = new Map<string, () => Promise<void>>();

export function registerSelectionFlush(projectId: string, flush: () => Promise<void>) {
  flushers.set(projectId, flush);
  return () => { if (flushers.get(projectId) === flush) flushers.delete(projectId); };
}

export async function flushSelection(projectId: string) {
  await flushers.get(projectId)?.();
}
