# EPIS2 Evolab — Sprint 8: Motor de mutación LLM (spec técnica + benchmark)

**Fecha:** 2026-06-10
**Host:** Windows · Ollama nativo · `http://localhost:11434` · RTX 5070 12 GB VRAM · 64 GB RAM
**Alcance:** especificación del motor de mutación de escenarios YAML (operadores LLM con salida estructurada, validación Zod, dry-run y reparación). Benchmark empírico previo a implementación.
**Datos crudos:** [`evolab-sprint8-benchmark-raw.json`](evolab-sprint8-benchmark-raw.json)

---

## 1. Benchmark empírico de modelos como operadores de mutación

### 1.1 Metodología

- **Escenarios base (corpus real, solo lectura):** `draft-lifecycle-cancelled-001.yaml`, `role-nurse-approve-001.yaml`, `admission-discharge-001.yaml`.
- **Tareas:** A = `role_swap` (physician→nurse), B = `payload_perturbation` (quitar `patientId` del `POST /api/drafts` + limpiar dependencias), C = `step_injection` (insertar `GET /api/drafts/{draftId}` tras el approve del journey).
- **Configuración:** `/api/chat` con `format` = JSON schema simplificado del escenario, `temperature 0.7`, `num_ctx 8192`, `think: false` (qwen3), 3 repeticiones por modelo × tarea con seeds distintos, ejecución secuencial (un modelo en VRAM a la vez).
- **Métricas:** (a) JSON parseable, (b) estructura válida — réplica de las reglas clave de `ScenarioDefinitionSchema` + `DeclarativeStepSchema`: campos requeridos, una sola clave por paso de flow, métodos HTTP del enum, **placeholders `{x}` definidos antes de su uso** (contexto base + `capture` previos), (c) coherencia semántica programática (rol cambiado, body perturbado, paso añadido, `expected.actionBlocked` coherente), (d) latencia y tokens/s.

### 1.2 Resultados (n=3 por celda)

| Modelo | Tarea | JSON ✓ | Estructura ✓ | Semántica ✓ | Latencia media | tok/s |
|---|---|---|---|---|---|---|
| qwen2.5-coder:7b | A role_swap | 100% | **100%** | 100% | 6 s | 113 |
| qwen2.5-coder:7b | B payload | 100% | **0%** | 100% | 4 s | 113 |
| qwen2.5-coder:7b | C step_inj | 100% | **100%** | 100% | 11 s | 111 |
| qwen3:8b | A role_swap | 100% | 100% | 100% | 8 s | 103 |
| qwen3:8b | B payload | 100% | 0% | 100% | 5 s | 103 |
| qwen3:8b | C step_inj | 100% | 100% | 100% | 12 s | 101 |
| **qwen2.5-coder:14b** | A role_swap | 100% | **100%** | 100% | 13 s | 60 |
| **qwen2.5-coder:14b** | B payload | 100% | **100%** | 100% | 6 s | 60 |
| **qwen2.5-coder:14b** | C step_inj | 100% | **100%** | 100% | 21 s | 59 |
| deepseek-coder-v2:16b | A role_swap | 100% | 100% | 100% | 12 s | 102 |
| deepseek-coder-v2:16b | B payload | 100% | 0% | 100% | 6 s | 103 |
| deepseek-coder-v2:16b | C step_inj | 100% | 100% | 100% | 17 s | 88 |

**Test de reparación** (variante inválida tipo B + lista de errores de validación → modelo reparador, `temperature 0.2`, 3 reps):

| Reparador | Tasa de reparación | Latencia media | Observación |
|---|---|---|---|
| **qwen2.5-coder:14b** | **3/3 (100%)** | 12 s | Elimina el paso dependiente y reapunta `actionObservation` al paso perturbado |
| deepseek-coder-v2:16b | 0/3 (0%) | 6 s | Devuelve el escenario casi sin cambios; no razona la dependencia |

### 1.3 Hallazgos clave

1. **`format` (JSON schema) de Ollama funciona en los 4 modelos: 100% de JSON parseable en 36/36 corridas.** El cuello de botella no es el formato sino el razonamiento de dependencias.
2. **Modo de fallo dominante y consistente (tarea B):** al quitar el `capture: {draftId: draft.id}` del paso perturbado, 3 de 4 modelos dejan el paso posterior `POST /api/drafts/{draftId}/approve` con el placeholder `{draftId}` colgante (9/9 corridas fallidas con el mismo error: `flow[2] placeholder {draftId} no definido antes de su uso`). Solo qwen2.5-coder:14b limpia la cadena de dependencias completa.
3. Las mutaciones locales (cambiar rol, insertar paso con placeholders ya capturados) son triviales para todos los modelos; las mutaciones que **rompen la cadena de captures** requieren el modelo de 14B o reparación.
4. qwen2.5-coder:7b es ~2× más rápido que el 14b (113 vs 60 tok/s) con calidad idéntica en A y C → ideal para amplitud.
5. deepseek-coder-v2:16b no aporta nada sobre qwen2.5-coder:14b (misma debilidad en B, falla como reparador) y confirma la nota del inventario de modelos («no usar en Evolab»).
6. qwen3:8b con `think: false` se comporta igual que el 7b-coder pero más lento; no se justifica como operador de mutación (mantenerlo como modelo del Simulated User).

