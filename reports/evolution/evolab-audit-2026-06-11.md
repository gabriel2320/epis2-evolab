# EPIS2 Evolab — Auditoría 2026-06-11

**Alcance:** repo `epis2-evolab` únicamente · **EPIS2 no auditado** (sandbox externo en uso).

---

## Resumen ejecutivo

| Área | Estado | Severidad |
|------|--------|-----------|
| Calidad código (typecheck/lint/format) | OK | — |
| Tests unitarios | **543/543** OK | — |
| `npm run quality` wrapper | Fallo intermitente Windows — ver README F4.2 | media |
| Sprint 7–9 (fitness, mutación, evolve) | Implementado · gate S9 parcial | media |
| Sprint 10 (metamórfico) | **✓** MR-01…07 · smoke vivo 7/7 | — |
| Sprint 11 (judge + bandit) | **✓** 84% live · consola · G1 | — |
| Sprint 12 (DGM-lite) | Roadmap | futura |
| CI smoke vivo | `EPIS2_CHECKOUT_TOKEN` + metamorphic en job smoke | media |
| Telemetría evolve huérfana | `npm run evolab:housekeeping` (F4.3) | baja |
| Dependencia EPIS2 | API/DB compartidos — CDR DEMO-004 upstream | externa |

---

## Inventario de agentes Evolab

| Agente / módulo | Rol | Estado | Modelo(s) |
|-----------------|-----|--------|-----------|
| **Step-engine** | Ejecutor declarativo YAML | Producción | — |
| **SimulatedUserAgent** | Plan LLM híbrido (FASE 8) | Activo con fallback; replan **diferido** | router Ollama |
| **Mutation pipeline** | Operadores LLM sobre YAML | S8 ✓ gate 92% | 7b amplitud / 14b reparación |
| **Evolve MAP-Elites** | Loop generacional + archivo | S9 ✓ gate parcial | reusa mutación |
| **Metamorphic pair-runner** | Oráculos par (A,B) | **✓ S10/F3** MR-01…07 | — |
| **Judge triage** | Clasifica señal/ruido/duplicado | **✓ S11** 84% live qwen3:8b | qwen3:8b |
| **Bandit UCB** | Selección modelo por tarea | **✓ S11** seed + judge_triage | stats Postgres |
| **Plan executor LLM** | Ejecución planes (FASE 9) | Código presente; uso condicionado | — |

---

## Hallazgos técnicos

### H1 — Sprint 10 incompleto (P0)

**Evidencia:** existen `metamorphic-schema.ts`, `evaluators/metamorphic.ts`, `metamorphic/pair-runner.ts`, `relation-loader.ts`, cambios en `orchestrator` (`inheritedContext`), pero:

- Sin `scenarios/relations/*.yaml`
- Sin `evolab metamorphic` en CLI
- Sin tests `metamorphic*.test.ts`
- Sin integración CI smoke

**Riesgo:** código muerto en master si no se commitea o no se cierra S10.

### H2 — Gate S9 no calibrado (P1)

**Evidencia:** [`evolab-sprint9-gate.md`](./evolab-sprint9-gate.md) — 1/5 élites en nichos vacíos (corrida 3 gen, 2.8 min).

**Riesgo:** loop funcional pero subexplora; PM-03 EPIS2 lanzó evolves cortos en paralelo generando telemetría sin valor clínico adicional.

### H3 — Cola de findings sin judge (P1)

**Evidencia:** S11 spec lista; ~24+ findings abiertos en DB (sync EPIS2 bridge). Triage 100% humano.

**Riesgo:** fatiga de revisión; duplicados por fingerprint (`discharge-critical`, `admission-discharge` mutados).

### H4 — Cobertura fitness con huecos (P2)

**Gaps:** `critical.acknowledged`, `inpatient.transferred`, `command.resolve`, dashboards work/patient/quality.

**Relación:** MR-07 (S10 spec) cerraría `critical.acknowledged` vía par metamórfico.

### H5 — `cdr_consistency` vs EPIS2 (externo, P2)

Finding persistente en DEMO-004: CDR no lee `clinical_critical_results`. **No reparar en esta sesión** (EPIS2 en trabajo). Evolab debe documentar como dependencia upstream.

### H6 — Simulated user / replan LLM (P3)

Replan acotado diferido (S6.2). Agente existe pero no es el cuello de botella actual vs mutación/evolve.

### H7 — CI smoke vivo (P2)

GHA requiere `EPIS2_CHECKOUT_TOKEN`; job `continue-on-error`. Sin observación verde sostenida.

### H8 — WIP staged sin commit (P1)

Tras reparación 2026-06-11, 9 archivos en staging en `d8969e8`. Git identity no configurada en máquina local impidió commit.

### H9 — Calidad npm en Windows (P3)

`npm run quality` abortó con `-1073741819`; `npx vitest run` OK. Posible interacción npm workspaces + vitest en Windows.

---

## Conflictos cerrados (esta auditoría)

| Conflicto | Resolución |
|-----------|------------|
| Lint S10 (`sourceLabels`) | Eliminado variable no usada |
| Prettier metamorphic | Formateado |
| Telemetría evolve en git | `.gitignore` `reports/evolution/evolve/` |
| Merge markers git | Ninguno detectado |
| Doble evolve PM-03 | Responsabilidad EPIS2 lock — **no tocado** |

---

## Métricas de referencia

- Corpus humano: **9 escenarios** + journey
- Mutación S8: **92%** validez (50 ops)
- Evolve gate corto: **3 élites**, **1** nicho nuevo
- Tests: **497**

---

## Referencias

- Roadmap: [`docs/evolution/EVOLAB_ROADMAP.md`](../../docs/evolution/EVOLAB_ROADMAP.md)
- S10 spec: [`evolab-sprint10-metamorphic-spec.md`](./evolab-sprint10-metamorphic-spec.md)
- S11 spec: [`evolab-sprint11-judge-bandit-spec.md`](./evolab-sprint11-judge-bandit-spec.md)
- Limitaciones: [`evolab-known-limitations.md`](./evolab-known-limitations.md)
