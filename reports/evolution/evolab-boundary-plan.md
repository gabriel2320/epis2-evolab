# EPIS2 Evolab — Plan de fronteras arquitectónicas

**Fecha:** 2026-06-08  
**Estado:** Aprobado para implementación MVP

---

## 1. Principio rector

```text
Evolab observa EPIS2.
EPIS2 no conoce Evolab.
```

Flujo de dependencias **unidireccional**. Evolab es un laboratorio externo que trata EPIS2 como caja negra (UI + HTTP) con observación controlada de sandbox (fixtures, auditoría, invariantes).

---

## 2. Dimensiones de independencia

| Dimensión | Implementación |
|-----------|----------------|
| Ciclo de vida | Comandos `npm run evolab:*` exclusivos |
| Proceso | `Evolution Orchestrator` — Node.js separado |
| Datos | PostgreSQL `epis2_evolab` · schema `evolution` |
| Código | `apps/evolution-lab/` · `apps/evolution-console/` |
| Dependencias | Solo contratos neutrales + HTTP + Playwright + Ollama |

---

## 3. Fronteras permitidas (Evolab → EPIS2)

### 3.1 Caja negra (principal)

| Interfaz | Mecanismo |
|----------|-----------|
| Web UI | Playwright sobre `http://127.0.0.1:5173` |
| API HTTP | `fetch` a `http://127.0.0.1:3001` (auth demo, health, audit) |
| Login demo | `POST /api/auth/login` con claves demo documentadas |

### 3.2 Caja blanca controlada (preparación/verificación)

| Interfaz | Mecanismo | Restricción |
|----------|-----------|-------------|
| Fixtures sintéticos | Referencia IDs de `@epis2/test-fixtures` | Solo datos marcados `DEMO/SINTÉTICO` |
| Sandbox DB | Conexión read-only o seed autorizado | `databaseMode: sandbox-read-write` solo en local-sandbox |
| Auditoría | `target.readAuditEvents` vía API | No SQL arbitrario |
| Logs | Observación externa de stdout/API | Sanitizar secretos |

---

## 4. Fronteras prohibidas

```text
❌ apps/web → evolution-lab
❌ apps/api → evolution-lab
❌ evolution-lab → apps/api/src/*
❌ evolution-lab → apps/web/src/*
❌ evolution-lab → servicios clínicos internos (draft, orders, sign)
❌ shell libre · SQL arbitrario · git libre
❌ Producción · staging con datos reales
```

### 4.1 Paquetes compartidos permitidos

```text
✓ @epis2/contracts       — tipos públicos
✓ @epis2/test-fixtures   — IDs demo sintéticos
✓ @epis2/design-system   — copy E2E (opcional, ya usado en e2e/)
```

### 4.2 Paquetes compartidos prohibidos

```text
✗ @epis2/clinical-domain ejecutable (evaluadores Evolab reimplementan reglas vía UI)
✗ Import directo de repositorios Drizzle clínicos
✗ @epis2/local-ai como orquestador
```

---

## 5. Target Environment

### 5.1 Allowlist MVP

| ID | Tipo | Web | API | DB mode |
|----|------|-----|-----|---------|
| `epis2-local-sandbox` | local-sandbox | `http://127.0.0.1:5173` | `http://127.0.0.1:3001` | sandbox-read-write |
| `epis2-ci-sandbox` | ci-sandbox | `$PLAYWRIGHT_WEB_URL` | `$PLAYWRIGHT_API_HEALTH_URL` | read-only |

### 5.2 Rechazos automáticos

- URLs que no estén en allowlist
- `environmentType: production`
- `syntheticOnly !== true`
- Hostnames de producción conocidos
- `EPIS2_EVOLAB_ENABLED !== true`

---

## 6. Base de datos

```text
┌─────────────────────┐     ┌─────────────────────┐
│ epis2 (clínico)     │     │ epis2_evolab        │
│ demo/sandbox data   │     │ schema: evolution   │
│ migraciones EPIS2   │     │ runs, findings, …   │
└─────────────────────┘     └─────────────────────┘
         ▲                           ▲
         │ observación               │ persistencia
         │ (fixtures/audit)          │ propia
         └───────────┬───────────────┘
                     │
              Evolution Orchestrator
```

**Conexión Evolab:**

```env
EPIS2_EVOLAB_DATABASE_URL=postgresql://epis2_evolab:epis2_evolab@127.0.0.1:5433/epis2_evolab
```

Usuario con permisos **solo** sobre `epis2_evolab`.

---

## 7. Validador de frontera

Comando: `npm run evolab:boundary:validate`

Verifica:

1. `apps/web` y `apps/api` no importan `@epis2/evolution-lab`
2. `evolution-lab` no importa rutas bajo `apps/api/src` ni `apps/web/src`
3. Build clínico (`npm run build -w @epis2/web`) no incluye evolution-lab
4. Scripts `dev:web`, `stack:dev` no referencian evolab
5. Ausencia de rutas Evolab en router clínico

---

## 8. Kill switch

Variables obligatorias:

```env
EPIS2_EVOLAB_ENABLED=true          # master switch
EPIS2_EVOLAB_PATCHING_ENABLED=false
EPIS2_EVOLAB_ALLOW_PUSH=false
EPIS2_EVOLAB_ALLOW_MERGE=false
```

Sin `EPIS2_EVOLAB_ENABLED=true`, ningún escenario ejecuta.

---

## 9. Instrumentación sandbox (excepción futura)

Si EPIS2 requiere hooks de fault injection (`EPIS2_EVOLAB_FAULT_INJECTION`):

- Endpoint o flag **desactivado por defecto**
- Imposibilitado cuando `NODE_ENV=production`
- Documentado en `docs/evolution/EVOLAB_SECURITY.md`
- **No implementado en EPIS2 clínico durante MVP** — fault simulado desde Evolab evaluators

---

## 10. Gates de independencia del build

| Gate | Comando |
|------|---------|
| Typecheck Evolab | `npm run typecheck -w @epis2/evolution-lab` |
| Tests Evolab | `npm run test -w @epis2/evolution-lab` |
| Boundary | `npm run evolab:boundary:validate` |
| Validate completo | `npm run evolab:validate` |
| Clínico sin Evolab | `npm run check` (sin evolution-lab en build chain inicial) |

**Nota:** el build raíz (`npm run build`) **no incluirá** evolution-lab hasta opt-in explícito, preservando independencia.

---

## 11. Separación dev:agent vs Evolab

| Aspecto | dev:agent | Evolab |
|---------|-----------|--------|
| Propósito | Desarrollo asistido Cursor | QA/simulación clínica |
| Scripts | `dev:agent:*` | `evolab:*` |
| Aprobación | low-risk write policy | human gates clínicos |
| Target | código fuente | EPIS2 runtime sandbox |

No fusionar orquestadores.

---

## 12. Cronograma de fronteras por fase

| Fase | Entregable frontera |
|------|---------------------|
| 0 | Este documento + audit |
| 1 | Guards + boundary validator |
| 2 | DB separada + migraciones |
| 4 | Target adapters (HTTP/browser) |
| 8 | Fault injection solo sandbox |
