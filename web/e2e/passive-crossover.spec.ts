import { test } from '@playwright/test';
import { setupSystem, openAccordion, expectChartChange } from './helpers';

test.describe('Passive crossover changes update charts', () => {
  test('adding 1st-order LP changes woofer response (2-way)', async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'Crossover');

    await expectChartChange(page, async () => {
      await page.locator('select[title*="Add passive"]').first().selectOption('1st_lp');
    });
  });

  test('editing passive inductor value changes chart (2-way)', async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'Crossover');

    // Add a passive LP first
    await page.locator('select[title*="Add passive"]').first().selectOption('1st_lp');
    await page.waitForTimeout(1000);

    // Now change the inductor value
    await expectChartChange(page, async () => {
      const lInput = page.locator('.param-row', {
        has: page.locator('.param-label', { hasText: /^L$/ }),
      }).locator('input[type="number"]').first();
      await lInput.click({ clickCount: 3 });
      await lInput.fill('5');
      await lInput.press('Tab');
    });
  });

  test('adding passive LP changes chart (1-way)', async ({ page }) => {
    await setupSystem(page, '1-Way');
    await openAccordion(page, 'Crossover');

    await expectChartChange(page, async () => {
      await page.locator('select[title*="Add passive"]').first().selectOption('1st_lp');
    });
  });
});
