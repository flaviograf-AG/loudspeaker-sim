# E2E Testing + Solver Bug Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Playwright E2E testing to catch orchestration bugs, then fix the identified solver routing issues.

**Architecture:** Playwright tests verify the full chain: UI input → React state → WASM solver → chart render. Each test asserts numerical output AND visual change. Solver bugs are fixed in Rust with corresponding Playwright + cargo tests.

**Tech Stack:** Playwright (browser E2E), Rust/WASM (solver), React 19 + ECharts 6 (frontend)

---

## Phase 1: Playwright Setup

### Task 1: Install Playwright and configure

**Files:**
- Modify: `web/package.json`
- Create: `web/playwright.config.ts`
- Create: `web/e2e/helpers.ts`

**Step 1: Install Playwright**

```bash
cd web && npm install -D @playwright/test && npx playwright install chromium
```

**Step 2: Create Playwright config**

Create `web/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
```

**Step 3: Create test helpers**

Create `web/e2e/helpers.ts`:

```typescript
import { Page, expect } from '@playwright/test';

/** Wait for WASM to load and dismiss the setup wizard with a given topology. */
export async function setupSystem(page: Page, topology: '1-Way' | '2-Way' = '2-Way') {
  await page.goto('/');
  await page.waitForSelector('button:has-text("Start Designing")', { timeout: 15000 });
  // Select topology if not default
  if (topology !== '2-Way') {
    await page.click(`button:has-text("${topology}")`);
  }
  await page.click('button:has-text("Start Designing")');
  // Wait for charts to render
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(1000); // debounce settle
}

/** Open an accordion section by title. */
export async function openAccordion(page: Page, title: string) {
  await page.click(`.accordion-header:has-text("${title}")`);
  await page.waitForTimeout(300);
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
  await page.waitForTimeout(500); // solver debounce + render
  const after = await getChartHash(page);
  expect(before).not.toBe(after);
}

/** Set a NumericInput value by its label text. */
export async function setNumericInput(page: Page, label: string, value: string) {
  const row = page.locator(`.param-row:has(.param-label:text("${label}")), .graf-form-group:has(label:text("${label}"))`);
  const input = row.locator('input[type="number"]');
  await input.click({ clickCount: 3 });
  await input.fill(value);
  await input.press('Tab'); // trigger blur/change
}
```

**Step 4: Add test script to package.json**

Add to `web/package.json` scripts:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

**Step 5: Commit**

```bash
git add web/package.json web/playwright.config.ts web/e2e/
git commit -m "chore: add Playwright E2E test infrastructure"
```

---

### Task 2: Core orchestration tests — driver params affect charts

**Files:**
- Create: `web/e2e/driver-params.spec.ts`

**Step 1: Write the test**

```typescript
import { test, expect } from '@playwright/test';
import { setupSystem, openAccordion, getChartHash, expectChartChange, setNumericInput } from './helpers';

test.describe('Driver parameter changes update charts', () => {
  test.beforeEach(async ({ page }) => {
    await setupSystem(page, '1-Way');
    await openAccordion(page, 'Driver');
  });

  test('changing Fs updates SPL chart', async ({ page }) => {
    await expectChartChange(page, async () => {
      await setNumericInput(page, 'Fs', '50');
    });
  });

  test('changing Qes updates SPL chart', async ({ page }) => {
    await expectChartChange(page, async () => {
      await setNumericInput(page, 'Qes', '0.6');
    });
  });

  test('changing Vas updates SPL chart', async ({ page }) => {
    await expectChartChange(page, async () => {
      await setNumericInput(page, 'Vas', '25');
    });
  });
});
```

**Step 2: Run test, verify it passes**

```bash
cd web && npx playwright test driver-params.spec.ts
```

Expected: 3 PASS (driver params do affect charts — this validates the basic pipeline).

**Step 3: Commit**

```bash
git add web/e2e/driver-params.spec.ts
git commit -m "test: driver parameter changes update charts (Playwright E2E)"
```

---

### Task 3: Enclosure changes affect charts (T/S mode)

**Files:**
- Create: `web/e2e/enclosure.spec.ts`

**Step 1: Write the test**

```typescript
import { test, expect } from '@playwright/test';
import { setupSystem, openAccordion, expectChartChange, setNumericInput } from './helpers';

test.describe('Enclosure changes update charts (T/S mode)', () => {
  test.beforeEach(async ({ page }) => {
    await setupSystem(page, '1-Way');
    await openAccordion(page, 'Enclosure');
  });

  test('changing sealed box volume updates SPL', async ({ page }) => {
    await expectChartChange(page, async () => {
      await setNumericInput(page, 'Volume', '40');
    });
  });

  test('changing Ql updates SPL', async ({ page }) => {
    await expectChartChange(page, async () => {
      await setNumericInput(page, 'Ql', '3');
    });
  });
});

test.describe('Enclosure changes update charts (2-way T/S)', () => {
  test.beforeEach(async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'Enclosure');
  });

  test('changing woofer volume updates system SPL', async ({ page }) => {
    await expectChartChange(page, async () => {
      await setNumericInput(page, 'Volume', '40');
    });
  });
});
```

