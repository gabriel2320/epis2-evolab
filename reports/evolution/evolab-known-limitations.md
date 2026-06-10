# EPIS2 Evolab — Limitaciones conocidas

**Actualizado:** 2026-06-10 · repo **epis2-evolab**

## Pendiente (por diseño)

Ver plan detallado: [docs/evolution/EVOLAB_ROADMAP.md](../../docs/evolution/EVOLAB_ROADMAP.md) (v2.0 — sprints S0–S6).

| Capacidad | Estado | Plan roadmap v2 |
|-----------|--------|-----------------|
| Lint / CI GitHub Actions | No implementado | Sprint 0 |
| Motor de pasos declarativo (escenario = YAML) | No implementado | Sprint 1–2 |
| Catálogo tramo C | ✅ Implementado (4 escenarios YAML, 8 activos) | Sprint 3 |
| Doctor preflight + reset fixtures | ✅ Implementado (`--strict`, `--reset-fixtures`, preflight en `run`) | Sprint 3 |
| CI smoke + evidencia minimal | ✅ Implementado (`evolab:smoke`, `--evidence minimal`, job GHA con sibling checkout — requiere secret `EPIS2_CHECKOUT_TOKEN`; `continue-on-error` hasta observarlo verde) | Sprint 4 |
| Evaluador CDR / audit completeness | ✅ Implementado (`cdr_consistency`, `audit_completeness` en discharge + MAR) | Sprint 5 |
| Journeys multi-paso | ✅ Implementado (`admission-discharge-001`: YAML encadenado con state carry, pasos idempotentes) | Sprint 6 |
| LLM loop run completo / replan | Diferido con disparador: activar solo cuando existan runs hybrid (`llmSimMode≠off`) con métricas `plan_fidelity` que justifiquen el replan; la métrica ya se persiste vía evaluaciones | Sprint 6 (condicionado) |
| Batch paralelo / run queue | Diferido | §4 roadmap (con disparador) |
| Fault injection | Diferido | §4 roadmap |
| Test/patch candidates (Ollama) | Diferido / desactivado | §4 roadmap |
| Review desde consola UI | Diferido | §4 roadmap |

## Implementado (referencia)

| Capacidad | Estado |
|-----------|--------|
| Persistencia PostgreSQL | ✓ FASE 2 |
| Replay / regenerate | ✓ FASE 7 |
| Backfill / queue / review CLI | ✓ FASE 7 |
| Simulated user + PlanExecutor | ✓ FASE 8–9 |
| Evolution Console read-only | ✓ FASE 10 |

## Limitaciones runtime

| Tema | Detalle |
|------|---------|
| **Sandbox EPIS2 externo** | Requiere checkout EPIS2 con `npm run stack:dev` o `$env:EPIS2_ROOT` + `evolab:stack` |
| **Playwright + Vite dev** | Sesión browser vía cookie API; E2E golden usa `pinDemoCase` / `epis2-nav-buscar` |
| **CDR vs críticos DB** | `clinical_critical_results` y CDR son fuentes distintas en DEMO-004 — el evaluador `cdr_consistency` cruza ambas y emite finding si divergen |
| **Enforcement clínico** | `discharge-critical-pending-001` registra hallazgo si approve HTTP 200 con crítico sin acuse |
| **API colgada** | `evolab run` hace preflight (timeout 3 s) y falla rápido con mensaje accionable; `--skip-preflight` lo omite |
| **Fixture críticos** | `sandbox-prep` resetea vía psql en PREPARE; `--reset-fixtures` lo hace obligatorio (falla si docker/psql no responde) |

## Gaps de escenarios

| Escenario | Gap potencial |
|-----------|---------------|
| `discharge-critical-pending-001` | Confirmado: approve epicrisis no bloqueada por PCR pendiente |
| `suspended-medication-mar-001` | Verificar si EPIS2 bloquea MAR suspendido o solo advierte |
| `role-evolution-sign-001` | RBAC admin en approve — verificado ✓ |
| `admission-double-booking-001` | Verificar contra sandbox vivo: 409 ante doble admisión de DEMO-004 |
| `role-nurse-approve-001` | Verificar contra sandbox vivo: 403 `draft.approve` para nurse |
| `draft-lifecycle-cancelled-001` | Verificar contra sandbox vivo: 409 al aprobar borrador cancelado |
| `census-service-integrity-001` | Verificar contra sandbox vivo: censo CIRUGIA-DEMO coherente |
| `admission-discharge-001` | Verificar journey completo contra sandbox vivo (admisión → epicrisis → alta) y validar en human_review |

## Dependencias externas

- Docker Postgres (compartido con EPIS2 en `:5433`)
- EPIS2 API + Web (`EPIS2_EVOLAB_*_BASE_URL`)
- `EPIS2_EVOLAB_ENABLED=true` obligatorio

## No descarga modelos

Evolab nunca ejecuta `ollama pull` automáticamente.
