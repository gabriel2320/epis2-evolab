# EPIS2 Evolab — Sprint 8: gate del motor de mutación LLM

**Fecha:** 2026-06-10
**Comando:** `npm run evolab:mutate -- --count 50` (mezcla de los 4 operadores sobre el corpus real de 9 escenarios)
**Stack:** Ollama nativo `http://localhost:11434` · qwen2.5-coder:7b (amplitud) · qwen2.5-coder:14b (profundidad/reparación) · bge-m3 (novedad)
**Spec base:** [`evolab-sprint8-mutation-spec.md`](evolab-sprint8-mutation-spec.md)

## Resultado del gate (≥70% requerido)

| Operador | Generadas | Válidas directas | Reparadas | Válidas finales | Aceptadas | Descartes |
|---|---|---|---|---|---|---|
| role_swap (7b) | 13 | 13 | 0 | **13 (100%)** | 6 | duplicate: 7 |
| payload_perturbation (14b) | 13 | 11 | 1 | **12 (92%)** | 12 | invalid_unrepairable: 1 |
| step_injection (7b) | 12 | 9 | 0 | **9 (75%)** | 3 | invalid: 3 · duplicate: 6 |
| crossover (14b) | 12 | 12 | 0 | **12 (100%)** | 10 | duplicate: 2 |
| **Global** | **50** | **45 (90%)** | **1** | **46 (92%)** | **31** | — |

**GATE SUPERADO: 92% de validez final (post-reparación) vs umbral 70%.** Validez directa 90%.

- Duración total de la corrida: **700 s (~11.7 min)** — dentro del presupuesto del roadmap (50–200 mutaciones por corrida nocturna).
- Los 4 descartes inválidos fueron fallos de Zod en el union de `flow` (paso malformado por el modelo), que por política §2.7 se descartan sin reparación.
- 15 descartes por duplicado estructural/novedad: esperado (R4 — los modelos convergen con seeds distintos); el dedup hizo su trabajo.
- 31 candidatos YAML quedaron en `scenarios/candidates/` (gitignored — no entran al corpus sin revisión humana).

## Ejemplo ilustrativo aceptado (crossover, 14b)

`role-nurse-approve-001-m8cx-012`: combina la creación de nota de enfermería (padre A, `role-nurse-approve-001`) con el sufijo de revisión browser + approve de `role-evolution-sign-001` (padre B), renombrando labels, conservando la cadena `capture: draftId` → `{draftId}` y heredando `expected.actionBlocked: true` coherente con la matriz RBAC.

## Desviaciones de la spec (justificadas)

1. **`target` y `fixture` añadidos a `required` del JSON schema de `format`** (§2.5 no los incluía): con constrained decoding los modelos omiten las propiedades no requeridas — sin `target` el 100% fallaba Zod; sin `fixture` se perdía el contexto base de placeholders. Validez 0% → 90% con este cambio (prompt iterado 1 vez: `promptVersion s8-v2`).
2. **Cliente nuevo `mutation/ollama-mutator.ts`** en vez de reutilizar `OllamaStructuredOutputClient`: el cliente existente usa `/api/generate` con `format: 'json'` plano; la mutación requiere `/api/chat` con system prompt y JSON schema. Mismo patrón (fallback de parseo, secuencial).
3. **Dedup de issues semántica/dry-run por (paso, placeholder)**: el mismo placeholder colgante aparecía en ambas capas, inflando el conteo del límite de reparación (≤4 errores).
