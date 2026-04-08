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
