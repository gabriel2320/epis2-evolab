# Evolab — Dossier de revisión humana · 2026-06-10

**Para:** revisor humano (médico/dev) · **Tiempo de triage estimado:** ~10 min
**Fuentes:** `evolution.findings` (Postgres :5433, DB `epis2_evolab`), evidencia run `4d1553d6`, `evolab findings` CLI (lectura), código EPIS2 (solo lectura), telemetría de mutación Sprint 8.

---

## PARTE 1 — Hallazgo clínico confirmado: alta aprobada con crítico sin acuse

### Veredicto

**Es un bug real de EPIS2, no un falso positivo del laboratorio.** El endpoint `POST /api/drafts/{id}/approve` aprueba una epicrisis (HTTP 200) con un resultado crítico de laboratorio (PCR, `f0000004-…-0002`) sin acuse de recibo. La regla CDR que debería bloquearlo **existe** (`cdr.critical_lab_without_ack`, severidad `block`), pero (a) nunca se consulta en el camino de aprobación del API, y (b) ni siquiera ve los críticos reales porque lee de otra fuente de datos. Reproducible: el mismo fingerprint (`e0ff3dbe…`) aparece en dos runs distintos (`4d1553d6` y `7f2a0877`).

### 1.1 Findings persistidos (verificados en DB)

Run `4d1553d6-9eab-4458-9c62-825d683049e8` · escenario `discharge-critical-pending-001` · target `epis2-local-sandbox` · los 4 en `review_status = open`, `recommended_action = generate_test`:

| ID (DB) | Evaluador | Categoría | Severidad | Conf. | Qué observó |
|---|---|---|---|---|---|
| `ceac9c2a…` | clinical_safety | clinical_safety | **critical** | 0.95 | Alta aprobada con crítico sin acuse — regla clínica no aplicada en UI/API |
| `3ad7cd9e…` | functional | authorization | high | 0.85 | `POST /api/drafts/{id}/approve` → HTTP 200 donde se esperaba bloqueo |
| `4273db7a…` | cdr_consistency | clinical_safety | high | 0.85 | `clinical_critical_results` tiene críticos sin acuse pero `clinical-alerts` devolvió **0 alertas** — fuentes desincronizadas |
| `0dcf40ae…` | audit_completeness | audit_trail | high | 0.85 | Auditoría registró `clinical.draft.approved` para una acción que debió bloquearse |

Contexto DB: 14 findings totales (13 open, 1 approved). `evolab findings --status open` (CLI, solo lectura) confirma los 4 más un duplicado de fingerprint `e0ff3dbe…`/`9ee6d8dde…` del run previo `7f2a0877` — el hallazgo es estable, no flaky.

### 1.2 Evidencia del run

Directorio: `reports/evolution/runs/4d1553d6-9eab-4458-9c62-825d683049e8/` (resumen narrativo en `evolab-sandbox-validation-2026-06-10.md`). Secuencia probatoria de `result.json`:

1. `unacknowledged_criticals` (pre): 1 crítico PCR sin acuse para DEMO-004.
2. `discharge_alerts`: API de alertas clínicas → **0 alertas** (la regla CDR no ve el crítico).
3. `discharge_draft_create`: borrador epicrisis → 201 (`ad222383…`).
4. `discharge_approve_attempt`: **aprobación → 200 OK** (`api/discharge-approve-attempt.json`: `status: approved`, nota `0618c709…` creada).
5. `after_discharge_attempt` (post): el crítico **sigue sin acuse**.
6. Auditoría post-run: `clinical.draft.approved` registrado (evento `e6571edb…`).

### 1.3 Causa raíz en EPIS2 (solo lectura — archivos y funciones)

Tres piezas que no se hablan entre sí:

1. **El camino de aprobación no tiene guard.** `approveDraft()` en `apps/api/src/clinical/service.ts` (líneas 367–432) valida solo el estado del borrador (`draft/editing/ready_for_review`) y ejecuta nota + approval + side-effects + auditoría en una transacción. **Nunca consulta `clinical_critical_results` ni el CDR.** La ruta `POST /api/drafts/:draftId/approve` (`apps/api/src/clinical/routes.ts`, ~447–456) solo exige el permiso RBAC `draft.approve`. Tampoco hay guard en los side-effects (`apps/api/src/clinical/approval-side-effects.ts`) — `discharge_summary` ni siquiera tiene handler ahí.

