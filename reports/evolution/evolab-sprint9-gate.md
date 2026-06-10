# EPIS2 Evolab — Sprint 9: gate loop evolutivo MAP-Elites

**Fecha:** 2026-06-10  
**Comando:** `npm run evolab:evolve -- --generations 3 --budget-minutes 30 --population 3`  
**Stack:** Ollama `http://localhost:11434` · API sandbox `:3001` · Postgres evolab `:5433`  
**Prerequisito:** `npm run evolab:db:migrate` (migración `004_evolution_archive.sql`)

## Resultado del gate (≥5 élites en nichos previamente vacíos)

| Métrica | Valor |
|---|---|
| Generaciones completadas | 3 / 3 |
| Presupuesto usado | 2.8 min / 30 min |
| Mutaciones intentadas | 9 |
| Mutaciones válidas (Zod+dry-run) | 7 (78%) |
| Candidatos evaluados en sandbox | 6 |
| Élites vigentes en archivo | 3 |
| **Élites nuevos en nichos previamente vacíos** | **1** (objetivo ≥5) |
| Candidatos en cola `human_review` | 1 |
| Descartes (evaluación fallida) | 1 |

**GATE NO ALCANZADO en corrida corta de validación** — el loop, persistencia y fitness funcionan; la corrida de 3 generaciones (~3 min efectivos) no explora suficiente el espacio de 36 nichos vacíos iniciales.

### Élites archivados

| Nicho | Candidato | Score | Operador | Gen |
|---|---|---|---|---|
| nurse×inpatient×blocked | `admission-discharge-001-m8rs-001` | 3.20 | role_swap | 1 |
| physician×clinical×allowed | `admission-double-booking-001-m8cx-004` | 17.39 | crossover | 2 |
| physician×inpatient×blocked | `admission-discharge-001-m8cx-008` | 3.18 | crossover | 3 |

### Descartes

- Gen 2: `admission-double-booking-001-m8rs-005` — evaluación OK pero score inferior a élite existente → cola `candidate`.
- Gen 2: candidato con fallo sandbox `HTTP 500` al crear borrador de alta → `discarded`.

### Telemetría

`reports/evolution/evolve/evolve-2026-06-10T17-02-31-164Z.json`

## Calibración recomendada para corrida nocturna (2–3 h)

1. **Generaciones × población:** `--generations 15 --population 5 --budget-minutes 150` — variar `startIndex` del pipeline entre generaciones ya implementado; no subir K sin ampliar presupuesto.
2. **Novelty:** subir umbral a `--novelty-threshold 0.01` en mutación si >30% descartes por duplicado (Sprint 8 gate usó 0.005, laxo).
3. **Operadores:** sesgar hacia `crossover` y `step_injection` cuando el mapa muestre huecos de endpoint (auth, audit, dashboard) — los `role_swap` sobre journeys existentes rellenan pocos nichos nuevos.
4. **Fixtures:** escenarios con `criticalResultPendingAcknowledgement` requieren reset automático (implementado en `evaluate-candidate.ts`).
5. **Migración:** ejecutar `evolab:db:migrate` antes de la primera corrida en estación nueva.

## Tests y dry-run

- `npm run quality` — 497 tests verdes (incl. S9.6: nichos, élites, selección, presupuesto, fallo candidato).
- `npm run evolab:evolve -- --generations 2 --budget-minutes 5 --dry-run` — sin Ollama/sandbox/DB.
