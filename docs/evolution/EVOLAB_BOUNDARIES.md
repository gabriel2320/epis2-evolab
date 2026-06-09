# EPIS2 Evolab — Fronteras

## Regla fundamental

```text
Evolab observa EPIS2. EPIS2 no conoce Evolab.
```

Evolab vive en el repo **epis2-evolab**. EPIS2 clínico está en **epis2**.

## Imports permitidos (evolution-lab)

- `@evolab/demo-fixtures` (casos DEMO alineados con seed EPIS2)
- Playwright, Ollama HTTP, Zod, postgres

## Imports prohibidos

- `apps/api/src/*` (checkout EPIS2)
- `apps/web/src/*`
- Servicios clínicos internos de EPIS2

## Validación

```bash
# Solo Evolab
npm run evolab:boundary:validate

# Incluye scan de apps/web y apps/api en EPIS2_ROOT
$env:EPIS2_ROOT="C:\path\to\epis2"
npm run evolab:boundary:validate
```

## Build clínico

`npm run build` en **epis2** no incluye Evolab — repos separados.
