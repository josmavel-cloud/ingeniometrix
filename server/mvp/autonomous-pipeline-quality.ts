export type AutonomousQualityGate = {
  name: string;
  attempt: number;
  max_attempts: number;
  score_100: number;
  threshold_100: number;
  passed: boolean;
  metrics: Record<string, number | string | boolean | null>;
  warnings: string[];
  blockers: string[];
};

export function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildQualityGate(input: {
  name: string;
  attempt: number;
  maxAttempts?: number;
  score: number;
  threshold?: number;
  metrics?: Record<string, number | string | boolean | null>;
  warnings?: string[];
  blockers?: string[];
}): AutonomousQualityGate {
  const score = clampScore(input.score);
  const threshold = input.threshold ?? 75;
  const blockers = input.blockers ?? [];
  return {
    name: input.name,
    attempt: input.attempt,
    max_attempts: input.maxAttempts ?? 5,
    score_100: score,
    threshold_100: threshold,
    passed: score >= threshold && blockers.length === 0,
    metrics: input.metrics ?? {},
    warnings: input.warnings ?? [],
    blockers,
  };
}

export async function iterateQualityGate<T>(input: {
  name: string;
  maxAttempts?: number;
  threshold?: number;
  runAttempt: (attempt: number) => Promise<{ result: T; gate: AutonomousQualityGate; shouldRetry?: boolean }>;
  onRetry?: (attempt: number, result: T, gate: AutonomousQualityGate) => Promise<void>;
}) {
  const maxAttempts = input.maxAttempts ?? 5;
  let last: { result: T; gate: AutonomousQualityGate } | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { result, gate, shouldRetry } = await input.runAttempt(attempt);
    last = { result, gate };
    if (gate.passed || shouldRetry === false || attempt === maxAttempts) return last;
    await input.onRetry?.(attempt, result, gate);
  }
  if (!last) throw new Error(`Quality loop ${input.name} did not run.`);
  return last;
}
