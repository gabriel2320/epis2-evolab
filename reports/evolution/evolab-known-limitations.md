# EPIS2 Evolab — Limitaciones conocidas

**Actualizado:** 2026-06-09 · repo **epis2-evolab**

## Pendiente (por diseño)

| Capacidad | Estado | Notas |
|-----------|--------|-------|
| Fault injection | No implementado | `EPIS2_EVOLAB_FAULT_INJECTION` |
| Test candidates (Ollama) | No implementado | — |
| Patch candidates | Desactivado | `EPIS2_EVOLAB_PATCHING_ENABLED=false` |
| Review desde consola UI | No implementado | CLI `evolab:review` |
| LLM loop run completo | Parcial | Plan + execute piloto (`llm-command-evolution-001`) |
| Escenarios 100% plan-driven | Parcial | Solo escenario piloto |

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
| **CDR vs críticos DB** | `clinical_critical_results` y CDR son fuentes distintas en DEMO-004 |
| **Enforcement clínico** | `discharge-critical-pending-001` registra hallazgo si approve HTTP 200 con crítico sin acuse |
| **API colgada** | Si `:3001` queda zombie, reiniciar sandbox EPIS2 antes de `evolab:run` |
| **Fixture críticos** | Tras tests manuales, acuses demo persisten — `sandbox-prep` resetea vía psql |

## Gaps de escenarios

| Escenario | Gap potencial |
|-----------|---------------|
| `discharge-critical-pending-001` | Confirmado: approve epicrisis no bloqueada por PCR pendiente |
| `suspended-medication-mar-001` | Verificar si EPIS2 bloquea MAR suspendido o solo advierte |
| `role-evolution-sign-001` | RBAC admin en approve — verificado ✓ |

## Dependencias externas

- Docker Postgres (compartido con EPIS2 en `:5433`)
- EPIS2 API + Web (`EPIS2_EVOLAB_*_BASE_URL`)
- `EPIS2_EVOLAB_ENABLED=true` obligatorio

## No descarga modelos

Evolab nunca ejecuta `ollama pull` automáticamente.
