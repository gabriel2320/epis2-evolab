# EPIS2 Evolab — Sprint 10: Relaciones metamórficas clínicas (spec)

**Fecha:** 2026-06-10
**Alcance:** especificación previa a implementación del evaluador `metamorphic` (S10.1–S10.4): catálogo de relaciones candidatas para EPIS2, diseño YAML de la declaración, contrato del evaluador, impacto mínimo en orquestador/persistencia, plan de tareas y riesgos.
**Lectura base (solo lectura):** `docs/evolution/EVOLAB_ROADMAP.md` §Sprint 10 · `src/contracts/schemas.ts` · `src/step-engine/{schema,custom-steps}.ts` · `src/evaluators/{census-integrity,audit-completeness,deterministic}.ts` · `src/orchestrator/*` · `src/fitness/coverage-catalog.ts` · `src/evolution/{niches,archive}.ts` · corpus `scenarios/*.yaml` (9) · EPIS2: `apps/api/src/{inpatient,clinical,audit,admin}` + `packages/clinical-domain/src/rbac.ts`.
**Tesis:** una relación metamórfica es un oráculo sin ground truth — declara en YAML una propiedad verificable entre las observaciones de **dos corridas relacionadas** (source / follow-up), y detecta clases de bug que ningún evaluador de un solo run puede ver.

---

## 1. Catálogo de relaciones metamórficas para EPIS2

### 1.1 Resumen priorizado

| ID | Nombre | Tipo | Prioridad | Sprint | Clase de bug que detecta |
|---|---|---|---|---|---|
| MR-01 | Inversión censo admisión→alta | inversión | **P0 (gate)** | S10 | Fuga de camas / censo no restaurado tras ciclo completo |
| MR-02 | Monotonicidad de permisos `draft.approve` | monotonicidad | **P0 (gate)** | S10 | Regresión RBAC — rol sin permiso ejecuta acción privilegiada |
| MR-03 | Idempotencia de acción bloqueada | idempotencia | **P0 (gate)** | S10 | Bypass por reintento / estado fantasma / auditoría que calla en repeticiones |
| MR-04 | Conservación: toda mutación 2xx deja evento de auditoría | conservación | P1 | S10/S11 | Mutación silenciosa — endpoint que escribe sin `appendAudit` |
| MR-05 | MAR — hold cambia el outcome (activa→suspendida) | perturbación de input (monotonicidad sobre estado) | P1 | S10/S11 | Hold ignorado por la vía de aprobación MAR |
| MR-06 | MAR — idempotencia de administración bloqueada | idempotencia | P1 | S11 | Race que permite administrar dosis suspendida al N-ésimo intento |
| MR-07 | Delta de acuse de crítico (k → k−1) + idempotencia del acuse | delta esperado + idempotencia | P1 | S11 | Contador de críticos no decrementa / doble evento `critical.acknowledged` |
| MR-08 | Conservación de lecturas — GET no muta estado clínico | conservación | P2 | S11 | GET con efectos colaterales (acuse implícito, contadores que mutan) |
| MR-09 | Inversión de traslado A→B→A | inversión | P2 | S11/S12 | Transfer que deja dos camas ocupadas o no libera la de origen |
| MR-10 | Simetría de interacciones farmacológicas A↔B (drug-intel) | simetría | **Futura** | S12+ | Asimetría en severidad/existencia de interacción según orden de consulta |

Convención de outcome: «bloqueado» = HTTP ∈ {400, 401, 403, 409, 422} (mismo criterio que `HttpResultEvaluator`); «permitido» = `ok === true`.

### 1.2 Detalle por relación

#### MR-01 — Inversión censo admisión→alta (sembrada en roadmap, S10.2)

- **Tipo:** inversión.
- **Corridas:** el roadmap pide explícitamente que «corra sobre el journey existente» (`admission-discharge-001`). Caso degenerado del par: **source = follow-up = el mismo run** (`selfPair`), comparando dos observaciones del mismo journey. La forma par-de-runs (source = solo admisión; follow-up = solo alta) queda como variante futura cuando el corpus tenga escenarios admit-only.
- **Relación verificable:** `census_snapshot(baseline)` ≍ `census_snapshot(census_after_discharge)` en los campos `{bedCount, occupiedCount, availableCount}`; además `demoPatientListed === false` en ambos extremos y `=== true` en `census_after_admission`.
- **Soporte existente:** custom steps `census_snapshot`, `find_available_bed`, `ensure_patient_not_admitted`; el journey ya emite `census_after_admission` y `census_after_discharge`.
- **Falta:** una observación `census_baseline` al inicio del journey — es **solo YAML** (añadir `custom: census_snapshot {label: census_baseline}` tras `ensure_patient_not_admitted`, que ya garantiza estado limpio). Cero código de steps.
- **Bug real que detectaría:** alta que no libera la cama (`status` queda `occupied`), doble decremento de disponibilidad, censo del dashboard de servicio desincronizado del estado de admisiones — exactamente la familia de incoherencias que `census_integrity` mide en un instante pero no puede ver **a través del ciclo**.
- **Prioridad P0:** es la relación del gate, barata (reusa el journey) y cubre el invariante clínico más visible del tablero de servicio.

