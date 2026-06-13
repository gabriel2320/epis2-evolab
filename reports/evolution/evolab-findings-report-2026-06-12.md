# EPIS2 Evolab — Informe de hallazgos

**Generado:** 2026-06-12T23:42:59.620Z
**Contexto:** post F5 extendido `f5-1781261389000`

> Judge **no cierra** `review_status`. Todos los open requieren decisión humana.

---

## Resumen cola open

| Métrica | Count |
|---------|------:|
| **Total open** | **197** |
| signal (judge) | 141 |
| noise (judge) | 56 |
| duplicate (judge) | 0 |
| sin judge | 0 |

---

## Por categoría (open)

| Categoría | Total | Signal |
|-----------|------:|-------:|
| clinical_safety | 104 | 94 |
| authorization | 66 | 26 |
| audit_trail | 23 | 17 |
| regression | 2 | 2 |
| ui_consistency | 2 | 2 |

---

## Por escenario (open, top signal)

| Escenario | Total | Signal | Noise | Dup | Sin judge |
|-----------|------:|-------:|------:|----:|----------:|
| admission-discharge-001-m8cx-008-m8cx-004 | 18 | 17 | 1 | 0 | 0 |
| admission-discharge-001-m8cx-008-m8rs-037 | 12 | 12 | 0 | 0 | 0 |
| admission-discharge-001-m8cx-008-m8rs-025-m8rs-005 | 13 | 11 | 2 | 0 | 0 |
| admission-discharge-001-m8cx-008-m8rs-013 | 11 | 11 | 0 | 0 | 0 |
| admission-discharge-001-m8cx-008-m8si-039 | 10 | 10 | 0 | 0 | 0 |
| admission-discharge-001-m8rs-001 | 9 | 9 | 0 | 0 | 0 |
| admission-discharge-001-m8cx-008-m8rs-025 | 8 | 8 | 0 | 0 | 0 |
| admission-discharge-001-m8cx-008 | 6 | 6 | 0 | 0 | 0 |
| admission-double-booking-001-m8cx-004 | 6 | 6 | 0 | 0 | 0 |
| admission-discharge-001-m8cx-008-m8rs-001 | 5 | 5 | 0 | 0 | 0 |
| admission-double-booking-001-m8cx-004-m8si-023 | 4 | 4 | 0 | 0 | 0 |
| role-evolution-sign-001-m8rs-021 | 4 | 3 | 1 | 0 | 0 |
| admission-discharge-001-m8cx-009 | 3 | 3 | 0 | 0 | 0 |
| admission-double-booking-001-m8cx-004-m8pp-014 | 3 | 3 | 0 | 0 | 0 |
| discharge-critical-pending-001-m8pp-006-m8pp-010 | 5 | 2 | 3 | 0 | 0 |
| admission-discharge-001-m8cx-004 | 4 | 2 | 2 | 0 | 0 |
| admission-discharge-001-m8cx-008-m8si-031 | 4 | 2 | 2 | 0 | 0 |
| admission-double-booking-001-m8cx-004-m8si-027 | 2 | 2 | 0 | 0 | 0 |
| discharge-critical-pending-001-m8rs-021 | 2 | 2 | 0 | 0 | 0 |
| discharge-critical-pending-001-m8si-023 | 2 | 2 | 0 | 0 | 0 |

---

## Top signal — revisión humana prioritaria

### admission-double-booking-001-m8cx-004 — clinical_safety

- **ID:** `06f2e304-3b23-4eb7-ab53-c8bf6be5b370`
- **Escenario:** admission-double-booking-001-m8cx-004
- **Severidad:** critical · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `25cfbfe37b34dcd3`
- **Rationale:** El hallazgo describe una violación de la regla clínica donde un resultado crítico fue aprobado sin acuse, lo cual es un error crítico en la seguridad clínica. La severidad es crítica y el conf evaluador es alto (0.95), lo que refuerza que es un hallazgo accionable. Además, hay evidencia de que el sistema no está aplicando la regla clínica en la UI/API, lo que confirma que es un bug real. No hay co

### llm-command-evolution-001 — command_resolve

- **ID:** `4ee8e0fb-8d0e-4564-a457-768b82192613`
- **Escenario:** llm-command-evolution-001
- **Severidad:** high · **Categoría:** regression
- **Prioridad judge:** 1
- **Fingerprint:** `bd1390f420e6a892`
- **Rationale:** El hallazgo describe una falta de respuesta del evaluador command_resolve en un escenario de evolución de comandos LLM, lo cual representa una falla en la ejecución del plan esperado. La severidad high y la confianza del evaluador (0.85) indican un posible error crítico en la lógica del sistema. No hay evidencia de duplicado ni de ruido claro, por lo que se clasifica como señal accionable.

### llm-command-evolution-001 — plan_fidelity

