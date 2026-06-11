import type { JudgeTriageOutput } from './schemas.js';

const SEVERITY_BASE: Record<string, number> = {
  critical: 10,
  high: 30,
  medium: 50,
  low: 70,
};

const VERDICT_DELTA: Record<JudgeTriageOutput['verdict'], number> = {
  signal: -20,
  duplicate: 15,
  noise: 40,
};

export function computeSuggestedPriority(
  severity: string,
  verdict: JudgeTriageOutput['verdict'],
  confidence: number,
): number {
  const base = SEVERITY_BASE[severity] ?? 50;
  const delta = VERDICT_DELTA[verdict];
  const raw = base + delta - Math.round(confidence * 10);
  return Math.min(100, Math.max(1, raw));
}

export function applySuggestedPriority(
  output: JudgeTriageOutput,
  severity: string,
): JudgeTriageOutput {
  return {
    ...output,
    suggestedPriority: computeSuggestedPriority(severity, output.verdict, output.confidence),
  };
}
