import { Page, expect } from '@playwright/test';

export type Topology = '1-Way' | '2-Way' | '2.5-Way' | '3-Way' | '3.5-Way' | '4-Way';

/** Wait for WASM to load and dismiss the setup wizard with a given topology and optional enclosure types. */
export async function setupSystem(
  page: Page,
  topology: Topology = '2-Way',
  enclosures?: string[],
) {
  await page.goto('/');
  await page.waitForSelector('.setup-wizard', { timeout: 15000 });
  // Select topology
  await page.locator('.setup-topology-btn', { hasText: topology }).click();

  // Select enclosure types per way (if specified)
  if (enclosures) {
    const selects = page.locator('.setup-way-select');
    for (let i = 0; i < enclosures.length; i++) {
      await selects.nth(i).selectOption(enclosures[i]);
    }
  }

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

/** Select a driver from the 485-driver preset database by search text. */
export async function selectDriverPreset(page: Page, searchText: string) {
  await openAccordion(page, 'Driver');
  const searchInput = page.locator('input[placeholder="Search drivers..."]');
  await searchInput.click();
  await searchInput.fill(searchText);
  await page.waitForTimeout(300);
  // Click the first search result
  const firstResult = page.locator('div[style*="cursor: pointer"]').first();
  await firstResult.click();
  await page.waitForTimeout(500); // solver settle
}

/** Switch to a specific way tab by name (e.g., "Woofer", "Tweeter"). */
export async function switchWay(page: Page, wayName: string) {
  await page.locator('.btn-row .graf-btn', { hasText: wayName }).click();
  await page.waitForTimeout(300);
}

/** Get the current solver result from window.__solverResult. */
export async function getSolverResult(page: Page): Promise<SolverResult> {
  // Wait for result to be populated
  await page.waitForFunction(() => (window as any).__solverResult !== null, { timeout: 10000 });
  return page.evaluate(() => (window as any).__solverResult);
}

/** Get SPL at a specific frequency (nearest point). */
export function splAtFreq(result: SolverResult, targetHz: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < result.frequencies_hz.length; i++) {
    const d = Math.abs(Math.log(result.frequencies_hz[i]) - Math.log(targetHz));
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return result.system_spl_db[bestIdx];
}

/** Get impedance at a specific frequency (nearest point). */
export function impedanceAtFreq(result: SolverResult, targetHz: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < result.frequencies_hz.length; i++) {
    const d = Math.abs(Math.log(result.frequencies_hz[i]) - Math.log(targetHz));
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return result.system_impedance_ohm[bestIdx];
}

/** Import an FRD file for the current way. */
export async function importFrd(page: Page, filePath: string) {
  await openAccordion(page, 'Driver');
  const fileInput = page.locator('input[type="file"][accept*=".frd"]');
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(800);
}

/** Import a ZMA file for the current way. */
export async function importZma(page: Page, filePath: string) {
  await openAccordion(page, 'Driver');
  const fileInput = page.locator('input[type="file"][accept*=".zma"]');
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(800);
}

export interface SolverResult {
  frequencies_hz: number[];
  system_spl_db: number[];
  system_impedance_ohm: number[];
  min_impedance_ohm: number;
  min_impedance_freq_hz: number;
  ways: {
    name: string;
    spl_db: number[];
    filter_gain_db: number[];
  }[];
}
