/** Credenciales demo públicas — ver docs/auth/DEMO_USERS.md */
export type DemoPersonaCredentials = {
  username: string;
  demoAuthKey: string;
  role: string;
  displayName: string;
};

export const DEMO_PERSONAS: Record<string, DemoPersonaCredentials> = {
  physician: {
    username: 'medico.demo',
    demoAuthKey: 'DEMO-CLAVE-MEDICO',
    role: 'physician',
    displayName: 'Dra. Ana Demo',
  },
  nurse: {
    username: 'enfermeria.demo',
    demoAuthKey: 'DEMO-CLAVE-ENFERMERIA',
    role: 'nurse',
    displayName: 'Enf. Luis Demo',
  },
  admin: {
    username: 'admin.demo',
    demoAuthKey: 'DEMO-CLAVE-ADMIN',
    role: 'admin',
    displayName: 'Admin Demo',
  },
  auditor: {
    username: 'auditor.demo',
    demoAuthKey: 'DEMO-CLAVE-AUDITOR',
    role: 'auditor',
    displayName: 'Auditor Demo',
  },
};

export function resolveDemoPersona(role: string): DemoPersonaCredentials {
  const persona = DEMO_PERSONAS[role];
  if (!persona) {
    throw new Error(`Persona demo no configurada para rol: ${role}`);
  }
  return persona;
}
