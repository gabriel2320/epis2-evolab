# Evolab — Cierre sesión 2026-06-13

**Alcance:** F5 dev-plan (VRAM governor) · hipótesis EPIS2 · registro desarrollos/capacidades · documentación organic loop.

---

## Entregado

| Ítem | Evidencia |
|------|-----------|
| Perfil `dev-plan` + VRAM 78%/9600 MB | `gpu/run-profile.ts`, `f5-resources.ts`, `vram-governor.ts` |
| F5 launcher | `scripts/evolution/f5-dev-plan-run.ts` · `evolab:f5:dev-plan` |
| Dev-plan brief | `export-dev-plan-brief.ts` · `evolab:dev-plan:brief` |
| Registro gaps | `dev-registration.ts` · `epis2-dev-registration.jsonl` (46 ítems) |
| Canon registro | `docs/evolution/EVOLAB_EPIS2_DEV_REGISTRATION.md` |
| Runbook F5 | `docs/evolution/F5_DEV_PLAN_RUNBOOK.md` |
| Hipótesis A/B/D/H3 fixed · E/F/G/C open | `hypotheses.jsonl` |

**Tests:** dev-plan, dev-registration, vram-governor, f5-resources — OK.

**EPIS2 (repo hermano):** fixes CDR/RBAC ya en `master` (`c3b8527`).

---

## Gates verificados hoy

- `evolab:pre-evolve-smoke` 4/4
- `evolab:f5:dev-plan:dry-run` OK
- `evolab:dev-register:export` 46 entradas

---

## Próximo paso (2026-06-14)

**Simulación larga 8 h** — ver [`f5-8h-launch-2026-06-14.md`](./f5-8h-launch-2026-06-14.md)

```powershell
npm run stack:dev          # EPIS2
npm run evolab:f5:8h       # evolab, tras pre-vuelo
```

Post-run: `dev-register:export` + `dev-plan:brief` + triage findings → sesión EPIS2 hyp-c o frente A/B/C.

---

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| VRAM critical al arrancar | `ollama ps` · solo qwen3:8b antes de F5 |
| API EPIS2 caída | `stack:dev` + doctor |
| 8 h unattended sin checkpoint | checkpoint 60 min · max-attempts 10 |

---

## Comandos útiles

```powershell
npm run evolab:gpu
npm run evolab:hypothesis
npm run evolab:replay-fingerprint -- 68c457a21613e462   # hyp-c
```
