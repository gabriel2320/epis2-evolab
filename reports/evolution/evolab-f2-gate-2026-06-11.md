# EPIS2 Evolab — F2 judge gate (post-crash recovery)

**Fecha:** 2026-06-11  
**Commit previo:** `e7cfbac`  
**Contexto:** sesión interrumpida por crash durante `tsx -e` ad-hoc; recuperación con script `export-judge-golden.mjs` (cierre DB explícito).

---

## Resumen F2

| ID | Tarea | Resultado |
|----|-------|-----------|
| F2.1 | Golden dossier (25 entradas) | ✓ 21 DB + 4 dossier sintético enriquecido |
| F2.2 | Eval live `qwen3:8b` | ✓ **84%** accuracy (21/25) · signal recall **100%** (gates ✓) — ver F3 gate / sprint11 report |
| F2.3 | Test G1 boundary | ✓ `judge-boundary.test.ts` |
| F2.4 | Bandit en `review --judge` | ✓ `selectBanditModel('judge_triage')` |
| F2.5 | Consola judge | ✓ columnas + `/api/judge-queue` + nav «Cola judge» |
| F2.6 | CI nightly Ollama | — omitido (opcional) |

**Veredicto F2:** ✓ cerrado (infra + calibración live 84% accuracy, 2026-06-11 post-F3 fixes).

---

## F2.2 — Eval live (detalle)

Comando: `npm run evolab:judge:eval -- --model qwen3:8b`

| Métrica | Valor | Gate |
|---------|------:|------|
| Accuracy | **84.0%** | ≥80% ✓ |
| Signal recall | 100.0% | ≥85% ✓ |
| Macro-F1 | 0.596 | — |

**Residuales (4/25):** golden-005/006 (duplicate→signal), golden-016 (noise→signal), golden-020 (noise→duplicate).

**Mitigaciones aplicadas:** prompt reglas 7–9 + few-shot; golden hidratado con `fingerprintHistory` + `evaluations`; export script enriquece historial noise/duplicate.

Reporte detallado: `reports/evolution/evolab-sprint11-judge-gate.md`

---

## Artefactos nuevos

- `scripts/evolution/export-judge-golden.mjs` + `npm run evolab:judge:export-golden`
- `apps/evolution-lab/fixtures/judge-golden-v1.json` → version `judge-golden-v1-dossier`
- `apps/evolution-lab/src/judge/judge-boundary.test.ts`
- Consola: `Cola judge`, badges verdict, API `/api/judge-queue`

---

## Gates locales

- `npm run quality` → **539/539** tests ✓
- `npm run evolab:judge:eval -- --mock` → 100% ✓

---

## Siguiente fase

**F3** cerrado — ver `reports/evolution/evolab-f3-gate-2026-06-11.md`. Siguiente: smoke vivo + F4.
