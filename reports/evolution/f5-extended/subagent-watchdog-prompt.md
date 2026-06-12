# Subagente F5 Watchdog — recuperación

**Generado:** 2026-06-12T10:37:35.322Z  
**Run ID:** f5-1781260652918  
**Intento:** 1

## Incidente

- **Código salida:** 1
- **Motivo:** "blocked"
      },
      {
        "role": "admin",
        "module": "classic",
        "outcome": "journey"
      },
      {
        "role": "admin",
        "module": "classic",
        "outcome": "metamorphic"
      }
    ],
    "candidatesPending": 0,
    "newElitesInPreviouslyEmpty": 0
  },
  "totalDurationMs": 44,
  "telemetryPath": "C:\\Users\\gdela\\OneDrive\\Documentos Importantes\\epis2-evolab\\reports\\evolution\\evolve\\evolve-2026-06-12T10-37-34-563Z.json",
  "gatePassed": false
}

- **Presupuesto restante (min):** 5

## Acciones automáticas ya ejecutadas

- npm run evolab:doctor

## Tu misión (Cursor Agent)

1. Leer `reports/evolution/f5-extended/incidents.jsonl` (última línea) y `run-state.json`.
2. Verificar sandbox: `npm run evolab:doctor` · EPIS2 `npm run dev:api` · Ollama `:11434`.
3. Si Postgres/Ollama caídos: `npm run evolab:stack` (requiere EPIS2_ROOT).
4. Reanudar corrida: `npm run evolab:f5:extended` (el watchdog retoma presupuesto restante).
5. Documentar causa raíz en `reports/evolution/f5-extended/recovery-<fecha>.md`.
6. **No** promover candidatos ni cerrar findings sin revisión humana.

## Telemetría evolve

- Log: `reports/evolution/f5-extended/evolve-run.log`
- JSON: `reports/evolution/evolve/*.json`

## Invariantes

- Una corrida evolve activa por estación
- Judge no cierra review_status
- Élites promoted intocables
