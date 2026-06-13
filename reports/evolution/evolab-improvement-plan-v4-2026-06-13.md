# EPIS2 Evolab — Plan de mejora v4 (post-F5)

**Fecha:** 2026-06-13  
**Contexto:** evaluación sesión F5 `f5-1781261389000` · VRAM saturada · gate S9 no cerrado · 197 open útiles como radar clínico  
**Hardware objetivo:** RTX 5070 12 GB · 64 GB RAM · Ollama nativo  
**Canon EPIS2:** Home = Centro de Comando · árbol reconciliado `epis2NavigationTree.ts` · IA no aprueba

---

## 1. Tesis de mejora

> **Evolab debe evolucionar el producto EPIS2 de forma orgánica, barata en GPU y alineada al árbol de procesos — no quemar VRAM repitiendo mutantes que amplifican el mismo fingerprint.**

| Objetivo | Métrica north-star |
|----------|-------------------|
| No saturar VRAM | ≥90% corridas evolve sin `resource_abort` |
| Programación evolutiva útil | ≥5 élites/nichos vacíos por corrida **o** 3 fingerprints P0 confirmados en EPIS2 |
| Desarrollo orgánico EPIS2 | 1 promote humano/semana + trazabilidad nicho → fix → re-run |
| Estética | Cobertura MAP-Elites paper/classic ≥60% celdas con élite candidata |
| Funcional | Huecos `fitness report` reducidos 20%/trimestre |
| Árbol de procesos | Nichos derivados de workspaces N0–N4, no solo strings libres |
| Eficiencia | Coste sandbox ↓50% (API-first, fingerprint dedup, modelo único) |

---

## 2. Diagnóstico (lecciones F5)

| Síntoma | Causa | Consecuencia |
|---------|-------|--------------|
| 8× `resource_abort` | Playwright + 2 modelos Ollama + qwen en GPU | Presupuesto quemado sin gate |
| 141 signal / 15 FP | Mutantes MAP-Elites sobre mismo journey roto | Cola humana inflada |
| Gate 0/5 formal, 4 en telemetría | Contador + abort race | Métricas no confiables |
| Visual smoke OK, F5 visual NO | Browser en corrida larga | Modo visual mal ubicado en pipeline |
| Utilidad real | Radar discharge+critical | **F5 útil como fuzzing, no como evolve desatendido** |

---

## 3. Pilares del plan

```text
┌─────────────────────────────────────────────────────────────────┐
│  P1 VRAM Governor    P2 Evolución eficiente    P3 Árbol procesos │
│  (orquestación GPU)  (MAP-Elites + dedup)      (workspaces EPIS2)│
├─────────────────────────────────────────────────────────────────┤
│  P4 Orgánico EPIS2   P5 Estética (visual)      P6 Funcional      │
│  (fix loop cerrado)  (paper/classic niches)    (journeys+MR)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                    P7 Eficiencia transversal
                    (API-first, bandit, batches)
```

---

## 4. Tramo A — VRAM Governor (Sprint 13)

**Objetivo:** una sola política de recursos para mutate, evolve, judge y F5.

| ID | Entregable | Criterio |
|----|------------|----------|
| **S13.1** | `GpuOrchestrator` central (`evolution/gpu-orchestrator.ts`): cola exclusiva — **max 1 modelo Ollama cargado**; `ollama stop` / unload antes de swap | Test: dos tareas secuenciales no superan VRAM pico histórico F5 |
| **S13.2** | Perfiles de corrida (`api-only` \| `hybrid` \| `visual-smoke`): F5/evolve default **`api-only`**; visual solo en smoke dedicado ≤15 min | `EPIS2_EVOLAB_RUN_PROFILE=api-only` documentado |
| **S13.3** | Umbral VRAM **adaptivo**: warn 85% → pausa mutate; critical 92% → **no lanzar** browser; hysteresis 5 min | Reducir falsos abort post-evolve completo |
| **S13.4** | Integrar orchestrator en `mutation/pipeline.ts`, `evolve` loop y `f5-resource-sampler` | Un solo módulo, no tres políticas |
| **S13.5** | CLI `evolab gpu status` + panel en consola `#/f5` | Modelo cargado, VRAM, cola |

**Gate A:** corrida evolve 60 min, browser off, **0 aborts**, ≥3 gen completadas.

---

## 5. Tramo B — Evolución eficiente y útil (Sprint 14)

**Objetivo:** F5 deja de ser “6 h ciegas”; pasa a **ciclos cortos con gate intermedio**.