- **ID:** `b69cf6ba-8ce3-4cba-b0ca-ded012621138`
- **Escenario:** llm-command-evolution-001
- **Severidad:** high · **Categoría:** regression
- **Prioridad judge:** 1
- **Fingerprint:** `c8a26389121b941c`
- **Rationale:** El hallazgo describe una falla en la ejecución del plan de evaluación 'plan_fidelity' en el escenario 'llm-command-evolution-001', con evidencia clara de que no se registró ninguna ejecución del plan. La severidad es alta y la confianza del evaluador es 0.85, lo que sugiere un problema real en la implementación del sistema. No hay coincidencia con hallazgos previos del mismo fingerprint, por lo qu

### admission-discharge-001-m8rs-001 — functional

- **ID:** `93bd475d-21d7-42fe-9dab-dac6352845fd`
- **Escenario:** admission-discharge-001-m8rs-001
- **Severidad:** high · **Categoría:** authorization
- **Prioridad judge:** 1
- **Fingerprint:** `50df1d69aac96d12`
- **Rationale:** El hallazgo describe una situación donde el proceso de alta (discharge) se completó con HTTP 200, a pesar de que se esperaba un bloqueo (HTTP 403 o 400). Esto sugiere que el sistema no está bloqueando la alta cuando debería, lo cual es un comportamiento inesperado y potencialmente crítico. Además, el hallazgo no coincide con el historial de fingerprints previos, lo que lo hace único en este contex

### admission-double-booking-001-m8cx-004 — cdr_consistency

- **ID:** `af30e7d6-6982-4d99-99bb-40db43fc1929`
- **Escenario:** admission-double-booking-001-m8cx-004
- **Severidad:** high · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `f0afe0d70dada190`
- **Rationale:** El hallazgo describe una desincronización entre la fuente de resultados críticos y el sistema de alertas clínicas (clinical-alerts), lo cual representa un riesgo para la seguridad clínica. La severidad es alta y el evaluador cdr_consistency identifica una discrepancia en el comportamiento esperado. No hay evidencia de que este sea un falso positivo o duplicado de un hallazgo ya resuelto. Este hall

### admission-double-booking-001-m8cx-004 — functional

- **ID:** `fc37a66c-fe69-4cc4-a5ab-308b6e02daa0`
- **Escenario:** admission-double-booking-001-m8cx-004
- **Severidad:** high · **Categoría:** authorization
- **Prioridad judge:** 1
- **Fingerprint:** `9915da53fd892db6`
- **Rationale:** El hallazgo describe una situación donde un paciente con resultado crítico no fue acusado, lo que representa un riesgo clínico significativo. Aunque el evaluador funcional no identificó el error, otros evaluadores como clinical_safety y cdr_consistency lo confirmaron. La severidad high y la confianza del evaluador (0.85) indican que es un hallazgo relevante que requiere atención humana.

### admission-double-booking-001-m8cx-004 — audit_completeness

- **ID:** `108ac776-501d-4462-a0f9-f574bb409f49`
- **Escenario:** admission-double-booking-001-m8cx-004
- **Severidad:** high · **Categoría:** audit_trail
- **Prioridad judge:** 1
- **Fingerprint:** `303642d4786fe652`
- **Rationale:** El hallazgo describe un evento prohibido en la auditoría (clinical.draft.approved) que no debería haber ocurrido, lo cual es un indicativo de una brecha en la seguridad auditiva. Este hallazgo se relaciona con otros problemas en el mismo escenario, como la falta de acuse de resultados críticos y desincronización entre CDR y clinical-alerts, lo que sugiere un patrón de errores en la gestión de even

### admission-discharge-001-m8cx-008 — functional

- **ID:** `4d8be5a5-2b64-4307-8709-c4f4af157982`
- **Escenario:** admission-discharge-001-m8cx-008
- **Severidad:** high · **Categoría:** authorization
- **Prioridad judge:** 1
- **Fingerprint:** `36f99e24a9f862a5`
- **Rationale:** El evaluador functional esperaba un bloqueo (HTTP 403) al intentar realizar una acción de alta (discharge) en un paciente que aún no está admitido, pero el sistema devolvió HTTP 200, lo cual indica que la lógica de autorización no está funcionando como se esperaba. Este es un bug real que afecta la seguridad del sistema y requiere revisión humana.

### admission-discharge-001-m8rs-001 — functional