#### MR-02 — Monotonicidad de permisos `draft.approve` (sembrada, S10.3)

- **Tipo:** monotonicidad de permisos.
- **Fundamento (EPIS2 `packages/clinical-domain/src/rbac.ts`):** `ROLE_PERMISSIONS` es la única fuente; `physician` y `pharmacist` tienen `draft.approve`; `nurse`, `admin`, `auditor` no. La relación formal: si el rol R_alto observa `allowed` para la acción con permiso p, todo rol R_bajo con `permisos(R_bajo) ⊉ {p}` debe observar `blocked`. Un `allowed` inesperado en el follow-up ⇒ finding RBAC `high`.
- **Corridas:** source = flujo crear+aprobar borrador como `physician` (expected allowed); follow-up = **mismo flow** con `persona.role: nurse` (expected blocked). Es exactamente la transformación del operador `role_swap` del Sprint 8 — sinergia directa: el motor de mutación ya sabe generar el follow-up.
- **Relación verificable:** `outcome(source.actionObservation) = allowed ∧ outcome(followUp.actionObservation) = blocked`. Matriz mínima del roadmap: nurse/physician/admin (3 pares con physician como source).
- **Soporte existente:** `role-nurse-approve-001` es ya la mitad follow-up; `resolveDemoPersona` cubre los roles; la matriz RBAC vive en `mutation/operators.ts` (`ROLE_CATALOG`, `roleCanApproveDrafts`).
- **Falta:** nada de motor. Un escenario source physician-approve corto (YAML puro, los pasos `api` existen) si no se quiere derivar por override de rol.
- **Bug real:** `preHandler` mal aplicado en una ruta nueva, permiso añadido por error a la matriz, wildcard reintroducido (gate EPIS2-03). Es la regresión de mayor severidad del producto (aprobación clínica por rol no autorizado).
- **Prioridad P0:** gate del roadmap, corre en segundos, severidad clínica máxima.

#### MR-03 — Idempotencia de acción bloqueada (sembrada, S10.4)

- **Tipo:** idempotencia.
- **Corridas:** source = `role-nurse-approve-001` (nurse crea nota y el approve devuelve 403); follow-up = **repetir el intento de approve N veces (N=2) sobre el mismo draft** del source.
- **Relación verificable:** (a) mismo status HTTP en todos los intentos; (b) el draft sigue sin estado `approved`; (c) auditoría sin `clinical.draft.approved` para ese `draftId` (correlación por `entityId`, reutilizando la lógica de `audit_completeness`); (d) el número de drafts del paciente no crece entre follow-ups (el reintento no clona).
- **Soporte existente:** flow completo del escenario; `audit_completeness` ya correla eventos prohibidos por `entityId === draftId` de la `actionObservation`; `capture: {draftId}` viaja en contexto.
- **Falta:** (1) que el follow-up pueda **heredar contexto capturado del source** (`draftId`) — ver §2 (`reuseContext`); (2) una observación de conteo de drafts: hoy `observe.payload` solo proyecta claves planas — proponer proyección `count: <ruta>` en el api step o un mini custom step `drafts_count` (decisión en T3 del plan).
- **Bug real:** retry que termina aprobando (race en la verificación de permiso), creación de drafts fantasma por reintento, auditoría que solo registra la primera denegación (las repeticiones silentes son justo lo que un auditor necesita ver).
- **Prioridad P0:** gate del roadmap; reusa `audit_completeness` como pide S10.4.

#### MR-04 — Conservación: toda mutación 2xx deja evento de auditoría

- **Tipo:** conservación.
- **Corridas:** source = flujo de solo lecturas (login + dashboards); follow-up = el mismo flujo **más** una mutación X (p. ej. `POST /api/drafts`). Relación: `auditDelta(followUp) − auditDelta(source)` debe contener exactamente el/los eventos del catálogo correspondientes a X (`clinical.draft.created`), correlacionados por el `entityId` capturado.
- **Relación verificable:** para cada paso `api` mutante (POST/PATCH/PUT/DELETE, criterio ya usado en `niches.ts` → `MUTATING_METHODS`) con respuesta 2xx, existe ≥1 evento de auditoría nuevo correlacionado con la entidad creada/afectada. Mapa endpoint→evento ya existe en `coverage-catalog.ts` (`ENDPOINT_CATALOG` + `AUDIT_EVENT_CATALOG`): la relación es data-driven, no hardcodea pares.
- **Soporte existente:** `captureAuditTrail` (post-run, auditor, `limit=80`), catálogo de eventos S7.
- **Falta:** snapshot de auditoría **pre-run** (cursor: id/fecha del último evento) para computar deltas sin contaminación de otros runs — custom step `audit_snapshot` pequeño, o reutilizar `captureAuditTrail` al inicio con label distinto.
- **Bug real:** endpoint nuevo que escribe sin `appendAudit` (la clase de omisión más probable al crecer la API — p. ej. al cablear drug-intel se pudo olvidar el evento; hoy `admin.drug_intel.reviewed` existe, pero la relación vigila los siguientes). Generaliza `audit_completeness` de «patrones declarados a mano» a «invariante estructural».
- **Prioridad P1:** muy alto valor por bug-class, pero requiere el cursor pre-run; entra si sobra presupuesto S10, si no abre S11.