| ID | Entregable | Criterio |
|----|------------|----------|
| **S14.1** | **Fingerprint ledger** en DB: agregar por `fingerprint` + `judge_verdict`; evolve no re-ejecuta mutante si FP signal ya open | ↓70% runs sandbox redundantes |
| **S14.2** | Modo `evolab evolve --focus-niches <keys>`: solo nichos frontera vacíos del mapa | Corrida 45 min targeted |
| **S14.3** | **Checkpoint gate** cada 45 min: si `newElitesInEmpty < 2` → parar y emitir informe (no quemar 6 h) | F5 extendido → F5 checkpointed |
| **S14.4** | Contador evolve: persistir `generationsCompleted` aunque hubo abort tardío (fix race) | run-state = telemetría |
| **S14.5** | Métrica fitness **accionabilidad**: penalizar mutante cuyo FP ya tiene ≥3 signal | MAP-Elites premia novedad clínica real |
| **S14.6** | `evolab evolve --dry-run` enriquecido: estima VRAM y tiempo antes de lanzar | Pre-vuelo obligatorio en runbook |

**Gate B:** corrida 90 min → ≥3 élites nichos vacíos **o** informe “stop early” con hipótesis EPIS2.

---

## 6. Tramo C — Integración árbol de procesos EPIS2 (Sprint 15)

**Objetivo:** MAP-Elites y cobertura alineados al **árbol reconciliado**, no dimensiones ad hoc.

**Fuente SoT EPIS2:** `apps/web/src/navigation/epis2NavigationTree.ts` · workspaces N0–N4 · command registry.

| ID | Entregable | Criterio |
|----|------------|----------|
| **S15.1** | Catálogo `PROCESS_TREE_NODES` importado/derivado (JSON snapshot en evolab, regenerable desde EPIS2): workspace × superficie × ruta | Sin acoplar repos en runtime — snapshot versionado |
| **S15.2** | Extender nichos MAP-Elites: `(rol × workspace × outcome)` paralelo a `(rol × module × outcome)`; visual = subnicho de workspace `ambulatory` | Mapa dual durante transición |
| **S15.3** | `fitness report --gaps`: cruce huecos cobertura ↔ nodos árbol no visitados | Lista priorizada para mutate |
| **S15.4** | Escenarios YAML: campo opcional `processNodeId` / `workspaceId` (Zod) | Trazabilidad mutante → nodo IDC |
| **S15.5** | Evaluador `navigation_reachable`: flow declara `browser.open` → nodo existe en árbol y breadcrumb coherente | Estética + IA arquitectura |
| **S15.6** | Journey seeds atados a **command intents** (`command-registry/definitions.ts` snapshot) | Evolución de comandos LLM alineada al comando clínico |

**Gate C:** mapa de calor por **workspace** (no solo module); ≥1 mutante élite anotado con `processNodeId` promotable.

---

## 7. Tramo D — Desarrollo orgánico EPIS2 (Sprint 16)

**Objetivo:** cerrar el loop Evolab → fix EPIS2 → re-validación → promote.

| ID | Entregable | Criterio |
|----|------------|----------|
| **S16.1** | **Hipótesis registry** (`reports/evolution/hypotheses.jsonl`): FP ancla → owner → estado (open/fixed/wontfix) | Triage F1 formalizado |
| **S16.2** | Script `evolab replay-fingerprint <fp>`: un comando reproduce cluster | Sustituye revisar 7 UUIDs |
| **S16.3** | Gate pre-evolve: smoke escenarios **base** (no mutantes) verde en EPIS2 | No evolve sobre sandbox roto |
| **S16.4** | Integración EPIS2: etiqueta PR `evolab-fp-<hash>` + checklist golden journey si toca discharge/critical | Trazabilidad cross-repo |
| **S16.5** | `archive:promote` exige hipótesis linked o human signoff explícito | Promoción ≠ automática |

**Gate D:** 1 fingerprint P0 (discharge+critical) ciclo completo en ≤2 sesiones humanas.

---

## 8. Tramo E — Mejoras estéticas (visual / modos MD3)

**Objetivo:** evolución de **shell visual** sin Playwright en loop caliente.

| ID | Entregable | Criterio |
|----|------------|----------|
| **E1** | Perfil `visual-smoke`: 2 escenarios paper/classic, **≤10 min**, post-evolve API-only | Separado de F5 |
| **E2** | Evaluador `visual_shell` ampliado: tokens MD3 (density, section tree I–XIV visible) vía snapshot DOM mínimo | Alineado `EPIS2_PAPER_CHART_SECTION_TREE.md` |
| **E3** | Mutación operator `perturbar_modo_visual`: solo `chartMode`, `section`, preferencias apariencia | Nichos paper/classic poblados sin browser en evolve |
| **E4** | MAP-Elites: fitness estético = % secciones chart + switch visible + contraste mínimo (screenshot diff opcional, off by default) | Elite visual = candidato UX |
| **E5** | Consola Evolab: vista “modos” (paper/classic/command) con celdas vacías | Operador ve huecos estéticos |

