# EPIS2 Evolab — Arquitectura

Evolab es una aplicación Node.js independiente en `apps/evolution-lab` que examina EPIS2 como **caja negra** (Playwright + HTTP) con observación controlada de sandbox.

## Componentes (MVP FASE 1)

| Módulo | Responsabilidad |
|--------|-----------------|
| `orchestrator/` | Loop maestro determinista |
| `state-machine/` | Transiciones autorizadas |
| `security/` | Guards pre-ejecución |
| `ollama/` | Registry, router, cola, JSON estructurado |
| `contracts/` | Schemas Zod |
| `scenarios/` | DSL YAML declarativo |
| `findings/` | Fingerprints deterministas |

## Loop maestro

```text
PREPARE → SEED → ACT → OBSERVE → EVALUATE → REPRODUCE → … → HUMAN_REVIEW → COMPLETE
```

El orquestador controla transiciones; los agentes LLM no deciden el estado.

## Proceso separado

Evolab **no** corre dentro de `apps/api`. Se invoca vía `npm run evolab:*` o `tsx apps/evolution-lab/src/cli.ts`.

## Target Environment

Solo `local-sandbox` y `ci-sandbox` con `syntheticOnly: true`.

Ver `reports/evolution/evolab-boundary-plan.md`.