**Step 2: Run, expect pass**

```bash
cd web && npx playwright test enclosure.spec.ts
```

**Step 3: Commit**

---

### Task 4: Passive crossover changes affect charts

**Files:**
- Create: `web/e2e/passive-crossover.spec.ts`

**Step 1: Write the test**

```typescript
import { test, expect } from '@playwright/test';
import { setupSystem, openAccordion, getChartHash, expectChartChange } from './helpers';

test.describe('Passive crossover changes update charts', () => {
  test('adding 1st-order LP changes woofer response (2-way)', async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'Crossover');

    await expectChartChange(page, async () => {
      const sel = page.locator('select:has(option[value="1st_lp"])');
      await sel.selectOption('1st_lp');
    });
  });

  test('editing passive inductor value changes chart (2-way)', async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'Crossover');

    // Add a passive LP first
    const sel = page.locator('select:has(option[value="1st_lp"])');
    await sel.selectOption('1st_lp');
    await page.waitForTimeout(1000);

    // Now change the inductor from default to 5 mH
    await expectChartChange(page, async () => {
      const lInput = page.locator('.param-row:has(.param-label:text("L")) input[type="number"]').first();
      await lInput.click({ clickCount: 3 });
      await lInput.fill('5');
      await lInput.press('Tab');
    });
  });

  test('adding passive LP changes chart (1-way)', async ({ page }) => {
    await setupSystem(page, '1-Way');
    await openAccordion(page, 'Crossover');

    await expectChartChange(page, async () => {
      const sel = page.locator('select:has(option[value="1st_lp"])');
      await sel.selectOption('1st_lp');
    });
  });
});
```

**Step 2: Run tests**

```bash
cd web && npx playwright test passive-crossover.spec.ts
```

Expected: The 2-way tests should PASS (system solver handles passive filters). The 1-way test should now also PASS after the solver routing fix. If any FAIL, that's a confirmed bug.

**Step 3: Commit**

---

### Task 5: Active crossover / EQ changes affect charts

**Files:**
- Create: `web/e2e/active-crossover.spec.ts`

**Step 1: Write the test**

```typescript
import { test } from '@playwright/test';
import { setupSystem, openAccordion, expectChartChange, setNumericInput } from './helpers';

test.describe('Active crossover changes update charts', () => {
  test('changing crossover frequency updates chart (2-way)', async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'Crossover');

    await expectChartChange(page, async () => {
      await setNumericInput(page, 'Freq', '1500');
    });
  });

  test('adding PEQ changes chart', async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'Crossover');

    await expectChartChange(page, async () => {
      const sel = page.locator('select:has(option[value*="PEQ"])');
      await sel.first().selectOption({ index: 1 }); // First EQ option
    });
  });
});
```

**Step 2: Run, expect pass**

**Step 3: Commit**

---

### Task 6: Per-way controls affect charts (gain, delay, invert, enable)

**Files:**
- Create: `web/e2e/way-controls.spec.ts`

**Step 1: Write the test**

```typescript
import { test } from '@playwright/test';
import { setupSystem, openAccordion, expectChartChange, setNumericInput } from './helpers';

test.describe('Per-way controls update charts (2-way)', () => {
  test.beforeEach(async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'Crossover');
  });

  test('changing gain updates chart', async ({ page }) => {
    await expectChartChange(page, async () => {
      await setNumericInput(page, 'Gain', '-6');
    });
  });

  test('toggling invert updates chart', async ({ page }) => {
    await expectChartChange(page, async () => {
      await page.locator('label:has-text("Inv") input[type="checkbox"]').click();
    });
  });

  test('toggling way enable updates chart', async ({ page }) => {
    await expectChartChange(page, async () => {
      await page.locator('label:has-text("On") input[type="checkbox"]').click();
    });
  });
});
```

**Step 2: Run, expect pass**

**Step 3: Commit**

---

### Task 7: System-level controls affect charts

**Files:**
- Create: `web/e2e/system-controls.spec.ts`

**Step 1: Write the test**

```typescript
import { test } from '@playwright/test';
import { setupSystem, openAccordion, expectChartChange, setNumericInput } from './helpers';

test.describe('System controls update charts', () => {
  test.beforeEach(async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'System');
  });

  test('changing drive voltage updates chart', async ({ page }) => {
    await expectChartChange(page, async () => {
      await setNumericInput(page, 'Drive', '1');
    });
  });

  test('changing freq start updates chart', async ({ page }) => {
    await expectChartChange(page, async () => {
      await setNumericInput(page, 'F start', '50');
    });
  });

  test('changing freq end updates chart', async ({ page }) => {
    await expectChartChange(page, async () => {
      await setNumericInput(page, 'F end', '10000');
    });
  });
});
```