**Gate E:** ≥10 celdas paper/classic con candidato; smoke visual semanal en CI (continue-on-error → verde).

---

## 9. Tramo F — Mejoras funcionales

| ID | Entregable | Criterio |
|----|------------|----------|
| **F1** | Evaluadores alineados a postmortem EPIS: `critical_pending` unificado discharge/MAR/census | Un FP por regla clínica |
| **F2** | Metamórficos MR-04…06: transfer UCI, results inbox, command resolve (huecos fitness) | 6 relaciones CI |
| **F3** | Fixture policy: `resetFixtures` automático en mutantes con `criticalResultPendingAcknowledgement` | ↓ falsos positivos Tema A |
| **F4** | Judge golden live Ollama ≥80% (cerrar F2 dev plan S11) | Cola ordenada confiable |
| **F5** | Batch `review:close-noise` (muestreo + rejected) tras judge | open < 100 sostenido |

---

## 10. Eficiencia transversal (P7)

| Táctica | Ahorro estimado | Implementación |
|---------|-----------------|----------------|
| API-first default | 40–60% tiempo/run | Browser off evolve |
| Modelo único + bandit | 30% VRAM | S13.1 + S11.3 |
| Fingerprint dedup pre-run | 50% sandbox | S14.1 |
| Novelty rejection más estricto | 20% mutaciones | Subir umbral en mutantes redundantes |
| Embeddings batch nocturnos | Latencia ↓ | Precomputar corpus 1×/día |
| Checkpoint 45 min | Evita 6 h inútiles | S14.3 |
| Promote 1 élite >> 100 mutantes | Valor humano ↑ | S16.5 |

**Presupuesto realista post-mejoras:** corrida útil **90–120 min** (no 360) · 15–25 gen · pop 4–6.

---

## 11. Roadmap integrado (12 semanas)

| Semana | Tramo | Entregable clave |
|--------|-------|------------------|
| 1–2 | A | GpuOrchestrator + perfil api-only |
| 3–4 | B | Fingerprint ledger + checkpoint F5 |
| 5–6 | C | PROCESS_TREE snapshot + nichos workspace |
| 7–8 | D | replay-fingerprint + hipótesis registry |
| 9–10 | E | visual-smoke pipeline + mutación modo visual |
| 11–12 | F | MR-04…06 + judge live gate |

**Paralelo continuo:** triaje FP P0 EPIS2 (discharge+critical) — desbloquea todo lo demás.

---

## 12. Redefinición de F5

| Antes | Después |
|-------|---------|
| 360 min desatendido | **F5-C:** 120 min max, checkpoint 45 min |
| Browser on en evolve | Browser solo en **visual-smoke** |
| Gate único al final | Gate intermedio + stop early |
| Éxito = 5 élites | Éxito = élites **o** 3 hipótesis EPIS2 confirmadas |
| 8 reintentos VRAM | 0 aborts (orchestrator) |

Comando objetivo:

```bash
npm run evolab:evolve -- --profile api-only --generations 24 --budget-minutes 120 --checkpoint-minutes 45
```

---

## 13. Guardrails (sin cambio)

- IA no aprueba ni promueve sin humano
- Sandbox synthetic only
- EPIS2 no importa Evolab
- Home ≠ dashboard
- Un registry navigation (no segundo árbol)

---

## 14. Próximos 3 pasos (esta semana)

1. **Implementar S13.1–S13.2** (GpuOrchestrator + `EPIS2_EVOLAB_RUN_PROFILE`) — máximo impacto VRAM.
2. **Implementar S14.1** (fingerprint ledger pre-run) — máximo impacto utilidad/colaboración humana.
3. **Snapshot árbol** (S15.1 draft) — export script desde EPIS2 `epis2NavigationTree.ts` → `evolab/fixtures/process-tree-snapshot.json`.

---

## 15. Referencias

- Roadmap v3: `docs/evolution/EVOLAB_ROADMAP.md` (S7–S12)
- Post-F5: `reports/evolution/evolab-f5-session-close-2026-06-12.md`
- Hallazgos: `reports/evolution/evolab-findings-plan-2026-06-12.md`
- Árbol EPIS2: `docs/architecture/EPIS2_RECONCILED_NAVIGATION_TREE.md`
- Limitaciones: `reports/evolution/evolab-known-limitations.md`

---

*Evolab evoluciona escenarios; EPIS2 evoluciona con evidencia. La GPU es un recurso finito — tratarla como tal es parte del diseño.*
