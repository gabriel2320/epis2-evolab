# EPIS2 Evolab — F3 metamórfico P1 gate

**Fecha:** 2026-06-11  
**Alcance:** MR-04…07 + nicho `metamorphic` · calibración F2.2 en la misma sesión  
**Veredicto:** ✓ cerrado (dry-run + quality verde; smoke vivo opcional pendiente de API EPIS2)

---

## Resumen F3

| ID | Relación | Propiedad | Dry-run |
|----|----------|-----------|---------|
| MR-04 | `mr-audit-conservation-001` | Conservación audit trail | ✓ |
| MR-05 | `mr-mar-hold-monotonicity-001` | Hold MAR monótono | ✓ |
| MR-06 | `mr-mar-blocked-idempotence-001` | Idempotencia MAR bloqueado | ✓ |
| MR-07 | `mr-critical-ack-delta-001` | Delta critical ack | ✓ |

**Smoke tag (7 relaciones):** `npm run evolab:metamorphic -- run --dry-run --tag smoke` → **7/7** ✓

---

## Cambios principales

### Escenarios base
- `critical-ack-snapshot-001.yaml` — snapshot pre-ack
- `critical-acknowledge-001.yaml` — acknowledge post-acción

### Motor metamórfico
- `metamorphic.ts`: operador `audit_delta` con `required` (delta source → followUp)
- `pair-runner.ts`: `resetFixtures` en followUp para pares independientes
- `sandbox-prep.ts`: `releaseMarScheduledDose`, guard `marDoseHeld === false` antes de hold

### Relation loader
- `actionObservation` en labels; `draftId` en captureKeys si `mar_approve_attempt`

### Evolución / nichos
- `niches.ts`: `NICHE_OUTCOMES` incluye `'metamorphic'`; `assignNicheForRelation()`

### Tests
- `metamorphic.test.ts` — MR-04…07 + `audit_delta`
- `relation-loader.test.ts` — 7 relaciones smoke
- `archive.test.ts` — 60 celdas (nicho metamorphic)

---

## Gates locales

| Gate | Resultado |
|------|-----------|
| `npm run quality` | **539/539** tests ✓ |
| Metamorphic dry-run `--tag smoke` | **7/7** ✓ |
| Smoke vivo (API `:3001`) | — no ejecutado (requiere `npm run dev:api` en EPIS2) |

---

## F2.2 calibración (misma sesión)

Comando: `npm run evolab:judge:eval -- --model qwen3:8b`

| Métrica | Antes | Ahora | Gate |
|---------|------:|------:|------|
| Accuracy | 52% | **84%** (21/25) | ≥80% ✓ |
| Signal recall | 100% | **100%** | ≥85% ✓ |
| Macro-F1 | 0.284 | 0.596 | — |

**Residuales (4/25):** duplicate 005–006 → signal; noise 016 → signal; noise 020 → duplicate.

Mitigaciones: prompt reglas 7–9 + few-shot; golden con `fingerprintHistory`/`evaluations`; export script enriquece noise/duplicate history.

Detalle: `reports/evolution/evolab-sprint11-judge-gate.md`

---

## Invariantes respetados

- Judge no escribe `review_status`; siempre `requiresHumanReview: true`
- Sin import EPIS sin manifiesto (solo sandbox API)

---

## Próximo paso

1. Smoke vivo metamórfico con stack EPIS2 levantado
2. Commit + push F3 + calibración (cambios locales sin commit)
3. F4 según `evolab-dev-plan-2026-06-11.md`