#### MR-05 — MAR: hold cambia el outcome (activa → suspendida)

- **Tipo:** perturbación controlada de estado (monotonicidad sobre el estado de la dosis).
- **Corridas:** source = flujo MAR con la dosis demo **activa** (fixture `mar_release`: `status='scheduled'`) → la administración/aprobación procede o al menos no es bloqueada por suspensión; follow-up = mismo flujo con fixture `marDoseHeld: true` (el `holdMarScheduledDose` actual) → bloqueada (es `suspended-medication-mar-001` tal cual).
- **Relación verificable:** `outcome(source) = allowed ∧ outcome(followUp) = blocked`, con `mar_alerts` del follow-up mostrando la alerta de suspensión y sin `clinical.draft.approved` para el draft MAR del follow-up.
- **Soporte existente:** `mar_dashboard`, `mar_alerts`, `mar_create_and_approve` (labels `mar_draft_create` / `mar_approve_attempt`); fixture `holdMarScheduledDose` en `sandbox-prep.ts`.
- **Falta:** el fixture inverso `releaseMarScheduledDose` (`UPDATE mar_scheduled_doses SET status='scheduled'`) — espejo de 10 líneas del hold existente; y `fixtures.resetBetween` por relación (§4) para garantizar el estado de cada mitad del par.
- **Bug real:** la vía de aprobación MAR que consulta el estado de la dosis en un punto distinto al que el fixture muta (hold visible en dashboard pero no en la validación del approve) — el bug clínico de medicación suspendida administrada, prioridad de seguridad del producto.
- **Prioridad P1:** primera relación que demuestra el patrón «par por perturbación de fixture»; pide un fixture nuevo pero trivial.

#### MR-06 — MAR: idempotencia de administración bloqueada

- **Tipo:** idempotencia.
- **Corridas:** source = `suspended-medication-mar-001`; follow-up = repetir `mar_create_and_approve` N veces con la dosis aún held.
- **Relación verificable:** todos los intentos bloqueados con el mismo status; `mar_dashboard` re-observado mantiene la dosis `held` y el mismo número de dosis programadas; auditoría sin `clinical.draft.approved` para ningún draft MAR del par; los drafts creados y rechazados crecen exactamente N (cada intento crea su draft pero ninguno se aprueba — el delta esperado se declara, no se asume cero).
- **Soporte existente:** todo el flujo MAR; `audit_completeness`.
- **Falta:** igual que MR-03 (conteo y herencia de contexto); nada específico de MAR.
- **Bug real:** condición de carrera donde el segundo intento encuentra la verificación de suspensión cacheada/stale y aprueba; acumulación de drafts colgantes que ensucian el MAR de enfermería.
- **Prioridad P1:** variante MAR del patrón MR-03; entra naturalmente después de que MR-03 esté verde.

#### MR-07 — Delta de acuse de resultado crítico + idempotencia del acuse

- **Tipo:** delta esperado + idempotencia.
- **Corridas:** source = fixture `resetCriticalPendingAcknowledgement` + snapshot `unacknowledgedCriticalCount = k` (ya lo expone `census_snapshot`/`service_criticals`); follow-up = `POST /api/inpatient/critical-results/{criticalId}/acknowledge` como physician + re-snapshot.
- **Relación verificable:** (a) `unacknowledgedCriticalCount(followUp) = k − 1`; (b) evento `critical.acknowledged` presente y correlacionado con `criticalId`; (c) segundo acknowledge del mismo crítico no genera segundo evento ni decrementa de nuevo (idempotencia del acuse — hoy devuelve el registro ya acusado o 404; cualquiera de los dos es aceptable, lo inaceptable es doble evento).
- **Soporte existente:** fixture de reset ya implementado en `sandbox-prep.ts`; `service_criticals` y `census_snapshot` exponen el contador; el endpoint existe en EPIS2 (`inpatient/routes.ts`).
- **Falta:** capturar un `criticalId` accionable — `service_criticals` observa pero no captura id; extensión menor (un `capture` en el custom step o api step directo con el `criticalResultId` del fixture, que ya es conocido).
- **Bug real:** contador del dashboard que no decrementa (lo que `discharge-critical-pending-001` ya encontró en versión estática), acuse duplicado con doble evento de auditoría.
- **Prioridad P1 con bonus de cobertura:** `POST .../acknowledge` y `critical.acknowledged` están entre los **13 endpoints / 7 eventos sin cubrir** del `fitness report` — esta relación cierra un hueco notable del mapa S7 a la vez que añade un oráculo.

#### MR-08 — Conservación de lecturas: GET no muta estado clínico

