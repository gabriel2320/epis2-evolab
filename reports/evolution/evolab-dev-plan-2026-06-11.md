# EPIS2 Evolab — Plan de desarrollo (post-auditoría)

**Fecha:** 2026-06-11  
**Alcance:** repo `epis2-evolab` únicamente · EPIS2 como sandbox externo  
**Excluido hasta el final:** corrida nocturna MAP-Elites (`evolve --generations 15 --budget-minutes 150`)  
**Estado base:** S7–S11 implementados en working tree · **527/527 tests** · WIP sin commit en `master`

---

## Objetivo

Cerrar el gap entre **código verde local** y **operación confiable**: commit, CI, gates reales (judge Ollama, metamorphic smoke), cola de findings usable, y extensión P1 del catálogo metamórfico — **sin** quemar presupuesto en evolve hasta que todo lo anterior esté estable.

---

## Fases (orden estricto)

```text
F0 Consolidación     → commit + CI mínimo
F1 Operación gates   → DB 005, judge cola, smoke vivo
F2 Judge producción  → golden real, eval live, guards + consola
F3 Metamórfico P1    → MR-04…07 + nicho MAP-Elites (sin evolve)
F4 Ops / EPIS2       → token GHA, docs, housekeeping
F5 Evolve nocturno   → ÚLTIMO — calibración MAP-Elites
```

Estimación relativa: **F0–F1** ≈ 1 sesión · **F2** ≈ 1 sesión · **F3** ≈ 1–2 sesiones · **F4** ≈ media sesión · **F5** ≈ 1 noche + revisión.

---

## F0 — Consolidación (bloqueante)

| ID | Tarea | Entregable | Gate |
|----|-------|------------|------|
| F0.1 | Commit WIP S10 cierre + S11 completo | 1 commit (o 2: `feat(s10)` + `feat(s11)`) en `master` | `npm run quality` |
| F0.2 | Push a `origin/master` | remoto al día | CI verde en GitHub |
| F0.3 | CI: job `quality` añade metamorphic dry-run | `.github/workflows/ci.yml` | `evolab:metamorphic run --dry-run --tag smoke` |
| F0.4 | CI: job `quality` añade judge eval mock | mismo workflow | `evolab:judge:eval -- --mock` exit 0 |
| F0.5 | Actualizar docs vivos | `evolab-known-limitations.md`, `EVOLAB_ROADMAP.md` §8 | coherencia con estado real |

**No hacer en F0:** evolve, golden re-etiquetado largo, nuevas relaciones MR-04+.

---

## F1 — Operación y gates en estación

Requisito: EPIS2 sandbox (`npm run stack:dev` en repo EPIS2) + Postgres `:5433` + Evolab DB.

| ID | Tarea | Comando / artefacto | Criterio |
|----|-------|---------------------|----------|
| F1.1 | Migración judge/bandit | `npm run evolab:db:migrate` | schema `005` aplicado |
| F1.2 | Warm-start bandit S8 | `npm run evolab:bandit:seed` | `evolab models --bandit` muestra stats |
| F1.3 | Judge sobre cola open | `npm run evolab:review -- --judge` | `judge_*` persistido; `review_status` sigue `open` |
| F1.4 | Smoke escenarios vivo | `npm run evolab:smoke` | tag `smoke` verde |
| F1.5 | Smoke metamórfico vivo | `npm run evolab:metamorphic -- run --tag smoke` | MR-01…03 passed o `human_review` explicado |
| F1.6 | Reporte operación | `reports/evolution/evolab-ops-gate-2026-06-11.md` | counts open/signal/noise/duplicate |

**Dependencia EPIS2 (documentar, no bloquear F1.3):** fix CDR `clinical_critical_results` cierra ruido en DEMO-004 — tarea R3.1 en EPIS2 cuando sandbox libre.

---

## F2 — Judge listo para uso diario

| ID | Tarea | Detalle | Gate |
|----|-------|---------|------|
| F2.1 | Golden set desde dossier real | Reemplazar/ampliar entradas sintéticas con snapshots de runs `4d1553d6`, `7f2a0877`, mutados S8 | ≥25 entradas versionadas |
| F2.2 | Eval live Ollama | `npm run evolab:judge:eval` (sin `--mock`, `--model qwen3:8b`) | accuracy ≥80%, signal recall ≥85% |
| F2.3 | Test regresión G1 | Test que falle si `src/judge/*` importa `reviewFinding` | vitest |
| F2.4 | Bandit en selección judge | `selectBanditModel('judge_triage')` antes de inferencia | telemetría en `model_bandit_events` |
| F2.5 | Consola: columnas judge | `read-model` + UI findings con `judge_verdict`, `judge_priority` | console muestra cola ordenada |
| F2.6 | CI nightly opcional | job separado con Ollama (self-hosted) o manual semanal | no bloquea PR |

