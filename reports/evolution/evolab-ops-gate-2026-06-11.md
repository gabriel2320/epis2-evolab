# EPIS2 Evolab — F1 ops gate

**Fecha:** 2026-06-11  
**Fase:** F1 Operación y gates en estación  
**Commit base:** `e7cfbac` (master, ahead 1 vs origin)  
**Sandbox:** EPIS2 `stack:dev` + `dev:api` · Postgres `:5433` · Ollama `qwen3:8b`

---

## Resumen

| ID | Tarea | Resultado |
|----|-------|-----------|
| F1.1 | `evolab:db:migrate` (005 judge/bandit) | ✓ 4 migraciones en schema `evolution` |
| F1.2 | `evolab:bandit:seed` | ✓ 9 modelos warm-start S8 |
| F1.3 | `evolab:review --judge` (Ollama live) | ✓ 24 findings clasificados |
| F1.4 | `evolab:smoke` | ✓ 2/2 passed |
| F1.5 | `evolab:metamorphic run --tag smoke` | ✓ 3/3 passed (MR-01…03) |
| F1.6 | Reporte ops | este documento |

**Veredicto F1:** cerrado en estación local.

---

## Doctor (post-migrate)

- Target EPIS2 API health/ready: ✓
- Evolab DB `epis2_evolab@127.0.0.1:5433`: ✓
- Ollama UP · modelo preferido `qwen3:8b`: ✓
- Escenarios cargados: 9

---

## Cola de revisión (judge live)

Comando: `npm run evolab:review -- --judge` · duración ~56s · exit 0

| Métrica | Count |
|---------|------:|
| Total open | 24 |
| signal | 21 |
| duplicate | 3 |
| noise | 0 |
| sin judge | 0 |

**Invariantes verificadas:**

- `review_status` permanece `open` en todos los findings
- Judge solo escribió columnas `judge_*`
- Mensaje CLI: «Todos requieren revisión humana. El judge solo ordena — no cierra.»

**Top escenarios en cola signal:** `admission-double-booking-001-m8cx-004`, `admission-discharge-001-m8rs-001`, `admission-discharge-001-m8cx-008`, `discharge-critical-pending-001-m8pp-006`, `llm-command-evolution-001`, `role-evolution-sign-001`.

**Duplicados (dedup determinista):** 3 findings en `discharge-critical-pending-001` emparejados por fingerprint con findings ya revisados.

---

## Smoke escenarios

Comando: `npm run evolab:smoke` · exit 0

| Escenario | Status | Findings |
|-----------|--------|----------|
| census-service-integrity-001 | completed | 0 |
| role-nurse-approve-001 | completed | 0 |

Batch: **2/2 passed**, 0 human_review.

---

## Smoke metamórfico (vivo)

Comando: `npm run evolab:metamorphic -- run --tag smoke` · exit 0

| Relación | Resultado |
|----------|-----------|
| mr-blocked-idempotence-001 (MR-03) | ✓ invariant_repeat + audit_delta + **delta drafts_count** |
| mr-census-inversion-001 (MR-01) | ✓ snapshot_equal + invariant_repeat |
| mr-permission-monotonicity-001 (MR-02) | ✓ monotonicidad RBAC |

**3/3 passed.**

---

## Bandit (post-seed)

Comando: `evolab models --bandit`

| Task | Selected (UCB) | Notas |
|------|----------------|-------|
| judge_triage | qwen2.5-coder:7b | qwen3:8b 22 pulls mean 0.922 |
| mutate_amplitude | qwen3:8b | warm-start S8 |
| mutate_depth | qwen2.5-coder:7b | warm-start S8 |
| mutate_repair | qwen2.5-coder:14b | warm-start S8 |

---

## Riesgos / deuda (→ F2)

1. **Golden sintético** — eval mock 100%; cola live clasificó 0 noise (posible sesgo optimista vs dossier real).
2. **Ruido CDR DEMO-004** — muchos signal en `cdr_consistency` / `admission-double-booking-001-m8cx-004`; fix EPIS2 R3.1 pendiente.
3. **F0.2 push** — `master` sigue 1 commit ahead de `origin/master`; CI remoto no validado post-F0.
4. **Consola** — sin columnas judge aún (F2.5).

---

## Próximo paso

**F2 — Judge producción:** golden desde dossier real, `evolab:judge:eval` live (≥80% accuracy), test G1, consola con `judge_verdict` / `judge_priority`.

Opcional inmediato: `git push origin master` (F0.2).
