import { createHash } from 'node:crypto';

export type FingerprintInput = {
  scenarioId: string;
  targetEnvironmentId: string;
  route?: string;
  action?: string;
  component?: string;
  errorCode?: string;
  expectedState?: string;
  actualState?: string;
  findingCategory?: string;
};

function normalize(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function computeFindingFingerprint(input: FingerprintInput): string {
  const parts = [
    normalize(input.scenarioId),
    normalize(input.targetEnvironmentId),
    normalize(input.route),
    normalize(input.action),
    normalize(input.component),
    normalize(input.errorCode),
    normalize(input.expectedState),
    normalize(input.actualState),
    normalize(input.findingCategory),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}
