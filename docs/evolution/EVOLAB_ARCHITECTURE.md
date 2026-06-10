# EPIS2 Evolab — Arquitectura

Repositorio **epis2-evolab**: aplicación Node.js en `apps/evolution-lab` que examina EPIS2 como **caja negra** (Playwright + HTTP) con observación controlada de sandbox.

Target EPIS2: checkout separado con `npm run stack:dev` (web `:5173`, API `:3001`).

## Componentes

| Módulo | Responsabilidad |
|--------|-----------------|
| `orchestrator/` | Loop maestro determinista |
| `state-machine/` | Transiciones autorizadas |
| `security/` | Guards pre-ejecución |
| `ollama/` | Registry, router, cola, JSON estructurado |
| `plan-executor/` | Ejecución de planes LLM (FASE 9) |
| `simulated-user/` | Agente LLM estructurado (FASE 8) |
| `persistence/` | PostgreSQL `epis2_evolab` |
| `console/` | Read-model para Evolution Console |
| `contracts/` | Schemas Zod |
| `scenarios/` | DSL YAML declarativo |
| `step-engine/` | Intérprete de pasos YAML v2 (`flow:`) — login, api, browser, wait, custom |
| `findings/` | Fingerprints deterministas |
| `fitness/` | Cobertura, novedad y fitness por escenario (Sprint 7) |

## Ejecución de escenarios (YAML v2)

Un escenario con campo `flow:` se ejecuta con el **step-engine** declarativo (modo `declarative`); sin `flow:`, cae al ejecutor TS registrado (modo `deterministic`, golden reference). Placeholders `{clave}` se resuelven desde `fixture` + demo case (`patientId`).

```yaml
flow:
  - login: { label: login_admin }
  - browser: { open: '/espacio/borrador/{draftId}', waitTestId: epis2-draft-review, label: draft_review_dom }
  - api: { label: approve_attempt, method: POST, path: '/api/drafts/{draftId}/approve' }
```

Capacidades del paso `api`: placeholders en path/body (incluye `{today}`, `{encounterId}`), `capture` (ruta punteada del response al contexto, ej. `draftId: draft.id`), `failOnMissingCapture` y proyección `observe.payload`.

La lógica de dominio reutilizable vive en **custom steps** nombrados (`step-engine/custom-steps.ts`): `census_snapshot`, `service_criticals`, `discharge_alerts`, `discharge_ui_probe`, `mar_dashboard`, `mar_alerts`, `mar_create_and_approve`. Un escenario nuevo los compone desde YAML sin escribir ejecutor.

Paridad validada por test: los flows de `role-evolution-sign-001`, `discharge-critical-pending-001` y `suspended-medication-mar-001` producen las mismas observaciones y llamadas que sus ejecutores TS (golden reference).

El catálogo tramo C (Sprint 3) se autoriza solo en YAML: `admission-double-booking-001` (409 doble admisión), `role-nurse-approve-001` (RBAC 403), `draft-lifecycle-cancelled-001` (409 ciclo de vida) y `census-service-integrity-001` (evaluador `census_integrity` sobre `census_snapshot`). El evaluador HTTP trata `409` como bloqueo válido.

## Evaluadores de profundidad clínica (Sprint 5)

- **`cdr_consistency`** (`expected.cdrConsistent: true`): cruza `clinical_critical_results` (observación `sandbox_critical` del dashboard de servicio) contra el motor CDR (`clinical_alerts_api`). DB con crítico sin acuse y CDR sin alerta crítica ⇒ finding `clinical_safety` high (`generate_test`); alerta crítica sin respaldo DB ⇒ medium (falso positivo).
- **`audit_completeness`** (`expected.auditMustInclude` / `auditMustNotInclude`): verifica eventos reales post-acción en `/api/audit/events` (`auth.login.success`, `clinical.draft.created`…). Los patrones prohibidos se correlacionan por `entityId === draftId` de la `actionObservation` — si una acción bloqueada aparece como `clinical.draft.approved`, finding high. Cubre `discharge-critical-pending-001` y `suspended-medication-mar-001`.