### 1.4 Recomendación de ensemble

| Rol | Modelo | Justificación |
|---|---|---|
| **Amplitud** (genera K variantes) | `qwen2.5-coder:7b` | 113 tok/s, 100% JSON, 100% estructura en mutaciones locales; ~6-11 s por variante |
| **Profundidad / reparador** | `qwen2.5-coder:14b` | Único modelo que razona la cadena de captures (100% en B y 100% de reparaciones) |
| Descartados | qwen3:8b, deepseek-coder-v2:16b, llama3.2 | Sin ventaja medible sobre los elegidos |

Ambos caben (no simultáneamente) en 12 GB de VRAM; el patrón es **lote de amplitud con 7b → swap → lote de reparación con 14b** para minimizar recargas de modelo (~5-10 s por swap).

---

## 2. Contratos de los operadores de mutación

Convenciones comunes a todos los operadores:

- **Transporte:** `POST /api/chat` de Ollama con `stream: false`, `format: <JSON schema simplificado>` (§2.5), `keep_alive: '3m'`, `options: { num_ctx: 8192, num_predict: 4096 }`. Reutilizar `src/ollama/structured-client.ts` e `inference-queue.ts` (concurrencia 1).
- **Temperatura:** 0.7 en amplitud (diversidad), 0.2 en reparación (determinismo).
- **Seed:** derivado de `randomSeed` del run + índice de variante → reproducibilidad.
- **Salida:** siempre el escenario mutado **completo** en JSON (el benchmark muestra que los modelos lo manejan bien; no se necesita formato diff/patch).
- **Trazabilidad:** toda variante registra `parentScenarioId(s)`, `operator`, `model`, `seed`, `promptVersion`.

### 2.1 `role_swap`

| Aspecto | Contrato |
|---|---|
| Input | Escenario padre (JSON) + rol destino (de un catálogo: `physician`, `nurse`, `admin`) + matriz de permisos por rol |
| Prompt | System: reglas de formato (§2.5) + matriz RBAC («solo physician puede aprobar borradores clínicos», etc.). User: instrucción de cambiar `persona.role` a X ajustando id (sufijo nuevo), name, labels de login y **`expected.actionBlocked` según la matriz de permisos** |
| Few-shot | No necesario (100% sin few-shot en benchmark) |
| Validación extra | `persona.role === rolDestino`; `expected.actionBlocked` coincide con la matriz de permisos para `goal.action`; id distinto del padre |
| Reparación | Si falla → 1 reintento con 14b; si vuelve a fallar → descartar variante |

### 2.2 `payload_perturbation`

| Aspecto | Contrato |
|---|---|
| Input | Escenario padre + paso api objetivo (label) + tipo de perturbación (`campo_faltante`, `valor_invalido`, `id_inexistente`) + campo objetivo |
| Prompt | Además de las reglas comunes, **instrucción explícita de limpieza de dependencias**: «si eliminas o invalidas el capture de un paso, ELIMINA los pasos posteriores que usen ese placeholder y reapunta `actionObservation` al paso perturbado». El benchmark muestra que sin el modelo 14b esta instrucción no basta — por eso este operador usa **directamente qwen2.5-coder:14b** o asume reparación casi segura |
| Few-shot | 1 ejemplo (variante inválida → corregida) recomendado si se quiere intentar primero con 7b; con 14b directo no es necesario |
| Validación extra | Algún `body` difiere del padre; `expected.actionBlocked === true`; `actionObservation` apunta a un label api existente; ningún placeholder colgante |
| Reparación | Es el operador con mayor tasa de invalidez con el modelo rápido (0% válido con 7b). Política: **generar con 14b de entrada** (6 s/variante, asumible) o, si se genera con 7b por lote, enviar el 100% esperado de inválidas al reparador |

### 2.3 `step_injection`

