# Evolab ↔ EPIS2 — Trazabilidad (S16.4)

Cuando una hipótesis evolab se confirma y requiere fix en EPIS2 sandbox:

## Etiqueta PR

```
evolab-fp-<hash12>
```

Ejemplo: fingerprint `50df1d69aac96d12` → etiqueta **`evolab-fp-50df1d69aac9`**.

Generar checklist:

```bash
npx tsx apps/evolution-lab/src/cli.ts hypothesis trace --fingerprint 50df1d69aac96d12
```

## Checklist mínimo (discharge / critical / P0)

1. PR EPIS2 con etiqueta `evolab-fp-*` y enlace a `hyp-*` en descripción.
2. `npm run check` en repo EPIS2.
3. Replay ancla evolab: `npm run evolab:replay-fingerprint -- 50df1d69aac96d12`
4. Validar escenario **base** YAML antes del mutante ancla.
5. Si toca discharge o critical: `npm run quality:golden-journey` en EPIS2.

## Gate D (S16)

Un fingerprint P0 (discharge + critical) debe cerrar ciclo completo en ≤2 sesiones humanas:

| Sesión | Acción |
|--------|--------|
| 1 | `hypothesis trace` + `replay-fingerprint` + veredicto humano |
| 2 | Fix EPIS2 + replay verde + `hypothesis update --status fixed` |

## Promoción corpus

`archive:promote` exige hipótesis vinculada o `--signoff "motivo"` explícito (S16.5).