- **Tipo:** conservación (idempotencia de lecturas).
- **Corridas:** source = `census_snapshot` + cursor de auditoría; follow-up = ráfaga de los mismos GET (dashboards, longitudinal, results-inbox) + re-snapshot.
- **Relación verificable:** censo idéntico campo a campo declarado; el delta de auditoría contiene **solo** eventos de tipo lectura/sesión (allowlist: `auth.login.success`, `dashboard.opened`); ningún evento mutante nuevo.
- **Falta:** cursor pre-run de auditoría (compartido con MR-04).
- **Bug real:** lectura con efecto colateral (acuse implícito al abrir el panel, contadores que escriben). Barata y de amplio espectro; además da cobertura a GET hoy no tocados (`results-inbox`, `longitudinal` — ambos en los huecos del mapa).
- **Prioridad P2:** entra cuando exista el cursor de MR-04.

#### MR-09 — Inversión de traslado A→B→A

- **Tipo:** inversión (composición con identidad).
- **Corridas:** source = admitir en cama A + snapshot; follow-up = `transfer` a cama B + `transfer` de vuelta a A + snapshot.
- **Relación verificable:** censo final ≍ censo post-admisión (misma cama ocupada por el paciente, mismas disponibles); auditoría con exactamente 2 eventos `inpatient.transferred` correlacionados con la admisión.
- **Soporte existente:** endpoint `POST /api/inpatient/admissions/:admissionId/transfer` (body `targetBedId`) existe en EPIS2; `find_available_bed` encuentra camas.
- **Falta:** `find_available_bed` captura siempre la clave fija `bedId` — una segunda invocación pisaría la primera; extensión menor `args.captureAs` (o excluir la cama actual). Es la única relación del catálogo que pide tocar un custom step existente.
- **Bug real:** traslado que ocupa la cama destino sin liberar la origen (doble ocupación) — incoherencia que `census_integrity` vería como `availableWithPatient/occupiedWithoutPatient` solo si mira en el instante correcto; la inversión la fuerza.
- **Prioridad P2 con bonus de cobertura:** `transfer` + `inpatient.transferred` son huecos notables del mapa S7.

#### MR-10 — Simetría de interacciones farmacológicas A↔B (drug-intel) — FUTURA

- **Tipo:** simetría.
- **Estado del módulo (verificado en EPIS2, `apps/api/src/admin/routes.ts` + `packages/contracts/src/drugIntel.ts`):** drug-intel (MF-183) expone hoy `GET /api/admin/drug-intel` (listado de staging, permiso `audit.read`), `POST /api/admin/drug-intel/:id/review` y `POST /api/admin/drug-intel/promote` (permiso `admin.catalogs.write`, eventos `admin.drug_intel.reviewed`). El `drugIntelRecordSchema` tiene `warnings`, `adverseReactions`, `correlation` — **no existe aún campo ni endpoint de interacciones par-a-par**.
- **Relación futura:** cuando exista consulta de interacción (p. ej. `GET /api/admin/drug-intel/interactions?a=X&b=Y` o campo `interactions[]` en el record), verificar `interaction(A,B) ≡ interaction(B,A)` en existencia y severidad, para pares del staging `approved`.
- **Utilizable hoy (interina, opcional):** monotonicidad RBAC sobre drug-intel — `review` permitido solo con `admin.catalogs.write` (admin) y bloqueado para physician/nurse — es una instancia más de MR-02 con otro permiso; y conservación MR-04 sobre `admin.drug_intel.reviewed`.
- **Prioridad: futura** — declarar el YAML como borrador `candidates/` marcado `requiresHumanReview: true` y activarla cuando el endpoint exista (el detector de nichos inalcanzables de S12 la levantará solo).

---

## 2. Diseño YAML de la declaración

### 2.1 Opciones evaluadas

**Opción A — archivo de relación independiente (`kind: metamorphic`)** que referencia escenarios existentes por id, con overrides por mitad del par.

| Pros | Contras |
|---|---|
| Reusa el corpus (9 escenarios + `candidates/`) sin duplicar flows | Indirección: si un escenario referenciado cambia labels, la relación rompe (mitigable con dry-run estático) |
| La relación es un **artefacto de primera clase**: mutable por el motor S8 como segundo genoma (cambiar el par, el rol del follow-up, el N de repeticiones) sin tocar los escenarios | Loader y validación nuevos (un archivo Zod + resolución de referencias) |
| Composición N×M: una relación nueva = 1 archivo pequeño; MR-02 sobre 3 roles = 3 archivos de ~20 líneas | Dos tipos de archivo en `scenarios/` (separable en `scenarios/relations/`) |
| Encaja en MAP-Elites como nuevo tipo de resultado sin tocar el genoma escenario | — |

**Opción B — bloque `followUp:` dentro de un escenario.**

| Pros | Contras |
|---|---|
| Un solo archivo, un solo genoma; loader casi sin cambios | Duplica el flow del follow-up cuando es un escenario que ya existe (MR-02/MR-03 reusan `role-nurse-approve-001` tal cual) |
| Mutación S8 opera sobre una unidad | Acopla la relación a **un** escenario: una relación entre dos escenarios del corpus obliga a copiar uno dentro del otro |
| — | `ScenarioDefinitionSchema` engorda con un campo que el 90% de los escenarios no usa; el dry-run S8 tendría que validar dos flows anidados |