| Aspecto | Contrato |
|---|---|
| Input | Escenario padre + punto de inserción (después de label X) + intención del paso (ej. «verificar recurso recién creado/aprobado») + lista de placeholders disponibles en ese punto (calculada determinísticamente recorriendo los `capture` previos) |
| Prompt | Reglas comunes + «solo usa placeholders de esta lista: [...]» (la lista la calcula el motor, no el LLM) + «añade la entrada correspondiente en `steps`» |
| Few-shot | No necesario |
| Validación extra | `flow.length === padre + 1`; el paso nuevo es del tipo pedido; placeholders del paso nuevo ⊆ contexto disponible en el punto de inserción; pasos previos y posteriores idénticos al padre (diff estructural) |
| Reparación | 1 reintento con 14b adjuntando errores; si falla → descartar |

### 2.4 `crossover`

No fue benchmarkeado (requiere dos padres); el diseño minimiza el riesgo apoyándose en lo medido:

| Aspecto | Contrato |
|---|---|
| Input | Dos escenarios padres **compatibles** (mismo `fixture.type` o capacidades solapadas — filtro determinista previo) + punto de corte sugerido |
| Prompt | Reglas comunes + «combina el prefijo de flow de A (hasta label X) con el sufijo de B (desde label Y), renombrando labels duplicados y garantizando que todo placeholder del sufijo esté capturado en el prefijo o sea del contexto base» |
| Modelo | **qwen2.5-coder:14b directo** — es estructuralmente análogo a la tarea B (razonamiento de cadena de captures), donde los modelos pequeños fallan al 100% |
| Validación extra | Todo placeholder resuelto; labels únicos; `expected` y `evaluators` provienen del padre cuyo paso final quedó como `actionObservation`; `target.capabilities` = unión de ambos padres |
| Reparación | 1 reintento con 14b; tasa de descarte esperada mayor que el resto — aceptable, el dedup/sandbox filtra después |

### 2.5 JSON schema de salida (compartido)

El schema pasado en `format` es deliberadamente laxo en `flow` (objetos genéricos) porque la gramática de llama.cpp no maneja bien uniones discriminadas profundas; la validación estricta ocurre después con Zod:

```json
{
  "type": "object",
  "required": ["id", "version", "name", "risk", "persona", "goal", "steps", "flow", "expected", "evaluators"],
  "properties": {
    "id": { "type": "string" },
    "version": { "type": "integer" },
    "name": { "type": "string" },
    "description": { "type": "string" },
    "risk": { "type": "string", "enum": ["low", "medium", "high"] },
    "target": { "type": "object" },
    "persona": { "type": "object", "required": ["role"], "properties": { "role": { "type": "string" } } },
    "fixture": { "type": "object" },
    "goal": { "type": "object", "required": ["action"] },
    "steps": { "type": "array", "items": { "type": "string" } },
    "flow": { "type": "array", "items": { "type": "object" } },
    "expected": { "type": "object" },
    "evaluators": { "type": "array", "items": { "type": "string" } },
    "actionObservation": { "type": "string" },
    "timeoutMs": { "type": "integer" },
    "maxAttempts": { "type": "integer" },
    "tags": { "type": "array", "items": { "type": "string" } }
  }
}
```

### 2.6 Validación post-generación (tres capas)

1. **Zod real:** `ScenarioDefinitionSchema.safeParse` + `DeclarativeStepSchema` por paso (`src/contracts/schemas.ts`, `src/step-engine/schema.ts`). No replicar reglas: importar.
2. **Chequeos semánticos del motor (no cubiertos por Zod):**
   - Resolución de placeholders: recorrer `flow` acumulando contexto (`patientId`, `encounterId`, `today` + `capture` previos + captures de pasos `custom` conocidos del catálogo) y verificar cada `{x}`.
   - `actionObservation` apunta a un label existente en `flow`.
   - Invariante por operador (§2.1–2.4): el cambio pedido se aplicó y nada más cambió (diff estructural contra el padre).
   - **Gate de seguridad Evolab:** la variante hereda `syntheticOnly`; paths fuera del allowlist de `src/security/target-allowlist.ts` → descarte inmediato sin reparación.
3. **Dry-run:** ejecutar el step-engine en modo «resolver sin llamar» (resolver placeholders contra un fixture sintético en memoria, sin HTTP). Detecta captures imposibles y rutas malformadas antes de gastar un run de sandbox.

### 2.7 Política de reparación

```text
variante inválida
  └─ errores SOLO de capas 2-3 (semántica/dry-run) y ≤ 4 errores
       └─ sí → 1 intento con qwen2.5-coder:14b (temperature 0.2,
               prompt de reparación con la lista de errores literal)
               └─ válida → continúa  |  inválida → descartar (sin 2.º reintento)
       └─ no (falla Zod básico, >4 errores, o viola allowlist) → descartar
```

