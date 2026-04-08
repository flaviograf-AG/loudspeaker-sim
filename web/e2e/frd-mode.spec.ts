import { test, expect } from '@playwright/test';
import { setupSystem, openAccordion, expectChartChange } from './helpers';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FRD = path.resolve(__dirname, '../../test-data/WF223BD02.frd');

test.describe('FRD mode — enclosure disabled when measured data loaded', () => {
  test('enclosure shows disabled banner after FRD import', async ({ page }) => {
    await setupSystem(page, '1-Way');
    await openAccordion(page, 'Driver');

    // Upload FRD file
    const fileInput = page.locator('input[type="file"][accept*=".frd"]');
    await fileInput.setInputFiles(TEST_FRD);
    await page.waitForTimeout(500);

    // Open enclosure accordion
    await openAccordion(page, 'Enclosure');

    // Should show disabled banner
    const disabled = page.locator('[data-testid="enclosure-disabled"]');
    await expect(disabled).toBeVisible();
    await expect(disabled).toContainText('Measured data active');
  });

  test('clearing FRD re-enables enclosure controls', async ({ page }) => {
    await setupSystem(page, '1-Way');
    await openAccordion(page, 'Driver');

    // Upload FRD
    const fileInput = page.locator('input[type="file"][accept*=".frd"]');
    await fileInput.setInputFiles(TEST_FRD);
    await page.waitForTimeout(500);

    // Clear FRD
    await page.locator('button', { hasText: 'Clear FRD/ZMA' }).click();
    await page.waitForTimeout(300);

    // Open enclosure
    await openAccordion(page, 'Enclosure');

    // Should NOT show disabled banner
    const disabled = page.locator('[data-testid="enclosure-disabled"]');
    await expect(disabled).not.toBeVisible();
  });

  test('passive filter changes still update chart with FRD', async ({ page }) => {
    await setupSystem(page, '1-Way');
    await openAccordion(page, 'Driver');

    // Upload FRD
    const fileInput = page.locator('input[type="file"][accept*=".frd"]');
    await fileInput.setInputFiles(TEST_FRD);
    await page.waitForTimeout(500);

    // Open crossover
    await openAccordion(page, 'Crossover');

    // Add passive LP — should still change chart even with measured data
    await expectChartChange(page, async () => {
      await page.locator('select[title*="Add passive"]').first().selectOption('1st_lp');
    });
  });
});
