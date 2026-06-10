# EPIS2 Evolab — Evolución de escenarios (programa v3)

**Versión:** 3.0  
**Fecha:** 2026-06-10  
**Repo:** [epis2-evolab](https://github.com/gabriel2320/epis2-evolab)  
**Target clínico:** [epis2](https://github.com/gabriel2320/epis2) (sandbox HTTP, sin acoplamiento de código)  
**Reemplaza:** v2.0 (2026-06-10) — sprints 0–6 completados; ver §1

---

## 1. Lo completado (v2.0 — Sprints 0–6)

El plan v2 atacó el cuello de botella correcto: el costo de autoría de escenarios. Estado al cierre:

| Sprint | Entregable | Estado |
|--------|------------|--------|
| 0 | ESLint + Prettier + CI + `npm run quality` | ✓ |
| 1–2 | Motor de pasos declarativo (`flow:` YAML v2) con paridad golden validada | ✓ |
| 3 | Catálogo tramo C en YAML puro (8 escenarios) + preflight endurecido + `--reset-fixtures` | ✓ |
| 4 | CI smoke (sibling checkout EPIS2 + Postgres efímero) + evidencia `minimal\|full` + orquestador por fases | ✓ |
| 5 | Evaluadores de profundidad clínica: `cdr_consistency`, `audit_completeness` | ✓ |
| 6 | Journey multi-paso `admission-discharge-001` con state carry; replan LLM diferido con disparador | ✓ |

Detalle técnico en [EVOLAB_ARCHITECTURE.md](./EVOLAB_ARCHITECTURE.md); gobernanza en [EVOLAB_NORMA_COMPLIANCE.md](./EVOLAB_NORMA_COMPLIANCE.md); límites en [EVOLAB_BOUNDARIES.md](./EVOLAB_BOUNDARIES.md).

**Resultado:** escenario nuevo = 1 archivo YAML; 9 escenarios + 1 journey; CI verde; hallazgo clínico real confirmado (`discharge-critical-pending-001`).

**Nuevo cuello de botella:** los escenarios los sigue escribiendo un humano. El corpus crece a velocidad humana y explora solo lo que al autor se le ocurre.

---

## 2. Tesis del programa v3 — Evolución de escenarios

> **El genoma es el YAML del escenario, no código.**

Estado del arte 2025–2026 aplicado con criterio:

| Referencia | Qué tomamos | Qué descartamos |
|------------|-------------|-----------------|
| AlphaEvolve / OpenEvolve / CodeEvolve | LLM como **operador de mutación** dentro de un loop evolutivo con evaluación automática | Evolucionar código arbitrario (riesgo alto, irrelevante aquí) |
| ShinkaEvolve | **Novelty rejection** con embeddings: descartar mutaciones casi idénticas antes de gastar cómputo | Infraestructura distribuida |
| Darwin Gödel Machine | **Archivo de variantes** + validación empírica + humano en el loop | Auto-modificación sin supervisión |
| Testing metamórfico clínico | Relaciones entre pares de ejecuciones como oráculo cuando no hay ground truth | — |

Por qué mutar YAML y no código:

1. **Riesgo casi nulo** — cada mutación pasa por Zod (`ScenarioDefinitionSchema`) + dry-run antes de tocar el sandbox; una mutación inválida se descarta o repara, jamás rompe nada.
2. **Espacio de búsqueda acotado y clínicamente significativo** — roles × módulos × payloads × encadenamientos.
3. **Invariantes EPIS2 intactas** — la IA **propone** escenarios; el humano **promueve** los élites a corpus; la IA **nunca aprueba** (`requiresHumanReview: true` en todo lo generado).

### Hardware objetivo (estación local)

RTX 5070 12 GB VRAM · 64 GB RAM · 16 hilos. Modelos Ollama disponibles: `qwen2.5-coder:14b`, `deepseek-coder-v2:16b`, `qwen2.5-coder:7b`, `qwen3:8b`, `llama3.2`, `bge-m3` (embeddings), `nomic-embed-text`.

**Patrón ensemble:** `qwen3:8b` para amplitud (generar K variantes baratas), `qwen2.5-coder:14b` para profundidad/reparación de inválidas (a futuro `qwen3-coder:30b-a3b` si entra en VRAM cuantizado). **Loop secuencial** — un modelo cargado en VRAM a la vez; el bandit (Sprint 11) decide cuál.

**Presupuesto realista:** 50–200 mutaciones por corrida nocturna de 2–3 h (mutación LLM ~10–30 s + dry-run ~1 s + run sandbox solo para candidatos prometedores).

---

## 3. Plan por sprints (7–12)

### Sprint 7 — Fitness y mapa de cobertura (sin LLM)

Antes de evolucionar hay que poder **medir**. Todo determinista.

| ID | Entregable | Criterio de aceptación |
|----|------------|------------------------|
| S7.1 | Catálogo de cobertura data-driven (`fitness/coverage-catalog.ts`): endpoints EPIS2 relevantes + eventos de auditoría conocidos | Catálogo extensible sin tocar lógica |
| S7.2 | Extracción de cobertura por run (`fitness/coverage-extract.ts`): endpoints (method + path canónico `:id`) y eventos tocados, desde observaciones del step-engine + audit trail | Tests con observaciones simuladas |
| S7.3 | Tabla `evolution.scenario_fitness` (migración 003): cobertura, hallazgos, duración, novedad; escritura integrada en fase PERSIST sin engordar el orquestador | Fila por run completado, best-effort |
| S7.4 | Índice de novedad (`fitness/novelty.ts`): texto canónico del YAML → embedding `bge-m3` vía Ollama → distancia coseno mínima vs corpus; cache en disco; degrada a null sin Ollama | Nunca rompe un run |
| S7.5 | CLI `evolab fitness report [--json]`: mapa de cobertura (cubierto/huecos por módulo), novedad por escenario, resumen de celdas vacías; sin sandbox ni DB obligatorios | — |
| S7.6 | Tests unitarios: extract, novelty (corpus vacío, duplicado ~0, distinto alto, Ollama caído → null), report | Verdes en `npm run quality` |

**Gate:** `evolab fitness report` muestra el mapa de calor del corpus actual. ✓ **Completado 2026-06-10.**

---

### Sprint 8 — Motor de mutación LLM

Operadores de mutación sobre YAML vía Ollama con salida JSON estructurada (reutiliza `OllamaStructuredOutputClient`).

| ID | Entregable | Criterio de aceptación |
|----|------------|------------------------|
| S8.1 | Pipeline mutación: prompt con escenario padre + few-shot → JSON → Zod → **dry-run obligatorio** (carga, placeholders, custom steps existentes) | Mutación inválida nunca llega al sandbox |
| S8.2 | Operadores: `cambiar_rol` (persona.role + expected RBAC), `perturbar_payload` (body de pasos api), `encadenar_paso` (paso extra del catálogo), `crossover` (combinar flows de dos escenarios) | 4 operadores con tests |
| S8.3 | Ensemble: `qwen3:8b` genera K variantes; las que fallan Zod/dry-run van a `qwen2.5-coder:14b` con el error como contexto de reparación (1 intento) | Tasa de válidas medida y persistida |
| S8.4 | Novelty rejection (ShinkaEvolve): embedding de la variante vs corpus + variantes de la sesión; distancia < umbral ⇒ descarte antes de ejecutar | Reusa `fitness/novelty.ts` |

**Gate:** 50 mutaciones generadas, **≥70%** pasan Zod + dry-run (tras reparación). ✓ **Completado 2026-06-10 — 92% validez final (90% directa) en corrida real de 50 sobre el corpus** (role_swap 13/13, payload_perturbation 12/13, step_injection 9/12, crossover 12/12; 700 s total; telemetría en `reports/evolution/evolab-sprint8-gate.md`). Nota: el ensemble final usa `qwen2.5-coder:7b` para amplitud (no `qwen3:8b`) según benchmark empírico de la spec.

---

### Sprint 9 — Loop evolutivo + archivo MAP-Elites

| ID | Entregable | Criterio de aceptación |
|----|------------|------------------------|
| S9.1 | `evolab evolve --generations N --budget-minutes M`: selección de padres → mutación → validación → run sandbox → fitness → archivo; corte duro por presupuesto | Corrida nocturna desatendida |
| S9.2 | Archivo MAP-Elites persistente en Postgres: nichos por **(rol × módulo clínico × tipo de resultado)**; un élite por nicho, élites del corpus humano protegidos (no se reemplazan, solo se comparan) | Tabla `evolution.scenario_archive` |
| S9.3 | Selección: prioriza padres de nichos frontera (vecinos vacíos) + fitness multiobjetivo (cobertura nueva, hallazgos, novedad, costo) | Sin colapso a un solo nicho |
| S9.4 | Variantes élite quedan como YAML en `scenarios/candidates/` + cola `human_review`; promoción a `scenarios/` es decisión humana (PR) | IA nunca escribe el corpus canónico |

**Gate:** una corrida nocturna (2–3 h) produce **≥5 candidatos élite en nichos vacíos** del mapa de Sprint 7.

---

### Sprint 10 — Relaciones metamórficas clínicas

Oráculos sin ground truth: relaciones declaradas en YAML entre **pares de ejecuciones**.

| ID | Entregable | Criterio de aceptación |
|----|------------|------------------------|
| S10.1 | Evaluador `metamorphic`: ejecuta par (A, B) y verifica la relación declarada (`metamorphic.relation` en YAML) | Esquema Zod + motor de pares |
| S10.2 | Relación **inversión**: admitir→alta debe devolver el censo al estado baseline (camas, ocupación) | Corre sobre journey existente |
| S10.3 | Relación **monotonicidad de permisos**: si rol R no puede X, un rol con menos permisos tampoco; éxito inesperado ⇒ finding RBAC high | Cubre matriz nurse/physician/admin |
| S10.4 | Relación **idempotencia de bloqueos**: repetir una acción bloqueada N veces no cambia el estado (sin drafts fantasma ni eventos `approved`) | Reusa `audit_completeness` |

**Gate:** **3 relaciones** metamórficas corriendo en CI smoke.

---

### Sprint 11 — Triage judge local + bandit de modelos

| ID | Entregable | Criterio de aceptación |
|----|------------|------------------------|
| S11.1 | Judge `qwen3:8b`: clasifica findings en `señal \| ruido \| duplicado` con razones, salida JSON estructurada; **siempre** `requiresHumanReview: true` — el judge ordena la cola, no decide | Clasificación persistida junto al finding |
| S11.2 | Set etiquetado: ≥30 findings históricos etiquetados a mano como golden | En repo, versionado |
| S11.3 | Bandit UCB sobre modelos locales por tarea (mutación amplitud / reparación / judge): recompensa = tasa de válidas o acierto vs golden, por modelo; persiste estadísticas y converge solo | `evolab models --bandit` muestra estado |

**Gate:** precisión del judge **≥80%** contra la muestra etiquetada.

---

### Sprint 12 — DGM-lite: auto-extensión supervisada

Cuando el mapa muestra nichos **inalcanzables** con los pasos/evaluadores actuales (p. ej. transfer, results-inbox), el sistema propone la extensión de sí mismo.

| ID | Entregable | Criterio de aceptación |
|----|------------|------------------------|
| S12.1 | Detector de nichos inalcanzables: celdas vacías del mapa cuyo endpoint/evento no es expresable con el catálogo de pasos actual | Reporte `fitness gaps --unreachable` |
| S12.2 | Generador de borradores (`qwen2.5-coder:14b`): código de nuevo custom step o evaluador **como borrador** con tests, en rama/carpeta `proposals/`, dry-run por defecto, jamás auto-merge | Humano revisa y mergea |
| S12.3 | Loop cerrado: propuesta mergeada ⇒ nicho alcanzable ⇒ el loop evolutivo del Sprint 9 lo puebla | Trazabilidad propuesta → nicho → élite |

**Gate:** primera propuesta de custom step/evaluador revisada y mergeada por humano.

---

## 4. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Tasa de mutaciones válidas baja (<70%) | Loop quema presupuesto en basura | Reparación con coder:14b (S8.3) + few-shot con élites del archivo + operadores más conservadores primero |
| Fitness hackeable (mutaciones que inflan cobertura sin valor clínico) | Archivo lleno de élites triviales | Novedad como componente del fitness + élites solo promovidos por humano (S9.4) + judge de triage (S11) |
| Presupuesto nocturno insuficiente (2–3 h) | Pocas generaciones | Novelty rejection pre-run (S8.4), dry-run barato como primer filtro, sandbox solo para candidatos, corte por `--budget-minutes` |
| Embeddings desactualizados vs corpus | Novedad engañosa | Cache por hash de texto canónico — cambio de YAML ⇒ recomputo automático |
| Deriva del judge local | Cola mal ordenada | Golden set versionado (S11.2) + el humano sigue viendo todo |
| VRAM 12 GB limita modelos | Sin ensemble paralelo | Loop secuencial asumido por diseño; bandit elige el mejor modelo por tarea, no más modelos |

## 5. Guardrails (no negociables)

- **Sandbox only**: las mutaciones corren contra `local-sandbox`/`ci-sandbox` con `syntheticOnly: true`; guards existentes aplican sin excepción.
- **Sin PHI**: el corpus, las mutaciones y los embeddings solo contienen datos sintéticos demo.
- **IA nunca aprueba**: todo escenario generado nace con `requiresHumanReview: true`; la promoción al corpus canónico y el merge de propuestas DGM-lite son acciones humanas (PR).
- **EPIS2 no conoce Evolab**: la frontera HTTP/Playwright de v2 no cambia (`boundary-validate` en CI).

## 6. Métricas north-star del programa

| Métrica | Hoy (post S7) | Post S9 | Post S12 |
|---------|----------------|---------|----------|
| Escenarios en corpus | 9 (humanos) | 9 + ≥5 élites promovidos | Crecimiento continuo supervisado |
| Celdas del mapa cubiertas | parcial (ver `fitness report`) | +nichos frontera | nichos antes inalcanzables |
| Costo de explorar un nicho nuevo | 1 sesión humana | 1 corrida nocturna | 1 corrida + 1 review |
| Oráculos disponibles | evaluadores deterministas | + fitness multiobjetivo | + 3 relaciones metamórficas |

## 7. Referencias

- [EVOLAB_ARCHITECTURE.md](./EVOLAB_ARCHITECTURE.md)
- [EVOLAB_NORMA_COMPLIANCE.md](./EVOLAB_NORMA_COMPLIANCE.md)
- [EVOLAB_BOUNDARIES.md](./EVOLAB_BOUNDARIES.md)
- Estado del arte: AlphaEvolve (DeepMind 2025), OpenEvolve/CodeEvolve (open source), ShinkaEvolve (Sakana AI), Darwin Gödel Machine (2025), metamorphic testing en sistemas clínicos

## 8. Próximo paso inmediato

**Sprint 8:** motor de mutación LLM. Primer operador: `cambiar_rol` (el más barato de validar — el dry-run y el evaluador RBAC existen). Medir tasa de válidas desde el día 1 contra el gate de ≥70%.
