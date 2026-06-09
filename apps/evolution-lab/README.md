# EPIS2 Evolab

**EPIS2 Simulated Evolution Laboratory** — suite autónoma de orquestación, simulación, testing y evolución supervisada sobre EPIS2.

Evolab opera **externamente** al sistema clínico ([epis2](https://github.com/gabriel2320/epis2)). EPIS2 no depende de Evolab.

## Inicio rápido

```bash
# Desde raíz de epis2-evolab
cp .env.example .env   # ajustar EPIS2_EVOLAB_ENABLED=true

npm run evolab:doctor
npm run evolab:scenarios
npm run evolab:db:migrate
npm run evolab:run -- --scenario discharge-critical-pending-001
npm run evolab:run -- --all
npm run evolab:replay -- --run <run-id>
npm run evolab:regenerate -- --run <run-id> --strategy new-seed
npm run evolab:import
npm run evolab:queue
npm run evolab:findings -- --status open
npm run evolab:review -- --finding <uuid> --decision approved|rejected|duplicate
npm run evolab:plan -- --scenario llm-command-evolution-001
$env:EPIS2_EVOLAB_LLM_SIM="execute"
npm run evolab:run -- --scenario llm-command-evolution-001
npm run evolab:validate
npm run evolab:boundary:validate
npm run evolab:console
```

Stack con sandbox EPIS2 en otro checkout:

```powershell
$env:EPIS2_ROOT="C:\path\to\epis2"
npm run evolab:stack
```

**Modo eficiente (default):** `EPIS2_EVOLAB_BROWSER=false` — API white-box sin Chromium.

## Arquitectura

```text
Evolution Orchestrator (proceso Node independiente)
  ├── State machine · Security guards · Ollama Gateway
  ├── Scenario runtime (deterministic + plan-driven)
  ├── Findings pipeline · PostgreSQL persistence
  └── Target adapters (HTTP + Playwright opcional)
```

## Ubicación en este repo

| Dimensión | Ruta |
|-----------|------|
| Lab | `apps/evolution-lab/` |
| Consola | `apps/evolution-console/` |
| Demo fixtures | `packages/demo-fixtures/` |
| Datos | DB `epis2_evolab` · schema `evolution` |
| Reportes | `reports/evolution/` |

## Documentación

- [docs/evolution/EVOLAB_ROADMAP.md](../../docs/evolution/EVOLAB_ROADMAP.md) — plan de mejora FASE 11–15
- [docs/evolution/EVOLAB_ARCHITECTURE.md](../../docs/evolution/EVOLAB_ARCHITECTURE.md)
- [docs/evolution/EVOLAB_BOUNDARIES.md](../../docs/evolution/EVOLAB_BOUNDARIES.md)
- [reports/evolution/evolab-mvp-validation.md](../../reports/evolution/evolab-mvp-validation.md)

## Fases (estado)

- [x] FASE 0–2 — Auditoría, CLI, PostgreSQL
- [x] FASE 4/5 — Evaluadores, batch, findings
- [x] FASE 7 — Replay, regenerate, backfill, review
- [x] FASE 8–9 — Simulated user + PlanExecutor
- [x] FASE 10 — Evolution Console (read-only)
- [ ] FASE 11–15 — Ver [EVOLAB_ROADMAP.md](../../docs/evolution/EVOLAB_ROADMAP.md)
