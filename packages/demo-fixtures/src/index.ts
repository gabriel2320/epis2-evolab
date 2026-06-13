export {
  DEMO_CLINICAL_CASES,
  DEMO_IDENTIFIER_SYSTEM,
  SIM_IDENTIFIER_SYSTEM,
  SYNTHETIC_LABEL,
  assertDemoCasesInvariants,
  getDemoCaseByCode,
  getDemoCaseByPatientId,
  type DemoClinicalCase,
} from './demoCases.js';
export {
  SIM_CLINICAL_CASES,
  assertSimCasesInvariants,
  getSimCaseByCode,
  getSimCaseByPatientId,
} from './simCases.js';
export { stableSimCaseUuids } from './simCaseIds.js';
