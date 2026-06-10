# EPIS2 Evolab — Limitaciones conocidas

**Actualizado:** 2026-06-10 · repo **epis2-evolab** · roadmap **v3**

Plan: [EVOLAB_ROADMAP.md](../../docs/evolution/EVOLAB_ROADMAP.md)

## Completado (v2 S0–S6 + v3 S7–S9)

| Capacidad | Estado |
|-----------|--------|
| Lint / CI / `npm run quality` | ✓ Sprint 0 |
| Motor declarativo YAML (`flow:`) | ✓ S1–2 |
| Catálogo tramo C (9 escenarios + journey) | ✓ S3–6 |
| Doctor / reset fixtures / evidencia minimal | ✓ S3–4 |
| Evaluadores `cdr_consistency`, `audit_completeness` | ✓ S5 |
| Journey `admission-discharge-001` | ✓ S6 |
| Fitness + mapa cobertura + `scenario_fitness` | ✓ S7 |
| Motor mutación LLM (4 operadores, gate 92%) | ✓ S8 |
| Loop `evolab evolve` + archivo MAP-Elites | ✓ S9 (gate nocturno pendiente) |

## Pendiente (roadmap v3 S10–S12)

| Capacidad | Sprint |
|-----------|--------|
| Evaluador metamórfico + relaciones clínicas | S10 (spec lista) |
| Judge local + bandit UCB | S11 (spec lista) |
| DGM-lite propuestas custom steps | S12 |
| LLM replan completo | Condicionado (S6) |
| Batch paralelo / fault injection / UI review | Diferido §4 roadmap |

## Limitaciones runtime

| Tema | Detalle |
|------|---------|
| **Sandbox EPIS2 externo** | Requiere API `:3001` + Postgres `:5433`; no empaquetado en Evolab |
| **CDR vs críticos DB** | `clinical-alerts` no lee `clinical_critical_results` — `cdr_consistency` emite finding en DEMO-004 aunque approve esté bloqueado (EPIS2 `61fb27f`) |
| **Enforcement epicrisis** | Guard en `approveDraft` (EPIS2) — política mixta critical block + override high documentada |
| **CI smoke vivo** | Job GHA requiere `EPIS2_CHECKOUT_TOKEN`; `continue-on-error` hasta observarlo verde |
| **Promoción corpus** | Candidatos en `scenarios/candidates/` — solo humano promueve a `scenarios/` |

## Gaps de cobertura (fitness report)

Huecos notables: `critical.acknowledged`, `inpatient.transferred`, `command.resolve`, dashboards work/patient/quality.

## Dependencias externas

- Docker Postgres (compartido EPIS2 `:5433`)
- Ollama local (mutación, embeddings bge-m3)
- `EPIS2_EVOLAB_ENABLED=true`

## No descarga modelos

Evolab nunca ejecuta `ollama pull` automáticamente.
