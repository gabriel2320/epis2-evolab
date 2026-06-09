# EPIS2 Evolab

Repositorio **standalone** del laboratorio de evolución supervisada sobre [EPIS2](https://github.com/gabriel2320/epis2).

Evolab opera **externamente** al sistema clínico: orquesta escenarios contra un sandbox EPIS2 en ejecución, persiste runs/findings en PostgreSQL y ofrece consola read-only.

## Requisitos

- Node.js 20+
- PostgreSQL (schema `evolution` en DB `epis2_evolab`)
- **EPIS2** en otro checkout, con sandbox levantado (`npm run stack:dev` en ese repo)
- Ollama (opcional, para escenarios LLM)

## Inicio rápido

```powershell
git clone https://github.com/gabriel2320/epis2-evolab.git
cd epis2-evolab
npm install
cp .env.example .env

npm run evolab:db:migrate
npm run evolab:doctor
npm run evolab:scenarios
npm run evolab:run -- --scenario role-evolution-sign-001
npm run evolab:console
```

## Relación con EPIS2

| Componente | Repo |
|------------|------|
| App clínica (web/api) | [epis2](https://github.com/gabriel2320/epis2) |
| Evolab (este repo) | epis2-evolab |

Variables de target (sandbox):

```env
EPIS2_EVOLAB_WEB_BASE_URL=http://127.0.0.1:5173
EPIS2_EVOLAB_API_BASE_URL=http://127.0.0.1:3001
EPIS2_EVOLAB_DATABASE_URL=postgresql://epis2_evolab:epis2_evolab@127.0.0.1:5433/epis2_evolab
```

Stack completo (EPIS2 + Evolab):

```powershell
$env:EPIS2_ROOT="C:\path\to\epis2"
npm run evolab:stack
```

## Estructura

```text
apps/evolution-lab/     CLI, orquestador, escenarios, evaluadores
apps/evolution-console/ UI read-only (puerto 5190)
packages/demo-fixtures/ Casos DEMO alineados con seed EPIS2
database/evolution/     Migraciones PostgreSQL
scripts/evolution/      migrate, validate, stack
docs/evolution/         Arquitectura y fronteras
```

## Comandos principales

```powershell
npm run evolab:run -- --all
npm run evolab:findings -- --status open
npm run evolab:queue
npm run evolab:review -- --finding <uuid> --decision approved
npm run evolab:plan -- --scenario llm-command-evolution-001
$env:EPIS2_EVOLAB_LLM_SIM="execute"
npm run evolab:run -- --scenario llm-command-evolution-001
npm run evolab:validate
```

## Documentación

- [docs/evolution/EVOLAB_ROADMAP.md](docs/evolution/EVOLAB_ROADMAP.md) — **plan de mejora** (eficiencia, rapidez, potencia, profundidad)
- [docs/evolution/EVOLAB_ARCHITECTURE.md](docs/evolution/EVOLAB_ARCHITECTURE.md)
- [docs/evolution/EVOLAB_BOUNDARIES.md](docs/evolution/EVOLAB_BOUNDARIES.md)
- [reports/evolution/evolab-mvp-validation.md](reports/evolution/evolab-mvp-validation.md)

## Licencia

Mismo proyecto EPIS2 — uso interno / privado salvo indicación contraria.
