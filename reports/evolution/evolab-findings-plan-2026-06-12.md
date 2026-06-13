# EPIS2 Evolab — Interpretación de hallazgos y plan de acción

**Fecha:** 2026-06-12  
**Contexto:** post F5 `f5-1781261389000` · cola **197 open** (141 signal · 56 noise)  
**Fuentes:** `evolab-findings-report-2026-06-12.json` · agregación fingerprints DB · judge llama3.2/qwen2.5-coder

---

## 1. Lectura ejecutiva

La corrida F5 generó **mucha señal concentrada**, no ruido disperso. El judge y la agregación por fingerprint muestran que **~80% de los signal** pertenecen a **3 familias clínicas** derivadas del mismo escenario base (`admission-discharge-001`) mutado por MAP-Elites:

| Familia | Signal approx. | Interpretación |
|---------|---------------:|----------------|
| **A — Alta con crítico pendiente** | ~90 | El sandbox no detecta/bloquea críticos pendientes al intentar discharge |
| **B — RBAC / functional (403 esperado)** | ~26 | Acciones de alta/aprobación devuelven 200/201 cuando deberían bloquearse |
| **C — Auditoría incompleta** | ~17 | Flujos discharge sin eventos audit capturados por evaluador |
| **D — Double-booking + crítico** | ~10 | Reglas clínicas cruzadas (CDR vs críticos) en mutantes booking |
| **E — Infra eval / LLM** | ~4 | Escenarios command/plan (evolab), no regresión clínica EPIS2 |
| **Noise (56)** | — | Mayoría: *expected obsoleto*, observaciones HTTP ausentes, mutante fuera de alcance evaluador |

**Conclusión:** no hay 141 bugs independientes. Hay **~15–20 fingerprints accionables** que se repiten en decenas de mutantes. La prioridad es **triaje por fingerprint → 3–5 hipótesis de producto** en EPIS2 sandbox, no revisar UUID a UUID.

---

## 2. Temas interpretados (detalle)

### Tema A — `critical_pending` en discharge (prioridad P0)

**Patrón:** títulos `… — critical_pending` y `… — clinical_safety` en escenarios `admission-discharge-001-m8cx-008-*`.

**Top fingerprints signal:** `c706f5f40557e0cd` (×7), `6572cef63b968d89` (×6), `129c4d642faf16a7` (×6), `4b2bd11919d42ee6` (×6).

**Qué dice el judge:** “no se detectó resultado crítico pendiente en sandbox” / “crítico ya no pendiente tras intento de alta”.

**Interpretación:**

- **Hipótesis producto (EPIS2):** guard de discharge no consulta `service_criticals` / snapshot de críticos pendientes de forma consistente con el evaluador.
- **Hipótesis evolab:** fixture `resetCriticalPendingAcknowledgement` no corre en todos los mutantes → falso positivo.
- **Hipótesis mutación:** mutantes cambian persona/endpoint pero comparten fingerprint → misma falla real amplificada.

**Acción:** validar manualmente **un** mutante representativo (`admission-discharge-001-m8cx-008-m8rs-037`) en sandbox antes de cerrar el resto del cluster.

---

### Tema B — Authorization / functional (P0–P1)

**Patrón:** `admission-discharge-001-m8rs-001 — functional` (×5), HTTP 200 en discharge donde se esperaba 403.

**Fingerprint:** `50df1d69aac96d12` (×5 signal).

**Interpretación:** posible gap RBAC en ruta de discharge o rol physician en mutante; puede ser el **mismo root cause** que Tema A visto desde evaluador `functional` vs `clinical_safety`.

**Acción:** una reproducción API (`POST discharge/approve`) con crítico pendiente; comparar con `docs/quality/GOLDEN_CLINICAL_JOURNEY.md`.

---

### Tema C — Audit trail (P1)

**Patrón:** `audit_completeness` en discharge/admission mutantes.

**Fingerprints:** `68c457a21613e462` (×4), `573cf1a080ff62ee` (×3).

**Interpretación mixta:**

- Parte **noise** (56): “no se capturaron eventos” por evidencia minimal / flujo no ejecutado en mutante.
- Parte **signal:** evento prohibido o ausencia real en journey aprobado.

**Acción:** separar noise de infraevidencia vs signal con replay `--evidence full` en 2 mutantes.

---

### Tema D — Double booking + crítico (P0)

**Escenario base:** `admission-double-booking-001-m8cx-004` — **6/6 signal**.

**Hallazgo ancla:** `06f2e304…` critical — crítico aprobado sin acuse.

**Interpretación:** regla clínica fuerte; si se confirma en EPIS2, es **candidate para fix troncal** (afecta múltiples nichos MAP-Elites).

---

### Tema E — Noise interpretable (P2 — batch)

**Ejemplos judge noise:**

- CDR consistency sin observaciones cruzadas (mutante `m8pp-022`: 7 noise / 1 signal).
- Audit sin eventos porque el flujo no llegó a la acción auditada.
- Functional sin captura HTTP → evaluador no puede afirmar pass/fail.

**Interpretación:** **deuda de escenario/evaluador**, no necesariamente bug. Candidatos a cierre batch `--decision rejected` tras muestreo de 5.

---

### Tema F — LLM command evolution (P2 evolab)

2 signal en `llm-command-evolution-001` (plan_fidelity, command_resolve).

**Interpretación:** capa evolab/LLM sim — **fuera de alcance EPIS2 clínico** esta sesión.

---

## 3. Mapa signal → acción

