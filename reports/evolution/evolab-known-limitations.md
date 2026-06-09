# EPIS2 Evolab — Limitaciones conocidas

**Actualizado:** 2026-06-09 · FASE 4/5

## MVP incompleto (por diseño)

| Capacidad | Estado | Fase |
|-----------|--------|------|
| Persistencia runs/findings | No implementado | 2 |
| Replay exact/new-seed/new-persona | CLI placeholder | 7 |
| Fault injection | No implementado | 8 |
| Test candidates | No implementado | 9 |
| Patch candidates | Desactivado | 10+ |
| Consola visual | Placeholder README | 10 |

## Limitaciones runtime (2026-06-09)

| Tema | Detalle |
|------|---------|
| **Playwright + Vite dev** | Sesión browser vía cookie API (`injectSessionCookies`); E2E golden usa `pinDemoCase` / `epis2-nav-buscar`. UI monta bajo `EpisAppProviders` en root route. |
| **CDR vs críticos DB** | `clinical_critical_results` (inbox) y CDR (`critical_lab_without_ack`) son fuentes distintas. DEMO-004 puede tener PCR pendiente en DB sin alerta CDR en `/clinical-alerts`. |
| **Enforcement clínico** | CDR documentadas como advisory — `discharge-critical-pending-001` registra hallazgo si approve HTTP 200 con crítico sin acuse. |
| **API colgada** | Si `:3001` queda en estado zombie, reiniciar con `DATABASE_URL` antes de `evolab:run`. |
| **Fixture críticos** | Tras tests manuales, acuses demo persisten — `sandbox-prep` resetea vía `docker exec epis2-postgres psql`. |

## Gaps de escenarios

| Escenario | Gap potencial |
|-----------|---------------|
| `discharge-critical-pending-001` | **Confirmado:** approve epicrisis no bloqueada por PCR pendiente (run `aafd3e1d…`) |
| `suspended-medication-mar-001` | Verificar si EPIS2 bloquea MAR suspendido o solo advierte |
| `role-evolution-sign-001` | RBAC admin en approve — verificado ✓ |

## Dependencias externas para runs completos

- Docker Postgres (`npm run stack:dev`)
- EPIS2 API + Web (`dev:api` con `DATABASE_URL`, `dev:web` en `:5173`)
- `EPIS2_EVOLAB_ENABLED=true` obligatorio

## No descarga modelos

Evolab nunca ejecuta `ollama pull` automáticamente.
