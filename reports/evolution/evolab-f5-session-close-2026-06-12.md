# EPIS2 Evolab — Cierre sesión F5 extendido

**Fecha cierre:** 2026-06-12  
**Run ID:** `f5-1781261389000`  
**Repo:** `epis2-evolab` · sandbox EPIS2 local

---

## Veredicto F5

| Criterio | Resultado |
|----------|-----------|
| Gate S9 (≥5 élites en nichos vacíos) | **NO** — 0/5 en cierre formal |
| Presupuesto 360 min | **46%** usado (~165 min) |
| Intentos watchdog | **8/8** agotados |
| Generaciones evolve (telemetría) | **56** (8 bloques × 7 gen) |
| Mejor bloque (telemetría) | intento 1 → **4** élites en nichos vacíos |
| Estado final | `completed_under_gate` |

**Gate no alcanzado.** La corrida produjo exploración MAP-Elites y reemplazos de élites, pero no consolidó ≥5 nichos previamente vacíos en un solo cierre de gate.

---

## Causa raíz operativa

Los **8 intentos** registraron `resource_abort` por **VRAM ≥92%** (Ollama + browser Playwright + evolve). El watchdog protegió correctamente, pero:

- Cortó evolve antes de acumular progreso en `run-state` (bug conocido: `stoppedForResources` no persiste `generationsCompleted`).
- Repitió bloques de 7 gen con overlap, consumiendo presupuesto sin cerrar gate.

**Recomendación próxima corrida:** `EPIS2_EVOLAB_BROWSER=0`, un solo modelo Ollama cargado, o umbral VRAM más alto / cooldown más largo.

---

## Evaluación post-corrida

### Judge (`evolab:review --judge`)

- **Fix aplicado:** `sanitizeJudgeParsed` descarta `suggestedPriority` del LLM (prioridad determinista post-parse).
- Re-ejecutado post-fix: **214 open** · signal **141** · noise **56** · duplicate **17** · sin judge **0**.
- Informe: `reports/evolution/evolab-findings-report-2026-06-12.md`

### Cola human_review (top 5)

| Run | Escenario | Hallazgos |
|-----|-----------|-----------|
| 6a207658… | admission-discharge-001-m8cx-008-m8rs-037 | 2 |
| c275fd3b… | role-nurse-approve-001-m8cx-024 | 1 |
| 6fe6f5ac… | admission-double-booking-001-m8cx-004-m8si-023 | 1 |
| 5bd1f22d… | admission-double-booking-001-m8cx-004-m8pp-022 | 2 |
| b2c4b3f1… | role-evolution-sign-001-m8rs-021 | 2 |

### Archive promote (`--dry-run`)

| Candidato | Acción |
|-----------|--------|
| admission-double-booking-001-m8cx-004 | omitido (ya en corpus) |
| discharge-critical-pending-001-m8pp-006 | omitido (ya en corpus) |
| **admission-discharge-001-m8cx-004** | **promotable** (score 11.97, niche physician\|inpatient\|journey) |

Promoción real pendiente de revisión humana: `npm run evolab:archive:promote` (sin `--dry-run`).

### Doctor

`evolab:doctor` **OK** — API, web, DB, Ollama.

---

## Artefactos

| Ruta | Contenido |
|------|-----------|
| `reports/evolution/f5-extended/run-state.json` | estado cerrado |
| `reports/evolution/f5-extended/incidents.jsonl` | 8 × resource_abort |
| `reports/evolution/f5-extended/resources.jsonl` | muestreos VRAM |
| `reports/evolution/evolve/evolve-2026-06-12T11-17*.json` … `13-43*.json` | telemetría por intento |

---

## Próximo paso (orden sugerido)

1. Revisar cola `human_review` — ver **`evolab-findings-report-2026-06-12.md`**
2. Promover 1 élite dry-run validada (`admission-discharge-001-m8cx-004`) tras OK humano.
3. ~~Fix judge `suggestedPriority`~~ ✓ (2026-06-12)
4. Relanzar F5 con **browser off** y presupuesto restante (~195 min) o corrida nueva 360 min.

---

*Los errores de EPIS no son recuerdos: son gates de EPIS2.*
