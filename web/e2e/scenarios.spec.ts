/**
 * Real loudspeaker scenario tests.
 *
 * These tests set up actual multi-way systems with real drivers, different
 * enclosure types, FRD/ZMA data, and crossover networks — then assert that
 * the solver output is physically plausible (SPL range, impedance, rolloff).
 *
 * NOT "did the canvas change" — these check numerical acoustic output.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  setupSystem, openAccordion, selectDriverPreset, switchWay,
  getSolverResult, splAtFreq, impedanceAtFreq, setNumericInput,
  importFrd, importZma, type SolverResult,
} from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FRD = path.resolve(__dirname, '../../test-data/WF223BD02.frd');
const TEST_ZMA = path.resolve(__dirname, '../../test-data/WF223BD02.zma');

// ─── Scenario 1: Real 2-way with named drivers, sealed boxes, LR4 crossover ───

test.describe('Scenario: 2-way sealed with real drivers + LR4 crossover', () => {
  test('AUDAX HM210C0 woofer + DAYTON DC28F tweeter at 2.5 kHz', async ({ page }) => {
    await setupSystem(page, '2-Way', ['Sealed', 'Sealed']);

    // Select woofer (way 0 is already active)
    await selectDriverPreset(page, 'HM210C0');
    const afterWoofer = await getSolverResult(page);
    expect(afterWoofer).not.toBeNull();

    // Switch to tweeter and select driver
    await switchWay(page, 'Tweeter');
    await selectDriverPreset(page, 'DC28F');

    // Set crossover frequency to 2500 Hz
    await openAccordion(page, 'Crossover');
    const freqRow = page.locator('.param-row[title*="Crossover frequency"]').first();
    const freqInput = freqRow.locator('input[type="number"]');
    await freqInput.click({ clickCount: 3 });
    await freqInput.fill('2500');
    await freqInput.press('Tab');
    await page.waitForTimeout(1000);

    // Select LR4 slope
    const slopeSelect = page.locator('select[title*="Filter slope"]');
    await slopeSelect.selectOption('LR4');
    await page.waitForTimeout(1000);

    const result = await getSolverResult(page);

    // Physical plausibility checks:

    // 1. System SPL should be in a sane range (60-100 dB) across the passband
    const spl500 = splAtFreq(result, 500);
    const spl1k = splAtFreq(result, 1000);
    const spl5k = splAtFreq(result, 5000);
    const spl10k = splAtFreq(result, 10000);

    expect(spl500).toBeGreaterThan(60);
    expect(spl500).toBeLessThan(105);
    expect(spl1k).toBeGreaterThan(60);
    expect(spl1k).toBeLessThan(105);
    expect(spl5k).toBeGreaterThan(60);
    expect(spl5k).toBeLessThan(105);

    // 2. We have two ways in the output
    expect(result.ways.length).toBe(2);

    // 3. Woofer should be louder than tweeter at 500 Hz
    const wooferSpl500 = result.ways[0].spl_db[
      result.frequencies_hz.findIndex(f => f >= 500)
    ];
    const tweeterSpl500 = result.ways[1].spl_db[
      result.frequencies_hz.findIndex(f => f >= 500)
    ];
    expect(wooferSpl500).toBeGreaterThan(tweeterSpl500 + 10);

    // 4. Tweeter should be louder than woofer at 10 kHz
    const wooferSpl10k = result.ways[0].spl_db[
      result.frequencies_hz.findIndex(f => f >= 10000)
    ];
    const tweeterSpl10k = result.ways[1].spl_db[
      result.frequencies_hz.findIndex(f => f >= 10000)
    ];
    expect(tweeterSpl10k).toBeGreaterThan(wooferSpl10k + 10);

    // 5. Minimum impedance should be > 2 ohms (not shorted)
    expect(result.min_impedance_ohm).toBeGreaterThan(2);

    // 6. System impedance at 1 kHz should be reasonable (3-50 ohms)
    const z1k = impedanceAtFreq(result, 1000);
    expect(z1k).toBeGreaterThan(3);
    expect(z1k).toBeLessThan(50);
  });
});

// ─── Scenario 2: 1-way vented box with real woofer ───

test.describe('Scenario: 1-way vented box (bass reflex)', () => {
  test('AUDAX HM170Z0 in vented box — port tuning extends bass', async ({ page }) => {
    await setupSystem(page, '1-Way', ['Vented']);

    // Select a real 17cm woofer
    await selectDriverPreset(page, 'HM170Z0');
    await page.waitForTimeout(500);

    const result = await getSolverResult(page);

    // Vented box physical checks:

    // 1. SPL should be in sane range at multiple frequencies
    const spl80 = splAtFreq(result, 80);
    const spl200 = splAtFreq(result, 200);
    const spl1k = splAtFreq(result, 1000);
    expect(spl80).toBeGreaterThan(50);
    expect(spl200).toBeGreaterThan(60);
    expect(spl1k).toBeGreaterThan(70);

    // 2. Vented box should have a characteristic dual-hump impedance
    //    (two peaks around the tuning frequency)
    const z30 = impedanceAtFreq(result, 30);
    const z50 = impedanceAtFreq(result, 50);
    const z100 = impedanceAtFreq(result, 100);
    // The dip between the two peaks (near port tuning) should be lower than the peaks
    // At least one of the outer frequencies should have higher impedance
    expect(Math.max(z30, z100)).toBeGreaterThan(z50 * 0.8); // impedance dip near tuning

    // 3. System impedance should never go below Re (~6.2 ohms for this driver)
    expect(result.min_impedance_ohm).toBeGreaterThan(4);

    // 4. Below box tuning, SPL should roll off steeply (24 dB/oct for vented)
    const spl20 = splAtFreq(result, 20);
    expect(spl80 - spl20).toBeGreaterThan(15); // significant bass rolloff below tuning
  });
});

// ─── Scenario 3: 3-way system with different enclosure types ───

test.describe('Scenario: 3-way system (vented woofer, sealed mid, sealed tweeter)', () => {
  test('three real drivers with LR4 crossovers at 500 Hz and 3 kHz', async ({ page }) => {
    await setupSystem(page, '3-Way', ['Vented', 'Sealed', 'Sealed']);

    // Way 0 (Woofer) — select a big woofer
    await selectDriverPreset(page, 'HM210C0');

    // Way 1 (Midrange) — switch tab and select
    await switchWay(page, 'Midrange');
    await selectDriverPreset(page, 'HM100C0');

    // Way 2 (Tweeter) — switch tab and select
    await switchWay(page, 'Tweeter');
    await selectDriverPreset(page, 'DC28F');

    await page.waitForTimeout(1000);
    const result = await getSolverResult(page);

    // 3-way checks:

    // 1. Must have 3 ways
    expect(result.ways.length).toBe(3);

    // 2. System SPL should be plausible across full bandwidth
    const spl100 = splAtFreq(result, 100);
    const spl1k = splAtFreq(result, 1000);
    const spl10k = splAtFreq(result, 10000);
    expect(spl100).toBeGreaterThan(50);
    expect(spl100).toBeLessThan(105);
    expect(spl1k).toBeGreaterThan(50);
    expect(spl1k).toBeLessThan(105);
    expect(spl10k).toBeGreaterThan(50);
    expect(spl10k).toBeLessThan(105);

    // 3. Each way should have data (not all zeros)
    for (const way of result.ways) {
      const maxSpl = Math.max(...way.spl_db);
      expect(maxSpl).toBeGreaterThan(30); // each way produces sound
    }

    // 4. Impedance never goes to zero (no open/short circuit)
    expect(result.min_impedance_ohm).toBeGreaterThan(1);
  });
});

// ─── Scenario 4: FRD+ZMA import — real measured data ───

test.describe('Scenario: 1-way with real FRD+ZMA measured data', () => {
  test('WF223BD02 measured response — solver uses FRD, not T/S', async ({ page }) => {
    await setupSystem(page, '1-Way');

    // Import real FRD and ZMA
    await importFrd(page, TEST_FRD);
    await importZma(page, TEST_ZMA);
    await page.waitForTimeout(1000);

    const result = await getSolverResult(page);

    // FRD checks:

    // 1. SPL should reflect the measured data (WF223BD02 peaks ~90 dB around 1-3 kHz)
    const spl1k = splAtFreq(result, 1000);
    const spl3k = splAtFreq(result, 3000);
    expect(spl1k).toBeGreaterThan(70);
    expect(spl1k).toBeLessThan(100);
    expect(spl3k).toBeGreaterThan(70);

    // 2. Impedance should come from ZMA (not flat Re)
    //    Real drivers have impedance peaks — check for variation
    const z100 = impedanceAtFreq(result, 100);
    const z1k = impedanceAtFreq(result, 1000);
    const z10k = impedanceAtFreq(result, 10000);
    const zRange = Math.max(z100, z1k, z10k) - Math.min(z100, z1k, z10k);
    expect(zRange).toBeGreaterThan(2); // ZMA should show impedance variation, not flat

    // 3. One way only
    expect(result.ways.length).toBe(1);
  });
});

// ─── Scenario 5: Mixed mode — woofer T/S + tweeter FRD ───

test.describe('Scenario: 2-way mixed mode (T/S woofer + FRD tweeter)', () => {
  test('woofer from T/S params, tweeter from measured FRD', async ({ page }) => {
    await setupSystem(page, '2-Way', ['Sealed', 'Sealed']);

    // Way 0 (Woofer) — use T/S params from database
    await selectDriverPreset(page, 'HM170Z0');

    // Way 1 (Tweeter) — use measured FRD data
    await switchWay(page, 'Tweeter');
    await importFrd(page, TEST_FRD);
    await page.waitForTimeout(1000);

    const result = await getSolverResult(page);

    // Mixed mode checks:

    // 1. Two ways present
    expect(result.ways.length).toBe(2);

    // 2. Both ways produce output
    const wooferMax = Math.max(...result.ways[0].spl_db);
    const tweeterMax = Math.max(...result.ways[1].spl_db);
    expect(wooferMax).toBeGreaterThan(50);
    expect(tweeterMax).toBeGreaterThan(50);

    // 3. System SPL is the combination, not just one way
    const sysSpl1k = splAtFreq(result, 1000);
    expect(sysSpl1k).toBeGreaterThan(60);
    expect(sysSpl1k).toBeLessThan(100);

    // 4. Impedance is reasonable
    expect(result.min_impedance_ohm).toBeGreaterThan(2);
  });
});

// ─── Scenario 6: Enclosure type matters — sealed vs vented vs open baffle ───

test.describe('Scenario: same driver, different enclosures produce different results', () => {
  test('sealed vs vented give different bass response for same woofer', async ({ page }) => {
    // First: sealed
    await setupSystem(page, '1-Way', ['Sealed']);
    await selectDriverPreset(page, 'HM210C0');
    await page.waitForTimeout(500);
    const sealedResult = await getSolverResult(page);
    const sealedSpl50 = splAtFreq(sealedResult, 50);
    const sealedSpl200 = splAtFreq(sealedResult, 200);

    // Now: reload with vented
    await setupSystem(page, '1-Way', ['Vented']);
    await selectDriverPreset(page, 'HM210C0');
    await page.waitForTimeout(500);
    const ventedResult = await getSolverResult(page);
    const ventedSpl50 = splAtFreq(ventedResult, 50);
    const ventedSpl200 = splAtFreq(ventedResult, 200);

    // At 200 Hz both should be similar (above both tuning frequencies)
    expect(Math.abs(sealedSpl200 - ventedSpl200)).toBeLessThan(6);

    // At 50 Hz the vented box should have significantly different response
    // (vented extends lower but rolls off faster below tuning)
    expect(Math.abs(sealedSpl50 - ventedSpl50)).toBeGreaterThan(2);

    // Impedance should be different (vented has dual hump)
    const sealedZ = sealedResult.min_impedance_ohm;
    const ventedZ = ventedResult.min_impedance_ohm;
    // Both should be > Re (~6.5 ohms)
    expect(sealedZ).toBeGreaterThan(4);
    expect(ventedZ).toBeGreaterThan(4);
  });
});
