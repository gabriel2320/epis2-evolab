# EPIS2 Evolab — Inventario de modelos Ollama

**Fecha:** 2026-06-08  
**Host:** Windows · Ollama nativo · `http://127.0.0.1:11434`

---

## 1. Estado del servicio

| Métrica | Valor |
|---------|-------|
| Ollama UP | ✓ |
| Modelos cargados (`ollama ps`) | 0 (idle) |
| Endpoint tags | `GET /api/tags` ✓ |

---

## 2. Modelos detectados

| Modelo | Tamaño | Familia | Capacidades | Uso Evolab propuesto |
|--------|--------|---------|-------------|---------------------|
| **qwen3:8b** | 5.2 GB | qwen3 | completion, tools, thinking | **Modelo generativo principal** |
| qwen2.5-coder:14b | 9.0 GB | qwen2 | completion, tools | Reservado (no cargar simultáneo) |
| qwen2.5-coder:7b | 4.7 GB | qwen2 | completion, tools | Fallback dev (no Evolab MVP) |
| deepseek-coder-v2:16b | 8.9 GB | deepseek2 | completion | No usar en Evolab MVP |
| deepseek-coder:6.7b | 3.8 GB | llama | completion | No usar en Evolab MVP |
| llama3.2:latest | 2.0 GB | llama | completion, tools | Clasificación opcional (no seleccionado) |
| bge-m3:latest | 1.2 GB | bert | embedding | Embedding opcional futuro |
| nomic-embed-text:latest | 274 MB | nomic-bert | embedding | Embedding opcional futuro |

---

## 3. Selección para Evolab MVP

```env
EPIS2_EVOLAB_OLLAMA_URL=http://127.0.0.1:11434
EPIS2_EVOLAB_MODEL=qwen3:8b
EPIS2_EVOLAB_FAST_MODEL=          # vacío — no cargar segundo generativo
EPIS2_EVOLAB_EMBEDDING_MODEL=     # vacío — evaluadores deterministas primero
EPIS2_EVOLAB_LLM_CONCURRENCY=1
```

**Justificación:** RTX 5070 12 GB VRAM → un solo modelo generativo ~5 GB deja margen para Playwright + SO. `qwen3:8b` ya es el modelo clínico canónico de EPIS2.

---

## 4. Tareas asignadas por perfil de agente

| Perfil | Modelo | Tarea |
|--------|--------|-------|
| Simulated User | qwen3:8b | Interpretar objetivo → acción browser permitida |
| Evaluator (LLM) | qwen3:8b | Clasificar evidencia, severidad, hipótesis |
| Orchestrator | — | Determinista (sin LLM) |
| Repair Candidate | — | Desactivado MVP |

Todos los perfiles LLM comparten cola con concurrencia 1.

---

## 5. Configuración de gateway

| Parámetro | Valor |
|-----------|-------|
| Timeout inferencia | 120 s |
| Reintentos JSON | 1 reparación |
| Circuit breaker | 2 errores consecutivos → open 60 s |
| Validación salida | Zod estricto |
| Descarga modelos | **Prohibida** |

---

## 6. Latencias

*Sin mediciones aún — gateway creado en FASE 3.*  
Primera medición esperada tras `npm run evolab:models`.

---

## 7. Errores observados en auditoría

Ninguno. Servicio idle, tags accesibles.

---

## 8. Recomendaciones

1. Mantener **un** modelo generativo cargado durante runs Evolab.
2. No activar `EPIS2_EVOLAB_FAST_MODEL` hasta medir VRAM con Playwright activo.
3. Evaluadores deterministas (HTTP, DOM, audit, RBAC) **sin Ollama** para gates duros.
4. Usar `bge-m3` solo si se implementa deduplicación semántica de hallazgos (post-MVP).
5. Ejecutar `npm run evolab:models` antes de cada sesión de laboratorio.

---

## 9. Comandos de verificación

```bash
ollama list
ollama ps
npm run evolab:models    # post FASE 1
npm run ollama:probe     # referencia clínica existente
```
