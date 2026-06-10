import type { ScenarioDefinition } from '../contracts/schemas.js';
import {
  AUDIT_EVENT_CATALOG,
  ENDPOINT_CATALOG,
  endpointKey,
  type CatalogAuditEvent,
  type CatalogEndpoint,
} from './coverage-catalog.js';
import { extractScenarioStaticCoverage } from './coverage-extract.js';

export type ScenarioFitnessSummary = {
  id: string;
  name: string;
  endpoints: string[];
  auditEvents: string[];
  novelty: number | null;
};

export type EndpointCoverageCell = {
  key: string;
  module: CatalogEndpoint['module'];
  coveredBy: string[];
};

export type AuditEventCoverageCell = {
  eventType: string;
  module: CatalogAuditEvent['module'];
  coveredBy: string[];
};

export type ModuleCoverageSummary = {
  module: string;
  covered: number;
  total: number;
};

export type FitnessReportData = {
  scenarios: ScenarioFitnessSummary[];
  endpointMatrix: EndpointCoverageCell[];
  auditEventMatrix: AuditEventCoverageCell[];
  moduleSummary: ModuleCoverageSummary[];
  gaps: { endpoints: string[]; auditEvents: string[] };
  noveltyAvailable: boolean;
};

/**
 * Mapa de cobertura del corpus (S7.5): cruza la cobertura declarada de cada
 * escenario YAML contra el catálogo de endpoints y eventos de auditoría.
 * Función pura sobre el corpus estático: no requiere sandbox ni DB.
 */
export function buildFitnessReport(
  scenarios: ScenarioDefinition[],
  novelty?: Map<string, number | null>,
): FitnessReportData {
  const summaries: ScenarioFitnessSummary[] = scenarios.map((scenario) => {
    const coverage = extractScenarioStaticCoverage(scenario);
    return {
      id: scenario.id,
      name: scenario.name,
      endpoints: coverage.endpoints,
      auditEvents: coverage.auditEvents,
      novelty: novelty?.get(scenario.id) ?? null,
    };
  });

  const endpointMatrix: EndpointCoverageCell[] = ENDPOINT_CATALOG.map((entry) => {
    const key = endpointKey(entry.method, entry.path);
    return {
      key,
      module: entry.module,
      coveredBy: summaries.filter((s) => s.endpoints.includes(key)).map((s) => s.id),
    };
  });

  const auditEventMatrix: AuditEventCoverageCell[] = AUDIT_EVENT_CATALOG.map((entry) => ({
    eventType: entry.eventType,
    module: entry.module,
    coveredBy: summaries
      .filter((s) => s.auditEvents.some((e) => e.includes(entry.eventType)))
      .map((s) => s.id),
  }));

  const modules = [...new Set(ENDPOINT_CATALOG.map((e) => e.module))];
  const moduleSummary: ModuleCoverageSummary[] = modules.map((module) => {
    const cells = endpointMatrix.filter((c) => c.module === module);
    return {
      module,
      covered: cells.filter((c) => c.coveredBy.length > 0).length,
      total: cells.length,
    };
  });

  return {
    scenarios: summaries,
    endpointMatrix,
    auditEventMatrix,
    moduleSummary,
    gaps: {
      endpoints: endpointMatrix.filter((c) => c.coveredBy.length === 0).map((c) => c.key),
      auditEvents: auditEventMatrix.filter((c) => c.coveredBy.length === 0).map((c) => c.eventType),
    },
    noveltyAvailable: summaries.some((s) => s.novelty !== null),
  };
}
