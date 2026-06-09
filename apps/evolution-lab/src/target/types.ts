export type TargetHealthResult = {
  ok: boolean;
  status: number;
  latencyMs: number;
  body?: unknown;
};

export type TargetApiResponse = {
  ok: boolean;
  status: number;
  latencyMs: number;
  body: unknown;
  headers: Record<string, string>;
};

export type TargetSession = {
  cookies: string;
  username: string;
  role: string;
};

export interface Epis2ApiTargetAdapter {
  health(): Promise<TargetHealthResult>;
  login(username: string, demoAuthKey: string): Promise<TargetSession>;
  apiRequest(
    session: TargetSession,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<TargetApiResponse>;
}

export interface Epis2BrowserTargetAdapter {
  open(path?: string): Promise<void>;
  fill(testId: string, value: string): Promise<void>;
  fillByLabel(label: string | RegExp, value: string): Promise<void>;
  click(testId: string): Promise<void>;
  isVisible(testId: string): Promise<boolean>;
  waitForTestId(testId: string, timeoutMs?: number): Promise<boolean>;
  screenshot(label: string): Promise<string>;
  currentUrl(): Promise<string>;
  close(): Promise<void>;
}