- **Máximo 1 reintento de reparación por variante.** El benchmark muestra que el 14b repara al primer intento (3/3) cuando recibe los errores explícitos; si no lo logra, la variante no vale el costo.
- El prompt de reparación exige «cambiar lo MÍNIMO necesario» e incluye la regla de eliminación de pasos dependientes (validada empíricamente).
- Las variantes descartadas se registran con sus errores → telemetría para ajustar prompts (`promptVersion`).

---

## 3. Pipeline del motor de mutación

```text
padres del corpus (scenarios/*.yaml)
   │
   ▼
[1] GENERACIÓN (amplitud) — qwen2.5-coder:7b, temperature 0.7
    K variantes por operador (K=5 sugerido); payload_perturbation y
    crossover van directo al 14b (modo profundidad)
   │
   ▼
[2] VALIDACIÓN — Zod real + semántica + allowlist + dry-run (§2.6)
   │        └─ inválidas reparables ──► [3]
   ▼
[3] REPARACIÓN (profundidad) — qwen2.5-coder:14b, temperature 0.2,
    1 intento máx., errores literales en el prompt (§2.7)
   │        └─ irreparables ──► descarte con telemetría
   ▼
[4] DEDUP — exacto por hash estructural (flow normalizado sin labels);
    la novedad semántica por embeddings bge-m3 la aporta el Sprint 7
    (interfaz: noveltyScore(variante, corpus) → [0,1])
   │
   ▼
[5] CANDIDATO LISTO — persistido con linaje (padres, operador, modelo,
    seed, promptVersion) → cola de evaluación en sandbox (orquestador
    existente); requiresHumanReview se hereda/endurece, nunca se relaja
```

Notas operativas:

- **Orden de lotes por VRAM:** todas las generaciones 7b del ciclo → swap → todas las tareas 14b (perturbation, crossover, reparaciones). Un solo swap por ciclo (~5-10 s).
- **Presupuesto por ciclo (medido):** con K=5 y 4 operadores ≈ 20 variantes ≈ 4-7 min de GPU. Compatible con ciclos nocturnos largos.
- IA no aprueba ni firma: toda variante que llegue a finding/test candidate sigue el flujo de `human_review` existente (invariantes EPIS2).

---

## 4. Riesgos detectados y mitigaciones

| # | Riesgo (evidencia del benchmark) | Mitigación |
|---|---|---|
| R1 | **Placeholders colgantes al romper cadenas de captures** — 9/9 fallos de los modelos <14B en tarea B, todos el mismo error | Validador de resolución de placeholders en capa 2 (ya prototipado); `payload_perturbation` y `crossover` directo al 14b; regla de limpieza explícita en prompts |
| R2 | Reparador débil: deepseek-coder-v2:16b falló 0/3 como reparador pese a su tamaño | Fijar reparador a qwen2.5-coder:14b por config (`model-registry`); no asumir que tamaño ⇒ capacidad de reparación |
| R3 | Swap de modelos en 12 GB VRAM (7b y 14b no caben juntos) | Lotes por modelo (§3); `keep_alive` corto; cola de inferencia con concurrencia 1 ya existente |
| R4 | Mutaciones triviales repetidas (los modelos convergen a la misma variante con seeds distintos: ids `…-mutated`, `…-002` casi idénticos) | Dedup estructural en capa 4 + novelty score de Sprint 7; variar campo objetivo/tipo de perturbación en el input del operador, no solo el seed |
| R5 | `expected` incoherente con la mutación (riesgo latente; el benchmark lo controló vía instrucción explícita) | Matriz RBAC y reglas de negocio en el system prompt; chequeo semántico de `actionBlocked` contra matriz de permisos en capa 2 |
| R6 | Deriva de prompts al evolucionar esquemas | `promptVersion` registrado por variante; smoke de 3 tareas (este benchmark, script reutilizable) como gate de regresión al cambiar prompt o modelo |

---

## 5. Veredicto sobre viabilidad

**La tasa de validez está muy por encima del umbral del 40%:** 100% de JSON parseable global; estructura válida 100% en role_swap y step_injection con todos los modelos, y 100% en payload_perturbation con qwen2.5-coder:14b. **No se necesitan** las alternativas contempladas (prompts por-campo, mutación por diff/patch JSON, ni descargar qwen3-coder:30b-a3b). El enfoque «escenario completo + `format` JSON schema + validación en capas + reparación 14b» es viable tal cual.

**Próximo paso exacto:** implementar en Sprint 8 los operadores §2.1 y §2.3 con el 7b (camino feliz medido), el validador de capas 2-3, y el operador §2.2 con 14b; dejar `crossover` para la segunda mitad del sprint cuando el dedup de Sprint 7 esté integrable.
