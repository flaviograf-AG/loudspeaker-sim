import { Page, expect } from '@playwright/test';

/** Wait for WASM to load and dismiss the setup wizard with a given topology. */
export async function setupSystem(page: Page, topology: '1-Way' | '2-Way' = '2-Way') {
  await page.goto('/');
  await page.waitForSelector('.setup-wizard', { timeout: 15000 });
  // Select topology
  await page.locator('.setup-topology-btn', { hasText: topology }).click();
  await page.locator('.setup-start-btn').click();
  // Wait for charts to render
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(1000); // debounce settle
}

/** Open an accordion section by title. */
export async function openAccordion(page: Page, title: string) {
  const section = page.locator('.accordion-section', {
    has: page.locator('.accordion-title', { hasText: title }),
  });
  // Only click if not already expanded
  const isExpanded = await section.evaluate(el => el.classList.contains('accordion-expanded'));
  if (!isExpanded) {
    await section.locator('.accordion-header').click();
    await page.waitForTimeout(300);
  }
}

/** Get pixel hash of the first chart canvas — detects ANY visual change. */
export async function getChartHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'no-canvas';
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-context';
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let i = 0; i < data.length; i += 100) {
      hash = ((hash << 5) - hash + data[i]) | 0;
    }
    return String(hash);
  });
}

/** Assert that a chart visually changed between two actions. */
export async function expectChartChange(page: Page, action: () => Promise<void>) {
  const before = await getChartHash(page);
  await action();
  await page.waitForTimeout(800); // solver debounce + render
  const after = await getChartHash(page);
  expect(before).not.toBe(after);
}

/** Set a NumericInput value by its label text. */
export async function setNumericInput(page: Page, label: string, value: string) {
  const row = page.locator('.param-row', {
    has: page.locator('.param-label', { hasText: label }),
  });
  const input = row.locator('input[type="number"]');
  await input.click({ clickCount: 3 });
  await input.fill(value);
  await input.press('Tab'); // trigger blur/change
}
