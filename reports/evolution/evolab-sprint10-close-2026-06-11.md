# Evolab Sprint 10 — Cierre metamorphic (completo) 2026-06-11

## Entregables

| ID | Artefacto | Estado |
|----|-----------|--------|
| S10.1 | `metamorphic-schema.ts`, evaluators, `pair-runner.ts` | OK |
| S10.2 | 3 relaciones gate P0 en `scenarios/relations/` (MR-01…03) | OK |
| S10.3 | `census_baseline` en `admission-discharge-001.yaml` | OK |
| S10.4 | `inheritedContext` + skip capture en step-engine | OK |
| S10.5 | CLI `evolab metamorphic run [--relation\|--tag\|--dry-run]` | OK |
| S10.6 | Tests relation-loader + metamorphic + engine | OK |
| S10.7 | MR-03 `delta/drafts_count` — custom step + cláusula YAML | OK |

## Gates

```bash
npm run quality
tsx apps/evolution-lab/src/cli.ts metamorphic run --dry-run --tag smoke   # 3 relaciones
```

Smoke vivo (sandbox EPIS2 en `:3001`):

```bash
npm run evolab -- metamorphic run --tag smoke
```

## MR-03 — drafts_count

- Custom step `drafts_count` en `step-engine/custom-steps.ts` (paginación GET `/api/drafts?patientId=…`)
- Observación al final de `role-nurse-approve-001.yaml`
- Cláusula `compare: delta` en `mr-blocked-idempotence-001.yaml` (`expected: 0`)

## Pendiente operativo (no bloquea cierre S10)

- Smoke metamorphic **vivo** contra API EPIS2 (requiere `stack:dev` en EPIS2)
- MAP-Elites: relaciones como nicho (`metamorphic` en `NICHE_OUTCOMES`) — S10/S11 backlog menor

## Siguiente

Sprint 11 judge + bandit — ver `evolab-sprint11-judge-gate.md` · `npm run evolab:judge:eval -- --mock`
