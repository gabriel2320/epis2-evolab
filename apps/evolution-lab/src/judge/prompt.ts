import type { JudgeTriageInput } from './schemas.js';

export const JUDGE_SYSTEM_PROMPT = `Eres el judge de triage de EPIS2 Evolab. Clasificas hallazgos de pruebas clínicas sintéticas
en una de tres categorías: signal (señal accionable), noise (ruido/falso positivo), duplicate
(duplicado de un hallazgo ya visto).

REGLAS INVIOLABLES:
1. NUNCA apruebes, rechaces ni cierres un hallazgo. Solo clasificas para ordenar la cola humana.
2. requiresHumanReview debe ser SIEMPRE true en tu respuesta JSON.
3. Un finding de severidad critical casi nunca es noise — solo si la evidencia demuestra
   claramente un expected mal escrito (p. ej. el escenario esperaba bloqueo pero el producto
   corrigió el bug).
4. Si fingerprintHistory muestra el mismo fingerprint con review_status approved/rejected/duplicate,
   clasifica duplicate salvo que actualResult difiera sustancialmente.
5. Findings del mismo escenario y run que describen el mismo bug desde evaluadores distintos
   (clinical_safety + cdr_consistency + audit_completeness) son signal independientes pero
   relatedFindingIds debe listarlos — NO marques duplicate entre evaluadores complementarios
   del mismo incidente a menos que el humano ya cerró uno como canonical.
6. Solo datos sintéticos demo — no infieras PHI ni recomiendes tratamiento clínico real.
7. noise: expected desactualizado — auditEventCreated en 403 RBAC, evaluador LLM sin respuesta
   (plan_fidelity/command_resolve) con dev:ai off, orchestrator regression flake, dom_state con browser off.
8. duplicate: mismo fingerprint que finding cerrado en fingerprintHistory (approved/rejected/duplicate).
9. Actual describe comportamiento CORRECTO (403 RBAC, Zod 400) y Expected obsoleto → noise.

CONTEXTO EPIS2 (resumen):
- discharge-critical-pending-001: alta aprobada con PCR crítico sin acuse es bug real confirmado.
- RBAC: nurse no puede draft.approve (403 esperado) — finding de audit en ese flujo suele ser noise.
- audit_completeness: eventos prohibidos (p. ej. clinical.draft.approved cuando debió bloquearse).
- llm-command-evolution-001: sin dev:ai los evaluadores LLM suelen ser noise de infraestructura.

EJEMPLOS FEW-SHOT (referencia, no copiar rationale):
- noise: nurse RBAC 403 esperado + finding pide auditEventCreated → verdict noise.
- noise: plan_fidelity sin respuesta LLM (dev:ai off) → verdict noise.
- duplicate: fingerprintHistory muestra ceac9c2a approved, mismo fingerprint → verdict duplicate.
- signal: alta aprobada con PCR crítico sin acuse → verdict signal.`;

function formatEvaluations(input: JudgeTriageInput): string {
  return input.evidence.evaluations
    .map(
      (ev) =>
        `- [${ev.evaluatorId}] passed=${ev.passed} severity=${ev.severity ?? '—'} — ${ev.message}`,
    )
    .join('\n');
}

function formatApiCaptures(input: JudgeTriageInput): string {
  if (!input.evidence.apiCaptures?.length) return '';
  return input.evidence.apiCaptures
    .map((c) => `- ${c.label} HTTP ${c.status ?? '?'}: ${c.excerpt}`)
    .join('\n');
}

function formatFingerprintHistory(input: JudgeTriageInput): string {
  return input.fingerprintHistory
    .map(
      (h) =>
        `- ${h.findingId} run=${h.runId.slice(0, 8)} status=${h.reviewStatus} severity=${h.severity} — ${h.createdAt}`,
    )
    .join('\n');
}

export function buildJudgeUserPrompt(input: JudgeTriageInput): string {
  const { finding, scenario, evidence } = input;
  return `Clasifica este finding de Evolab.

## Finding
- ID: ${finding.id || '(offline eval)'}
- Escenario: ${scenario.id} (${scenario.name}, riesgo ${scenario.risk})
- Evaluador implícito: ${finding.title}
- Categoría: ${finding.category} | Severidad: ${finding.severity} | Conf evaluador: ${finding.confidence}
- Expected: ${finding.expectedResult}
- Actual: ${finding.actualResult}
- Fingerprint: ${finding.fingerprint}
- Componentes: ${finding.affectedComponents.join(', ') || '—'}

## Evaluaciones del run
${formatEvaluations(input) || '(sin evaluaciones)'}

## Evidencia HTTP/observaciones
${evidence.observationsSummary || '(sin observaciones)'}
${formatApiCaptures(input)}

## Historial mismo fingerprint (${input.fingerprintHistory.length} previos)
${formatFingerprintHistory(input) || '(ninguno)'}

Responde SOLO JSON con: verdict, confidence, rationale, requiresHumanReview (true), suggestedPriority, relatedFindingIds.`;
}
