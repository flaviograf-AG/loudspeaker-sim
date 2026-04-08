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
      // "Inv" checkbox label
      await page.locator('label', { hasText: 'Inv' }).locator('input[type="checkbox"]').click();
    });
  });

  test('toggling way enable updates chart', async ({ page }) => {
    await expectChartChange(page, async () => {
      // "On" checkbox label
      await page.locator('label', { hasText: /^\s*On\s*$/ }).locator('input[type="checkbox"]').click();
    });
  });
});