Ambos se auto-agregan desde `expected` en `buildEvaluatorsForScenario`.

## Journey multi-paso (Sprint 6)

`admission-discharge-001` encadena el ciclo completo en YAML puro con **state carry**: `find_available_bed` captura `{bedId}` del censo, la admisión captura `{admissionId}`, la epicrisis captura `{draftId}` y el alta reutiliza `{admissionId}`. El paso `ensure_patient_not_admitted` lo hace idempotente (da de alta una admisión previa de DEMO-001 si existe). La auditoría del ciclo se verifica con `audit_completeness` (`inpatient.admitted`, `clinical.draft.created`, `clinical.draft.approved`, `inpatient.discharged`).

El replan LLM acotado (S6.2) queda **diferido con disparador**: se activa solo cuando runs hybrid (`llmSimMode≠off`) acumulen métricas `plan_fidelity` que lo justifiquen — la métrica ya se persiste con cada evaluación.

## Fitness y mapa de cobertura (Sprint 7)

El módulo `fitness/` mide el corpus para el programa de evolución de escenarios (roadmap v3):

- **`coverage-catalog.ts`** — catálogo data-driven de endpoints EPIS2 y eventos de auditoría relevantes, más el mapa de endpoints que toca cada custom step. Única fuente de rutas: extender = añadir entradas.
- **`coverage-extract.ts`** — deriva cobertura efectiva de un run (observaciones del step-engine + audit trail → claves `METHOD /path/:id`) y cobertura declarada estática desde el YAML.
- **`novelty.ts`** — texto canónico del escenario → embedding `bge-m3` vía Ollama (`/api/embed`) → distancia coseno mínima vs corpus. Cache en disco (`reports/evolution/fitness/embedding-cache.json`); degrada a `null` si Ollama no responde, nunca rompe un run.
- **`persist-fitness.ts`** — escribe `evolution.scenario_fitness` (migración 003: cobertura jsonb, hallazgos, duración, novedad) en la fase PERSIST. Best-effort, invocado desde `persist-run` sin engordar el orquestador.
- **`report.ts` + `evolab fitness report [--json]`** — mapa de cobertura del corpus (cubierto/huecos por módulo), novedad por escenario y métricas persistidas si la DB responde. No requiere sandbox vivo.

## Preflight operativo

`evolab doctor [--strict]` y `evolab run` ejecutan `preflightTarget`: ping `health`/`ready` del API (timeout 3 s, detecta proceso zombie en `:3001`) y web solo si `BROWSER=true`. `run --skip-preflight` lo omite; `run --reset-fixtures` convierte el reset de `sandbox-prep` (acuses críticos, dosis MAR held) en obligatorio en PREPARE en vez de best-effort.

## Evidencia por run

`EPIS2_EVOLAB_EVIDENCE=full|minimal` (o `run --evidence minimal`). En `minimal` el run escribe solo `metadata/result/evaluation/findings.json` (las observaciones siguen completas en `result.json`); se omiten `api/`, `model/` y `logs/` (~-80% archivos). `npm run evolab:smoke` ejecuta el subset `--tag smoke` con evidencia minimal — es el job smoke de CI (sibling checkout de EPIS2 + Postgres efímero, requiere secret `EPIS2_CHECKOUT_TOKEN`).

## Orquestador por fases

`orchestrator.ts` (<300 líneas) conserva solo el loop maestro; las fases viven en módulos: `build-run` (guards + run inicial), `run-phases` (fixture prep, plan LLM, browser), `audit-capture`, `evaluate-run` (evaluadores + findings) y `persist-run` (PostgreSQL best-effort).

## Loop maestro

```text
PREPARE → SEED → ACT → OBSERVE → EVALUATE → REPRODUCE → … → HUMAN_REVIEW → COMPLETE
```

## Proceso separado

Evolab **no** corre dentro de `apps/api` de EPIS2. Se invoca vía `npm run evolab:*` en **este repo**.

## Target Environment

Solo `local-sandbox` y `ci-sandbox` con `syntheticOnly: true`.

Ver `reports/evolution/evolab-boundary-plan.md`.
