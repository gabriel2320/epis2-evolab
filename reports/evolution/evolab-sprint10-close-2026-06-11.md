# Evolab Sprint 10 — Cierre R0 metamorphic 2026-06-11

## Entregables

| ID | Artefacto | Estado |
|----|-----------|--------|
| S10.1 | `metamorphic-schema.ts`, evaluators, `pair-runner.ts` | OK |
| S10.2 | 3 relaciones gate en `scenarios/relations/` | OK |
| S10.3 | `census_baseline` en `admission-discharge-001.yaml` | OK |
| S10.4 | `inheritedContext` + skip capture en step-engine | OK |
| S10.5 | CLI `evolab metamorphic run [--relation\|--tag\|--dry-run]` | OK |
| S10.6 | Tests relation-loader + metamorphic + engine | +20 tests |

## Gates

```bash
npm run quality          # 517/517 OK
tsx cli.ts metamorphic run --dry-run --tag smoke   # 3 relaciones OK
```

## Pendiente (no bloquea R0)

- **MR-03** cláusula `delta/drafts_count` — spec T3; requiere proyección count o custom step
- **Smoke vivo** — requiere API EPIS2 en :3001
- **R0.5** nota Windows README para wrapper `quality` intermitente

## Siguiente

Ver `evolab-repair-plan-2026-06-11.md` fases R1→R3 y `epis2-auto-dev-evolab-continuation-plan-2026-06-11.md` (EPIS2).
