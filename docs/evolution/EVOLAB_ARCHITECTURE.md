# EPIS2 Evolab — Arquitectura

Repositorio **epis2-evolab**: aplicación Node.js en `apps/evolution-lab` que examina EPIS2 como **caja negra** (Playwright + HTTP) con observación controlada de sandbox.

Target EPIS2: checkout separado con `npm run stack:dev` (web `:5173`, API `:3001`).

## Componentes

| Módulo | Responsabilidad |
|--------|-----------------|
| `orchestrator/` | Loop maestro determinista |
| `state-machine/` | Transiciones autorizadas |
| `security/` | Guards pre-ejecución |
| `ollama/` | Registry, router, cola, JSON estructurado |
| `plan-executor/` | Ejecución de planes LLM (FASE 9) |
| `simulated-user/` | Agente LLM estructurado (FASE 8) |
| `persistence/` | PostgreSQL `epis2_evolab` |
| `console/` | Read-model para Evolution Console |
| `contracts/` | Schemas Zod |
| `scenarios/` | DSL YAML declarativo |
| `findings/` | Fingerprints deterministas |

## Loop maestro

```text
PREPARE → SEED → ACT → OBSERVE → EVALUATE → REPRODUCE → … → HUMAN_REVIEW → COMPLETE
```

## Proceso separado

Evolab **no** corre dentro de `apps/api` de EPIS2. Se invoca vía `npm run evolab:*` en **este repo**.

## Target Environment

Solo `local-sandbox` y `ci-sandbox` con `syntheticOnly: true`.

Ver `reports/evolution/evolab-boundary-plan.md`.
