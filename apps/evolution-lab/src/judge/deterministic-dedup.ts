import type { JudgeTriageInput, JudgeTriageOutput } from './schemas.js';
import { applySuggestedPriority } from './priority.js';

const CLOSED_STATUSES = new Set(['approved', 'rejected', 'duplicate']);

/**
 * Dedup obvio por fingerprint idéntico con histórico humano cerrado.
 * No cambia review_status — solo prefill advisory judge_*.
 */
export function tryDeterministicDuplicate(input: JudgeTriageInput): JudgeTriageOutput | null {
  if (input.finding.reviewStatus && input.finding.reviewStatus !== 'open') {
    return null;
  }

  const priorClosed = input.fingerprintHistory.find(
    (h) =>
      h.findingId !== input.finding.id &&
      h.reviewStatus !== 'open' &&
      CLOSED_STATUSES.has(h.reviewStatus),
  );

  if (!priorClosed) return null;

  const output: JudgeTriageOutput = {
    verdict: 'duplicate',
    confidence: 0.99,
    rationale: `Dedup determinista: fingerprint coincide con ${priorClosed.findingId} (${priorClosed.reviewStatus})`,
    requiresHumanReview: true,
    relatedFindingIds: [priorClosed.findingId],
  };

  return applySuggestedPriority(output, input.finding.severity);
}
