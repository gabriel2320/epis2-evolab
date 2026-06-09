# EPIS2 Evolab

**EPIS2 Simulated Evolution Laboratory** — suite autónoma de orquestación, simulación, testing y evolución supervisada sobre EPIS2.

Evolab opera **externamente** al sistema clínico. EPIS2 no depende de Evolab.

## Inicio rápido

```bash
# Desde raíz del monorepo
cp apps/evolution-lab/.env.example .env   # ajustar EPIS2_EVOLAB_ENABLED=true

npm run evolab:doctor
npm run evolab:scenarios
npm run evolab:db:migrate                 # crear epis2_evolab + schema evolution
npm run evolab:run -- --scenario discharge-critical-pending-001
npm run evolab:run -- --all                    # batch — 3 escenarios
npm run evolab:run -- --tag clinical_safety    # batch por tag
npm run evolab:replay -- --run <run-id>        # reproducir con mismo seed (filesystem o DB)
npm run evolab:regenerate -- --run <run-id> --strategy new-seed
npm run evolab:import                          # backfill reports → PostgreSQL
npm run evolab:queue                           # cola human_review
npm run evolab:findings -- --status open
npm run evolab:review -- --finding <uuid> --decision approved|rejected|duplicate
npm run evolab:plan -- --scenario llm-command-evolution-001
$env:EPIS2_EVOLAB_LLM_SIM="execute"
npm run evolab:run -- --scenario llm-command-evolution-001
npm run evolab:validate
npm run evolab:boundary:validate
```

**Modo eficiente (default):** `EPIS2_EVOLAB_BROWSER=false` — API white-box sin Chromium.  
**Hallazgos:** cada run fallido genera `findings.json` con fingerprint determinista.

## Arquitectura

```text
Evolution Orchestrator (proceso Node independiente)
  ├── State machine (transiciones explícitas)
  ├── Security guards (sandbox only)
  ├── Ollama Gateway (cola, circuit breaker)
  ├── Scenario runtime (3 executors + YAML)
  ├── Findings pipeline (fingerprints + findings.json)
  └── Target adapters (HTTP + Playwright opcional)
```

## Independencia

| Dimensión | Ubicación |
|-----------|-----------|
| Código | `apps/evolution-lab/` |
| Consola | `apps/evolution-console/` (placeholder) |
| Datos | `epis2_evolab` DB · schema `evolution` |
| Comandos | `npm run evolab:*` |
| Reportes | `reports/evolution/` |

## Documentación

- `docs/evolution/EVOLAB_ARCHITECTURE.md`
- `docs/evolution/EVOLAB_BOUNDARIES.md`
- `reports/evolution/evolab-audit.md`

## Fases

- [x] FASE 0 — Auditoría
- [x] FASE 1 — App autónoma (CLI, contratos, state machine, guards)
- [x] FASE 2 — Persistencia PostgreSQL (`epis2_evolab` / schema `evolution`)
- [ ] FASE 3–10 — Ver prompt maestro