**Recomendación: Opción A** — archivo de relación independiente en `scenarios/relations/*.yaml`, con dos concesiones pragmáticas: (1) `followUp` es **opcional** — su ausencia declara `selfPair` (la relación se verifica entre dos observaciones del mismo run, que es exactamente lo que pide S10.2 para la inversión sobre el journey existente); (2) cada mitad admite `overrides` acotados (persona, expected, fixture) para derivar el source de un escenario existente sin archivo extra — el override de rol es literalmente el operador `role_swap` de S8 aplicado en runtime.

### 2.2 Esquema propuesto (`MetamorphicRelationSchema`, Zod)

```yaml
id: <string>                  # mr-*-001
version: 1
kind: metamorphic             # discrimina del ScenarioDefinitionSchema
relation: inversion | permission_monotonicity | idempotence | conservation | symmetry
name: <string>
risk: low | medium | high

source:
  scenario: <scenarioId>      # debe existir en scenarios/ o candidates/
  overrides:                  # opcional, subset acotado
    persona: { role: physician }
    expected: { actionBlocked: false }
    fixture: { marDoseHeld: false }

followUp:                     # opcional → selfPair si falta
  scenario: <scenarioId>
  repeat: 1                   # N follow-ups (idempotencia)
  reuseContext: [draftId]     # claves capturadas del source inyectadas al contexto del follow-up
  resetFixturesBetween: false # ver §4

verify:                       # lista de cláusulas; todas deben pasar
  - compare: snapshot_equal | outcome_implication | delta | invariant_repeat | audit_delta
    # ... parámetros por comparador, ver §3.2

onViolation:
  severity: high
  category: metamorphic_<relation>

requiresHumanReview: true     # las relaciones nacen como todo lo generado/evolucionable
tags: [metamorphic, smoke]
```

### 2.3 Ejemplos completos de las 3 relaciones P0

**MR-01 — `scenarios/relations/mr-census-inversion-001.yaml`** (selfPair sobre el journey; requiere añadir `census_baseline` al journey — cambio YAML-only en `admission-discharge-001`, versión 2):

```yaml
id: mr-census-inversion-001
version: 1
kind: metamorphic
relation: inversion
name: Inversión — admitir y dar de alta devuelve el censo a baseline
risk: high

source:
  scenario: admission-discharge-001   # selfPair: sin followUp

verify:
  - compare: snapshot_equal
    left:  { run: source, observation: census_baseline }
    right: { run: source, observation: census_after_discharge }
    fields: [bedCount, occupiedCount, availableCount]
  - compare: invariant_repeat
    observation: census_after_discharge
    field: demoPatientListed
    equals: false
  - compare: invariant_repeat
    observation: census_after_admission
    field: demoPatientListed
    equals: true

onViolation: { severity: high, category: metamorphic_inversion }
requiresHumanReview: true
tags: [metamorphic, census, smoke]
```

**MR-02 — `scenarios/relations/mr-permission-monotonicity-001.yaml`** (par real; el source deriva por override de rol del mismo flow):

```yaml
id: mr-permission-monotonicity-001
version: 1
kind: metamorphic
relation: permission_monotonicity
name: Monotonicidad — si physician aprueba, nurse (sin draft.approve) debe ser bloqueado
risk: high

source:
  scenario: role-nurse-approve-001
  overrides:
    persona: { role: physician }
    expected: { actionBlocked: false }

followUp:
  scenario: role-nurse-approve-001    # tal cual: nurse, actionBlocked: true

verify:
  - compare: outcome_implication
    premise:    { run: source,   observation: nurse_approve_attempt, outcome: allowed }
    conclusion: { run: followUp, observation: nurse_approve_attempt, outcome: blocked }
    permission: draft.approve         # documenta la arista RBAC verificada

onViolation: { severity: high, category: metamorphic_rbac }
requiresHumanReview: true
tags: [metamorphic, rbac, smoke]
```

**MR-03 — `scenarios/relations/mr-blocked-idempotence-001.yaml`** (par con repetición y herencia de contexto):

```yaml
id: mr-blocked-idempotence-001
version: 1
kind: metamorphic
relation: idempotence
name: Idempotencia — repetir un approve bloqueado no cambia estado ni omite auditoría
risk: medium

source:
  scenario: role-nurse-approve-001

followUp:
  scenario: role-nurse-approve-001
  repeat: 2
  reuseContext: [draftId]             # el follow-up reintenta sobre el MISMO draft
  resetFixturesBetween: false

verify:
  - compare: invariant_repeat
    observation: nurse_approve_attempt
    field: status                     # mismo HTTP status en source y cada follow-up
  - compare: audit_delta
    forbidden: [clinical.draft.approved]
    correlateBy: draftId              # entityId === draftId (lógica de audit_completeness)
  - compare: delta
    observation: drafts_count         # requiere proyección count (T3)
    field: total
    expected: 0                       # los reintentos no crean drafts nuevos

onViolation: { severity: high, category: metamorphic_idempotence }
requiresHumanReview: true
tags: [metamorphic, rbac, audit, smoke]
```

