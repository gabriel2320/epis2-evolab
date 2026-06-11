# EPIS2 Evolab — Plan de mejora de agentes y desarrollo

**Horizonte:** Sprints 10–12 (roadmap v3) · **2026-06-11**

---

## 1. Visión de la flota de agentes

```text
                    ┌─────────────────┐
                    │  Humano (PR)    │  promoción corpus · evolab review
                    └────────┬────────┘
                             │
    ┌────────────────────────┼────────────────────────┐
    │                        │                        │
    ▼                        ▼                        ▼
┌─────────┐           ┌─────────────┐          ┌──────────────┐
│ Mutator │──YAML──▶  │  Sandbox    │──obs──▶│ Evaluators   │
│ 7b/14b  │           │  runner     │          │ determinista │
└────┬────┘           └─────────────┘          └──────┬───────┘
     │                                                  │
     ▼                                                  ▼
┌─────────┐                                    ┌──────────────┐
│ Evolve  │◀── fitness / MAP-Elites            │ Metamorphic  │  S10
│ loop    │                                    │ pair-runner  │
└────┬────┘                                    └──────┬───────┘
     │                                                  │
     ▼                                                  ▼
┌─────────┐                                    ┌──────────────┐
│ Judge   │  S11 — ordena cola                 │ Findings DB  │
│ qwen3   │  (no aprueba)                      └──────────────┘
└────┬────┘
     │
     ▼
┌─────────┐
│ Bandit  │  S11 — elige modelo por tarea
│ UCB     │
└─────────┘
```

---

## 2. Mejoras por agente

### 2.1 Mutation Agent (S8 — mantenimiento)

| Mejora | Prioridad | Acción |
|--------|-----------|--------|
| Integrar bandit cuando exista | P1 | `task_type=mutation_amplitude` → 7b vs qwen3 |
| Few-shot desde archivo MAP-Elites | P1 | Inyectar 2 élites por nicho en prompt |
| Operador `role_swap` → relaciones MR-02 | P0 | Sinergia S10: mutación genera follow-up nurse |
| Telemetría por operador en evolve JSON | P2 | Ya parcial — dashboard en console |

### 2.2 Evolve Agent (S9 — calibración)

| Mejora | Prioridad | Acción |
|--------|-----------|--------|
| Presupuesto nocturno 150 min | P0 | Ver R1 plan reparación |
| Protección élites corpus humano | ✓ | No reemplazar, solo comparar |
| Fitness multiobjetivo | P1 | Pesar hallazgos `high` > cobertura trivial |
| Nichos frontera | P1 | Ya en `select-parents` — validar con corrida larga |

### 2.3 Metamorphic Agent (S10 — implementar)

| Mejora | Prioridad | Acción |
|--------|-----------|--------|
| CLI + 3 relaciones gate | P0 | MR-01 inversión, MR-02 RBAC, MR-03 idempotencia |
| `selfPair` MR-01 | P0 | Añadir `census_baseline` al journey YAML |
| `reuseContext` MR-03 | P0 | Ya en orchestrator WIP — test E2E |
| CI unitario sin sandbox | P0 | Tests con observaciones mock |
| MR-04 conservación auditoría | P1 | Requiere `audit_snapshot` custom step |

### 2.4 Judge Agent (S11 — nuevo)

| Mejora | Prioridad | Acción |
|--------|-----------|--------|
| Modelo fijo qwen3:8b `think:false` | P0 | Spec S11 |
| Golden 25 findings | P0 | Etiquetar desde dossier + runs históricos |
| Prohibición escribir `review_status` | P0 | Guard en código + test |
| Cola ordenada por `signal` first | P1 | `evolab review --sorted` |
| Eval offline ≥80% F1 | P0 | Gate S11 |

### 2.5 Bandit Agent (S11 — nuevo)

| Mejora | Prioridad | Acción |
|--------|-----------|--------|
| Tabla `model_bandit_stats` | P0 | migración 005 |
| Tareas: mutation_amplitude, mutation_repair, judge_triage | P0 | Spec S11 |
| Warm-start desde telemetría S8 | P1 | Importar tasas 7b/14b del gate |
| CLI `evolab models --bandit` | P1 | Mostrar UCB por tarea |
| Loop secuencial VRAM | ✓ | Un modelo cargado — diseño actual OK |

### 2.6 Simulated User Agent (FASE 8 — diferido)

| Mejora | Prioridad | Acción |
|--------|-----------|--------|
| Replan LLM | P3 | Solo si `plan_fidelity` acumulado lo exige (S6.2) |
| No competir con mutación YAML | — | Mutación es genoma v3; sim-user queda híbrido legacy |

### 2.7 DGM-lite Agent (S12 — futuro)

| Mejora | Prioridad | Acción |
|--------|-----------|--------|
| Detector nichos inalcanzables | P2 | `fitness gaps --unreachable` |
| Propuestas en `proposals/` | P2 | custom step / evaluador borrador |
| Humano mergea PR | P0 guardrail | Nunca auto-merge |

---

## 3. Plan de desarrollo por sprint (Evolab only)

### Sprint 10 — Cierre (2–3 sesiones)

| Semana | Entregables |
|--------|-------------|
| S10-A | Commit foundation + 3 YAML relations + CLI + tests |
| S10-B | MR-01 verde contra sandbox (API EPIS2 cuando libre) |
| S10-C | CI: job `metamorphic-unit` en workflow quality |

**Gate:** 3 relaciones metamórficas en CI (unit + 1 smoke opcional).

### Sprint 11 — Judge + Bandit (3–4 sesiones)

| Semana | Entregables |
|--------|-------------|
| S11-A | Golden set + judge triage CLI + migración |
| S11-B | Bandit stats + integración en mutate pipeline |
| S11-C | Gate F1 ≥80% + `evolab models --bandit` |

### Sprint 12 — DGM-lite (exploratorio)

| Entregables |
|-------------|
| Reporte gaps unreachable |
| 1 propuesta custom step en `proposals/` con tests |
| Review humano |

---

## 4. KPIs agentes (north-star Evolab)

| KPI | Baseline | Meta S10 | Meta S11 | Meta S12 |
|-----|----------|----------|----------|----------|
| Relaciones metamórficas activas | 0 | 3 | 5 | 7 |
| Precisión judge (F1) | — | — | ≥80% | ≥85% |
| Élites/noche (nichos vacíos) | 1 | — | ≥5 | ≥8 |
| Findings abiertos sin triage | ~24 | ~24 | cola ordenada | −30% dup |
| Cobertura endpoints catálogo | parcial | +MR-07 | +judge noise filter | +DGM gap fill |

---

## 5. Riesgos del plan de agentes

| Riesgo | Mitigación |
|--------|------------|
| Judge auto-cierra findings | Tests + invariante `requiresHumanReview` |
| Bandit elige modelo sin VRAM | Preflight `evolab doctor` + fallback fijo |
| Metamorphic flaky por timing | Prohibir campos `*At` en verify (ya en loader) |
| Evolve quema API EPIS2 | Ventanas nocturnas; no orquestar desde EPIS2 PM-03 |

---

## 6. Próximo paso único

**S10-A:** commit staged + 3 archivos `scenarios/relations/mr-*.yaml` + CLI `metamorphic run`.

Ver [`evolab-repair-plan-2026-06-11.md`](./evolab-repair-plan-2026-06-11.md) para tareas R0 desglosadas.
