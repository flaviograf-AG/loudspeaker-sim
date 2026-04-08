import { test } from '@playwright/test';
import { setupSystem, openAccordion, expectChartChange, setNumericInput } from './helpers';

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