```text
                    ┌─────────────────────────┐
                    │ 141 signal open         │
                    └───────────┬─────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
   │ ~15 FP        │   │ ~40 FP        │   │ ~86 instancias│
   │ clusters P0   │   │ audit/UI P1   │   │ duplicados    │
   │ 3–5 hipótesis │   │ evidencia     │   │ mismo FP      │
   └───────┬───────┘   └───────┬───────┘   └───────┬───────┘
           │                   │                   │
           ▼                   ▼                   ▼
   EPIS2 fix sandbox    Replay full evidence   Cerrar duplicate
   + golden journey     o reject noise         por FP confirmado
```

---

## 4. Plan por fases (SDEPIS2)

### Fase 0 — En curso (operación)

| ID | Acción | Owner | Gate |
|----|--------|-------|------|
| F5-R1 | F5 reanudado browser off (~195 min) | evolab | VRAM estable |
| F5-R2 | 17 duplicate cerrados | ✓ | — |

---

### Fase 1 — Triaje fingerprint (1 sesión, ~2 h)

| Paso | Comando / artefacto | Entregable |
|------|---------------------|------------|
| 1.1 | Export top 20 FP → hoja triage | `findings-fingerprint-triage.md` |
| 1.2 | Elegir **5 anclas** (1 por tema A–D + 1 noise) | UUIDs ancla |
| 1.3 | Replay anclas | `evolab replay --run <id>` o re-run escenario |
| 1.4 | Decisión humana por FP | approved / rejected / duplicate batch |

**Anclas sugeridas:**

| Tema | UUID | Escenario |
|------|------|-----------|
| A | `eb821f9e…` o run `6a207658…` | admission-discharge-001-m8cx-008-m8rs-037 |
| B | `93bd475d-21d7-42fe-9dab-dac6352845fd` | admission-discharge-001-m8rs-001 |
| D | `06f2e304-3b23-4eb7-ab53-c8bf6be5b370` | admission-double-booking-001-m8cx-004 |
| C | pick from audit_completeness cluster | admission-discharge-001-m8rs-001 |
| Noise | muestreo `5641f148…` | double-booking m8pp-022 |

**Gate F1:** cada FP P0 tiene veredicto humano + nota de root cause.

---

### Fase 2 — Investigación EPIS2 (tramo clínico, 1–2 sesiones)

**Alcance allowlist:** API inpatient/discharge, critical results, RBAC — **solo sandbox EPIS2**, sin tocar evolab mutants.

| Hipótesis | Verificación | Fix potencial |
|-----------|--------------|---------------|
| H1 Discharge no bloquea con crítico pendiente | API + census_snapshot | Guard en approve discharge |
| H2 RBAC physician vs nurse en mutante | session role + endpoint | Policy matrix |
| H3 Fixture crítico no reseteado en evaluate | trace sandbox-prep en mutantes | `resetFixtures` en escenarios evolab |

**Gates:** `npm run check` · escenario ancla pasa en EPIS2 · `quality:golden-journey` si aplica.

---

### Fase 3 — Higiene evolab (paralelo, bajo riesgo)

| Paso | Acción |
|------|--------|
| 3.1 | Batch `--decision rejected` en noise muestreado (target −30 open) |
| 3.2 | Cerrar por FP duplicate restantes tras F1 |
| 3.3 | `archive:promote` élite `admission-discharge-001-m8cx-004` si fitness confirma |
| 3.4 | Actualizar `expected` obsoletos en escenarios base (no mutantes) |

**Gate F3:** open < 100 · signal P0 todos decididos.

---

### Fase 4 — Re-validación y gate F5

| Paso | Acción |
|------|--------|
| 4.1 | Smoke: `admission-discharge-001`, `discharge-critical-pending-001`, `admission-double-booking-001` |
| 4.2 | Re-run MAP-Elites nicho physician\|inpatient\|journey |
| 4.3 | Objetivo S9: ≥5 élites en nichos vacíos (browser off) |

---

## 5. Cronograma sugerido

| Día | Foco | Horas |
|-----|------|------:|
| D0 (hoy) | F5 resume + Fase 1 anclas (2 FP) | 2 |
| D1 | Fase 2 EPIS2 H1/H2 + F1 resto FP | 4 |
| D2 | Fase 3 batch noise + promote | 2 |
| D3 | Fase 4 re-validación + informe cierre | 3 |

---

## 6. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Confundir mutante roto con bug EPIS2 | Siempre ancla escenario **base** YAML antes de mutante |
| Judge sobre-clasifica signal | Humano rechaza tras replay; no auto-approve |
| F5 genera más open sin fix | Pausar evolve tras F2 hasta smoke verde |
| 141 signal abruma revisión | **Solo triage por fingerprint**, ignorar instancias duplicadas |

---

## 7. Comandos de referencia

```powershell
# Triaje
npm run evolab:findings -- --limit 50 --status open
npm run evolab:findings:report

# Decisión humana (por FP ancla)
npm run evolab:review -- --finding <uuid> --decision approved|rejected|duplicate

# Batch noise (tras muestreo)
# manual por ahora; candidato script close-judge-noise

# Re-run escenario base EPIS2
npm run evolab:run -- --scenario admission-discharge-001 --reset-fixtures --evidence full

# Promoción
npm run evolab:archive:promote -- --dry-run
```

---

## 8. Próximo paso inmediato (una acción)

**Replay + decisión humana del fingerprint `50df1d69aac96d12`** (authorization discharge 200 vs 403) — si se confirma bug, abre tramo EPIS2 H1/H2; si no, cierra ~5 instancias como `rejected` y reduce ruido de Tema B.

---

*Informe complementario:* `evolab-findings-report-2026-06-12.md` · *Cierre F5:* `evolab-f5-session-close-2026-06-12.md`
