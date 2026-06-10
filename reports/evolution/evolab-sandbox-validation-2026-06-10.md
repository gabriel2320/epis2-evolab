# Evolab — Validación de corpus contra sandbox EPIS2 vivo

**Fecha:** 2026-06-10 · **Commit base:** ac12e12 (Sprint 7 — fitness y mapa de cobertura)
**Target:** epis2-local-sandbox · API `http://127.0.0.1:3001` · Postgres `epis2-postgres` (:5433) · Ollama 8 modelos (qwen3:8b, bge-m3)

## Alcance

Primera validación contra sandbox vivo del corpus completo (9 escenarios), incluyendo los escenarios de Sprints 3–6 nunca ejecutados contra target real, y verificación de la escritura de fitness de Sprint 7 (`evolution.scenario_fitness` + índice de novedad bge-m3).

- Preflight: `evolab doctor --strict` ✓ (guards críticos, target allowlist, Ollama UP, DB evolab OK)
- Migraciones: `evolab:db:migrate` aplicó `003_scenario_fitness.sql` sin error (001/002 idempotentes)
- Ejecución: `evolab run --all --reset-fixtures` (API-first, browser off, LLM sim off)
- Escenario `llm-command-evolution-001` re-ejecutado con `EPIS2_EVOLAB_LLM_SIM=execute` (requiere plan LLM por diseño, `execution: plan`)

## Resultado por escenario

| Escenario | Resultado | Detalle |
|-----------|-----------|---------|
| admission-discharge-001 | ✅ pass | Journey multi-paso completo (admisión → epicrisis → alta), 0 hallazgos — primera validación viva |
| admission-double-booking-001 | ✅ pass | 409 ante doble admisión confirmado — primera validación viva |
| census-service-integrity-001 | ✅ pass | Censo CIRUGIA-DEMO coherente — primera validación viva |
| discharge-critical-pending-001 | ⚠️ finding | `human_review`, 4 hallazgos legítimos sobre EPIS2 (ver abajo) — el escenario funciona según diseño |
| draft-lifecycle-cancelled-001 | ✅ pass | 409 al aprobar borrador cancelado confirmado — primera validación viva |
| llm-command-evolution-001 | ✅ pass* | `human_review` en batch con LLM sim off (esperado: requiere plan); con `LLM_SIM=execute` → PASSED, plan 4/4 pasos, comando resuelto → `/espacio/evolucion` |
| role-evolution-sign-001 | ✅ pass | RBAC approve verificado |
| role-nurse-approve-001 | ✅ pass | 403 `draft.approve` para nurse confirmado — primera validación viva |
| suspended-medication-mar-001 | ✅ pass | MAR held + evaluadores cdr/audit OK |

**Batch:** 7/9 passed, 2 `human_review` (ambos explicados; exit 0). Los 5 escenarios de Sprints 3–6 pendientes de validación viva pasaron todos.

## Verificación fitness (Sprint 7)

- `evolution.scenario_fitness`: **10 filas** (9 batch + 1 re-run LLM), **novelty no nula en 10/10** (bge-m3 vía Ollama respondió; rango 0.271–0.422).
- `endpoints_covered` y `audit_events_covered` poblados por run (p. ej. admission-discharge-001: 7 endpoints, 7 eventos).
- `evolab fitness report`: cobertura 11/24 endpoints del catálogo (13 huecos), 5/12 eventos de auditoría (7 huecos). Módulo audit 1/1; clinical 4/10. Huecos notables: `critical-results acknowledge`, `transfer`, `auth.logout`, `command.resolve` (evento auditoría).

## Fixes aplicados

**Ninguno.** No hubo bugs de escenario ni de engine. Acciones de entorno (no versionadas):

- Creado `.env` local desde `.env.example` (gitignored) — no existía en el working tree.
- Aplicada migración 003 sobre la DB `epis2_evolab` existente.

El `human_review` de `llm-command-evolution-001` en batch no es un bug: el escenario declara `execution: plan` y con `llmSimMode=off` no hay plan que evaluar. Validado en verde con `EPIS2_EVOLAB_LLM_SIM=execute` (run `a35abcdc`).

## Hallazgos sobre EPIS2 (no tocados — documentados)

Run `4d1553d6` (`discharge-critical-pending-001`), reproducibles, consistentes con el gap ya registrado en `evolab-known-limitations.md` («Confirmado: approve epicrisis no bloqueada por PCR pendiente»):

1. **clinical_safety (critical, conf 0.95):** alta aprobada (HTTP 200) con resultado crítico `f0000004-…-0002` sin acuse — la regla clínica no se aplica en UI/API. Componentes: `apps/api/clinical`, `packages/clinical-domain/cdr`.
2. **functional (high):** `POST /api/drafts/{id}/approve` devolvió 200 donde el escenario esperaba bloqueo.
3. **cdr_consistency (high):** `clinical_critical_results` tiene críticos sin acuse pero el CDR no emite alerta crítica en `clinical-alerts` — fuentes desincronizadas.
4. **audit_completeness (high):** auditoría registra `clinical.draft.approved` para una acción que debió bloquearse.

Los 4 hallazgos quedaron persistidos en `evolution.findings` con `recommendedAction: generate_test`, pendientes de `evolab review`.

## Estado final

- **Corpus:** 9/9 escenarios validados contra sandbox vivo (8 verdes + 1 finding legítimo por diseño).
- **Fitness Sprint 7:** escritura y novedad operativas end-to-end.
- **Stack EPIS2:** Postgres (`epis2-postgres`, :5433) y API (:3001) quedan corriendo para la siguiente sesión.

**Próximo paso sugerido:** revisar los 4 hallazgos de `discharge-critical-pending-001` (`evolab review`) y decidir si EPIS2 debe bloquear el approve con crítico pendiente (gate clínico); cubrir huecos de catálogo (`critical acknowledge`, `transfer`) en Sprint 8.