2. **La regla CDR existe pero está "hambrienta" de datos.** `evaluateCriticalLabWithoutAck()` en `packages/clinical-domain/src/clinicalDecisionRules/rules.ts` (110–130) bloquea `discharge_summary` si hay `criticalLabAlerts` — pero ese contexto se construye en `fromSafetyInput.ts` (`extractCriticalLabAlerts`, líneas 26–35) por **heurística de texto sobre los summary fields** (`input.labs`), no desde la tabla `clinical_critical_results`. El endpoint de alertas (`getDemoClinicalAlertsForPatient`, `apps/api/src/clinical/service.ts` 160–202) arma su input desde problems/observations/summary y nunca toca `clinicalCriticalResults`. Por eso `clinical-alerts` devolvió 0 alertas → finding `cdr_consistency`.

3. **El acuse vive en otro módulo, desconectado del alta.** `acknowledgeCriticalResult()` (`apps/api/src/inpatient/service.ts`, 168+) y la ruta `POST /api/inpatient/critical-results/:criticalId/acknowledge` (`apps/api/src/inpatient/routes.ts`, 31–57, evento `critical.acknowledged`) funcionan; el dashboard de servicio sí computa `unacknowledgedCriticals` desde `clinicalCriticalResults WHERE acknowledged_at IS NULL`. La consulta correcta ya existe — solo que nadie la usa en el approve.

### 1.4 ¿Coincide con lo ya anotado en known-limitations?

**Sí, coincide y lo amplía.** `evolab-known-limitations.md` ya registraba «Confirmado: approve epicrisis no bloqueada por PCR pendiente» y «`clinical_critical_results` y CDR son fuentes distintas en DEMO-004». Lo nuevo de hoy: (a) confirmación contra sandbox vivo con evidencia persistida y reproducible, (b) la causa raíz localizada a nivel de función, y (c) el ángulo de auditoría (`clinical.draft.approved` registrado para una acción que la política clínica considera inválida) que no estaba anotado.

### 1.5 Recomendación accionable (fix mínimo en EPIS2)

**Fix mínimo (3 piezas, una sesión MF dedicada):**

1. **Guard en `approveDraft()`**: si `draft.draftType === 'discharge_summary'` (y a futuro `transfer_note`), consultar `clinical_critical_results` del paciente con `acknowledged_at IS NULL` dentro de la misma transacción; si hay filas, rechazar (409/422) con mensaje accionable que liste los críticos pendientes.
2. **Evento de auditoría del bloqueo**: registrar p. ej. `clinical.draft.approve_blocked` con los IDs de críticos — el intento bloqueado debe dejar huella (hoy ni bloquea ni distingue).
3. **Test de integración**: fixture DEMO-004 (crítico sin acuse) → approve epicrisis → esperar bloqueo + evento; segundo caso: acusar el crítico → approve → 200. Espejo del escenario evolab `discharge-critical-pending-001`.

Opcional de segundo orden (no bloquear el fix por esto): alimentar `criticalLabAlerts` del CDR desde `clinical_critical_results` para que la UI muestre la alerta antes de que el médico llegue al botón de firma.

**Riesgo del fix:** bajo-medio. Toca el camino crítico de aprobación (transaccional, compartido por todos los draft types) — un guard mal filtrado podría bloquear approves legítimos de otros tipos de nota. Mitigación: guard estrictamente por `draftType`, test de regresión sobre `clinical.integration.test.ts` y `closeEncounter.integration.test.ts`.

**Decisión que te toca a ti (trade-off clínico, no lo decido yo):**

- **Bloqueo duro (sin override):** máxima seguridad — nadie da de alta con un crítico sin acuse. Riesgo: en la práctica real hay altas legítimas con críticos conocidos-pero-no-acusados-en-sistema (p. ej. crítico ya tratado, paciente que firma alta voluntaria, traslado urgente); un bloqueo duro fuerza acuses "de trámite" que degradan el valor del acuse como señal.
- **Warning con override justificado:** el médico puede aprobar declarando justificación obligatoria, que queda en auditoría junto al evento de override. Mantiene agencia clínica y deja rastro, pero admite que el gap siga ocurriendo "con firma".
- Punto medio razonable: bloqueo duro para severidad `critical` + override justificado para `high`. También es decisión tuya si el acuse desde la pantalla de alta (un clic con identidad) cuenta como acuse válido.

---

## PARTE 2 — Digest de los 31 candidatos del Sprint 8

### Veredicto

