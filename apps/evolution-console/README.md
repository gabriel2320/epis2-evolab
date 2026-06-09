# EPIS2 Evolution Console

Interfaz visual **read-only** para Evolab — puerto propio, sin rutas clínicas EPIS2.

## Arranque

```powershell
# Requiere EPIS2_EVOLAB_DATABASE_URL (misma que evolution-lab)
npm run evolab:console
```

Abre [http://127.0.0.1:5190](http://127.0.0.1:5190).

Variables opcionales:

| Variable | Default |
|----------|---------|
| `EPIS2_EVOLAB_CONSOLE_PORT` | `5190` |
| `EPIS2_EVOLAB_CONSOLE_HOST` | `127.0.0.1` |

## Pantallas (MVP)

- **Dashboard** — runs recientes, hallazgos abiertos, cola `human_review`, conteo de escenarios
- **Runs** — listado con enlace a detalle
- **Hallazgos** — findings desde PostgreSQL
- **Cola review** — runs en `human_review`
- **Detalle run** — evaluaciones, findings y evidencia filesystem (`result.json`, etc.)

## API read-only

| Ruta | Descripción |
|------|-------------|
| `GET /api/health` | Ping DB |
| `GET /api/dashboard` | Resumen agregado |
| `GET /api/runs` | Listado de runs |
| `GET /api/runs/:id` | Detalle + evidencia |
| `GET /api/findings` | Hallazgos (`?status=open`) |
| `GET /api/queue` | Cola human_review |

La revisión humana sigue en CLI: `npm run evolab:review`.

## Arquitectura

- Servidor Node (`apps/evolution-console/src/server.ts`) + UI estática (`public/`)
- Read-model en `apps/evolution-lab/src/console/read-model.ts` (reutiliza `repository.ts`)
- Shell visual distinto al clínico (tema laboratorio oscuro)
