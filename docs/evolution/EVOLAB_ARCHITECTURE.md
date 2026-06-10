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

## Ejecución de escenarios (YAML v2)

Un escenario con campo `flow:` se ejecuta con el **step-engine** declarativo (modo `declarative`); sin `flow:`, cae al ejecutor TS registrado (modo `deterministic`, golden reference). Placeholders `{clave}` se resuelven desde `fixture` + demo case (`patientId`).

```yaml
flow:
  - login: { label: login_admin }
  - browser: { open: '/espacio/borrador/{draftId}', waitTestId: epis2-draft-review, label: draft_review_dom }
  - api: { label: approve_attempt, method: POST, path: '/api/drafts/{draftId}/approve' }
```

Capacidades del paso `api`: placeholders en path/body (incluye `{today}`, `{encounterId}`), `capture` (ruta punteada del response al contexto, ej. `draftId: draft.id`), `failOnMissingCapture` y proyección `observe.payload`.

La lógica de dominio reutilizable vive en **custom steps** nombrados (`step-engine/custom-steps.ts`): `service_criticals`, `discharge_alerts`, `discharge_ui_probe`, `mar_dashboard`, `mar_alerts`, `mar_create_and_approve`. Un escenario nuevo los compone desde YAML sin escribir ejecutor.

Paridad validada por test: los flows de `role-evolution-sign-001`, `discharge-critical-pending-001` y `suspended-medication-mar-001` producen las mismas observaciones y llamadas que sus ejecutores TS (golden reference).

## Loop maestro

```text
PREPARE → SEED → ACT → OBSERVE → EVALUATE → REPRODUCE → … → HUMAN_REVIEW → COMPLETE
```

## Proceso separado

Evolab **no** corre dentro de `apps/api` de EPIS2. Se invoca vía `npm run evolab:*` en **este repo**.

## Target Environment

Solo `local-sandbox` y `ci-sandbox` con `syntheticOnly: true`.

Ver `reports/evolution/evolab-boundary-plan.md`.
