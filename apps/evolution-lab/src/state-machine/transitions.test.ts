import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  canTransition,
  InvalidStateTransitionError,
  isActiveStatus,
  isTerminalStatus,
  MASTER_LOOP_SEQUENCE,
  transition,
} from './transitions.js';
import { RunStatusSchema, type RunStatus } from '../contracts/schemas.js';

const ALL_STATUSES = RunStatusSchema.options;

describe('state machine — allowed transitions', () => {
  it('define transición para cada estado', () => {
    for (const status of ALL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('completed no permite salidas', () => {
    expect(ALLOWED_TRANSITIONS.completed).toEqual([]);
    expect(isTerminalStatus('completed')).toBe(true);
  });

  it('cancelled es terminal vía completed', () => {
    expect(canTransition('cancelled', 'completed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
  });

  it('pending → preparing → seeding → starting_target → running', () => {
    let current: RunStatus = 'pending';
    for (const next of ['preparing', 'seeding', 'starting_target', 'running'] as const) {
      expect(canTransition(current, next)).toBe(true);
      current = transition(current, next);
    }
    expect(current).toBe('running');
  });

  it('running → collecting_evidence → evaluating', () => {
    expect(transition('running', 'collecting_evidence')).toBe('collecting_evidence');
    expect(transition('collecting_evidence', 'evaluating')).toBe('evaluating');
  });

  it('evaluating puede ir a passed, reproducing o human_review', () => {
    expect(canTransition('evaluating', 'passed')).toBe(true);
    expect(canTransition('evaluating', 'reproducing')).toBe(true);
    expect(canTransition('evaluating', 'human_review')).toBe(true);
  });

  it('passed → completed', () => {
    expect(transition('passed', 'completed')).toBe('completed');
  });

  it('reproducing → finding_created', () => {
    expect(transition('reproducing', 'finding_created')).toBe('finding_created');
  });

  it('finding_created → test_candidate_created → human_review', () => {
    expect(transition('finding_created', 'test_candidate_created')).toBe('test_candidate_created');
    expect(transition('test_candidate_created', 'human_review')).toBe('human_review');
  });

  it('human_review → approved → completed', () => {
    expect(transition('human_review', 'approved')).toBe('approved');
    expect(transition('approved', 'completed')).toBe('completed');
  });

  it('rechaza transición directa pending → running', () => {
    expect(canTransition('pending', 'running')).toBe(false);
    expect(() => assertTransition('pending', 'running')).toThrow(InvalidStateTransitionError);
  });

  it('rechaza transición completed → pending', () => {
    expect(canTransition('completed', 'pending')).toBe(false);
  });

  it('rechaza transición passed → running (retroceso)', () => {
    expect(canTransition('passed', 'running')).toBe(false);
  });

  it('patch_candidate_created solo si patching habilitado en orquestador — transición existe', () => {
    expect(canTransition('test_candidate_created', 'patch_candidate_created')).toBe(true);
    expect(canTransition('patch_candidate_created', 'validating')).toBe(true);
  });

  it('validating → rejected permitido', () => {
    expect(canTransition('validating', 'rejected')).toBe(true);
  });

  it('failed puede ir a human_review', () => {
    expect(canTransition('failed', 'human_review')).toBe(true);
  });

  it('MASTER_LOOP_SEQUENCE es subsecuencia válida', () => {
    for (let i = 0; i < MASTER_LOOP_SEQUENCE.length - 1; i += 1) {
      const from = MASTER_LOOP_SEQUENCE[i]!;
      const to = MASTER_LOOP_SEQUENCE[i + 1]!;
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('isActiveStatus distingue estados activos', () => {
    expect(isActiveStatus('running')).toBe(true);
    expect(isActiveStatus('evaluating')).toBe(true);
    expect(isActiveStatus('completed')).toBe(false);
    expect(isActiveStatus('failed')).toBe(false);
  });
});

describe('state machine — exhaustivo por estado', () => {
  const forbiddenPairs: Array<[RunStatus, RunStatus]> = [];

  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      if (from === to) continue;
      if (!ALLOWED_TRANSITIONS[from].includes(to)) {
        forbiddenPairs.push([from, to]);
      }
    }
  }

  it.each(forbiddenPairs)('bloquea %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidStateTransitionError);
  });
});
