# EPIS2 Evolab — F2 judge gate (post-crash recovery)

**Fecha:** 2026-06-11  
**Commit previo:** `e7cfbac`  
**Contexto:** sesión interrumpida por crash durante `tsx -e` ad-hoc; recuperación con script `export-judge-golden.mjs` (cierre DB explícito).

---

## Resumen F2

| ID | Tarea | Resultado |
|----|-------|-----------|
| F2.1 | Golden dossier (25 entradas) | ✓ 21 DB + 4 dossier sintético enriquecido |
| F2.2 | Eval live `qwen3:8b` | ⚠ 52% accuracy (13/25) · **signal recall 100%** (gate recall ✓, accuracy ✗) |
| F2.3 | Test G1 boundary | ✓ `judge-boundary.test.ts` |
| F2.4 | Bandit en `review --judge` | ✓ `selectBanditModel('judge_triage')` |
| F2.5 | Consola judge | ✓ columnas + `/api/judge-queue` + nav «Cola judge» |
| F2.6 | CI nightly Ollama | — omitido (opcional) |

**Veredicto F2:** infraestructura cerrada · **calibración live pendiente** (accuracy ≥80%).

---

## F2.2 — Eval live (detalle)

Comando: `npm run evolab:judge:eval -- --model qwen3:8b`

| Métrica | Valor | Gate |
|---------|------:|------|
| Accuracy | 52.0% | ≥80% ✗ |
| Signal recall | 100.0% | ≥85% ✓ |
| Macro-F1 | 0.284 | — |

**Fallos principales:** golden `noise` (010–011, 014, 016–021, 024–025) clasificados como `signal` por Ollama; `duplicate` 005–006 sin dedup determinista en eval offline (histórico sin cierre humano en DB).

**Mitigaciones aplicadas:** prompt reglas 7–9 (RBAC/LLM/dom noise), golden hidratado con `fingerprintHistory` + `evaluations`, sanitize `relatedFindingIds` inválidos en cliente Ollama.

**Próximo paso F2.2:** relabel humano de entradas noise ambiguas · o few-shot en prompt · o gate live solo `signal recall` hasta calibración.

---

## Artefactos nuevos

- `scripts/evolution/export-judge-golden.mjs` + `npm run evolab:judge:export-golden`
- `apps/evolution-lab/fixtures/judge-golden-v1.json` → version `judge-golden-v1-dossier`
- `apps/evolution-lab/src/judge/judge-boundary.test.ts`
- Consola: `Cola judge`, badges verdict, API `/api/judge-queue`

---

## Gates locales

- `npm run quality` → **528/528** tests ✓
- `npm run evolab:judge:eval -- --mock` → 100% ✓

---

## Siguiente fase

**F3** metamórfico P1 (MR-04…07) o iteración F2.2 (prompt / golden relabel).
