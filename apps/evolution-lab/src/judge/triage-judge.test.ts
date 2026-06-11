import { describe, expect, it } from 'vitest';
import { tryDeterministicDuplicate } from './deterministic-dedup.js';
import { computeSuggestedPriority } from './priority.js';
import { classifyFinding } from './triage-judge.js';
import { createMockJudgeClient } from './ollama-judge-client.js';
import type { JudgeTriageInput } from './schemas.js';

function baseInput(overrides: Partial<JudgeTriageInput> = {}): JudgeTriageInput {
  return {
    finding: {
      id: 'f-new',
      runId: 'run-2',
      scenarioId: 'discharge-critical-pending-001',
      targetEnvironmentId: 'epis2-local-sandbox',
      category: 'clinical_safety',
      severity: 'critical',
      confidence: 0.9,
      title: 'Alta con crítico sin acuse',
      expectedResult: 'Bloquear approve',
      actualResult: 'Approve 200',
      fingerprint: 'e0ff3dbea1b2c3d4',
      recommendedAction: 'Fix guard',
      affectedComponents: ['clinical'],
      reviewStatus: 'open',
    },
    scenario: {
      id: 'discharge-critical-pending-001',
      name: 'Discharge critical',
      risk: 'high',
      personaRole: 'physician',
      goalAction: 'approve_discharge',
      evaluators: ['clinical_safety'],
    },
    evidence: { evaluations: [], observationsSummary: '' },
    fingerprintHistory: [],
    ...overrides,
  };
}

describe('deterministic dedup', () => {
  it('prefill duplicate cuando fingerprint coincide con finding cerrado', () => {
    const input = baseInput({
      fingerprintHistory: [
        {
          findingId: 'f-prev',
          runId: 'run-1',
          scenarioId: 'discharge-critical-pending-001',
          severity: 'critical',
          reviewStatus: 'approved',
          createdAt: '2026-06-09T00:00:00Z',
        },
      ],
    });
    const result = tryDeterministicDuplicate(input);
    expect(result?.verdict).toBe('duplicate');
    expect(result?.requiresHumanReview).toBe(true);
    expect(result?.relatedFindingIds).toContain('f-prev');
  });

  it('no dedup si histórico solo open', () => {
    const input = baseInput({
      fingerprintHistory: [
        {
          findingId: 'f-prev',
          runId: 'run-1',
          scenarioId: 'discharge-critical-pending-001',
          severity: 'critical',
          reviewStatus: 'open',
          createdAt: '2026-06-09T00:00:00Z',
        },
      ],
    });
    expect(tryDeterministicDuplicate(input)).toBeNull();
  });
});

describe('priority', () => {
  it('signal critical tiene prioridad más alta que noise', () => {
    const signalP = computeSuggestedPriority('critical', 'signal', 0.9);
    const noiseP = computeSuggestedPriority('critical', 'noise', 0.9);
    expect(signalP).toBeLessThan(noiseP);
  });
});

describe('classifyFinding', () => {
  it('usa dedup determinista sin llamar LLM', async () => {
    const input = baseInput({
      fingerprintHistory: [
        {
          findingId: 'f-prev',
          runId: 'run-1',
          scenarioId: 'discharge-critical-pending-001',
          severity: 'critical',
          reviewStatus: 'rejected',
          createdAt: '2026-06-09T00:00:00Z',
        },
      ],
    });
    const client = createMockJudgeClient(() => 'noise');
    const result = await classifyFinding(input, client);
    expect(result.source).toBe('deterministic');
    expect(result.output.verdict).toBe('duplicate');
  });

  it('LLM mock siempre incluye requiresHumanReview true', async () => {
    const client = createMockJudgeClient(() => 'signal');
    const result = await classifyFinding(baseInput(), client);
    expect(result.source).toBe('llm');
    expect(result.output.requiresHumanReview).toBe(true);
  });
});
