import { test } from '@playwright/test';
import { setupSystem, openAccordion, expectChartChange, setNumericInput } from './helpers';

test.describe('Enclosure changes update charts (1-way)', () => {
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

test.describe('Enclosure changes update charts (2-way)', () => {
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