Nota: con `reuseContext`, el flow del follow-up debe saltar los pasos de creación ya satisfechos por el contexto heredado. Regla simple y determinista para S10: un paso `api` cuyo `capture` ya está completo en el contexto heredado se omite (mismo principio que `ensure_patient_not_admitted` usa para idempotencia de precondición). Documentado en el dry-run.

### 2.4 Compatibilidad con Sprint 8 (mutación) y Sprint 9 (MAP-Elites)

- **Mutación:** la relación es un **segundo genoma**, más pequeño y barato que el escenario. Operadores naturales: `relation_role_swap` (cambia el rol del override — reusa la matriz RBAC), `relation_retarget` (apunta source/followUp a otro escenario compatible del corpus — validado por dry-run), `relation_repeat_perturbation` (N de idempotencia). Todos validables con el mismo pipeline Zod + dry-run; el dry-run estático añade: el escenario referenciado existe, los labels de `verify` existen en su flow, las claves de `reuseContext` son `capture` reales del source. Una relación mutada inválida se descarta igual que un escenario inválido.
- **MAP-Elites:** las relaciones entran al archivo como **nuevo tipo de resultado**: añadir `metamorphic` a `NICHE_OUTCOMES` (el espacio pasa de 3×5×3=45 a 3×5×4=60 celdas; `enumerateNiches`, `parseNicheKey` y el repositorio lo absorben sin migración — la clave del nicho es texto). El rol del nicho = `persona.role` del follow-up (el lado «interesante» del par); el módulo = módulo primario del escenario source (reusa `scenarioPrimaryModule`). El fitness de una relación suma una dimensión propia: `violationsFound` (una relación que detecta violaciones reales vale más que una que siempre pasa). Élites de relación se promueven por humano igual que escenarios (S9.4, `candidates/` → PR).

---

## 3. Diseño del evaluador `metamorphic`

### 3.1 Contrato de entrada

El evaluador **no** es un `DeterministicEvaluator` más dentro de un run (esos reciben las observaciones de un solo run): es un evaluador **de par**, ejecutado por el pair-runner (§4) después de que ambos runs terminan, con este contexto:

```ts
export type MetamorphicEvaluatorContext = {
  relation: MetamorphicRelation;            // YAML parseado (Zod)
  correlationId: string;
  source: PairSide;
  followUps: PairSide[];                    // [] en selfPair; length === repeat
};

export type PairSide = {
  runId: string;
  scenarioId: string;
  observations: ScenarioObservation[];      // mismas que consume todo evaluador
  evidenceDir: string;
  finalStatus: RunStatus;
};
```

Devuelve `EvaluationResult[]` (uno por cláusula `verify`, `evaluatorId: 'metamorphic'`, `details.clause` con el comparador) y, si hay violación, un `Finding` correlacionado (§3.4). Si cualquier run del par terminó `failed` por infraestructura, el resultado es `passed: false, severity: 'info', message: 'par no evaluable'` — **no** es violación (evita findings falsos por sandbox caído, mismo espíritu que la degradación a null del novelty S7).

### 3.2 Tipos de comparación

| Comparador | Semántica | Parámetros | Relaciones que lo usan |
|---|---|---|---|
| `snapshot_equal` | Igualdad de un subconjunto **declarado** de campos entre dos observaciones (nunca el payload completo) | `left`, `right` (run+observation), `fields[]`, `tolerance?` (numérica, default 0) | MR-01, MR-08, MR-09 |
| `outcome_implication` | Si la premisa observa el outcome declarado, la conclusión debe observar el suyo; premisa falsa ⇒ cláusula `passed` con `details.vacuous: true` (y warning — un source que no logra `allowed` no verifica nada) | `premise`, `conclusion` ({run, observation, outcome: allowed\|blocked}), `permission?` | MR-02, MR-05 |
| `delta` | Diferencia numérica esperada de un campo entre source y follow-up | `observation`, `field`, `expected` (entero, admite negativos) | MR-07 (−1), MR-03 (0) |
| `invariant_repeat` | Un campo es idéntico en source y todos los follow-ups (o igual a `equals` si se declara) | `observation`, `field`, `equals?` | MR-03, MR-06, MR-01 |
| `audit_delta` | Sobre el delta de auditoría del par: `required[]` (eventos que deben aparecer) y `forbidden[]` (que no), correlacionados por `correlateBy` (clave de contexto → `entityId`), nunca globalmente | `required?`, `forbidden?`, `correlateBy` | MR-03, MR-04, MR-06, MR-07 |

Los cinco comparadores son funciones puras sobre `ScenarioObservation[]` — testeables con observaciones simuladas igual que `census_integrity` y `audit_completeness` hoy.

### 3.3 No-determinismo del sandbox: qué normalizar

