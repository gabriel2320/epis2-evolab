# EPIS2 Evolab — Cumplimiento norma full stack (MD3 · React · Node · PostgreSQL)

**Versión:** 1.0  
**Fecha:** 2026-06-09  
**Alcance:** repositorio [epis2-evolab](https://github.com/gabriel2320/epis2-evolab)  
**Referencia:** Norma de buenas prácticas full stack (Material Design 3, React, Node.js, PostgreSQL)

---

## 1. Contexto de aplicación

Evolab **no es** la aplicación clínica EPIS2. Es un **laboratorio externo** con:

| Componente | Tecnología actual |
|------------|-------------------|
| `apps/evolution-lab` | Node.js + TypeScript (CLI, orquestador, worker lógico) |
| `apps/evolution-console` | Node `http` + HTML/CSS/JS estático (read-only) |
| Persistencia | PostgreSQL `epis2_evolab` / schema `evolution` |
| Target | EPIS2 sandbox vía HTTP + Playwright opcional |

**Implicación:** las reglas de **React + Material Design 3** aplican de forma **limitada** (consola y futuras UIs). Las reglas de **Node.js + PostgreSQL + contratos + pruebas** aplican **plenamente** al lab.

EPIS2 clínico (`apps/web`, `apps/api`, `@epis2/epis2-ui`) es auditado en su propio repositorio; esta matriz no lo sustituye.

---

## 2. Resumen ejecutivo

| Estado | Cantidad | % |
|--------|----------|---|
| Cumple | 18 | 38% |
| Parcial | 14 | 30% |
| No cumple | 8 | 17% |
| N/A (no aplica al lab) | 7 | 15% |

**Veredicto:** Evolab cumple **bien** en contratos Zod, PostgreSQL relacional, frontera con EPIS2, tests unitarios y validación de entorno. **No cumple** el stack canónico de presentación (React + MUI + tema institucional) ni varios gates operacionales (lint, OpenAPI, observabilidad estructurada, CI completo).

**Posición normativa recomendada:** tratar Evolab como **monolito modular Node.js + PostgreSQL** con **UI de laboratorio** exenta de MD3 clínico, pero **alineada en tokens propios**; migrar consola a React+MUI solo si se justifica (FASE 15+).

---

## 3. Matriz de cumplimiento

Leyenda: **C** Cumple · **P** Parcial · **N** No cumple · **—** No aplica

### 3.1 Principios rectores (§2)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| R-01 Arquitectura en capas | **P** | Separación `contracts/`, `orchestrator/`, `persistence/`, `evaluators/`; el orquestador concentra casos de uso + infraestructura |
| R-02 Contratos explícitos | **C** | Zod en `config/env.ts`, `contracts/schemas.ts`, escenarios YAML parseados con `ScenarioDefinitionSchema` |
| R-03 Monolito modular | **P** | Workspaces `apps/*`, `packages/demo-fixtures`; falta paquete `contracts` compartido exportado y límites estrictos entre módulos |
| R-04 Fuente única de verdad | **C** | PG para runs/findings; filesystem como evidencia derivada; URL no usada (CLI) |

### 3.2 Repositorio y dependencias (§3)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| R-05 Dependencias dirigidas | **C** | Sin imports React/MUI/EPIS2 clínico; `boundary-validate` en CI manual |
| Estructura monorepo recomendada | **P** | Falta `packages/contracts`, `tests/integration`, `docs/decisions`, `infra/monitoring` |

### 3.3 Material Design 3 y sistema visual (§4)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| R-06 Tema centralizado | **P** | Consola usa CSS variables propias (`--accent`, `--surface`); **no** `createTheme` MUI |
| R-07 Sin valores arbitrarios | **P** | Tokens CSS en `:root`; algunos colores hex fijos sin paquete institucional |
| R-08 Biblioteca visual encapsulada | **N** | No hay `@evolab/ui`; consola no usa MUI |
| R-09 Color semántico | **P** | Badges `completed`, `human_review`, severidades; no mapeo MUI semantic palette |
| R-10–R-12 Layout / a11y WCAG | **N** | Sin React, sin roles ARIA sistemáticos, sin audit axe en consola |

**Nota:** por diseño la consola es **shell de laboratorio** distinto al clínico. Cumplir MD3 al 100% **no es obligatorio** salvo que se decida unificar UX (ver §6).

### 3.4 React y TypeScript (§5)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| R-13 TypeScript estricto | **P** | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` ✓; faltan `noImplicitOverride`, `useUnknownInCatchVariables` |
| R-14–R-19 React | **—** | Sin React en Evolab (consola vanilla JS) |

### 3.5 Node.js y backend (§6)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| R-20 Node LTS | **P** | Requiere Node 20+ en README; sin `engines` en `package.json` ni `.nvmrc` |
| R-21 Framework único | **P** | Consola: `node:http` crudo; lab: CLI sin servidor HTTP principal; **no** Fastify |
| R-22 Controladores delgados | **P** | `server.ts` mezcla routing + respuesta; lógica en `read-model.ts` (aceptable pero sin capa use-case) |
| R-23 No bloqueante | **C** | I/O async; Ollama en cola; Playwright opcional; sin CPU pesada en event loop |
| R-24 Config validada | **C** | `EvolabEnvSchema.parse()` al arranque |
| R-25 Errores normalizados | **N** | Respuestas `{ error: string }` sin `type`, `correlationId`, RFC7807-like |

### 3.6 PostgreSQL (§7)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| R-26 Integridad DB | **C** | PK, FK, CHECK en `severity`, `review_status`, `confidence`; índices en `002_schema.sql` |
| R-27 Relacional primero | **C** | `jsonb` solo en `configuration`, `details`, `evidence_ids` (metadatos) |
| R-28 Migraciones inmutables | **C** | `001_bootstrap_role.sql`, `002_schema.sql`; test `migration-evolution.test.mjs` |
| R-29 Transacciones | **C** | `sql.begin()` en `persistRunBundle`, `reviewFinding` |
| R-30 Índices medidos | **P** | Índices por escenario/status/fingerprint; sin `EXPLAIN` documentado |
| R-31 RLS | **—** | DB single-tenant lab; rol `epis2_evolab` dedicado |
| R-32 Backups | **N** | Sin runbook backup/restore `epis2_evolab` |

### 3.7 API y contratos (§8)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| R-33 Diseño API | **P** | REST ad hoc `/api/runs`, `/api/findings`; sin `/v1`, sin PATCH/DELETE formales |
| R-34 Contrato compartido | **P** | Zod interno; **sin** OpenAPI ni paquete `@evolab/contracts` consumible por cliente |
| R-35 Consultas delimitadas | **P** | `limit` query param; sin cursor, sin max cap documentado en schema |

### 3.8 Seguridad (§9)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| R-36 Modelo de amenazas | **P** | `EVOLAB_BOUNDARIES.md`, guards; sin documento threat-model dedicado |
| R-37 Seguridad entrada | **P** | Zod env; SQL parametrizado (`postgres` tagged templates); sin rate limit en consola |
| R-38 AuthN/Z separadas | **P** | Consola sin auth (localhost); CLI sin RBAC; adecuado para lab local, **N** para exposición red |
| R-39 Secretos | **C** | `.env` gitignored; `maskDatabaseUrl`; kill switches `ALLOW_PUSH=false` |
| R-40 Auditoría | **P** | `human_decisions` en PG; logs no estructurados como auditoría funcional |

### 3.9 Pruebas (§10)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| R-41 Pirámide | **P** | 383 tests unitarios ✓; sin integración PG (Testcontainers); E2E Evolab→EPIS2 manual |
| R-42 Herramientas | **P** | Vitest ✓; Playwright en lab ✓; sin MSW, RTL, Storybook, axe |
| R-43 Aislamiento E2E | **P** | Escenarios con seed; fixture reset parcial (`sandbox-prep`) |
| R-44 Selectores | **P** | Playwright controller usa selectores EPIS2; golden helpers en repo EPIS2 |

### 3.10 Observabilidad (§11)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| R-45 Logs estructurados | **N** | `logger.ts` texto; no Pino JSON |
| R-46 Correlación | **N** | Sin `correlationId` run/request |
| R-47 Métricas/trazas | **N** | Sin OpenTelemetry |
| R-48 Health checks | **P** | `/api/health` consola; sin `/health/live` + `/health/ready` separados |

### 3.11 Herramientas y gates (§12–14)

| Regla | Estado | Evidencia / gap |
|-------|--------|-----------------|
| Stack canónico §17 | **N** | Sin React, MUI, Fastify, Drizzle, Pino, OTel en Evolab |
| Scripts §13 | **P** | `typecheck`, `test`, `evolab:validate`; sin `lint`, `format:check`, `test:e2e`, `quality` unificado |
| Gates §14 | **N** | No lint, no E2E CI Evolab, no a11y, no audit deps, no bundle budget |

### 3.12 Antipatrones (§15)

| Antipatrón | Evolab |
|------------|--------|
| Componentes gigantes | **P** — `orchestrator.ts` ~800+ líneas |
| SQL en controlador | **C** — SQL en `repository.ts` |
| Migraciones editadas | **C** |
| Secretos en frontend | **C** — consola sin secrets |
| E2E orden-dependent | **P** |
| Backups no probados | **N** |

---

## 4. Fortalezas alineadas con la norma

1. **Contratos Zod** en configuración, dominio Evolab y planes LLM.
2. **PostgreSQL bien modelado** con integridad referencial y checks.
3. **Transacciones** en persistencia y review.
4. **Frontera arquitectónica** explícita con EPIS2 (observa, no se acopla).
5. **TypeScript strict** (base sólida).
6. **Tests unitarios** amplios (383) incluyendo state machine.
7. **Variables de entorno validadas** antes de ejecutar escenarios.
8. **Human-in-the-loop** para findings (`human_decisions`).

---

## 5. Brechas prioritarias (orden de remediación)

### P0 — Sin rediseño UX

| ID | Brecha | Regla | Acción |
|----|--------|-------|--------|
| G-01 | Sin ESLint/Prettier en epis2-evolab | §14 | Añadir config compartida + `npm run lint` |
| G-02 | Sin CI GitHub Actions | §14 | Workflow: typecheck, test, boundary |
| G-03 | `engines` Node LTS no fijado | R-20 | `"engines": { "node": ">=20" }` + `.nvmrc` |
| G-04 | Errores API ad hoc | R-25 | `EvolabError` + formato `{ type, title, status, correlationId }` |
| G-05 | Orquestador monolítico | R-01, §15 | Extraer `RunScenarioUseCase`, `EvaluateRunUseCase` |

### P1 — Operación y profundidad

| ID | Brecha | Regla | Acción |
|----|--------|-------|--------|
| G-06 | Logs no JSON | R-45 | Migrar a Pino con `runId`, `scenarioId` |
| G-07 | Sin correlationId | R-46 | UUID por run + header en consola API |
| G-08 | Tests integración PG | R-41 | Testcontainers o PG efímero en CI |
| G-09 | OpenAPI consola | R-33, R-34 | `docs/api/evolab-console.openapi.yaml` |
| G-10 | Backup runbook | R-32 | `docs/runbooks/evolab-db-backup.md` |

### P2 — Consola y presentación (opcional MD3)

| ID | Brecha | Regla | Acción |
|----|--------|-------|--------|
| G-11 | Consola vanilla | R-06–R-12 | Migrar a Vite+React+MUI **tema laboratorio** o documentar exención formal |
| G-12 | Sin a11y automatizada | R-12, R-42 | axe en consola si pasa a React |
| G-13 | Paginación cursor | R-35 | `?cursor=` en `/api/runs` y `/api/findings` |

---

## 6. Política de exención MD3 (recomendada)

Documentar en ADR:

> **Evolab Console** queda **exenta** de Material Design 3 clínico (`@epis2/epis2-ui`) porque:
>
> 1. Es herramienta interna de laboratorio, no producto clínico.
> 2. Debe ser visualmente **distinguible** de EPIS2 (evitar confusión operador).
> 3. Debe cumplir **tokens propios** (ya iniciados en CSS variables).
>
> **Debe cumplir:** contraste mínimo, navegación teclado, semántica HTML, API con contratos.
>
> **Reevaluar MD3** si la consola pasa a usuarios clínicos no técnicos.

---

## 7. Mapa brechas → roadmap existente

| Brecha | Fase [EVOLAB_ROADMAP.md](./EVOLAB_ROADMAP.md) |
|--------|-----------------------------------------------|
| G-01, G-02 CI | FASE 12 |
| G-04, G-07 API/errors | FASE 15 (consola) |
| G-05 orchestrator split | FASE 11 (refactor interno) |
| G-06, G-07 observabilidad | FASE 11–12 |
| G-08 integración PG | FASE 12 |
| G-11 consola React | FASE 15 (opcional) |
| G-13 paginación | FASE 15 |

---

## 8. Checklist “Definition of Done” Evolab (adaptado §16)

Para cada feature Evolab:

- [ ] Contrato Zod actualizado
- [ ] Migración PG si aplica (inmutable)
- [ ] Tests unitarios
- [ ] Test integración PG para persistencia crítica
- [ ] `evolab:boundary:validate` con `EPIS2_ROOT`
- [ ] Sin imports clínicos EPIS2
- [ ] Logs con `runId`
- [ ] Documentación en `docs/evolution/`
- [ ] Typecheck + lint en CI

---

## 9. Conclusión

Evolab **cumple parcialmente** la norma full stack: fuerte en **PostgreSQL, Zod, TypeScript y separación de EPIS2**; débil en **presentación MD3/React, Fastify, observabilidad, gates CI y API formal**.

No debe forzarse el stack clínico MD3 sobre el lab; debe **elevarse** el backend Node y la calidad operacional (P0) y **decidir explícitamente** si la consola migra a React+MUI (P2) o mantiene exención documentada.

**Próximo paso normativo:** implementar **G-01 + G-02 + G-03** en un sprint de gobernanza (1 semana), antes de FASE 11 funcional.
