import type { Epis2BrowserTargetAdapter } from './types.js';

/** Browser desactivado — escenarios API-first sin Chromium. */
export function createNullBrowserAdapter(): Epis2BrowserTargetAdapter {
  const noop = async () => {};
  return {
    open: noop,
    fill: noop,
    fillByLabel: noop,
    click: noop,
    isVisible: async () => false,
    waitForTestId: async () => false,
    screenshot: async () => '',
    currentUrl: async () => 'about:blank',
    close: noop,
  };
}