| Fuente de ruido | Tratamiento |
|---|---|
| Timestamps (`capturedAt`, `*At` en bodies, fechas de drafts) | Excluidos por diseño: solo se comparan los `fields` declarados; ningún comparador acepta campos `*At` (lint del dry-run lo rechaza) |
| Ids generados (draftId, admissionId, eventos de auditoría) | Nunca se comparan por valor entre runs; se usan para **correlacionar** (`correlateBy`), reutilizando `UUID_RE`/`normalizeApiPath` del catálogo S7 para canonicalizar paths en evidencia |
| Trail de auditoría compartido (otros runs escriben en paralelo) | Solo deltas correlacionados por `entityId` + ventana del par; jamás conteos globales (`eventCount` queda prohibido como campo comparable) |
| Censo compartido (otra sesión admite/da de alta en la misma unidad) | Comparar solo los campos declarados; `tolerance` numérica opcional; política principal en §6 (re-verificación antes de finding) |
| Orden de listas (camas, eventos) | Comparación order-insensitive con clave estable (`bedId`, `eventType+entityId`) cuando un comparador futuro necesite listas; en S10 ningún comparador compara listas completas |

### 3.4 Violación como finding

- **`category`:** `metamorphic_<relation>` (p. ej. `metamorphic_rbac`); **`severity`:** la declarada en `onViolation` (RBAC = `high` por mandato del roadmap S10.3; inversión de censo = `high`; idempotencia = `medium` salvo que la violación sea un `approved` fantasma ⇒ `high` — el evaluador escala si `audit_delta.forbidden` dispara).
- **Evidencia de ambos runs:** `evidenceIds` concatena las evidencias relevantes de source y follow-ups; `details` incluye `{correlationId, sourceRunId, followUpRunIds, clause, leftValue, rightValue}`. `FindingSchema` no cambia: el finding ancla en `runId` del follow-up (donde se materializa la violación) y el par viaja en details/evidence.
- **`fingerprint`:** hash de `(relationId, clause.compare, campos normalizados de left/right)` — dedup estable entre corridas (reusa `findings/fingerprint.ts`).
- **`reproducible`:** el par se re-ejecuta con los mismos seeds (`randomSeed` derivado del correlationId) antes de confirmar — ver §6.
- **`recommendedAction`:** `human_review` siempre (las relaciones nacen `requiresHumanReview: true`; el judge S11 las triará pero no decide).

---

## 4. Impacto en orquestador y persistencia (mínimo, sin refactor)

El principio: **el orquestador no aprende qué es un par**. Un módulo nuevo `metamorphic/pair-runner.ts` se sienta encima y llama `executeRun` dos (o N+1) veces. Cambios concretos:

1. **`OrchestratorResult.observations` (1 línea):** `runOnce` ya tiene `bundle.observations` en mano al construir el resultado; exponerlas en el retorno evita que el pair-runner re-lea evidencia de disco. Único cambio dentro de `orchestrator.ts`.
2. **`correlationId` sin cambio de schema:** `EvolutionRunSchema.configuration` (record libre, ya existe) lleva `{correlationId, pairRole: 'source'|'followUp', relationId, pairIndex}`. El pair-runner genera el correlationId (uuid) y lo pasa vía las opciones existentes de `executeRun` (extender `ExecuteRunOptions` con `configuration?` — aditivo).
3. **Orden y fail-fast:** estrictamente secuencial source → followUp(s) (minimiza la ventana de interferencia del sandbox compartido). Si el source falla por infraestructura (`isTransientError` ya distingue), el par aborta sin follow-ups y sin finding.
4. **Herencia de contexto (`reuseContext`):** el pair-runner extrae del source las claves declaradas (están en las observaciones/captures del bundle) y las inyecta como contexto inicial del follow-up — punto de extensión en `executeScenario`/step-engine que hoy ya arranca contexto desde fixture + demo case; es añadir una fuente más, no refactor.
5. **Reset de fixtures entre source y follow-up — por relación, no global:** `followUp.resetFixturesBetween` (default `false`). MR-01 selfPair: n/a. MR-02: `false` (cada run crea su propio draft; estado compartido irrelevante). MR-03/MR-06: `false` obligatorio (la idempotencia exige conservar el estado). MR-05: `true` (re-asegurar `held`/`scheduled` según mitad — es la relación cuyo input ES el fixture). MR-07: reset **antes del source** únicamente. El pair-runner reusa `runFixturePhase`/`prepareScenarioFixture` tal cual.
6. **Persistencia (best-effort, patrón S7):** migración siguiente de `epis2_evolab` con (a) columna `correlation_id` nullable en la tabla de runs, y (b) tabla `evolution.metamorphic_pairs` (`relation_id, correlation_id, source_run_id, follow_up_run_ids[], passed, violated_clauses jsonb, created_at`). Las `EvaluationResult` del evaluador se persisten como las demás (asociadas al run follow-up). Si la DB no está, todo queda en filesystem como hoy (`persistRun` ya degrada con warning).

CLI: `evolab metamorphic <relationId>` + `evolab metamorphic --tag smoke` (espejo de `run --tag smoke`).

## 5. Plan de implementación S10

