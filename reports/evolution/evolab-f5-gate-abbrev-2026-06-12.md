# EPIS2 Evolab — F5 evolve abreviado

**Fecha:** 2026-06-12  
**Comando:** `npm run evolab:evolve -- --generations 3 --budget-minutes 20 --population 3 --json`  
**Stack:** Ollama `:11434` · API EPIS2 `:3001` · Postgres `:5433`

---

## Resultado

| Métrica | Valor | Gate F5 completo |
|---------|------:|------------------|
| Generaciones | 3 / 3 | 15 |
| Duración | **2.4 min** / 20 min | ~150 min |
| Mutaciones válidas | **6/9** (67%) | — |
| Evaluados sandbox | 6 | — |
| Élites vigentes | **5** | — |
| **Nichos vacíos rellenados** | **2** | ≥5 ✗ |
| Candidatos `human_review` | 63 | — |

**Veredicto abreviado:** loop OK · gate nocturno **no** alcanzado (esperado con 3 gen).

---

## Por generación

| Gen | mut | válid | eval | élite+ | cola | ms |
|-----|----:|------:|-----:|-------:|-----:|---:|
| 1 | 3 | 2 | 2 | 0 | 2 | 47s |
| 2 | 3 | 3 | 3 | 1 | 2 | 31s |
| 3 | 3 | 1 | 1 | 1 | 0 | 65s |

---

## Élites (muestra)

| Nicho | Candidato | Score |
|-------|-----------|------:|
| nurse×inpatient×blocked | `admission-discharge-001-m8rs-001` | 3.20 |
| physician×clinical×allowed | `admission-double-booking-001-m8cx-004` | 17.39 |
| physician×inpatient×blocked | `admission-discharge-001-m8cx-008` | 3.18 |
| (+ 2 más en archivo Postgres) | | |

---

## Telemetría

`reports/evolution/evolve/evolve-2026-06-12T00-14-05-048Z.json`

---

## Próximo paso (F5 completo)

```powershell
npm run evolab:evolve -- --generations 15 --population 5 --budget-minutes 150 --json
```

Revisar candidatos en `scenarios/candidates/` y cola consola antes de promover.
