import type { EvolabConfig } from '../config/env.js';
import { resolveTargetEnvironment, isProductionUrl } from './target-allowlist.js';

export type GuardCheck = {
  id: string;
  label: string;
  passed: boolean;
  severity: 'critical' | 'warning' | 'info';
  message: string;
};

export type GuardReport = {
  ok: boolean;
  checks: GuardCheck[];
  blockedReason?: string;
};

export function runSecurityGuards(config: EvolabConfig): GuardReport {
  const checks: GuardCheck[] = [];

  checks.push({
    id: 'evolab_enabled',
    label: 'EPIS2_EVOLAB_ENABLED',
    passed: config.enabled,
    severity: 'critical',
    message: config.enabled
      ? 'Evolab habilitado'
      : 'Evolab deshabilitado — establecer EPIS2_EVOLAB_ENABLED=true',
  });

  checks.push({
    id: 'not_production_node_env',
    label: 'NODE_ENV no es production',
    passed: process.env.NODE_ENV !== 'production',
    severity: 'critical',
    message:
      process.env.NODE_ENV === 'production'
        ? 'NODE_ENV=production — ejecución rechazada'
        : `NODE_ENV=${process.env.NODE_ENV ?? 'undefined'} (aceptable)`,
  });

  const target = resolveTargetEnvironment(config.targetId);
  checks.push({
    id: 'target_in_allowlist',
    label: 'Target en allowlist',
    passed: target !== undefined,
    severity: 'critical',
    message: target
      ? `Target ${config.targetId} autorizado (${target.environmentType})`
      : `Target ${config.targetId} no está en allowlist`,
  });

  if (target) {
    checks.push({
      id: 'target_synthetic_only',
      label: 'Target syntheticOnly',
      passed: target.syntheticOnly === true,
      severity: 'critical',
      message: target.syntheticOnly
        ? 'Target marcado como sintético'
        : 'Target no es sintético — rechazado',
    });

    checks.push({
      id: 'target_sandbox_type',
      label: 'Target environmentType sandbox',
      passed:
        target.environmentType === 'local-sandbox' ||
        target.environmentType === 'ci-sandbox',
      severity: 'critical',
      message: `environmentType=${target.environmentType}`,
    });

    checks.push({
      id: 'web_url_not_production',
      label: 'Web URL no es producción',
      passed: !isProductionUrl(config.webBaseUrl),
      severity: 'critical',
      message: `webBaseUrl=${config.webBaseUrl}`,
    });

    checks.push({
      id: 'api_url_not_production',
      label: 'API URL no es producción',
      passed: !isProductionUrl(config.apiBaseUrl),
      severity: 'critical',
      message: `apiBaseUrl=${config.apiBaseUrl}`,
    });
  }

  checks.push({
    id: 'patching_disabled_mvp',
    label: 'Patching desactivado (MVP)',
    passed: !config.patchingEnabled,
    severity: 'warning',
    message: config.patchingEnabled
      ? 'EPIS2_EVOLAB_PATCHING_ENABLED=true — requiere aprobación explícita'
      : 'Patching desactivado',
  });

  checks.push({
    id: 'no_push',
    label: 'Push desactivado',
    passed: !config.allowPush,
    severity: 'critical',
    message: config.allowPush ? 'EPIS2_EVOLAB_ALLOW_PUSH=true — rechazado' : 'Push desactivado',
  });

  checks.push({
    id: 'no_merge',
    label: 'Merge desactivado',
    passed: !config.allowMerge,
    severity: 'critical',
    message: config.allowMerge ? 'EPIS2_EVOLAB_ALLOW_MERGE=true — rechazado' : 'Merge desactivado',
  });

  checks.push({
    id: 'global_timeout',
    label: 'Timeout global configurado',
    passed: config.globalTimeoutMs > 0,
    severity: 'info',
    message: `globalTimeoutMs=${config.globalTimeoutMs}`,
  });

  const criticalFailed = checks.filter((c) => c.severity === 'critical' && !c.passed);
  const ok = criticalFailed.length === 0;

  const report: GuardReport = { ok, checks };
  if (!ok) {
    report.blockedReason = criticalFailed.map((c) => c.id).join(', ');
  }
  return report;
}

export function assertGuardsPass(config: EvolabConfig): void {
  const report = runSecurityGuards(config);
  if (!report.ok) {
    throw new Error(
      `Guards de seguridad fallaron: ${report.blockedReason ?? 'desconocido'}`,
    );
  }
}
