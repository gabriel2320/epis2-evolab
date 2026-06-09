# EPIS2 Evolab — Fronteras

## Regla fundamental

```text
Evolab observa EPIS2. EPIS2 no conoce Evolab.
```

## Imports permitidos (evolution-lab)

- `@epis2/contracts`
- `@epis2/test-fixtures`
- Playwright, Ollama HTTP, Zod

## Imports prohibidos

- `apps/api/src/*`
- `apps/web/src/*`
- Servicios clínicos internos

## Validación

```bash
npm run evolab:boundary:validate
```

## Build clínico

`npm run build` en raíz **no incluye** evolution-lab — independencia del ciclo clínico.
