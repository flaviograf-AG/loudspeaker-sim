/**
 * Test every passive component type to verify it affects SPL output.
 * Regression test for the shunt component bug where Zobel, notch,
 * shunt R/L/C had zero effect due to missing source impedance.
 */
import { test, expect } from '@playwright/test';
import { setupSystem, openAccordion, getSolverResult } from './helpers';

const ALL_PRESETS = [
  '1st_lp', '1st_hp',
  'bw2_lp', 'bw2_hp',
  'lr2_lp', 'lr2_hp',
  'lr4_lp', 'lr4_hp',
  'zobel',
  'lpad_3db', 'lpad_6db',
  'notch', 'series_notch',
  'series_r', 'series_l', 'series_c',
  'shunt_r', 'shunt_l', 'shunt_c',
];

for (const preset of ALL_PRESETS) {
  test(`passive component "${preset}" changes SPL output`, async ({ page }) => {
    await setupSystem(page, '1-Way');
    const baseline = await getSolverResult(page);
    const baseSpl = baseline.system_spl_db.slice();

    await openAccordion(page, 'Crossover');
    await page.locator('select[title*="Add passive"]').first().selectOption(preset);
    await page.waitForTimeout(1000);

    const after = await getSolverResult(page);
    let maxDiff = 0;
    for (let i = 0; i < baseSpl.length; i++) {
      const diff = Math.abs(after.system_spl_db[i] - baseSpl[i]);
      if (diff > maxDiff) maxDiff = diff;
    }
    // 0.3 dB is the minimum visible change on a chart
    expect(maxDiff, `"${preset}" had max SPL change of only ${maxDiff.toFixed(2)} dB`)
      .toBeGreaterThan(0.3);
  });
}