| # | Tarea | Contenido | Estimación relativa |
|---|---|---|---|
| T1 | Schema + loader + dry-run de relaciones | `MetamorphicRelationSchema` (Zod), loader de `scenarios/relations/`, dry-run estático: referencias resuelven, labels de `verify` existen en los flows, `reuseContext` ⊆ captures del source, campos `*At` prohibidos | **M** |
| T2 | Pair-runner + correlación | `metamorphic/pair-runner.ts`, `OrchestratorResult.observations`, `ExecuteRunOptions.configuration`, herencia de contexto, `resetFixturesBetween`, CLI `evolab metamorphic` | **M** |
| T3 | Evaluador `metamorphic` | 5 comparadores puros + normalización + finding correlacionado + escalado de severidad; proyección `count` en api step (o custom step `drafts_count`); tests unitarios con observaciones simuladas (patrón `sprint5-evaluators.test.ts`) | **L** |
| T4 | Relaciones P0 en YAML | `mr-census-inversion-001`, `mr-permission-monotonicity-001`, `mr-blocked-idempotence-001` + `census_baseline` en `admission-discharge-001` (v2, YAML-only) | **S** |
| T5 | Persistencia | Migración (correlation_id + `metamorphic_pairs`), escritura best-effort en el pair-runner | **S** |
| T6 | CI smoke | Paso `evolab metamorphic --tag smoke` en el job `smoke` de `ci.yml`; ajuste de timeout (abajo) | **S** |

Orden: T1 → T2 → T3 (T4 y T5 en paralelo desde que T1 está) → T6.

### Gate medible (validado contra el CI actual)

El roadmap pide «3 relaciones corriendo en CI smoke». Contraste con `.github/workflows/ci.yml`: el job `smoke` tiene **timeout 8 min**, `continue-on-error: true`, browser off, sin Ollama, y hoy ejecuta `run --tag smoke` (escenarios cortos, segundos por run). Costo añadido del gate: MR-02 = 2 runs cortos; MR-03 = 3 runs cortos; MR-01 selfPair = 1 run del journey (`timeoutMs: 120000`, `maxAttempts: 2`). Peor caso ≈ +6 runs ≈ +3–4 min sobre un job que ya consume varios en `npm ci` ×2 + migrate + arranque API.

**Gate propuesto (ajustado):** las **3 relaciones P0 verdes en CI smoke**, con dos condiciones: (1) subir `timeout-minutes` del job smoke de 8 → **12**; (2) `maxAttempts: 1` para el journey de MR-01 dentro del par en CI (el retry del par lo gobierna el pair-runner, no el run). Si la latencia observada del journey en CI lo desmiente, el fallback documentado es: MR-02 + MR-03 en CI smoke y MR-01 en el gate local (`npm run evolab:smoke` extendido) — pero se intenta primero el gate completo.

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Estado compartido del sandbox** (otra sesión/agente usa la misma API :3001 y muta censo/auditoría durante el par) | Falsos positivos — la peor deuda posible de un oráculo nuevo | (a) comparar solo campos declarados y deltas correlacionados por `entityId`, nunca globales; (b) source→followUp back-to-back (ventana mínima); (c) **re-verificación antes de finding**: el pair-runner repite el par 1 vez ante violación (estado `reproducing` ya existe en `RunStatusSchema`) y solo confirma si la violación se repite; (d) lock file local del pair-runner para no solapar pares de la misma estación; (e) `tolerance` declarable en `snapshot_equal` como última válvula, default 0 |
| **Costo de ejecutar pares** (2–3× runs por relación) | Presupuesto nocturno S9 y CI comprimidos | Pares solo para corpus + élites promovidos (no para cada candidato de mutación); selfPair donde la relación lo permite (MR-01); en CI solo los 3 P0 con tag `smoke`; el fitness de relación registra `durationMs` del par completo para que el costo pese en la selección |
| Trail de auditoría global con `limit=80` se queda corto en pares largos | `audit_delta` evalúa sobre ventana incompleta | Cursor pre-run (custom step `audit_snapshot`, también requisito de MR-04) y elevar `limit` solo en la captura del par; mientras tanto correlación por `entityId` reduce el daño |
| Premisa vacua en monotonicidad (el source physician falla por otra razón y la implicación «pasa» sin verificar nada) | Falsa sensación de cobertura RBAC | `outcome_implication` marca `details.vacuous: true` y el reporte de fitness cuenta relaciones vacuas como no-cobertura; en CI una premisa vacua falla el gate (el source debe ser allowed) |
| Relaciones mutadas (S8 sobre el segundo genoma) generan pares sin sentido | Ruido en el archivo | Dry-run estático de referencias/labels obligatorio (T1) + las relaciones mutadas nacen en `candidates/` con `requiresHumanReview: true`, nunca en `scenarios/relations/` directo (política S9.4 idéntica) |
| Herencia de contexto (`reuseContext`) acopla el follow-up a detalles internos del source | Fragilidad al evolucionar escenarios | Claves heredables restringidas a captures declarados (validado en dry-run); si el capture desaparece del source, la relación falla en dry-run, no en runtime |

---

## Próximo paso inmediato

T1 (`MetamorphicRelationSchema` + dry-run): es el contrato del que cuelgan pair-runner y evaluador, y deja el diseño YAML congelado antes de escribir comparadores. El primer par en verde debe ser MR-02 (runs más cortos, severidad máxima, sinergia directa con `role_swap` de S8).
