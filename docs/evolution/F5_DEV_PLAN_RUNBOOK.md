# F5 dev-plan — Runbook (VRAM controlada + plan EPIS2)

**Objetivo:** evolucionar escenarios clínicos con **GPU acotada** y convertir hallazgos en **acciones concretas** del tablero EPIS2 (PROG-EXPERIENCIA-CORE).

**Registro desarrollos / gaps:** [`EVOLAB_EPIS2_DEV_REGISTRATION.md`](./EVOLAB_EPIS2_DEV_REGISTRATION.md)

---

## Perfil `dev-plan`

| Parámetro | Valor | Motivo |
|-----------|-------|--------|
| `EPIS2_EVOLAB_RUN_PROFILE` | `dev-plan` | Browser off, evidencia minimal |
| VRAM % max | **78%** | Margen vs sesión anterior (92% → aborts) |
| VRAM MB max | **9600** | RTX 5070 12 GB — deja ~2.5 GB SO + sandbox |
| VRAM warn | **72%** | Pausa antes de mutación |
| LLM concurrency | **1** | Un modelo en VRAM (orchestrator exclusivo) |
| Embedding | `bge-m3` | Tras mutación; swap secuencial |

Override opcional en `.env`:

```env
EPIS2_EVOLAB_RUN_PROFILE=dev-plan
EPIS2_EVOLAB_MAX_GPU_MEM_PERCENT=78
EPIS2_EVOLAB_MAX_GPU_MEM_MB=9600
EPIS2_EVOLAB_GPU_WARN_PERCENT=72
EPIS2_EVOLAB_MODEL=qwen3:8b
EPIS2_EVOLAB_EMBEDDING_MODEL=bge-m3
```

---

## Comandos

```bash
# Pre-vuelo (estimación VRAM + nichos + hipótesis open)
npm run evolab:f5:dev-plan:dry-run

# Corrida recomendada (~120 min, checkpoint 40 min)
npm run evolab:f5:dev-plan

# Parámetros custom
npm run evolab:f5:dev-plan -- --generations 12 --budget-minutes 90 --population 3

# Brief accionable → EPIS2 (sin evolve)
npm run evolab:dev-plan:brief

# Estado GPU
npm run evolab:gpu
```

---

## Nichos focus (MAP-Elites)

Alineados a clínica base + tres frentes (API-first):

- `physician|clinical|blocked` — discharge / critical
- `nurse|inpatient|blocked` — RBAC operacional
- `physician|inpatient|journey` — admisión → alta
- `physician|clinical|journey` — journey clínico
- `admin|audit|journey` — audit trail (hyp-c)

Escenarios **paper/classic** (browser) → sesión aparte con `visual-smoke` ≤15 min.

---

## Hipótesis ↔ plan EPIS2

Registry: `reports/evolution/hypotheses.jsonl`

| ID | Frente | MF / gate EPIS2 |
|----|--------|-----------------|
| hyp-c-audit-trail | core | audit · `npm run check` |
| hyp-e-paper-command | A papel | MF-PA-01 · `quality:paper-mode-next` |
| hyp-f-dual-chart-nav | B electrónica | MF-TE-01 · `quality:dual-chart-gate` |
| hyp-g-command-assist | C comando | MF-CM-01 · `test:e2e:ux-g02` |

P0 cerrados (hyp-a/b/d) siguen como **regresión** en pre-evolve smoke.

Formato notas enriquecidas (opcional):

```text
[dev-plan:A-paper|MF-PA-01|quality:paper-mode-next|packages/command-registry/|Fix comando X]
```

---

## Flujo sesión humana (≤2 sesiones por P0)

1. **Evolab:** `evolab:f5:dev-plan` → brief en `reports/evolution/evolab-dev-plan-brief-*.md`
2. **Priorizar:** hipótesis P0/P1 open del brief
3. **Replay:** `npm run evolab:replay-fingerprint -- <fp>`
4. **EPIS2:** fix mínimo en sandbox · PR con `evolab-fp-*`
5. **Gate frente:** según tabla (golden-journey / dual-chart / ux-g02)
6. **Cierre:** `hypothesis update --status fixed`

---

## Gates obligatorios

| Fase | Comando |
|------|---------|
| Pre-evolve | `npm run evolab:pre-evolve-smoke` |
| Post-evolve | mismo + brief dev-plan |
| EPIS2 fix | `npm run check` + gate del frente |
| Promote corpus | `archive:promote --hypothesis-id` o `--signoff` |

---

## Qué evitar

- F5 6h unattended con browser on
- Dos modelos generativos cargados (`ollama ps` > 1)
- Evolve sin dry-run tras cambio de modelo
- Mezclar tramo clínico + refactor UI masivo en una sesión EPIS2

---

## Artefactos

| Ruta | Contenido |
|------|-----------|
| `reports/evolution/evolab-dev-plan-brief-*.md` | Acciones sesión EPIS2 |
| `reports/evolution/evolve/evolve-*.json` | Telemetría MAP-Elites |
| `reports/evolution/hypotheses.jsonl` | Registry organic loop |
| `docs/evolution/EVOLAB_EPIS2_TRACEABILITY.md` | PR labels + Gate D |

Ver también: `evolab-improvement-plan-v4-2026-06-13.md` (VRAM Governor S13).
