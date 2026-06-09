import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Epis2BrowserTargetAdapter } from '../target/types.js';

export type PlaywrightControllerOptions = {
  webBaseUrl: string;
  headless: boolean;
  timeoutMs: number;
  screenshotsDir: string;
};

export class PlaywrightController {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  page: Page | undefined;

  constructor(private readonly options: PlaywrightControllerOptions) {}

  async launch(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.options.headless });
    this.context = await this.browser.newContext({
      baseURL: this.options.webBaseUrl,
      ignoreHTTPSErrors: true,
    });
    this.context.setDefaultTimeout(this.options.timeoutMs);
    this.page = await this.context.newPage();
  }

  async loginViaWebProxy(username: string, demoAuthKey: string): Promise<void> {
    if (!this.page || !this.context) throw new Error('Browser no iniciado');
    const login = await this.page.request.post('/api/auth/login', {
      data: { username, demoAuthKey },
    });
    if (!login.ok()) {
      throw new Error(`Login web demo falló (HTTP ${login.status()})`);
    }
    const state = await this.page.request.storageState();
    await this.context.addCookies(state.cookies);
  }

  async injectSessionCookies(apiBaseUrl: string, cookieHeader: string): Promise<void> {
    if (!this.context) throw new Error('Browser no iniciado');
    const [pair] = cookieHeader.split(';');
    const eq = pair?.indexOf('=') ?? -1;
    if (eq <= 0) throw new Error('Cookie de sesión inválida');
    const name = pair!.slice(0, eq).trim();
    const value = pair!.slice(eq + 1).trim();
    const apiUrl = new URL(apiBaseUrl);
    await this.context.addCookies([
      {
        name,
        value,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
      {
        name,
        value,
        domain: apiUrl.hostname,
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);
  }

  private requirePage(): Page {
    if (!this.page) throw new Error('Browser no iniciado');
    return this.page;
  }

  private async adapterOpen(path = '/comando'): Promise<void> {
    const page = this.requirePage();
    await page.goto(path);
    await page.waitForLoadState('domcontentloaded');
    if (path.startsWith('/comando')) {
      await page
        .getByTestId('epis2-command-prompt')
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => undefined);
    } else if (path.includes('/espacio/ficha')) {
      await page
        .getByTestId('epis2-patient-workspace')
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => undefined);
    } else if (path.includes('/espacio/borrador/')) {
      await page
        .getByTestId('epis2-draft-review')
        .waitFor({ state: 'visible', timeout: 20_000 })
        .catch(() => undefined);
    } else if (path.startsWith('/espacio/')) {
      await page
        .getByTestId('epis2-generated-clinical-page')
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => undefined);
    }
  }

  private async adapterFill(testId: string, value: string): Promise<void> {
    await this.requirePage().getByTestId(testId).fill(value);
  }

  private async adapterFillByLabel(label: string | RegExp, value: string): Promise<void> {
    await this.requirePage().getByLabel(label).fill(value);
  }

  private async adapterClick(testId: string): Promise<void> {
    await this.requirePage().getByTestId(testId).click();
  }

  private async adapterIsVisible(testId: string): Promise<boolean> {
    return this.requirePage().getByTestId(testId).isVisible();
  }

  private async adapterWaitForTestId(testId: string, timeoutMs = 15_000): Promise<boolean> {
    try {
      await this.requirePage().getByTestId(testId).waitFor({ state: 'visible', timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  private async adapterScreenshot(label: string): Promise<string> {
    const page = this.requirePage();
    const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const path = `${this.options.screenshotsDir}/${safe}.png`;
    await page.screenshot({ path, fullPage: true });
    return path;
  }

  private async adapterCurrentUrl(): Promise<string> {
    return this.requirePage().url();
  }

  createBrowserAdapter(): Epis2BrowserTargetAdapter {
    return {
      open: (path) => this.adapterOpen(path),
      fill: (testId, value) => this.adapterFill(testId, value),
      fillByLabel: (label, value) => this.adapterFillByLabel(label, value),
      click: (testId) => this.adapterClick(testId),
      isVisible: (testId) => this.adapterIsVisible(testId),
      waitForTestId: (testId, timeoutMs) => this.adapterWaitForTestId(testId, timeoutMs),
      screenshot: (label) => this.adapterScreenshot(label),
      currentUrl: () => this.adapterCurrentUrl(),
      close: () => this.close(),
    };
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
  }
}
