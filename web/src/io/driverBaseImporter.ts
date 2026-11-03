/**
 * Driver Base (https://jonathandcohen.github.io/driver-base/drivers.json)
 * Importer, Mathematical Consistency Validator, and Atomic Staging Refresh Engine.
 *
 * Attribution:
 *   Source dataset: driver-base by Jonathan D. Cohen
 *   URL: https://jonathandcohen.github.io/driver-base/drivers.json
 *   License: Creative Commons Attribution 4.0 International (CC BY 4.0)
 *   https://creativecommons.org/licenses/by/4.0/
 */

import type { DriverParams } from '../types';
import type { DriverDbEntry } from '../presets/drivers_db';

export const DRIVER_BASE_SOURCE_URL = 'https://jonathandcohen.github.io/driver-base/drivers.json';
export const DRIVER_BASE_ATTRIBUTION =
  'Driver Base dataset by Jonathan D. Cohen (https://jonathandcohen.github.io/driver-base/drivers.json), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).';

/** Physical constants specified for validation checks */
export const VALIDATION_RHO_KG_M3 = 1.20;
export const VALIDATION_C_M_S = 343.0;

export type ValidationStatus = 'ACCEPT' | 'QUARANTINE' | 'UNVERIFIED';

export type EquationId =
  | 'qts_from_qms_qes'
  | 'fs_from_mms_cms'
  | 'qes_from_fs_mms_re_bl'
  | 'qms_from_fs_mms_rms'
  | 'vas_from_sd_cms'
  | 'vas_from_sd_fs_mms';

export interface OriginalInputWithUnit {
  field: string;
  value: unknown;
  unit: string;
  source?: string;
}

export interface EquationCheckResult {
  check_id: EquationId;
  equation: string;
  target_field: string;
  unit: string;
  published_value: number;
  predicted_value: number;
  error_pct: number;
  passed: boolean;
  flagged_for_review: boolean;
  participating_fields: string[];
  original_inputs: OriginalInputWithUnit[];
}

export interface SkippedCheckInfo {
  check_id: EquationId;
  equation: string;
  reason: 'missing_fields' | 'derived_fields';
  fields: string[];
}

export interface InvalidFieldIssue {
  field: string;
  raw_value: unknown;
  unit: string;
  reason: 'non_finite' | 'non_positive' | 'negative';
}

export interface RawDriverBaseRecord {
  canonical_id: string;
  manufacturer: string;
  model: string;
  driver_kind?: string | null;
  status?: string | null;
  spec_source?: Record<string, string> | null;
  source_urls?: string[] | null;
  fetched_at?: string | null;
  scraped_at?: string | null;
  last_scraped_at?: string | null;
  warn_flags?: string[] | null;
  fs_hz?: unknown;
  qts?: unknown;
  qes?: unknown;
  qms?: unknown;
  vas_liters?: unknown;
  mms_g?: unknown;
  cms_mm_per_n?: unknown;
  rms_ns_per_m?: unknown;
  bl_tm?: unknown;
  re_ohm?: unknown;
  le_mh?: unknown;
  sd_cm2?: unknown;
  xmax_mm?: unknown;
  xmech_mm?: unknown;
  impedance_nominal_ohm?: unknown;
  sensitivity_db_1w_1m?: unknown;
  sensitivity_db_2_83v_1m?: unknown;
  nominal_size_mm?: unknown;
  overall_diameter_mm?: unknown;
  [key: string]: unknown;
}

export interface DriverBaseSnapshot {
  schema_version?: string;
  generated_at?: string;
  generator?: {
    name?: string;
    version?: string;
    git_sha?: string | null;
  };
  drivers: RawDriverBaseRecord[];
}

export interface DriverValidationRecord {
  canonical_id: string;
  manufacturer: string;
  model: string;
  status: ValidationStatus;
  simulation_ready: boolean;
  missing_simulation_fields: string[];
  qts_only_validated: boolean;
  checks_run: EquationCheckResult[];
  failed_checks: EquationCheckResult[];
  review_flags: EquationCheckResult[];
  skipped_checks: SkippedCheckInfo[];
  invalid_fields: InvalidFieldIssue[];
  fields_covered: string[];
  raw_record: RawDriverBaseRecord;
}

export interface QuarantineReportFailure {
  failure_kind: 'equation_mismatch' | 'invalid_field';
  check_id?: EquationId;
  equation?: string;
  invalid_field?: string;
  invalid_reason?: string;
  original_inputs: OriginalInputWithUnit[];
  published_value?: number | null;
  predicted_value?: number | null;
  unit?: string;
  error_pct?: number | null;
}

