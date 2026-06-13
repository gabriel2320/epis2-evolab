import { createHash } from 'node:crypto';

/** UUIDs estables para casos SIM (prefijo a0000002/b0000002 ≠ DEMO a0000001). */
export function stableSimCaseUuids(caseCode: string): {
  patientId: string;
  encounterId: string;
} {
  const patientSuffix = createHash('sha256')
    .update(`sim-patient:${caseCode}`)
    .digest('hex')
    .slice(0, 12);
  const encounterSuffix = createHash('sha256')
    .update(`sim-encounter:${caseCode}`)
    .digest('hex')
    .slice(0, 12);
  return {
    patientId: `a0000002-0000-4000-8000-${patientSuffix}`,
    encounterId: `b0000002-0000-4000-8000-${encounterSuffix}`,
  };
}
