#!/usr/bin/env node
/**
 * Comprehensive regression and unit test suite for the driver-base importer & validator.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  validateDriverBaseRecord,
  importDriverBaseSnapshot,
  refreshDriverDatabaseSafely,
  DRIVER_BASE_SOURCE_URL,
} from './import-driver-base.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const snapshotPath = path.resolve(__dirname, '../src/presets/driver_base_snapshot.json');
const rawText = fs.readFileSync(snapshotPath, 'utf8');
const snapshotSha256 = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex');
const snapshot = JSON.parse(rawText);

let passedTests = 0;
function runTest(name, fn) {
  fn();
  passedTests++;
  console.log(`  [PASS] ${name}`);
}

console.log('Running driver-base importer regression tests...');

// 1. Frozen fixture: Beyma 12BR70, 8 Ω (bad mms_g = 0.074 vs corrected mms_g = 74)
runTest('Beyma 12BR70, 8 Ω: quarantines bad mms_g=0.074 (Fs≈996.1 Hz vs 31 Hz) and accepts mms_g=74 (Fs≈31.5 Hz)', () => {
  const beymaRaw = snapshot.drivers.find((d) => d.canonical_id === 'beyma__12br70__8ohm');
  assert.ok(beymaRaw, 'beyma__12br70__8ohm must exist in frozen snapshot');
  assert.equal(beymaRaw.mms_g, 0.074);
  assert.equal(beymaRaw.cms_mm_per_n, 0.345);
  assert.equal(beymaRaw.fs_hz, 31.0);

  const badRes = validateDriverBaseRecord(beymaRaw);
  assert.equal(badRes.status, 'QUARANTINE');
  assert.equal(badRes.simulation_ready, false);

  const fsCheck = badRes.failed_checks.find((c) => c.check_id === 'fs_from_mms_cms');
  assert.ok(fsCheck, 'fs_from_mms_cms check must fail on bad mms_g=0.074');
  assert.ok(
    Math.abs(fsCheck.predicted_value - 996.11) < 0.5,
    `Expected predicted Fs ≈ 996.1 Hz, got ${fsCheck.predicted_value}`
  );
  assert.equal(fsCheck.published_value, 31.0);
  assert.ok(fsCheck.error_pct > 3000, `Expected >3000% error, got ${fsCheck.error_pct}%`);

  // Now test with corrected mms_g = 74 g
  const fixedBeyma = { ...beymaRaw, mms_g: 74.0 };
  const fixedRes = validateDriverBaseRecord(fixedBeyma);
  const fixedFsCheck = fixedRes.checks_run.find((c) => c.check_id === 'fs_from_mms_cms');
  assert.ok(fixedFsCheck, 'fs_from_mms_cms check must run on corrected mms_g=74');
  assert.equal(fixedFsCheck.passed, true);
  assert.ok(
    Math.abs(fixedFsCheck.predicted_value - 31.5) < 0.1,
    `Expected predicted Fs ≈ 31.5 Hz, got ${fixedFsCheck.predicted_value}`
  );
  assert.equal(fixedRes.status, 'ACCEPT');
  assert.equal(fixedRes.simulation_ready, true);
});

// 2. Frozen fixture: Dayton Audio RSS315HF-4, 4 Ω (bad bl_tm = 1.0 vs corrected bl_tm = 13.99)
runTest('Dayton Audio RSS315HF-4, 4 Ω: quarantines bad bl_tm=1.0 (Qes≈88.6 vs 0.45) and accepts bl_tm=13.99 (Qes≈0.453)', () => {
  const daytonRaw = snapshot.drivers.find((d) => d.canonical_id === 'dayton__rss315hf_4__4ohm');
  assert.ok(daytonRaw, 'dayton__rss315hf_4__4ohm must exist in frozen snapshot');
  assert.equal(daytonRaw.bl_tm, 1.0);
  assert.equal(daytonRaw.qes, 0.45);

  const badRes = validateDriverBaseRecord(daytonRaw);
  assert.equal(badRes.status, 'QUARANTINE');
  assert.equal(badRes.simulation_ready, false);

  const qesCheck = badRes.failed_checks.find((c) => c.check_id === 'qes_from_fs_mms_re_bl');
  assert.ok(qesCheck, 'qes_from_fs_mms_re_bl check must fail on bad bl_tm=1.0');
  assert.ok(
    Math.abs(qesCheck.predicted_value - 88.615) < 0.1,
    `Expected predicted Qes ≈ 88.6, got ${qesCheck.predicted_value}`
  );
  assert.equal(qesCheck.published_value, 0.45);
  assert.ok(qesCheck.error_pct > 19000, `Expected >19000% error, got ${qesCheck.error_pct}%`);

  // Note: Qts check passes on the bad fixture, proving one failed check is sufficient even if Qts passes
  const qtsCheck = badRes.checks_run.find((c) => c.check_id === 'qts_from_qms_qes');
  assert.ok(qtsCheck && qtsCheck.passed, 'Qts check passes on RSS315HF-4, yet record is still quarantined');

  // Now test with corrected bl_tm = 13.99 T·m
  const fixedDayton = { ...daytonRaw, bl_tm: 13.99 };
  const fixedRes = validateDriverBaseRecord(fixedDayton);
  const fixedQesCheck = fixedRes.checks_run.find((c) => c.check_id === 'qes_from_fs_mms_re_bl');
  assert.ok(fixedQesCheck, 'qes_from_fs_mms_re_bl check must run on corrected bl_tm=13.99');
  assert.equal(fixedQesCheck.passed, true);
  assert.ok(
    Math.abs(fixedQesCheck.predicted_value - 0.4528) < 0.005,
    `Expected predicted Qes ≈ 0.453, got ${fixedQesCheck.predicted_value}`
  );
  assert.equal(fixedRes.status, 'ACCEPT');
  assert.equal(fixedRes.simulation_ready, true);
});

// 3. Missing fields: skipped checks do not fail; record with no runnable checks is UNVERIFIED
runTest('Missing fields: skips checks with missing inputs and marks record UNVERIFIED when no checks can run', () => {
  const unverifiedFixture = {
    canonical_id: 'test__missing_fields__8ohm',
    manufacturer: 'TestAudio',
    model: 'MissingFields-8',
    fs_hz: 45,
    re_ohm: 6.2,
    qes: 0.45,
    qms: null,
    qts: null,
    vas_liters: 25,
    sd_cm2: 135,
    mms_g: null,
    cms_mm_per_n: null,
    rms_ns_per_m: null,
    bl_tm: null,
    spec_source: {
      fs_hz: 'html_table',
      re_ohm: 'html_table',
      qes: 'html_table',
      vas_liters: 'html_table',
      sd_cm2: 'html_table',
    },
  };

  const res = validateDriverBaseRecord(unverifiedFixture);
  assert.equal(res.status, 'UNVERIFIED');
  assert.equal(res.checks_run.length, 0);
  assert.equal(res.invalid_fields.length, 0);
  assert.equal(res.simulation_ready, false);
});

// 4. Derived-only checks: publisher-derived fields cannot validate their own inputs
runTest('Derived-only checks: skips checks where any participating field is marked "derived" in spec_source', () => {
  const derivedOnlyFixture = {
    canonical_id: 'test__derived_only__8ohm',
    manufacturer: 'TestAudio',
    model: 'DerivedOnly-8',
    fs_hz: 40,
    re_ohm: 6.0,
    qes: 0.5,
    qms: 4.5,
    // Qts = 4.5 * 0.5 / 5.0 = 0.45, but marked "derived"
    qts: 0.45,
    vas_liters: 30,
    sd_cm2: 140,
    // Cms derived from Vas & Sd
    cms_mm_per_n: 0.916,
    mms_g: null,
    rms_ns_per_m: null,
    bl_tm: null,
    spec_source: {
      fs_hz: 'html_table',
      re_ohm: 'html_table',
      qes: 'html_table',
      qms: 'html_table',
      qts: 'derived',
      vas_liters: 'html_table',
      sd_cm2: 'html_table',
      cms_mm_per_n: 'derived',
    },
  };

  const res = validateDriverBaseRecord(derivedOnlyFixture);
  assert.equal(res.checks_run.length, 0);
  assert.equal(res.status, 'UNVERIFIED');
  assert.equal(res.simulation_ready, false);
  const derivedSkips = res.skipped_checks.filter((s) => s.reason === 'derived_fields');
  assert.equal(derivedSkips.length, 2);
});

// 5. Invalid supplied values vs missing values
runTest('Invalid values: distinguishes supplied non-finite or non-positive values from missing (null) and quarantines', () => {
  const zeroMmsFixture = {
    canonical_id: 'test__invalid_zero_mms__8ohm',
    manufacturer: 'TestAudio',
    model: 'ZeroMms-8',
    fs_hz: 50,
    re_ohm: 6.0,
    qes: 0.5,
    qms: 4.5,
    qts: 0.45, // Qts check is valid (0% error)
    mms_g: 0, // Invalid non-positive supplied value!
    cms_mm_per_n: null, // Missing value (not invalid)
    vas_liters: 20,
    sd_cm2: 120,
    spec_source: {
      fs_hz: 'html_table',
      re_ohm: 'html_table',
      qes: 'html_table',
      qms: 'html_table',
      qts: 'html_table',
      mms_g: 'html_table',
    },
  };

  const res = validateDriverBaseRecord(zeroMmsFixture);
  assert.equal(res.status, 'QUARANTINE');
  assert.equal(res.simulation_ready, false);
  assert.equal(res.invalid_fields.length, 1);
  assert.equal(res.invalid_fields[0].field, 'mms_g');
  assert.equal(res.invalid_fields[0].reason, 'non_positive');

  const nanBlFixture = {
    ...zeroMmsFixture,
    canonical_id: 'test__invalid_nan_bl__8ohm',
    mms_g: null,
    bl_tm: Number.NaN,
  };
  const resNan = validateDriverBaseRecord(nanBlFixture);
  assert.equal(resNan.status, 'QUARANTINE');
  assert.equal(resNan.invalid_fields.length, 1);
  assert.equal(resNan.invalid_fields[0].field, 'bl_tm');
  assert.equal(resNan.invalid_fields[0].reason, 'non_finite');
});

// 6. Exact 10% boundary & 5% review flag
runTest('Exact 10% boundary: accepts error_pct == 10.0% (flagged >5%) and quarantines error_pct > 10.0%', () => {
  // Published qts = 0.50; if qms = 1.1 and qes = 1.1, predicted Qts = 0.55 -> exact 10.0% error
  const exact10Fixture = {
    canonical_id: 'test__boundary_10pct__8ohm',
    manufacturer: 'TestAudio',
    model: 'Boundary10',
    fs_hz: 50,
    re_ohm: 6.0,
    qms: 1.1,
    qes: 1.1,
    qts: 0.5, // predicted = 0.55 -> |0.55 - 0.50| / 0.50 = 10.0%
    vas_liters: 20,
    sd_cm2: 130,
    spec_source: {
      qms: 'html_table',
      qes: 'html_table',
      qts: 'html_table',
    },
  };

  const res10 = validateDriverBaseRecord(exact10Fixture);
  assert.equal(res10.status, 'ACCEPT');
  assert.equal(res10.simulation_ready, true);
  assert.equal(res10.qts_only_validated, true);
  assert.equal(res10.review_flags.length, 1);
  assert.ok(Math.abs(res10.checks_run[0].error_pct - 10.0) < 1e-9);

  // Slightly over 10% error (predicted = 0.5505 -> 10.1% error)
  const over10Fixture = {
    ...exact10Fixture,
    canonical_id: 'test__over_10pct__8ohm',
    qms: 1.101,
    qes: 1.101, // predicted = 0.5505 -> 10.1% error
  };
  const resOver10 = validateDriverBaseRecord(over10Fixture);
  assert.equal(resOver10.status, 'QUARANTINE');
  assert.equal(resOver10.simulation_ready, false);
});

// 7. Safe staging refresh: removes newly quarantined driver and preserves active DB on import failure
runTest('Safe staging refresh: removes previously accepted driver when it enters quarantine and keeps active DB on failed snapshot', () => {
  const driverA = {
    canonical_id: 'test__driver_a__8ohm',
    manufacturer: 'TestAudio',
    model: 'DriverA',
    fs_hz: 31.5,
    re_ohm: 5.8,
    qms: 6.18,
    qes: 0.45,
    qts: 0.42,
    mms_g: 74.0,
    cms_mm_per_n: 0.345,
    vas_liters: 136.85,
    sd_cm2: 530.0,
    spec_source: {
      fs_hz: 'html_table',
      qms: 'html_table',
      qes: 'html_table',
      qts: 'html_table',
      mms_g: 'html_table',
      cms_mm_per_n: 'html_table',
      vas_liters: 'html_table',
      sd_cm2: 'html_table',
    },
  };
  const driverB = {
    ...driverA,
    canonical_id: 'test__driver_b__8ohm',
    model: 'DriverB',
  };

  const initialImport = importDriverBaseSnapshot({
    schema_version: '1.0',
    generated_at: '2026-11-01T00:00:00Z',
    drivers: [driverA, driverB],
  });
  assert.equal(initialImport.counts.simulation_ready, 2);

  let activeState = {
    import_metadata: {
      source_url: initialImport.source_url,
      attribution: initialImport.attribution,
      generated_at: initialImport.generated_at,
      snapshot_sha256: 'sha-1',
      tolerance_pct: initialImport.tolerance_pct,
    },
    simulation_ready_by_id: initialImport.simulation_ready_drivers,
    validation_by_id: initialImport.validation_by_id,
    quarantine_report: initialImport.quarantine_report,
  };

  // Refresh 1: driverB now has corrupted mms_g = 0.074 -> moves to QUARANTINE
  const refresh1 = refreshDriverDatabaseSafely(activeState, {
    schema_version: '1.0',
    generated_at: '2026-11-02T00:00:00Z',
    drivers: [driverA, { ...driverB, mms_g: 0.074 }],
  });

  assert.equal(refresh1.updated, true);
  assert.deepEqual(refresh1.removed_from_simulation_ready, ['test__driver_b__8ohm']);
  assert.equal(refresh1.state.simulation_ready_by_id.has('test__driver_a__8ohm'), true);
  assert.equal(refresh1.state.simulation_ready_by_id.has('test__driver_b__8ohm'), false);
  assert.equal(refresh1.state.quarantine_report.length, 1);
  assert.equal(refresh1.state.quarantine_report[0].canonical_id, 'test__driver_b__8ohm');

  activeState = refresh1.state;

  // Refresh 2: malformed JSON or network failure -> keeps previous active dataset intact
  const refresh2 = refreshDriverDatabaseSafely(activeState, '{ invalid json ');
  assert.equal(refresh2.updated, false);
  assert.ok(refresh2.error);
  assert.equal(refresh2.state, activeState);
  assert.equal(refresh2.state.simulation_ready_by_id.size, 1);
  assert.equal(refresh2.state.simulation_ready_by_id.has('test__driver_a__8ohm'), true);
});

console.log(`All ${passedTests} test suites passed!`);

// Diagnostics on snapshot duplicates and missing simulation inputs
const seenIds = new Map();
const dupIds = [];
for (const d of snapshot.drivers) {
  if (seenIds.has(d.canonical_id)) {
    dupIds.push(d.canonical_id);
  }
  seenIds.set(d.canonical_id, (seenIds.get(d.canonical_id) ?? 0) + 1);
}
console.log(`Raw drivers array length: ${snapshot.drivers.length}`);
console.log(`Unique canonical_ids: ${seenIds.size} (duplicate entries in raw array: ${dupIds.length})`);
if (dupIds.length > 0) {
  console.log('Duplicate canonical_ids:', dupIds);
  let rawAccept = 0, rawQuarantine = 0, rawUnverified = 0;
  for (const d of snapshot.drivers) {
    const v = validateDriverBaseRecord(d);
    if (v.status === 'ACCEPT') rawAccept++;
    else if (v.status === 'QUARANTINE') rawQuarantine++;
    else rawUnverified++;
  }
  console.log(`Without canonical_id deduplication (all ${snapshot.drivers.length} raw entries): accept=${rawAccept}, quarantine=${rawQuarantine}, unverified=${rawUnverified}`);
}

const fullImport = importDriverBaseSnapshot(snapshot, {
  snapshotSha256,
  sourceUrl: DRIVER_BASE_SOURCE_URL,
});
const missingSimReasonCounts = {};
let acceptWithVasNonNegAndRequiredPos = 0;
let acceptWithDerivedVasPossible = 0;
for (const v of fullImport.validation_by_id.values()) {
  if (v.status === 'ACCEPT') {
    const r = v.raw_record;
    const hasCore5 =
      typeof r.fs_hz === 'number' && r.fs_hz > 0 &&
      typeof r.re_ohm === 'number' && r.re_ohm > 0 &&
      typeof r.qes === 'number' && r.qes > 0 &&
      typeof r.qms === 'number' && r.qms > 0 &&
      typeof r.sd_cm2 === 'number' && r.sd_cm2 > 0;
    if (hasCore5) {
      acceptWithVasNonNegAndRequiredPos++;
      if (!(typeof r.vas_liters === 'number' && r.vas_liters > 0)) {
        if ((typeof r.cms_mm_per_n === 'number' && r.cms_mm_per_n > 0) || (typeof r.mms_g === 'number' && r.mms_g > 0)) {
          acceptWithDerivedVasPossible++;
        }
      }
    }
  }
  if (v.status === 'ACCEPT' && !v.simulation_ready) {
    const key = `${v.raw_record.driver_kind}:${v.missing_simulation_fields.join(',')}`;
    missingSimReasonCounts[key] = (missingSimReasonCounts[key] ?? 0) + 1;
  }
}
console.log('Accepted but missing simulation fields breakdown (by driver_kind:fields):', missingSimReasonCounts);
console.log('Accepted with core 5 (fs,re,qes,qms,sd > 0):', acceptWithVasNonNegAndRequiredPos, 'of which missing Vas has Cms/Mms:', acceptWithDerivedVasPossible);