export interface QuarantineReportEntry {
  canonical_id: string;
  manufacturer: string;
  model: string;
  failures: QuarantineReportFailure[];
  raw_record: RawDriverBaseRecord;
}

export interface ValidationOptions {
  /** Maximum allowed percentage error for ACCEPT (default 10.0%) */
  tolerancePct?: number;
  /** Discrepancy threshold above which passing checks are flagged for review (default 5.0%) */
  reviewThresholdPct?: number;
}

export interface DriverBaseImportResult {
  source_url: string;
  attribution: string;
  schema_version: string;
  generated_at: string;
  snapshot_sha256?: string;
  tolerance_pct: number;
  review_threshold_pct: number;
  counts: {
    total_records: number;
    accepted: number;
    quarantined: number;
    unverified: number;
    simulation_ready: number;
    accepted_missing_sim_inputs: number;
    accepted_qts_only: number;
    flagged_for_review: number;
  };
  simulation_ready_drivers: Map<string, DriverDbEntry>;
  validation_by_id: Map<string, DriverValidationRecord>;
  quarantine_report: QuarantineReportEntry[];
}

export interface ActiveDriverDatabaseState {
  import_metadata: {
    source_url: string;
    attribution: string;
    generated_at: string;
    snapshot_sha256?: string;
    tolerance_pct: number;
  };
  simulation_ready_by_id: Map<string, DriverDbEntry>;
  validation_by_id: Map<string, DriverValidationRecord>;
  quarantine_report: QuarantineReportEntry[];
}

export interface SafeRefreshOutcome {
  updated: boolean;
  error?: string;
  state: ActiveDriverDatabaseState;
  removed_from_simulation_ready: string[];
  added_to_simulation_ready: string[];
}

const EQUATION_FIELD_UNITS: Record<string, string> = {
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
] as const;

function isDerivedField(record: RawDriverBaseRecord, field: string): boolean {
  const src = record.spec_source?.[field];
  return typeof src === 'string' && src.trim().toLowerCase() === 'derived';
}

function makeInputWithUnit(record: RawDriverBaseRecord, field: string): OriginalInputWithUnit {
  return {
    field,
    value: record[field],
    unit: EQUATION_FIELD_UNITS[field] ?? '',
    source: record.spec_source?.[field],
  };
}

/**
 * Validate a single raw driver record from driver-base before deriving or rounding anything.
 */