**31 candidatos válidos, calidad desigual y honestamente modesta en cobertura nueva: ninguno toca los huecos notables del catálogo** (`critical-results acknowledge`, `transfer`, `auth.logout`, evento `command.resolve` — el fitness report sigue en 11/24 endpoints y 5/12 eventos). Los operadores remezclan los 9 padres sobre los mismos 5 endpoints ya cubiertos; la novedad es conductual (roles, payloads, orden de pasos), no de superficie. Hay un núcleo de 6-8 candidatos que sí prueban interacciones nuevas entre guards, y una cola de near-duplicados y expected dudosos. **Serán evaluados empíricamente en sandbox por el Sprint 9 (en curso): tu revisión fina debe enfocarse en la futura promoción de élites, no en aprobar/rechazar esta camada uno a uno.**

Telemetría (`reports/evolution/mutation/mutate-2026-06-10T15-54-54-098Z.json`): 50 generados → 31 aceptados; descartes: 15 duplicados, 4 inválidos irreparables; 1 reparado; novelty bge-m3 0.043–0.177 (umbral 0.005, laxo).

### 2.1 Inventario por operador y nicho

| Operador | Aceptados | Nichos (rol × módulo × resultado esperado) |
|---|---|---|
| `payload_perturbation` (m8pp) | 12 | physician×admisión×bloqueo (3: cama inválida/ausente), physician×journey×bloqueo en draft create (3), physician×alta-crítico×bloqueo (2), physician×lifecycle×bloqueo PATCH (2), nurse×drafts×bloqueo (2) |
| `crossover` (m8cx) | 10 | physician×alta-crítico+doble-booking×bloqueo (2), physician×journey+censo×éxito (4), nurse×RBAC+admin-flujo×bloqueo (2), admin×lifecycle-cancelado×bloqueo (1), nurse×MAR-suspendido×bloqueo (1) |
| `role_swap` (m8rs) | 6 | nurse×journey completo admisión→alta×bloqueo (4 near-dupes), nurse×lifecycle-cancelado×bloqueo (2) |
| `step_injection` (m8si) | 3 | physician×lifecycle-cancelado + GET de verificación×bloqueo (3 near-dupes) |

Sesgo visible: `draft-lifecycle-cancelled-001` y `admission-discharge-001` son padres de 16/31; los 4 inválidos irreparables fueron todos `Zod flow.2` (step_injection/perturbation rompiendo el shape del paso 2).

### 2.2 Los más prometedores (6)

1. **`discharge-critical-pending-001-m8cx-036`** — Cruza el escenario del hallazgo confirmado con re-admisión (doble booking) y trae el expected más rico de la camada (`dischargeBlocked`, `criticalResultRemainsPending`, `cdrConsistent`, `auditEventCreated`). Clínicamente: verifica que el gap del alta no se "esconda" tras otra operación de hospitalización y re-confirmará el finding tras el fix. Riesgo de trivialidad: bajo — pero hasta que EPIS2 corrija el guard, duplicará el fingerprint existente en vez de descubrir algo nuevo.

2. **`admission-discharge-001-m8rs-001`** (representante; 017/033/041 son near-dupes) — Enfermera ejecuta el journey completo: admitir, crear epicrisis, **aprobarla** y dar el alta de la admisión. Clínicamente importante: el RBAC de `draft.approve` para nurse está probado (403), pero ¿puede una enfermera **admitir** y **ejecutar el alta operativa** (`/admissions/{id}/discharge`)? Ese guard nunca se ha probado. Riesgo: medio — el journey muere en el approve (403) y los pasos posteriores pueden quedar sin ejercer; el resultado dependerá de cómo el engine maneje el fallo intermedio.

3. **`role-evolution-sign-001-m8cx-024`** — Admin (que sí tiene `draft.approve`) intenta aprobar un borrador **cancelado**. Prueba la precedencia del guard de estado sobre el privilegio de rol: exactamente el tipo de interacción entre guards que ningún escenario padre cubre. Riesgo de trivialidad: bajo.

4. **`draft-lifecycle-cancelled-001-m8rs-005`** — Enfermera intenta aprobar un borrador cancelado: ¿responde el API 403 (RBAC primero) o 409 (estado primero)? Establece el orden de evaluación de guards — relevante para seguridad (un 409 antes del 403 filtra información de estado a un rol sin permiso). Riesgo: medio (puede colapsar en el 403 conocido).

5. **`suspended-medication-mar-001-m8cx-028`** — Combina MAR con medicación suspendida + intento de aprobación por enfermera: seguridad medicamentosa × RBAC en un solo flujo, con expected de warning visible + auditoría. Clínicamente: administrar un fármaco suspendido es de los errores más dañinos en hospitalización. Riesgo: medio — el padre ya pasa en verde; el cruce puede no añadir señal nueva.

