# EPIS2 Evolab — Plan de reparaciones 2026-06-11

> **Restricción:** no modificar EPIS2 mientras el sandbox está en uso. Reparaciones solo en `epis2-evolab` + operación contra API ya levantada.

---

## Fase R0 — Inmediato (1 sesión, ~2 h) ✅ CERRADO 2026-06-11

| ID | Reparación | Entregable | Gate |
|----|------------|------------|------|
| R0.1 | **Commit WIP S10** staged (`metamorphic` foundation) | commit en master | `npm run quality` |
| R0.2 | Añadir **3 relaciones YAML** gate (MR-01, MR-02, MR-03) | YAML + dry-run verde | `validateRelationDryRun` |
| R0.3 | CLI `evolab metamorphic run --relation ID [--json]` | `cli.ts` + command | help + smoke manual |
| R0.4 | Tests unitarios metamorphic (evaluator + relation-loader) | ≥15 tests | vitest |
| R0.5 | Documentar `npm run quality` Windows | nota en README evolab | pendiente |

**Cierre:** `evolab-sprint10-close-2026-06-11.md` · 517 tests · dry-run smoke 3/3

---

## Fase R1 — Estabilización evolve (1 noche + 1 sesión)

| ID | Reparación | Detalle |
|----|------------|---------|
| R1.1 | Corrida calibrada MAP-Elites | `evolab evolve --generations 15 --population 5 --budget-minutes 150` |
| R1.2 | Actualizar `evolab-sprint9-gate.md` con resultado | objetivo ≥5 nichos vacíos |
| R1.3 | Política de presupuesto | No lanzar evolve desde EPIS2 PM-03 en paralelo — solo manual/nocturno (doc en Evolab, no cambiar EPIS2 ahora) |
| R1.4 | Purga telemetría local | Borrar `reports/evolution/evolve/*.json` >7 días (script opcional `evolab housekeeping`) |

---

## Fase R2 — Triage findings (Sprint 11 implementación mínima)

| ID | Reparación | Detalle |
|----|------------|---------|
| R2.1 | Golden set 25 findings | `reports/evolution/judge-golden-set.jsonl` versionado |
| R2.2 | `evolab judge triage --run-id X` | qwen3:8b JSON; **solo** advisory; `requiresHumanReview: true` |
| R2.3 | Dedup determinista por fingerprint | Sin LLM — spec S11 §1.1 |
| R2.4 | Persistir `judge_verdict` columna advisory | migración 005 |
| R2.5 | Gate ≥80% macro-F1 vs golden | script `evolab judge eval` |

---

## Fase R3 — Dependencias EPIS2 (cuando EPIS2 libre)

| ID | Reparación | Repo | Notas |
|----|------------|------|-------|
| R3.1 | CDR lee críticos DB | **EPIS2** | Cierra `cdr_consistency` DEMO-004 |
| R3.2 | `EPIS2_CHECKOUT_TOKEN` en GHA | GitHub secrets | CI smoke verde |
| R3.3 | Captura `census_baseline` en journey | Evolab YAML | Desbloquea MR-01 selfPair |

---

## Orden recomendado

```text
R0 (S10 cerrar) → R1 (evolve calibrar) → R2 (judge) → R3 (EPIS2 libre)
```

---

## Comandos de verificación por fase

```bash
# R0
npm run typecheck && npm run lint && npm run test
npm run evolab -- metamorphic run --relation mr-admission-discharge-inversion --dry-run

# R1
npm run evolab:evolve -- --generations 15 --population 5 --budget-minutes 150 --json

# R2
npm run evolab -- judge eval --golden reports/evolution/judge-golden-set.jsonl
```