export function validateDriverBaseRecord(
  record: RawDriverBaseRecord,
  options: ValidationOptions = {}
): DriverValidationRecord {
  const tolerancePct = options.tolerancePct ?? 10.0;
  const reviewThresholdPct = options.reviewThresholdPct ?? 5.0;
  // Floating-point boundary guard so exact 10% (e.g. 1.1 / 1.0 - 1 = 0.10000000000000009) is treated as <= 10%
  const eps = 1e-9;

  const invalid_fields: InvalidFieldIssue[] = [];
  const validPositiveValues = new Map<string, number>();

  // 1. Check all 11 equation fields for missing vs invalid (non-finite or non-positive)
  for (const field of EQUATION_FIELDS) {
    const raw = record[field];
    if (raw === null || raw === undefined) {
      continue; // Missing value — distinct from invalid
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

  // Also check optional simulator fields le_mh and xmax_mm if supplied (must be finite and >= 0)
  for (const optField of ['le_mh', 'xmax_mm'] as const) {
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

  // 2. Convert valid published values to SI units for calculation
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

  const checks_run: EquationCheckResult[] = [];
  const skipped_checks: SkippedCheckInfo[] = [];

  const tryCheck = (
    check_id: EquationId,
    equation: string,
    target_field: string,
    unit: string,
    participating_fields: string[],
    published_value: number | undefined,
    computePredicted: () => number | undefined
  ) => {
    // Check if any participating field is missing or invalid
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

    // Check if any participating field is marked as "derived" in spec_source
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

  // Check 1: Qts = Qms * Qes / (Qms + Qes)
  tryCheck(
    'qts_from_qms_qes',
    'Qts = Qms * Qes / (Qms + Qes)',
    'qts',
    '',
    ['qts', 'qms', 'qes'],
    qts,
    () => (qms !== undefined && qes !== undefined ? (qms * qes) / (qms + qes) : undefined)
  );

  // Check 2: Fs = 1 / (2*pi * sqrt(Mms * Cms))
  tryCheck(
    'fs_from_mms_cms',
    'Fs = 1 / (2π * √(Mms * Cms))',
    'fs_hz',
    'Hz',
    ['fs_hz', 'mms_g', 'cms_mm_per_n'],
    fs_hz,
    () =>
      mms_kg !== undefined && cms_m_per_n !== undefined
        ? 1.0 / (2.0 * Math.PI * Math.sqrt(mms_kg * cms_m_per_n))
        : undefined
  );

  // Check 3: Qes = 2*pi * Fs * Mms * Re / BL^2
  tryCheck(
    'qes_from_fs_mms_re_bl',
    'Qes = 2π * Fs * Mms * Re / BL²',
    'qes',
    '',
    ['qes', 'fs_hz', 'mms_g', 're_ohm', 'bl_tm'],
    qes,
    () =>
      fs_hz !== undefined && mms_kg !== undefined && re_ohm !== undefined && bl_tm !== undefined
        ? (2.0 * Math.PI * fs_hz * mms_kg * re_ohm) / (bl_tm * bl_tm)
        : undefined
  );

  // Check 4: Qms = 2*pi * Fs * Mms / Rms
  tryCheck(
    'qms_from_fs_mms_rms',
    'Qms = 2π * Fs * Mms / Rms',
    'qms',
    '',
    ['qms', 'fs_hz', 'mms_g', 'rms_ns_per_m'],
    qms,
    () =>
      fs_hz !== undefined && mms_kg !== undefined && rms_ns_per_m !== undefined
        ? (2.0 * Math.PI * fs_hz * mms_kg) / rms_ns_per_m
        : undefined
  );

  // Check 5: Vas = rho * c^2 * Sd^2 * Cms (compared in litres)
  tryCheck(
    'vas_from_sd_cms',
    'Vas = ρ * c² * Sd² * Cms',
    'vas_liters',
    'L',
    ['vas_liters', 'sd_cm2', 'cms_mm_per_n'],
    vas_liters,
    () => {
      if (sd_m2 === undefined || cms_m_per_n === undefined) return undefined;
      const vas_m3 = VALIDATION_RHO_KG_M3 * VALIDATION_C_M_S * VALIDATION_C_M_S * sd_m2 * sd_m2 * cms_m_per_n;
      return vas_m3 * 1000.0; // convert m³ to L to match published vas_liters
    }
  );

  // Check 6: Vas = rho * c^2 * Sd^2 / ((2*pi * Fs)^2 * Mms) (compared in litres)
  tryCheck(
    'vas_from_sd_fs_mms',
    'Vas = ρ * c² * Sd² / ((2π * Fs)² * Mms)',
    'vas_liters',
    'L',
    ['vas_liters', 'sd_cm2', 'fs_hz', 'mms_g'],
    vas_liters,
    () => {
      if (sd_m2 === undefined || fs_hz === undefined || mms_kg === undefined) return undefined;
      const omega_s = 2.0 * Math.PI * fs_hz;
      const vas_m3 =
        (VALIDATION_RHO_KG_M3 * VALIDATION_C_M_S * VALIDATION_C_M_S * sd_m2 * sd_m2) /
        (omega_s * omega_s * mms_kg);
      return vas_m3 * 1000.0; // convert m³ to L to match published vas_liters
    }
  );

  const failed_checks = checks_run.filter((c) => !c.passed);
  const review_flags = checks_run.filter((c) => c.flagged_for_review);

  const coveredSet = new Set<string>();
  for (const c of checks_run) {
    for (const f of c.participating_fields) coveredSet.add(f);
  }
  const fields_covered = [...coveredSet];

  // Explicit Acceptance Rule:
  // - QUARANTINE if an applicable check exceeds 10% error or a supplied field is invalid.
  // - UNVERIFIED if no independent check can run.
  // - ACCEPT if at least one independent check runs and all applicable checks are within 10%.
  let status: ValidationStatus;
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

  // Simulator required-input check (mirrors validate_driver in solver/src/lib.rs + derive_driver requirements)
  const requiredSimFields = ['fs_hz', 're_ohm', 'qes', 'qms', 'vas_liters', 'sd_cm2'] as const;
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

/**
 * Convert an ACCEPT + simulation_ready RawDriverBaseRecord into a DriverDbEntry in SI units.
 */
export function toDriverDbEntry(
  record: RawDriverBaseRecord,
  validation: DriverValidationRecord
): DriverDbEntry {
  const fs_hz = Number(record.fs_hz);
  const re_ohm = Number(record.re_ohm);
  const le_mh = typeof record.le_mh === 'number' && Number.isFinite(record.le_mh) && record.le_mh >= 0 ? record.le_mh : 0;
  const qes = Number(record.qes);
  const qms = Number(record.qms);
  const vas_liters = Number(record.vas_liters);
  const sd_cm2 = Number(record.sd_cm2);
  const xmax_mm =
    typeof record.xmax_mm === 'number' && Number.isFinite(record.xmax_mm) && record.xmax_mm >= 0
      ? record.xmax_mm
      : 0;

  const params: DriverParams = {
    fs_hz,
    re_ohm,
    le_h: le_mh * 1e-3,
    qes,
    qms,
    vas_m3: vas_liters * 1e-3,
    sd_m2: sd_cm2 * 1e-4,
    xmax_m: xmax_mm * 1e-3,
  };

  const z_nom =
    typeof record.impedance_nominal_ohm === 'number' && Number.isFinite(record.impedance_nominal_ohm) && record.impedance_nominal_ohm > 0
      ? record.impedance_nominal_ohm
      : Math.round(re_ohm) <= 4
      ? 4
      : 8;

  const spl_ref =
    typeof record.sensitivity_db_2_83v_1m === 'number' && Number.isFinite(record.sensitivity_db_2_83v_1m)
      ? record.sensitivity_db_2_83v_1m
      : typeof record.sensitivity_db_1w_1m === 'number' && Number.isFinite(record.sensitivity_db_1w_1m)
      ? record.sensitivity_db_1w_1m
      : 0;

  const dia_mm =
    typeof record.nominal_size_mm === 'number' && Number.isFinite(record.nominal_size_mm) && record.nominal_size_mm > 0
      ? record.nominal_size_mm
      : typeof record.overall_diameter_mm === 'number' && Number.isFinite(record.overall_diameter_mm) && record.overall_diameter_mm > 0
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

/**
 * Validate and stage an entire driver-base snapshot JSON object or string.
 * Keyed by `canonical_id` so impedance variants stay separate and reruns do not create duplicates.
 */
export function importDriverBaseSnapshot(
  snapshotInput: string | DriverBaseSnapshot,
  options: ValidationOptions & { snapshotSha256?: string; sourceUrl?: string } = {}
): DriverBaseImportResult {
  const tolerancePct = options.tolerancePct ?? 10.0;
  const reviewThresholdPct = options.reviewThresholdPct ?? 5.0;

  let snapshot: DriverBaseSnapshot;
  if (typeof snapshotInput === 'string') {
    if (!snapshotInput.trim()) {
      throw new Error('Empty snapshot input');
    }
    snapshot = JSON.parse(snapshotInput) as DriverBaseSnapshot;
  } else {
    snapshot = snapshotInput;
  }

  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.drivers)) {
    throw new Error('Invalid driver-base snapshot: missing "drivers" array');
  }
  if (snapshot.drivers.length === 0) {
    throw new Error('Invalid driver-base snapshot: "drivers" array is empty');
  }

  const simulation_ready_drivers = new Map<string, DriverDbEntry>();
  const validation_by_id = new Map<string, DriverValidationRecord>();
  const quarantine_report: QuarantineReportEntry[] = [];

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
    // Deduplicate by canonical_id so reruns or duplicate entries never create duplicates
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
      const failures: QuarantineReportFailure[] = [
        ...v.invalid_fields.map(
          (inv): QuarantineReportFailure => ({
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
          })
        ),
        ...v.failed_checks.map(
          (fc): QuarantineReportFailure => ({
            failure_kind: 'equation_mismatch',
            check_id: fc.check_id,
            equation: fc.equation,
            original_inputs: fc.original_inputs,
            published_value: fc.published_value,
            predicted_value: Number(fc.predicted_value.toFixed(6)),
            unit: fc.unit,
            error_pct: Number(fc.error_pct.toFixed(4)),
          })
        ),
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

/**
 * Safe staging refresh:
 * - Validates the new snapshot in staging before updating live data.
 * - If a previously accepted driver now fails (or loses required inputs), removes it from simulation-ready results in the same atomic update.
 * - If downloading, parsing, or import-level validation fails, keeps the previous successful dataset active.
 */
export function refreshDriverDatabaseSafely(
  previousState: ActiveDriverDatabaseState,
  newSnapshotOrError: string | DriverBaseSnapshot | Error,
  options: ValidationOptions & { snapshotSha256?: string; sourceUrl?: string } = {}
): SafeRefreshOutcome {
  try {
    if (newSnapshotOrError instanceof Error) {
      throw newSnapshotOrError;
    }
    const staged = importDriverBaseSnapshot(newSnapshotOrError, options);

    const removed_from_simulation_ready: string[] = [];
    const added_to_simulation_ready: string[] = [];

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

    const nextState: ActiveDriverDatabaseState = {
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

