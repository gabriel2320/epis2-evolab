import type { RunStatus } from '../contracts/schemas.js';

/** Transiciones explícitas autorizadas — única fuente de verdad. */
export const ALLOWED_TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['seeding', 'failed', 'cancelled'],
  seeding: ['starting_target', 'failed', 'cancelled'],
  starting_target: ['running', 'failed', 'cancelled'],
  running: ['collecting_evidence', 'failed', 'cancelled'],
  collecting_evidence: ['evaluating', 'failed'],
  evaluating: ['passed', 'reproducing', 'human_review', 'failed'],
  passed: ['completed'],
  reproducing: ['unconfirmed', 'finding_created', 'failed'],
  unconfirmed: ['human_review', 'reproducing', 'failed'],
  finding_created: ['test_candidate_created', 'human_review'],
  test_candidate_created: ['patch_candidate_created', 'human_review', 'rejected'],
  patch_candidate_created: ['validating', 'rejected'],
  validating: ['human_review', 'rejected'],
  human_review: ['approved', 'rejected', 'reproducing'],
  approved: ['completed'],
  rejected: ['completed'],
  failed: ['completed', 'human_review'],
  cancelled: ['completed'],
  completed: [],
};

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly from: RunStatus,
    public readonly to: RunStatus,
  ) {
    super(`Transición no autorizada: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

export function transition(from: RunStatus, to: RunStatus): RunStatus {
  assertTransition(from, to);
  return to;
}

export function isTerminalStatus(status: RunStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

export function isActiveStatus(status: RunStatus): boolean {
  return !isTerminalStatus(status) && status !== 'failed' && status !== 'rejected';
}

/** Secuencia nominal del loop maestro (referencia — el orquestador controla transiciones). */
export const MASTER_LOOP_SEQUENCE: readonly RunStatus[] = [
  'pending',
  'preparing',
  'seeding',
  'starting_target',
  'running',
  'collecting_evidence',
  'evaluating',
];
