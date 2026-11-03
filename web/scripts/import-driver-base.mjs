#!/usr/bin/env node
/**
 * Driver Base Importer & Validator CLI
 *
 * Imports https://jonathandcohen.github.io/driver-base/drivers.json
 * (or local snapshot web/src/presets/driver_base_snapshot.json),
 * validates published T/S parameters against 6 physical consistency equations
 * in SI units before deriving or rounding anything, applies the explicit
 * ACCEPT / QUARANTINE / UNVERIFIED rule, filters simulation-ready records,
 * and writes:
 *   - web/src/presets/driver_base_quarantine_report.json
 *   - web/src/presets/driver_base_db.ts
 *
 * Attribution:
 *   Dataset: driver-base by Jonathan D. Cohen
 *   Source: https://jonathandcohen.github.io/driver-base/drivers.json
 *   License: Creative Commons Attribution 4.0 International (CC BY 4.0)
 *   https://creativecommons.org/licenses/by/4.0/
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DRIVER_BASE_SOURCE_URL = 'https://jonathandcohen.github.io/driver-base/drivers.json';
export const DRIVER_BASE_ATTRIBUTION =
  'Driver Base dataset by Jonathan D. Cohen (https://jonathandcohen.github.io/driver-base/drivers.json), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).';

export const VALIDATION_RHO_KG_M3 = 1.20;
export const VALIDATION_C_M_S = 343.0;

const EQUATION_FIELD_UNITS = {
  qts: '',
  qms: '',
  qes: '',
  fs_hz: 'Hz',
  mms_g: 'g',
  cms_mm_per_n: 'mm/N',
  re_ohm: 'Ω',
  bl_tm: 'T·m',
  rms_ns_per_m: 'N·s/m',
  vas_liters: 'L',
  sd_cm2: 'cm²',
  le_mh: 'mH',
  xmax_mm: 'mm',
};

const EQUATION_FIELDS = [
  'qts',
  'qms',
  'qes',
  'fs_hz',
  'mms_g',
  'cms_mm_per_n',
  're_ohm',
  'bl_tm',
  'rms_ns_per_m',
  'vas_liters',
  'sd_cm2',
];

function isDerivedField(record, field) {
  const src = record.spec_source?.[field];
  return typeof src === 'string' && src.trim().toLowerCase() === 'derived';
}

function makeInputWithUnit(record, field) {
  return {
    field,
    value: record[field],
    unit: EQUATION_FIELD_UNITS[field] ?? '',
    source: record.spec_source?.[field],
  };
}

export function validateDriverBaseRecord(record, options = {}) {
  const tolerancePct = options.tolerancePct ?? 10.0;
  const reviewThresholdPct = options.reviewThresholdPct ?? 5.0;
  const eps = 1e-9;

  const invalid_fields = [];
  const validPositiveValues = new Map();

  for (const field of EQUATION_FIELDS) {
    const raw = record[field];
    if (raw === null || raw === undefined) {
      continue;
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      invalid_fields.push({
        field,
        raw_value: raw,
        unit: EQUATION_FIELD_UNITS[field] ?? '',
        reason: 'non_finite',
      });
    } else if (raw <= 0) {
      invalid_fields.push({
        field,
        raw_value: raw,
        unit: EQUATION_FIELD_UNITS[field] ?? '',
        reason: 'non_positive',
      });
    } else {
      validPositiveValues.set(field, raw);
    }
  }

  for (const optField of ['le_mh', 'xmax_mm']) {
    const raw = record[optField];
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      invalid_fields.push({
        field: optField,
        raw_value: raw,
        unit: EQUATION_FIELD_UNITS[optField],
        reason: 'non_finite',
      });
    } else if (raw < 0) {
      invalid_fields.push({
        field: optField,
        raw_value: raw,
        unit: EQUATION_FIELD_UNITS[optField],
        reason: 'negative',
      });
    }
  }

  const fs_hz = validPositiveValues.get('fs_hz');
  const qts = validPositiveValues.get('qts');
  const qes = validPositiveValues.get('qes');
  const qms = validPositiveValues.get('qms');
  const re_ohm = validPositiveValues.get('re_ohm');
  const bl_tm = validPositiveValues.get('bl_tm');
  const rms_ns_per_m = validPositiveValues.get('rms_ns_per_m');
  const mms_g = validPositiveValues.get('mms_g');
  const cms_mm_per_n = validPositiveValues.get('cms_mm_per_n');
  const sd_cm2 = validPositiveValues.get('sd_cm2');
  const vas_liters = validPositiveValues.get('vas_liters');

  const mms_kg = mms_g !== undefined ? mms_g * 1e-3 : undefined;
  const cms_m_per_n = cms_mm_per_n !== undefined ? cms_mm_per_n * 1e-3 : undefined;
  const sd_m2 = sd_cm2 !== undefined ? sd_cm2 * 1e-4 : undefined;

  const checks_run = [];
  const skipped_checks = [];

  const tryCheck = (
    check_id,
    equation,
    target_field,
    unit,
    participating_fields,
    published_value,
    computePredicted
  ) => {
    const missing = participating_fields.filter((f) => !validPositiveValues.has(f));
    if (missing.length > 0 || published_value === undefined) {
      skipped_checks.push({
        check_id,
        equation,
        reason: 'missing_fields',
        fields: missing,
      });
      return;
    }

    const derived = participating_fields.filter((f) => isDerivedField(record, f));
    if (derived.length > 0) {
      skipped_checks.push({
        check_id,
        equation,
        reason: 'derived_fields',
        fields: derived,
      });
      return;
    }

    const predicted_value = computePredicted();
    if (predicted_value === undefined || !Number.isFinite(predicted_value)) {
      return;
    }

    const error_pct = (100.0 * Math.abs(predicted_value - published_value)) / published_value;
    const passed = error_pct <= tolerancePct + eps;
    const flagged_for_review = passed && error_pct > reviewThresholdPct + eps;

    checks_run.push({
      check_id,
      equation,
      target_field,
      unit,
      published_value,
      predicted_value,
      error_pct,
      passed,
      flagged_for_review,
      participating_fields,
      original_inputs: participating_fields.map((f) => makeInputWithUnit(record, f)),
    });
  };

  // 1. Qts = Qms * Qes / (Qms + Qes)
  tryCheck(
    'qts_from_qms_qes',
    'Qts = Qms * Qes / (Qms + Qes)',
    'qts',
    '',
    ['qts', 'qms', 'qes'],
    qts,
    () => (qms * qes) / (qms + qes)
  );

  // 2. Fs = 1 / (2*pi * sqrt(Mms * Cms))
  tryCheck(
    'fs_from_mms_cms',
    'Fs = 1 / (2π * √(Mms * Cms))',
    'fs_hz',
    'Hz',
    ['fs_hz', 'mms_g', 'cms_mm_per_n'],
    fs_hz,
    () => 1.0 / (2.0 * Math.PI * Math.sqrt(mms_kg * cms_m_per_n))
  );

  // 3. Qes = 2*pi * Fs * Mms * Re / BL^2
  tryCheck(
    'qes_from_fs_mms_re_bl',
    'Qes = 2π * Fs * Mms * Re / BL²',
    'qes',
    '',
    ['qes', 'fs_hz', 'mms_g', 're_ohm', 'bl_tm'],
    qes,
    () => (2.0 * Math.PI * fs_hz * mms_kg * re_ohm) / (bl_tm * bl_tm)
  );

  // 4. Qms = 2*pi * Fs * Mms / Rms
  tryCheck(
    'qms_from_fs_mms_rms',
    'Qms = 2π * Fs * Mms / Rms',
    'qms',
    '',
    ['qms', 'fs_hz', 'mms_g', 'rms_ns_per_m'],
    qms,
    () => (2.0 * Math.PI * fs_hz * mms_kg) / rms_ns_per_m
  );

  // 5. Vas = rho * c^2 * Sd^2 * Cms
  tryCheck(
    'vas_from_sd_cms',
    'Vas = ρ * c² * Sd² * Cms',
    'vas_liters',
    'L',
    ['vas_liters', 'sd_cm2', 'cms_mm_per_n'],
    vas_liters,
    () => {
      const vas_m3 =
        VALIDATION_RHO_KG_M3 * VALIDATION_C_M_S * VALIDATION_C_M_S * sd_m2 * sd_m2 * cms_m_per_n;
      return vas_m3 * 1000.0;
    }
  );

  // 6. Vas = rho * c^2 * Sd^2 / ((2*pi * Fs)^2 * Mms)
  tryCheck(
    'vas_from_sd_fs_mms',
    'Vas = ρ * c² * Sd² / ((2π * Fs)² * Mms)',
    'vas_liters',
    'L',
    ['vas_liters', 'sd_cm2', 'fs_hz', 'mms_g'],
    vas_liters,
    () => {
      const omega_s = 2.0 * Math.PI * fs_hz;
      const vas_m3 =
        (VALIDATION_RHO_KG_M3 * VALIDATION_C_M_S * VALIDATION_C_M_S * sd_m2 * sd_m2) /
        (omega_s * omega_s * mms_kg);
      return vas_m3 * 1000.0;
    }
  );

  const failed_checks = checks_run.filter((c) => !c.passed);
  const review_flags = checks_run.filter((c) => c.flagged_for_review);

  const coveredSet = new Set();
  for (const c of checks_run) {
    for (const f of c.participating_fields) coveredSet.add(f);
  }
  const fields_covered = [...coveredSet];

  let status;
  if (invalid_fields.length > 0 || failed_checks.length > 0) {
    status = 'QUARANTINE';
  } else if (checks_run.length === 0) {
    status = 'UNVERIFIED';
  } else {
    status = 'ACCEPT';
  }

  const qts_only_validated =
    status === 'ACCEPT' &&
    checks_run.length === 1 &&
    checks_run[0].check_id === 'qts_from_qms_qes';

  const requiredSimFields = ['fs_hz', 're_ohm', 'qes', 'qms', 'vas_liters', 'sd_cm2'];
  const missing_simulation_fields = requiredSimFields.filter((f) => !validPositiveValues.has(f));
  const simulation_ready = status === 'ACCEPT' && missing_simulation_fields.length === 0;

  return {
    canonical_id: record.canonical_id,
    manufacturer: record.manufacturer,
    model: record.model,
    status,
    simulation_ready,
    missing_simulation_fields,
    qts_only_validated,
    checks_run,
    failed_checks,
    review_flags,
    skipped_checks,
    invalid_fields,
    fields_covered,
    raw_record: record,
  };
}

export function toDriverDbEntry(record, validation) {
  const fs_hz = Number(record.fs_hz);
  const re_ohm = Number(record.re_ohm);
  const le_mh =
    typeof record.le_mh === 'number' && Number.isFinite(record.le_mh) && record.le_mh >= 0
      ? record.le_mh
      : 0;
  const qes = Number(record.qes);
  const qms = Number(record.qms);
  const vas_liters = Number(record.vas_liters);
  const sd_cm2 = Number(record.sd_cm2);
  const xmax_mm =
    typeof record.xmax_mm === 'number' && Number.isFinite(record.xmax_mm) && record.xmax_mm >= 0
      ? record.xmax_mm
      : 0;

  const params = {
    fs_hz,
    re_ohm,
    le_h: Number((le_mh * 1e-3).toPrecision(8)),
    qes,
    qms,
    vas_m3: Number((vas_liters * 1e-3).toPrecision(8)),
    sd_m2: Number((sd_cm2 * 1e-4).toPrecision(8)),
    xmax_m: Number((xmax_mm * 1e-3).toPrecision(8)),
  };

  const z_nom =
    typeof record.impedance_nominal_ohm === 'number' &&
    Number.isFinite(record.impedance_nominal_ohm) &&
    record.impedance_nominal_ohm > 0
      ? record.impedance_nominal_ohm
      : Math.round(re_ohm) <= 4
      ? 4
      : 8;

  const spl_ref =
    typeof record.sensitivity_db_2_83v_1m === 'number' &&
    Number.isFinite(record.sensitivity_db_2_83v_1m)
      ? record.sensitivity_db_2_83v_1m
      : typeof record.sensitivity_db_1w_1m === 'number' &&
        Number.isFinite(record.sensitivity_db_1w_1m)
      ? record.sensitivity_db_1w_1m
      : 0;

  const dia_mm =
    typeof record.nominal_size_mm === 'number' &&
    Number.isFinite(record.nominal_size_mm) &&
    record.nominal_size_mm > 0
      ? record.nominal_size_mm
      : typeof record.overall_diameter_mm === 'number' &&
        Number.isFinite(record.overall_diameter_mm) &&
        record.overall_diameter_mm > 0
      ? record.overall_diameter_mm
      : 20 * Math.sqrt(sd_cm2 / Math.PI);

  return {
    canonical_id: record.canonical_id,
    vendor: record.manufacturer,
    model: record.model,
    params,
    z_nom,
    spl_ref,
    dia_m: Number((dia_mm / 1000).toFixed(4)),
    driver_kind: record.driver_kind ?? undefined,
    source_urls: record.source_urls ?? undefined,
    qts_only_validated: validation.qts_only_validated,
    checks_run_ids: validation.checks_run.map((c) => c.check_id),
    fields_covered: validation.fields_covered,
    flagged_for_review: validation.review_flags.length > 0,
  };
}

export function importDriverBaseSnapshot(snapshotInput, options = {}) {
  const tolerancePct = options.tolerancePct ?? 10.0;
  const reviewThresholdPct = options.reviewThresholdPct ?? 5.0;

  let snapshot;
  if (typeof snapshotInput === 'string') {
    if (!snapshotInput.trim()) {
      throw new Error('Empty snapshot input');
    }
    snapshot = JSON.parse(snapshotInput);
  } else {
    snapshot = snapshotInput;
  }

  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.drivers)) {
    throw new Error('Invalid driver-base snapshot: missing "drivers" array');
  }
  if (snapshot.drivers.length === 0) {
    throw new Error('Invalid driver-base snapshot: "drivers" array is empty');
  }

  const simulation_ready_drivers = new Map();
  const validation_by_id = new Map();
  const quarantine_report = [];

  let accepted = 0;
  let quarantined = 0;
  let unverified = 0;
  let simulation_ready = 0;
  let accepted_missing_sim_inputs = 0;
  let accepted_qts_only = 0;
  let flagged_for_review = 0;

  for (const raw of snapshot.drivers) {
    if (!raw || typeof raw.canonical_id !== 'string' || !raw.canonical_id.trim()) {
      throw new Error('Invalid driver record: missing canonical_id');
    }
    const cid = raw.canonical_id;
    if (validation_by_id.has(cid)) {
      continue;
    }

    const v = validateDriverBaseRecord(raw, { tolerancePct, reviewThresholdPct });
    validation_by_id.set(cid, v);

    if (v.status === 'ACCEPT') {
      accepted++;
      if (v.qts_only_validated) accepted_qts_only++;
      if (v.review_flags.length > 0) flagged_for_review++;

      if (v.simulation_ready) {
        simulation_ready++;
        simulation_ready_drivers.set(cid, toDriverDbEntry(raw, v));
      } else {
        accepted_missing_sim_inputs++;
      }
    } else if (v.status === 'QUARANTINE') {
      quarantined++;
      const failures = [
        ...v.invalid_fields.map((inv) => ({
          failure_kind: 'invalid_field',
          invalid_field: inv.field,
          invalid_reason: inv.reason,
          original_inputs: [
            {
              field: inv.field,
              value: inv.raw_value,
              unit: inv.unit,
              source: raw.spec_source?.[inv.field],
            },
          ],
          published_value: typeof inv.raw_value === 'number' ? inv.raw_value : null,
          predicted_value: null,
          unit: inv.unit,
          error_pct: null,
        })),
        ...v.failed_checks.map((fc) => ({
          failure_kind: 'equation_mismatch',
          check_id: fc.check_id,
          equation: fc.equation,
          original_inputs: fc.original_inputs,
          published_value: fc.published_value,
          predicted_value: Number(fc.predicted_value.toFixed(6)),
          unit: fc.unit,
          error_pct: Number(fc.error_pct.toFixed(4)),
        })),
      ];

      quarantine_report.push({
        canonical_id: cid,
        manufacturer: raw.manufacturer,
        model: raw.model,
        failures,
        raw_record: raw,
      });
    } else {
      unverified++;
    }
  }

  return {
    source_url: options.sourceUrl ?? DRIVER_BASE_SOURCE_URL,
    attribution: DRIVER_BASE_ATTRIBUTION,
    schema_version: snapshot.schema_version ?? '1.0',
    generated_at: snapshot.generated_at ?? 'unknown',
    snapshot_sha256: options.snapshotSha256,
    tolerance_pct: tolerancePct,
    review_threshold_pct: reviewThresholdPct,
    counts: {
      total_records: validation_by_id.size,
      accepted,
      quarantined,
      unverified,
      simulation_ready,
      accepted_missing_sim_inputs,
      accepted_qts_only,
      flagged_for_review,
    },
    simulation_ready_drivers,
    validation_by_id,
    quarantine_report,
  };
}

export function refreshDriverDatabaseSafely(previousState, newSnapshotOrError, options = {}) {
  try {
    if (newSnapshotOrError instanceof Error) {
      throw newSnapshotOrError;
    }
    const staged = importDriverBaseSnapshot(newSnapshotOrError, options);

    const removed_from_simulation_ready = [];
    const added_to_simulation_ready = [];

    for (const prevId of previousState.simulation_ready_by_id.keys()) {
      if (!staged.simulation_ready_drivers.has(prevId)) {
        removed_from_simulation_ready.push(prevId);
      }
    }
    for (const nextId of staged.simulation_ready_drivers.keys()) {
      if (!previousState.simulation_ready_by_id.has(nextId)) {
        added_to_simulation_ready.push(nextId);
      }
    }

    const nextState = {
      import_metadata: {
        source_url: staged.source_url,
        attribution: staged.attribution,
        generated_at: staged.generated_at,
        snapshot_sha256: staged.snapshot_sha256,
        tolerance_pct: staged.tolerance_pct,
      },
      simulation_ready_by_id: staged.simulation_ready_drivers,
      validation_by_id: staged.validation_by_id,
      quarantine_report: staged.quarantine_report,
    };

    return {
      updated: true,
      state: nextState,
      removed_from_simulation_ready,
      added_to_simulation_ready,
    };
  } catch (err) {
    return {
      updated: false,
      error: err instanceof Error ? err.message : String(err),
      state: previousState,
      removed_from_simulation_ready: [],
      added_to_simulation_ready: [],
    };
  }
}

// Run as CLI if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const presetsDir = path.resolve(__dirname, '../src/presets');
  const snapshotPath = path.join(presetsDir, 'driver_base_snapshot.json');
  const quarantineReportPath = path.join(presetsDir, 'driver_base_quarantine_report.json');
  const generatedDbPath = path.join(presetsDir, 'driver_base_db.ts');

  const rawText = fs.readFileSync(snapshotPath, 'utf8');
  const sha256 = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex');

  const result = importDriverBaseSnapshot(rawText, {
    snapshotSha256: sha256,
    sourceUrl: DRIVER_BASE_SOURCE_URL,
  });

  // Write machine-readable quarantine report (without bulky full raw_record in summary array, or with full details)
  const machineReadableReport = {
    source_url: result.source_url,
    attribution: result.attribution,
    schema_version: result.schema_version,
    generated_at: result.generated_at,
    snapshot_sha256: result.snapshot_sha256,
    tolerance_pct: result.tolerance_pct,
    review_threshold_pct: result.review_threshold_pct,
    counts: result.counts,
    quarantined_drivers: result.quarantine_report.map((q) => ({
      canonical_id: q.canonical_id,
      manufacturer: q.manufacturer,
      model: q.model,
      failures: q.failures,
      raw_record: q.raw_record,
    })),
  };

  fs.writeFileSync(quarantineReportPath, JSON.stringify(machineReadableReport, null, 2), 'utf8');

  // Write simulation-ready TypeScript database module
  const entriesArray = [...result.simulation_ready_drivers.values()];
  const tsContent = `// Auto-generated by web/scripts/import-driver-base.mjs
// Source URL: ${result.source_url}
// Snapshot generated_at: ${result.generated_at}
// Snapshot SHA-256: ${result.snapshot_sha256}
// Attribution: ${result.attribution}
// Screening tolerance: ${result.tolerance_pct}% (review flag > ${result.review_threshold_pct}%)
// Counts: total=${result.counts.total_records}, accepted=${result.counts.accepted}, quarantined=${result.counts.quarantined}, unverified=${result.counts.unverified}, simulation_ready=${result.counts.simulation_ready}

import type { DriverDbEntry } from './drivers_db';

export const DRIVER_BASE_METADATA = {
  source_url: ${JSON.stringify(result.source_url)},
  attribution: ${JSON.stringify(result.attribution)},
  license: 'CC BY 4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  schema_version: ${JSON.stringify(result.schema_version)},
  generated_at: ${JSON.stringify(result.generated_at)},
  snapshot_sha256: ${JSON.stringify(result.snapshot_sha256)},
  tolerance_pct: ${result.tolerance_pct},
  review_threshold_pct: ${result.review_threshold_pct},
  counts: ${JSON.stringify(result.counts, null, 2)},
} as const;

export const DRIVER_BASE_SIMULATION_READY: DriverDbEntry[] = [
${entriesArray.map((e) => JSON.stringify(e)).join(',\n')}
];
`;

  fs.writeFileSync(generatedDbPath, tsContent, 'utf8');

  console.log('=== DRIVER-BASE IMPORT SUMMARY ===');
  console.log('Source URL:', result.source_url);
  console.log('Attribution:', result.attribution);
  console.log('Snapshot generated_at:', result.generated_at);
  console.log('Snapshot SHA-256:', result.snapshot_sha256);
  console.log('Counts:', JSON.stringify(result.counts, null, 2));
}