**Invariantes (no negociables):** `requiresHumanReview: true` siempre · judge nunca escribe `review_status`.

---

## F3 — Metamórfico P1 (sin evolve)

Catálogo spec: MR-04…07. Orden por valor clínico / cobertura fitness.

| ID | Relación | Prerequisito técnico | Prioridad |
|----|----------|----------------------|-----------|
| F3.1 | **MR-07** delta acuse crítico | custom step o observación `critical_count` + escenario acuse | P1 — cierra gap `critical.acknowledged` |
| F3.2 | **MR-04** conservación auditoría | comparador ya existe (`audit_delta`); YAML + escenario API write | P1 |
| F3.3 | **MR-05** MAR hold | reutilizar `suspended-medication-mar-001` + `outcome_implication` | P1 |
| F3.4 | **MR-06** MAR idempotencia bloqueada | patrón MR-03 sobre MAR | P1 |
| F3.5 | Nicho `metamorphic` en MAP-Elites | `NICHE_OUTCOMES` + `enumerateNiches` + tests archive | integración spec S10 §2.4 |
| F3.6 | CI: dry-run incluye nuevas relaciones | tag `metamorphic` o `--all` en dry-run | vitest + validateRelationDryRun |

**Explícitamente fuera de F3:** MR-08…10, mutación de relaciones (`relation_role_swap`), runs sandbox de relaciones mutadas.

---

## F4 — Ops, frontera y deuda menora

| ID | Tarea | Repo | Notas |
|----|-------|------|-------|
| F4.1 | Secret `EPIS2_CHECKOUT_TOKEN` en GHA | GitHub | promover smoke de `continue-on-error` → gate cuando verde 3× |
| F4.2 | Nota Windows `npm run quality` | README evolab | R0.5 repair plan |
| F4.3 | Script `evolab housekeeping` (opcional) | evolab | purga `reports/evolution/evolve/*.json` >7 días |
| F4.4 | Sincronizar audit 2026-06-11 | reports | marcar S10/S11 implementados |
| F4.5 | Few-shot élites en mutación | mutation operators | 2 YAML élite por nicho desde archivo — **prepara** F5, no requiere evolve |

---

## F5 — Evolve nocturno (ÚLTIMO)

Solo cuando F0–F4 estén cerrados y la cola de findings no esté ahogada en ruido.

| ID | Tarea | Comando | Objetivo |
|----|-------|---------|----------|
| F5.1 | Corrida calibrada | `evolab evolve --generations 15 --population 5 --budget-minutes 150 --json` | ≥5 élites en nichos vacíos |
| F5.2 | Actualizar gate S9 | `evolab-sprint9-gate.md` | telemetría + decisión promote/reject |
| F5.3 | Revisión humana candidatos | `scenarios/candidates/` → PR corpus | IA nunca promueve sola |

**Política:** no lanzar evolve desde EPIS2 PM-03 en paralelo; una corrida activa por estación.

---

## Sprint 12 (fuera de este plan)

DGM-lite (`fitness gaps --unreachable`, propuestas `proposals/`) — iniciar cuando F3.5 muestre huecos inalcanzables con catálogo actual de custom steps.

---

## Checklist de cierre del plan (sin F5)

- [ ] WIP commiteado y CI con dry-run + judge mock
- [ ] Migración 005 aplicada en estación dev
- [ ] `review --judge` ejecutado; cola priorizada
- [ ] Smoke metamórfico vivo 3/3 o findings documentados
- [ ] Judge eval live ≥80% con golden re-etiquetado
- [ ] Test G1 (no `reviewFinding` desde judge)
- [ ] Consola muestra judge
- [ ] ≥1 relación MR-04 o MR-07 en repo + tests
- [ ] `NICHE_OUTCOMES` incluye `metamorphic` (código + test)

---

## Referencias

- Auditoría: conversación 2026-06-11 · `evolab-known-limitations.md`
- Repair: `evolab-repair-plan-2026-06-11.md`
- S10 spec: `evolab-sprint10-metamorphic-spec.md`
- S11 spec: `evolab-sprint11-judge-bandit-spec.md`
- Agentes: `evolab-agent-improvement-plan-2026-06-11.md`
