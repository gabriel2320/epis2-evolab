import { z } from 'zod';

/**
 * Pasos declarativos (YAML v2, campo `flow:`).
 * Cada paso es un objeto con exactamente una clave: login | api | browser | wait.
 * Los strings admiten placeholders `{clave}` resueltos desde fixture + demo case.
 */

export const LoginStepSchema = z.object({
  login: z
    .object({
      label: z.string().min(1).optional(),
    })
    .nullable(),
});

export const ApiStepSchema = z.object({
  api: z.object({
    label: z.string().min(1),
    method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
    path: z.string().min(1),
    body: z.record(z.unknown()).optional(),
    /** Label del archivo de evidencia; default: label con `_` → `-`. */
    evidenceLabel: z.string().min(1).optional(),
    /** claveCtx -> ruta punteada en el body de respuesta (ej. draftId: draft.id). */
    capture: z.record(z.string()).optional(),
    /** Si un capture queda undefined, abortar con este error; admite {status}. */
    failOnMissingCapture: z.string().min(1).optional(),
    /** Proyección de la observación; default kind=api_response, payload {status, ok, path}. */
    observe: z
      .object({
        kind: z.string().min(1).optional(),
        label: z.string().min(1).optional(),
        /** Claves del payload: status | ok | path | cualquier clave del contexto. */
        payload: z.array(z.string().min(1)),
      })
      .optional(),
  }),
});

const VisibleCheckSchema = z.union([
  z.string().min(1),
  z.object({
    testId: z.string().min(1),
    /** Solo evaluar si esta clave del payload acumulado es true. */
    ifKey: z.string().min(1).optional(),
  }),
]);

export const BrowserStepSchema = z.object({
  browser: z.object({
    open: z.string().min(1).optional(),
    /** waitForTestId; el resultado se guarda en payload bajo `waitAs` (default: el testId). */
    waitTestId: z.string().min(1).optional(),
    waitTimeoutMs: z.number().int().positive().optional(),
    waitAs: z.string().min(1).optional(),
    /** clavePayload -> testId (o check condicional). */
    visible: z.record(VisibleCheckSchema).optional(),
    screenshot: z.string().min(1).optional(),
    /** Si está presente, emite observación dom_state con este label. */
    label: z.string().min(1).optional(),
    /** Pares extra clavePayload -> valor (con placeholders) incluidos en la observación. */
    payload: z.record(z.string()).optional(),
    includeUrl: z.boolean().optional(),
  }),
});

export const WaitStepSchema = z.object({
  wait: z.object({
    ms: z.number().int().positive(),
  }),
});

/** Paso de dominio registrado en el catálogo (step-engine/custom-steps.ts). */
export const CustomStepSchema = z.object({
  custom: z.object({
    name: z.string().min(1),
    args: z.record(z.unknown()).optional(),
  }),
});

export const DeclarativeStepSchema = z.union([
  LoginStepSchema,
  ApiStepSchema,
  BrowserStepSchema,
  WaitStepSchema,
  CustomStepSchema,
]);

export type LoginStep = z.infer<typeof LoginStepSchema>;
export type ApiStep = z.infer<typeof ApiStepSchema>;
export type BrowserStep = z.infer<typeof BrowserStepSchema>;
export type WaitStep = z.infer<typeof WaitStepSchema>;
export type CustomStep = z.infer<typeof CustomStepSchema>;
export type DeclarativeStep = z.infer<typeof DeclarativeStepSchema>;

export function isLoginStep(step: DeclarativeStep): step is LoginStep {
  return 'login' in step;
}

export function isApiStep(step: DeclarativeStep): step is ApiStep {
  return 'api' in step;
}

export function isBrowserStep(step: DeclarativeStep): step is BrowserStep {
  return 'browser' in step;
}

export function isWaitStep(step: DeclarativeStep): step is WaitStep {
  return 'wait' in step;
}

export function isCustomStep(step: DeclarativeStep): step is CustomStep {
  return 'custom' in step;
}