6. **`discharge-critical-pending-001-m8pp-018`** — Perturba el `draftType` en el contexto de crítico pendiente: prueba la validación de payload justo en el nicho de seguridad clínica (¿un draftType inesperado esquiva el futuro guard de alta?). Riesgo: alto de ser trivial (Zod 400 genérico), pero es la pregunta correcta para blindar el fix: el guard debe activarse por tipo de borrador y un tipo malformado no debe colarse.

Menciones: `admission-double-booking-001-m8pp-022/042` (admisión sin cama / cama inválida — validación negativa útil pero casi seguro 400 trivial).

### 2.3 Los sospechosos

- **Expected incoherentes entre near-duplicados:** los 4 journeys de enfermera (m8rs-001/017/033/041) discrepan entre sí — 001/033 esperan `auditEventCreated: false`, 017 además exige `auditMustInclude` con eventos que solo existen si los pasos previos **no** fueron bloqueados, y 041 espera `actionBlocked: true` **y** `auditEventCreated: true` con `inpatient.admitted` incluido. Al menos dos de los cuatro tienen el expected mal adivinado; los resultados divergentes en sandbox dirán cuál.
- **Triviales que inflan cobertura:** `admission-discharge-001-m8cx-044` recorta el journey a admisión + dos snapshots de censo con `actionBlocked: false` y `actionObservation` apuntando a una observación custom (`snapshot_census_02`), no a una acción de API — pasará en verde sin probar nada nuevo. `m8cx-016` tiene el mismo patrón de observación. `role-nurse-approve-001-m8pp-010` espera evento de auditoría para un create con body inválido (EPIS2 no audita creaciones fallidas → finding falso casi garantizado).
- **Expected dudoso en perturbaciones de payload:** `admission-discharge-001-m8pp-006/046` esperan bloqueo en `POST /api/drafts`, pero ese endpoint acepta bodies muy laxos — si la perturbación es leve, devolverá 201 y generará findings-ruido. `draft-lifecycle-cancelled-001-m8pp-034` (cancelar sin status) espera `auditEventCreated: true` mientras su gemelo m8pp-014 (status numérico 12345) espera `false` — uno de los dos está mal.
- **Near-dupes que pasaron el umbral de novedad:** los 3 step_injection (m8si-007/015/023) difieren solo en dónde insertan un GET de verificación; los 4 nurse-journeys ídem. El umbral 0.005 es demasiado laxo — para Sprint 9+ conviene subirlo o deduplicar por firma estructural de flow.
- **Cosmético pero sistemático:** mojibake de codificación en casi todos los `name:` generados («�?"», «invǭlido», «evoluci��n») — corregir el encoding del pipeline de mutación antes de promover élites, o los YAML promovidos heredarán nombres ilegibles.

### 2.4 Qué hará Sprint 9 (en curso) — y qué NO revisar hoy

Sprint 9 ejecutará los 31 contra el sandbox vivo y persistirá fitness/resultados por candidato. La validación empírica filtrará triviales, expected incoherentes y duplicados conductuales mucho mejor que una lectura manual de YAML. **No gastes tu revisión en aprobar candidatos individuales hoy**: guárdala para la promoción de élites cuando Sprint 9 reporte resultados con datos de ejecución.

---

## Checklist de decisiones del revisor

- [ ] **(a) Triage del finding `discharge-critical-pending-001`** — aceptar los 4 findings de run `4d1553d6` (siguen `open` en `evolution.findings`; cerrar vía `evolab review`) y decidir si se deriva el fix a EPIS2 como microfase propia. Decisión clínica incluida: **¿bloqueo duro, override justificado, o mixto por severidad?** (trade-off en §1.5).
- [ ] **(b) Crear el secret `EPIS2_CHECKOUT_TOKEN` en GitHub** (pendiente de sesiones previas) — activa el CI smoke con sibling checkout (`evolab:smoke`); el job sigue en `continue-on-error` hasta observarlo verde.
- [ ] **(c) Definir el criterio de promoción de élites para cuando Sprint 9 reporte** — propuesta a validar: promover solo candidatos que (i) descubran un finding nuevo (fingerprint inédito) **o** cubran endpoint/evento del catálogo aún sin cubrir, (ii) con expected coherente con lo observado, (iii) sin near-dupe ya promovido; los huecos notables (`critical acknowledge`, `transfer`, `command.resolve`) probablemente requieran **escenarios escritos a mano o un operador nuevo dirigido a catálogo**, porque esta camada no los alcanza.
