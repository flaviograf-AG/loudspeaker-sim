import { test } from '@playwright/test';
import { setupSystem, openAccordion, expectChartChange, setNumericInput } from './helpers';

test.describe('Active crossover changes update charts', () => {
  test('changing crossover frequency updates chart (2-way)', async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'Crossover');

    await expectChartChange(page, async () => {
      // Target the crossover point freq input (has tooltip "Crossover frequency for...")
      const row = page.locator('.param-row[title*="Crossover frequency"]').first();
      const input = row.locator('input[type="number"]');
      await input.click({ clickCount: 3 });
      await input.fill('1500');
      await input.press('Tab');
    });
  });

  test('adding PEQ changes chart', async ({ page }) => {
    await setupSystem(page, '2-Way');
    await openAccordion(page, 'Crossover');

    await expectChartChange(page, async () => {
      // Select "+ Add EQ filter..." dropdown and pick first EQ option
      const sel = page.locator('select', { has: page.locator('option', { hasText: 'Add EQ filter' }) });
      await sel.selectOption({ index: 1 }); // First EQ preset
    });
  });
});
