# EPIS2 Evolab — Validación MVP (FASE 0–5)



**Fecha:** 2026-06-08  

**Actualizado:** 2026-06-09 — escenario `discharge-critical-pending-001`



---



## Gates ejecutados



| Gate | Resultado |

|------|-----------|

| `typecheck -w @epis2/evolution-lab` | ✓ |

| `test -w @epis2/evolution-lab` | ✓ 367+ tests |

| `evolab:boundary:validate` | ✓ |

| **E2E Evolab** `role-evolution-sign-001` | ✓ **PASSED** (completed) |

| **E2E Evolab** `discharge-critical-pending-001` | ✓ **Ejecutado** (human_review — hallazgo clínico) |



---



## Escenario RBAC — `role-evolution-sign-001`



```text

Run: e586aa1a-14a9-43bb-be58-cdf2627dfdd1

Estado: completed

Evidencia: reports/evolution/runs/e586aa1a-14a9-43bb-be58-cdf2627dfdd1/

```



| Evaluador | Resultado |

|-----------|-----------|

| role_permission | ✓ Admin → HTTP 403 en approve |

| functional | ✓ Acción bloqueada |

| dom_state | ✓ Sin botón aprobar + API 403 |



---



## Escenario seguridad clínica — `discharge-critical-pending-001`



```text

Run: aafd3e1d-687f-4ca0-a67f-98de404b4a7f

Estado: human_review

Evidencia: reports/evolution/runs/aafd3e1d-687f-4ca0-a67f-98de404b4a7f/

```



| Evaluador | Resultado |

|-----------|-----------|

| functional | ✗ HTTP 200 en approve — se esperaba bloqueo |

| clinical_safety | ✗ **Hallazgo crítico:** alta aprobada con PCR sin acuse |

| critical_pending | ✓ Crítico sigue pendiente tras intento |



**Interpretación:** Evolab detectó correctamente que EPIS2 permite aprobar epicrisis (API) pese a `clinical_critical_results` pendiente en DEMO-004. Las CDR son advisory; no hay enforcement en approve.



**Preparación sandbox:** `sandbox-prep` restaura `acknowledged_at=NULL` vía Docker Postgres antes del run.



**Ruta de ejecución:** white-box API (dashboard + alerts + draft create + approve) + sonda browser opcional (DOM no disponible — ver limitaciones).



---



## FASE 4/5 entregada



- Target adapters: API health/login/request, browser Playwright

- Scenario runtime: executor por escenario (`role-evolution-sign-001`, `discharge-critical-pending-001`)

- Evaluadores: `clinical_safety`, `critical_pending`, HTTP/DOM/RBAC

- Evidencia filesystem: metadata, result, evaluation, api/, screenshots/

- Fixture prep idempotente para críticos demo



---



## FASE 7 entregada (2026-06-09)

- regenerate / replay / import / queue / review
- Batch `--all`: MAR verificado

## FASE 8 — Simulated user (LLM plan)

- `SimulatedUserAgent` + `EPIS2_EVOLAB_LLM_SIM=true`
- Evidencia `model/simulated-user-plan.json`
- CLI `evolab:plan --scenario <id>`

## Playwright / E2E reparado

- Golden journeys + Evolab browser (`injectSessionCookies`)

## FASE 9 — Plan → acciones (2026-06-09)

- `PlanExecutor` — channels `api` | `browser` | `command` | `observe`
- `EPIS2_EVOLAB_LLM_SIM=execute` — plan Ollama + ejecución
- Modo híbrido: plan fallido → executor determinista (escenarios conocidos)
- Escenario piloto `llm-command-evolution-001`
- Evaluadores `plan_fidelity`, `command_resolve`

## Pendiente

- Evolution Console (FASE 10)
- Ejecutor genérico driven-by-plan
- Fault injection