- **ID:** `1c0b218b-ea61-4b39-9c88-93a2f22cc0fe`
- **Escenario:** admission-discharge-001-m8rs-001
- **Severidad:** high · **Categoría:** authorization
- **Prioridad judge:** 1
- **Fingerprint:** `50df1d69aac96d12`
- **Rationale:** El finding describe una situación donde el sistema no bloquea la alta de un paciente (HTTP 200) cuando se esperaba un bloqueo (true). Este comportamiento no coincide con el expected, lo que sugiere un error en la lógica de autorización. Además, el hallazgo no se repite en el historial del fingerprint, y no hay evidencia de que sea un falso positivo. La severidad high y la confianza del evaluador (

### admission-double-booking-001-m8cx-004 — cdr_consistency

- **ID:** `c3d6a0de-13ba-4e57-96d5-a2d23720e710`
- **Escenario:** admission-double-booking-001-m8cx-004
- **Severidad:** high · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `f0afe0d70dada190`
- **Rationale:** El hallazgo describe una desincronización entre la fuente de resultados críticos (clinical_critical_results) y el sistema de alertas (clinical-alerts), lo cual representa un riesgo para la seguridad clínica. La evidencia HTTP muestra que el sistema bloquea la aprobación de la alta cuando hay resultados críticos sin acuse, pero el CDR no emite alertas críticas, lo que sugiere una inconsistencia en 

### admission-discharge-001-m8rs-001 — functional

- **ID:** `9ba07368-9cf7-4c20-b339-c9b2e245fc9d`
- **Escenario:** admission-discharge-001-m8rs-001
- **Severidad:** high · **Categoría:** authorization
- **Prioridad judge:** 1
- **Fingerprint:** `50df1d69aac96d12`
- **Rationale:** El hallazgo describe una situación donde el evaluador funcional esperaba un bloqueo (HTTP 403) al intentar aprobar una salida, pero se recibió un HTTP 200, lo cual indica que el sistema no está bloqueando como se esperaba. Este comportamiento es inesperado y representa un posible error en la lógica de autorización. Además, el hallazgo no coincide con el historial de fingerprints previos, lo que su

### admission-double-booking-001-m8cx-004 — cdr_consistency

- **ID:** `8b913e8b-7669-42cd-a154-92e20ca6033e`
- **Escenario:** admission-double-booking-001-m8cx-004
- **Severidad:** high · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `f0afe0d70dada190`
- **Rationale:** El hallazgo describe una desincronización entre el sistema de alertas clínicas (clinical-alerts) y el CDR, lo cual representa un riesgo para la seguridad clínica. La evidencia HTTP muestra que hay resultados críticos sin acuse, pero el sistema no emite alertas críticas, lo que puede llevar a errores en la toma de decisiones. Este es un hallazgo de alta severidad y no se observa evidencia de que se

### discharge-critical-pending-001-m8pp-006 — functional

- **ID:** `6acb36a0-111e-4bde-9f25-e91a58e02e67`
- **Escenario:** discharge-critical-pending-001-m8pp-006
- **Severidad:** high · **Categoría:** authorization
- **Prioridad judge:** 1
- **Fingerprint:** `bebd14371350f384`
- **Rationale:** El finding describe una situación donde el evaluador funcional esperaba un bloqueo (HTTP 403) pero recibió un HTTP 201, lo cual indica una posible falla en la autorización. Aunque el evaluador clínico y de auditoría pasaron, el comportamiento inesperado del sistema en el evaluador funcional sugiere una brecha de seguridad o lógica de negocio. No hay evidencia de duplicado ni de ruido claro, por lo

### admission-discharge-001-m8rs-001 — functional

- **ID:** `6bd9d90e-16d1-47a3-91ee-3f51b7942f1d`
- **Escenario:** admission-discharge-001-m8rs-001
- **Severidad:** high · **Categoría:** authorization
- **Prioridad judge:** 1
- **Fingerprint:** `50df1d69aac96d12`
- **Rationale:** El hallazgo describe una situación donde el proceso de alta (discharge) se completó con HTTP 200, a pesar de que se esperaba un bloqueo (HTTP 403). Este comportamiento no coincide con la expectativa definida en el escenario, lo que sugiere un error en la lógica de autorización o en la validación del flujo de alta. Además, el hallazgo no coincide con el historial de fingerprints previos, lo que lo 

### admission-discharge-001-m8rs-001 — functional

- **ID:** `e6ad0872-32b0-47b2-8eb2-957aaa1338da`
- **Escenario:** admission-discharge-001-m8rs-001
- **Severidad:** high · **Categoría:** authorization
- **Prioridad judge:** 1
- **Fingerprint:** `50df1d69aac96d12`
- **Rationale:** El finding indica un comportamiento inesperado (HTTP 200 en lugar de bloqueo esperado) que no ha sido cerrado como duplicado en los últimos hallazgos con el mismo fingerprint.

### admission-discharge-001-m8cx-008 — clinical_safety

- **ID:** `dfb4386f-a85f-4872-9ac3-a0ff6804d18c`
- **Escenario:** admission-discharge-001-m8cx-008
- **Severidad:** high · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `f89a772ce1bc7823`
- **Rationale:** El finding indica que no se detectó el resultado crítico pendiente en el sandbox, lo cual es un comportamiento inesperado y potencialmente crítico para la alta hospitalaria.

### admission-discharge-001-m8cx-008 — audit_completeness

- **ID:** `18f18669-bf46-44b0-9d58-1d4f12465926`
- **Escenario:** admission-discharge-001-m8cx-008
- **Severidad:** high · **Categoría:** audit_trail
- **Prioridad judge:** 1
- **Fingerprint:** `39126c4932797038`
- **Rationale:** El finding indica un evento prohibido en la auditoría que no debería haber ocurrido, lo cual sugiere un comportamiento inesperado del sistema.

### admission-discharge-001-m8cx-008 — functional

- **ID:** `8ececefa-46f5-4f16-8673-37d4a554fd91`
- **Escenario:** admission-discharge-001-m8cx-008
- **Severidad:** high · **Categoría:** authorization
- **Prioridad judge:** 1
- **Fingerprint:** `36f99e24a9f862a5`
- **Rationale:** El finding indica un comportamiento inesperado (HTTP 200) en lugar del bloqueo esperado (403 RBAC). Aunque hay evidencia de que el evento se registró correctamente, el comportamiento no es conforme al escenario esperado.

### admission-discharge-001-m8cx-008-m8rs-001 — clinical_safety

- **ID:** `aac8b7e6-2fc0-41fe-924f-19693d311141`
- **Escenario:** admission-discharge-001-m8cx-008-m8rs-001
- **Severidad:** high · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `261c37349c8e39c2`
- **Rationale:** No se detectó resultado crítico pendiente en sandbox — verificar seeds

### admission-discharge-001-m8cx-008-m8rs-013 — clinical_safety

- **ID:** `b1c0d18b-1852-49bc-80d8-fd7f83998328`
- **Escenario:** admission-discharge-001-m8cx-008-m8rs-013
- **Severidad:** high · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `efa918267c3cb027`
- **Rationale:** El finding indica un comportamiento inesperado en la API de alta, donde no se detectó el resultado crítico pendiente en el sandbox, lo cual es una anomalía que requiere atención.

### discharge-critical-pending-001-m8rs-021 — clinical_safety

- **ID:** `7b7a1498-73d0-4e68-a208-ae7032b86482`
- **Escenario:** discharge-critical-pending-001-m8rs-021
- **Severidad:** high · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `c4f772c3f2d61f24`
- **Rationale:** No se detectó resultado crítico pendiente en sandbox, lo que indica que el sistema de alta no ha encontrado ningún problema crítico pendiente.

### discharge-critical-pending-001-m8si-023 — clinical_safety

- **ID:** `3217c8d4-d0c5-4c65-883d-62293d8543d5`
- **Escenario:** discharge-critical-pending-001-m8si-023
- **Severidad:** high · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `da790499fa17215e`
- **Rationale:** La evaluación de clinical_safety indica que no se detectó resultado crítico pendiente en sandbox, lo cual es inesperado dado el escenario de alta aprobada con PCR crítico sin acuse.

### admission-discharge-001-m8cx-008-m8rs-025 — clinical_safety

- **ID:** `e0cec5b2-8f26-4704-b31e-5cce25572bd7`
- **Escenario:** admission-discharge-001-m8cx-008-m8rs-025
- **Severidad:** high · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `a512384868392eb0`
- **Rationale:** La evaluación de clinical_safety indica que no se detectó resultado crítico pendiente en sandbox, lo cual es inesperado dado que el escenario previo tenía una severidad alta.

### admission-double-booking-001-m8cx-004-m8si-027 — clinical_safety

- **ID:** `31bc76ce-5397-45e2-8dc7-f651c268c9fa`
- **Escenario:** admission-double-booking-001-m8cx-004-m8si-027
- **Severidad:** high · **Categoría:** clinical_safety
- **Prioridad judge:** 1
- **Fingerprint:** `a36d9ecd2521e504`
- **Rationale:** No se detectó resultado crítico pendiente en sandbox — verificar seeds

### admission-discharge-001-m8cx-008-m8si-031 — functional

- **ID:** `b400b357-5f14-4984-86b2-658ce0d34862`
- **Escenario:** admission-discharge-001-m8cx-008-m8si-031
- **Severidad:** high · **Categoría:** authorization
- **Prioridad judge:** 1
- **Fingerprint:** `1417e04f33c8d061`
- **Rationale:** El escenario de alta aprobada con PCR crítico sin acuse es un hallazgo de autorización que no se espera bloqueo, lo cual es inusual y requiere atención.

---

## Acciones recomendadas

1. `npm run evolab:review -- --finding <uuid> --decision approved|rejected|duplicate`
2. Cola runs: `npm run evolab:queue`
3. Promoción élites: `npm run evolab:archive:promote -- --dry-run`

JSON: `reports/evolution/evolab-findings-report-2026-06-12.json`