**Step 2: Run, expect pass**

**Step 3: Commit**

---

## Phase 2: Architectural Review — FRD/ZMA + Enclosure Interaction

### Task 8: Research and document how FRD/ZMA should interact with enclosure models

**Files:**
- Create: `docs/plans/2026-04-08-frd-enclosure-interaction.md`

**Step 1: Research**

Read the published theory. Key question: when a user imports FRD/ZMA data, what does it represent and how should enclosure models interact with it?

**Standard practice in loudspeaker CAD tools:**
- **XSim, VituixCAD, PCD:** FRD = measured response of driver IN ITS ENCLOSURE. Enclosure model is NOT applied on top. The user measures the driver in the actual box, imports FRD, then designs crossover.
- **Hornresp, WinISD, AJ-Horn:** T/S parameter mode only. No FRD import. Enclosure model always applied.
- **This app bridges both:** T/S + enclosure simulation AND FRD/ZMA import for crossover design.

**Correct behavior:**
1. When `measured` data is present: FRD represents the driver's acoustic output as measured (typically in-box, on-baffle, or at a specific measurement distance). The enclosure model is NOT applied on top — it would double-count the acoustic loading.
2. Passive filters, active filters, gain, delay, inversion: ALL still apply — these are signal-chain elements downstream of the driver acoustic output.
3. Enclosure controls SHOULD be disabled/hidden when FRD is loaded — they are meaningless in this mode.

**Step 2: Document the finding**

Write the research finding to `docs/plans/2026-04-08-frd-enclosure-interaction.md` with citations.

**Step 3: Commit**

---

### Task 9: Add "FRD mode" UI feedback — disable enclosure controls when measured data is active

**Files:**
- Modify: `web/src/App.tsx` (EnclosureInputs section)
- Modify: `web/src/components/EnclosureInputs.tsx` (add disabled state)

**Step 1: In App.tsx, pass `hasMeasured` prop to EnclosureInputs**

Where EnclosureInputs is rendered (~line 291), add:

```typescript
<EnclosureInputs
  config={way.enclosure}
  driver={way.driver}
  // ... existing props ...
  disabled={!!way.measured}
  disabledReason="Enclosure model bypassed — using measured FRD response"
/>
```

**Step 2: In EnclosureInputs.tsx, show disabled state with explanation**

When `disabled` is true, show a banner explaining why enclosure controls are inactive and grey out inputs.

**Step 3: Write E2E test**

Create `web/e2e/frd-mode.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
// Test that enclosure controls are disabled when FRD is loaded
// Test that passive filter changes still update charts with FRD
```

**Step 4: Commit**

---

## Phase 3: Fix Remaining Bugs

### Task 10: Verify passive filters work with FRD/ZMA in the Rust solver

**Files:**
- Test: `solver/tests/frd_passive_tests.rs`

**Step 1: Write a Rust integration test**

```rust
/// Verify that passive filters affect the system output even when
/// measured FRD/ZMA data is used instead of T/S simulation.
#[test]
fn passive_filter_affects_measured_data_system() {
    // Create a 1-way system with measured FRD data
    // Run solve_system WITHOUT passive filters → get SPL curve A
    // Run solve_system WITH a series inductor → get SPL curve B
    // Assert: curves differ by > 1 dB at some frequency
}
```

**Step 2: Run test**

```bash
cd solver && cargo test passive_filter_affects_measured -- --nocapture
```

Expected: PASS (the Rust code at system.rs:178-183 does apply passive filters with measured data). If FAIL, that's a Rust-level bug to fix.

**Step 3: Commit**

---

### Task 11: Clean up PlotArea.tsx (now dead code)

**Files:**
- Delete: `web/src/components/PlotArea.tsx` (no longer imported after Task 2 fix)

**Step 1: Verify PlotArea is truly unused**

```bash
grep -r "PlotArea" web/src/ --include="*.ts" --include="*.tsx"
```

Should only appear in PlotArea.tsx itself and nowhere else.

**Step 2: Delete the file**

**Step 3: Commit**

---

### Task 12: Update CLAUDE.md — remove false "46 E2E tests" claim, add Playwright info

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update testing section**

- Remove "46 E2E Puppeteer tests passing" claim
- Add Playwright info: `cd web && npx playwright test`
- Document the unified solver routing: all systems use `solve_system`, even 1-way

**Step 2: Commit**

---

## Execution Order

| Phase | Tasks | Purpose |
|-------|-------|---------|
| **1** | Tasks 1–7 | Playwright setup + comprehensive orchestration tests |
| **2** | Tasks 8–9 | Architectural research + UI fix for FRD mode |
| **3** | Tasks 10–12 | Rust-level verification, cleanup, docs |

Total: 12 tasks, ~30 test cases covering every input→chart dependency.
