//! Driver Base (`https://jonathandcohen.github.io/driver-base/drivers.json`)
//! Importer, Mathematical Consistency Validator, and Atomic Staging Refresh Engine.
//!
//! Attribution:
//! - Dataset: `driver-base` by Jonathan D. Cohen
//! - Source URL: `https://jonathandcohen.github.io/driver-base/drivers.json`
//! - License: Creative Commons Attribution 4.0 International (CC BY 4.0)
//!   `https://creativecommons.org/licenses/by/4.0/`

use crate::constants::TWO_PI;
use crate::types::DriverParams;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub const DRIVER_BASE_SOURCE_URL: &str = "https://jonathandcohen.github.io/driver-base/drivers.json";
pub const DRIVER_BASE_ATTRIBUTION: &str =
    "Driver Base dataset by Jonathan D. Cohen (https://jonathandcohen.github.io/driver-base/drivers.json), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).";

/// Physical constants specified for validation checks:
/// rho = 1.20 kg/m^3, c = 343 m/s.
pub const VALIDATION_RHO_KG_M3: f64 = 1.20;
pub const VALIDATION_C_M_S: f64 = 343.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ValidationStatus {
    ACCEPT,
    QUARANTINE,
    UNVERIFIED,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EquationId {
    QtsFromQmsQes,
    FsFromMmsCms,
    QesFromFsMmsReBl,
    QmsFromFsMmsRms,
    VasFromSdCms,
    VasFromSdFsMms,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OriginalInputWithUnit {
    pub field: String,
    pub value: Value,
    pub unit: String,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquationCheckResult {
    pub check_id: EquationId,
    pub equation: String,
    pub target_field: String,
    pub unit: String,
    pub published_value: f64,
    pub predicted_value: f64,
    pub error_pct: f64,
    pub passed: bool,
    pub flagged_for_review: bool,
    pub participating_fields: Vec<String>,
    pub original_inputs: Vec<OriginalInputWithUnit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkippedCheckInfo {
    pub check_id: EquationId,
    pub equation: String,
    pub reason: String,
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvalidFieldIssue {
    pub field: String,
    pub raw_value: Value,
    pub unit: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverValidationRecord {
    pub canonical_id: String,
    pub manufacturer: String,
    pub model: String,
    pub status: ValidationStatus,
    pub simulation_ready: bool,
    pub missing_simulation_fields: Vec<String>,
    pub qts_only_validated: bool,
    pub checks_run: Vec<EquationCheckResult>,
    pub failed_checks: Vec<EquationCheckResult>,
    pub review_flags: Vec<EquationCheckResult>,
    pub skipped_checks: Vec<SkippedCheckInfo>,
    pub invalid_fields: Vec<InvalidFieldIssue>,
    pub fields_covered: Vec<String>,
    pub raw_record: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuarantineReportFailure {
    pub failure_kind: String,
    pub check_id: Option<EquationId>,
    pub equation: Option<String>,
    pub invalid_field: Option<String>,
    pub invalid_reason: Option<String>,
    pub original_inputs: Vec<OriginalInputWithUnit>,
    pub published_value: Option<f64>,
    pub predicted_value: Option<f64>,
    pub unit: String,
    pub error_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuarantineReportEntry {
    pub canonical_id: String,
    pub manufacturer: String,
    pub model: String,
    pub failures: Vec<QuarantineReportFailure>,
    pub raw_record: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationReadyDriver {
    pub canonical_id: String,
    pub vendor: String,
    pub model: String,
    pub params: DriverParams,
    pub z_nom: f64,
    pub spl_ref: f64,
    pub dia_m: f64,
    pub qts_only_validated: bool,
    pub checks_run_ids: Vec<EquationId>,
    pub fields_covered: Vec<String>,
    pub flagged_for_review: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportCounts {
    pub total_records: usize,
    pub accepted: usize,
    pub quarantined: usize,
    pub unverified: usize,
    pub simulation_ready: usize,
    pub accepted_missing_sim_inputs: usize,
    pub accepted_qts_only: usize,
    pub flagged_for_review: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverBaseImportResult {
    pub source_url: String,
    pub attribution: String,
    pub schema_version: String,
    pub generated_at: String,
    pub tolerance_pct: f64,
    pub review_threshold_pct: f64,
    pub counts: ImportCounts,
    pub simulation_ready_drivers: BTreeMap<String, SimulationReadyDriver>,
    pub validation_by_id: BTreeMap<String, DriverValidationRecord>,
    pub quarantine_report: Vec<QuarantineReportEntry>,
}

#[derive(Debug, Clone)]
pub struct SafeRefreshOutcome {
    pub updated: bool,
    pub error: Option<String>,
    pub state: DriverBaseImportResult,
    pub removed_from_simulation_ready: Vec<String>,
    pub added_to_simulation_ready: Vec<String>,
}

const EQUATION_FIELDS: &[(&str, &str)] = &[
    ("qts", ""),
    ("qms", ""),
    ("qes", ""),
    ("fs_hz", "Hz"),
    ("mms_g", "g"),
    ("cms_mm_per_n", "mm/N"),
    ("re_ohm", "Ω"),
    ("bl_tm", "T·m"),
    ("rms_ns_per_m", "N·s/m"),
    ("vas_liters", "L"),
    ("sd_cm2", "cm²"),
];

fn field_unit(field: &str) -> &'static str {
    for &(k, u) in EQUATION_FIELDS {
        if k == field {
            return u;
        }
    }
    match field {
        "le_mh" => "mH",
        "xmax_mm" => "mm",
        _ => "",
    }
}

fn is_derived_field(record: &Value, field: &str) -> bool {
    record
        .get("spec_source")
        .and_then(|s| s.get(field))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().eq_ignore_ascii_case("derived"))
        .unwrap_or(false)
}

fn make_input_with_unit(record: &Value, field: &str) -> OriginalInputWithUnit {
    OriginalInputWithUnit {
        field: field.to_string(),
        value: record.get(field).cloned().unwrap_or(Value::Null),
        unit: field_unit(field).to_string(),
        source: record
            .get("spec_source")
            .and_then(|s| s.get(field))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    }
}

/// Validate a single raw driver record from `driver-base` before deriving or rounding anything.
pub fn validate_driver_base_record(
    record: &Value,
    tolerance_pct: f64,
    review_threshold_pct: f64,
) -> DriverValidationRecord {
    let eps = 1e-9;
    let canonical_id = record
        .get("canonical_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let manufacturer = record
        .get("manufacturer")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let model = record
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut invalid_fields = Vec::new();
    let mut valid_positive = BTreeMap::<String, f64>::new();

    for &(field, unit) in EQUATION_FIELDS {
        match record.get(field) {
            None | Some(Value::Null) => continue,
            Some(Value::Number(n)) => {
                if let Some(val) = n.as_f64() {
                    if !val.is_finite() {
                        invalid_fields.push(InvalidFieldIssue {
                            field: field.to_string(),
                            raw_value: Value::Number(n.clone()),
                            unit: unit.to_string(),
                            reason: "non_finite".to_string(),
                        });
                    } else if val <= 0.0 {
                        invalid_fields.push(InvalidFieldIssue {
                            field: field.to_string(),
                            raw_value: Value::Number(n.clone()),
                            unit: unit.to_string(),
                            reason: "non_positive".to_string(),
                        });
                    } else {
                        valid_positive.insert(field.to_string(), val);
                    }
                } else {
                    invalid_fields.push(InvalidFieldIssue {
                        field: field.to_string(),
                        raw_value: Value::Number(n.clone()),
                        unit: unit.to_string(),
                        reason: "non_finite".to_string(),
                    });
                }
            }
            Some(other) => {
                invalid_fields.push(InvalidFieldIssue {
                    field: field.to_string(),
                    raw_value: other.clone(),
                    unit: unit.to_string(),
                    reason: "non_finite".to_string(),
                });
            }
        }
    }

    // Check optional simulator fields le_mh and xmax_mm if supplied (must be finite and >= 0)
    for &opt_field in &["le_mh", "xmax_mm"] {
        match record.get(opt_field) {
            None | Some(Value::Null) => continue,
            Some(Value::Number(n)) => {
                if let Some(val) = n.as_f64() {
                    if !val.is_finite() {
                        invalid_fields.push(InvalidFieldIssue {
                            field: opt_field.to_string(),
                            raw_value: Value::Number(n.clone()),
                            unit: field_unit(opt_field).to_string(),
                            reason: "non_finite".to_string(),
                        });
                    } else if val < 0.0 {
                        invalid_fields.push(InvalidFieldIssue {
                            field: opt_field.to_string(),
                            raw_value: Value::Number(n.clone()),
                            unit: field_unit(opt_field).to_string(),
                            reason: "negative".to_string(),
                        });
                    }
                }
            }
            Some(other) => {
                invalid_fields.push(InvalidFieldIssue {
                    field: opt_field.to_string(),
                    raw_value: other.clone(),
                    unit: field_unit(opt_field).to_string(),
                    reason: "non_finite".to_string(),
                });
            }
        }
    }

    let fs_hz = valid_positive.get("fs_hz").copied();
    let qts = valid_positive.get("qts").copied();
    let qes = valid_positive.get("qes").copied();
    let qms = valid_positive.get("qms").copied();
    let re_ohm = valid_positive.get("re_ohm").copied();
    let bl_tm = valid_positive.get("bl_tm").copied();
    let rms_ns_per_m = valid_positive.get("rms_ns_per_m").copied();
    let mms_g = valid_positive.get("mms_g").copied();
    let cms_mm_per_n = valid_positive.get("cms_mm_per_n").copied();
    let sd_cm2 = valid_positive.get("sd_cm2").copied();
    let vas_liters = valid_positive.get("vas_liters").copied();

    // SI conversions
    let mms_kg = mms_g.map(|v| v * 1e-3);
    let cms_m_per_n = cms_mm_per_n.map(|v| v * 1e-3);
    let sd_m2 = sd_cm2.map(|v| v * 1e-4);

    let mut checks_run = Vec::new();
    let mut skipped_checks = Vec::new();

    let mut try_check = |check_id: EquationId,
                         equation: &str,
                         target_field: &str,
                         unit: &str,
                         participating: &[&str],
                         published: Option<f64>,
                         predicted_fn: &dyn Fn() -> Option<f64>| {
        let missing: Vec<String> = participating
            .iter()
            .filter(|&&f| !valid_positive.contains_key(f))
            .map(|&f| f.to_string())
            .collect();
        if !missing.is_empty() || published.is_none() {
            skipped_checks.push(SkippedCheckInfo {
                check_id,
                equation: equation.to_string(),
                reason: "missing_fields".to_string(),
                fields: missing,
            });
            return;
        }

        let derived: Vec<String> = participating
            .iter()
            .filter(|&&f| is_derived_field(record, f))
            .map(|&f| f.to_string())
            .collect();
        if !derived.is_empty() {
            skipped_checks.push(SkippedCheckInfo {
                check_id,
                equation: equation.to_string(),
                reason: "derived_fields".to_string(),
                fields: derived,
            });
            return;
        }

        let pub_val = published.unwrap();
        if let Some(pred_val) = predicted_fn() {
            if pred_val.is_finite() {
                let error_pct = 100.0 * (pred_val - pub_val).abs() / pub_val;
                let passed = error_pct <= tolerance_pct + eps;
                let flagged_for_review = passed && error_pct > review_threshold_pct + eps;
                checks_run.push(EquationCheckResult {
                    check_id,
                    equation: equation.to_string(),
                    target_field: target_field.to_string(),
                    unit: unit.to_string(),
                    published_value: pub_val,
                    predicted_value: pred_val,
                    error_pct,
                    passed,
                    flagged_for_review,
                    participating_fields: participating.iter().map(|&f| f.to_string()).collect(),
                    original_inputs: participating
                        .iter()
                        .map(|&f| make_input_with_unit(record, f))
                        .collect(),
                });
            }
        }
    };

    // 1. Qts = Qms * Qes / (Qms + Qes)
    try_check(
        EquationId::QtsFromQmsQes,
        "Qts = Qms * Qes / (Qms + Qes)",
        "qts",
        "",
        &["qts", "qms", "qes"],
        qts,
        &|| Some((qms? * qes?) / (qms? + qes?)),
    );

    // 2. Fs = 1 / (2*pi * sqrt(Mms * Cms))
    try_check(
        EquationId::FsFromMmsCms,
        "Fs = 1 / (2π * √(Mms * Cms))",
        "fs_hz",
        "Hz",
        &["fs_hz", "mms_g", "cms_mm_per_n"],
        fs_hz,
        &|| Some(1.0 / (TWO_PI * (mms_kg? * cms_m_per_n?).sqrt())),
    );

    // 3. Qes = 2*pi * Fs * Mms * Re / BL^2
    try_check(
        EquationId::QesFromFsMmsReBl,
        "Qes = 2π * Fs * Mms * Re / BL²",
        "qes",
        "",
        &["qes", "fs_hz", "mms_g", "re_ohm", "bl_tm"],
        qes,
        &|| Some((TWO_PI * fs_hz? * mms_kg? * re_ohm?) / (bl_tm? * bl_tm?)),
    );

    // 4. Qms = 2*pi * Fs * Mms / Rms
    try_check(
        EquationId::QmsFromFsMmsRms,
        "Qms = 2π * Fs * Mms / Rms",
        "qms",
        "",
        &["qms", "fs_hz", "mms_g", "rms_ns_per_m"],
        qms,
        &|| Some((TWO_PI * fs_hz? * mms_kg?) / rms_ns_per_m?),
    );

    // 5. Vas = rho * c^2 * Sd^2 * Cms (compared in litres)
    try_check(
        EquationId::VasFromSdCms,
        "Vas = ρ * c² * Sd² * Cms",
        "vas_liters",
        "L",
        &["vas_liters", "sd_cm2", "cms_mm_per_n"],
        vas_liters,
        &|| {
            let vas_m3 = VALIDATION_RHO_KG_M3
                * VALIDATION_C_M_S
                * VALIDATION_C_M_S
                * sd_m2?
                * sd_m2?
                * cms_m_per_n?;
            Some(vas_m3 * 1000.0)
        },
    );

    // 6. Vas = rho * c^2 * Sd^2 / ((2*pi * Fs)^2 * Mms) (compared in litres)
    try_check(
        EquationId::VasFromSdFsMms,
        "Vas = ρ * c² * Sd² / ((2π * Fs)² * Mms)",
        "vas_liters",
        "L",
        &["vas_liters", "sd_cm2", "fs_hz", "mms_g"],
        vas_liters,
        &|| {
            let omega_s = TWO_PI * fs_hz?;
            let vas_m3 = (VALIDATION_RHO_KG_M3
                * VALIDATION_C_M_S
                * VALIDATION_C_M_S
                * sd_m2?
                * sd_m2?)
                / (omega_s * omega_s * mms_kg?);
            Some(vas_m3 * 1000.0)
        },
    );

    let failed_checks: Vec<EquationCheckResult> =
        checks_run.iter().filter(|c| !c.passed).cloned().collect();
    let review_flags: Vec<EquationCheckResult> = checks_run
        .iter()
        .filter(|c| c.flagged_for_review)
        .cloned()
        .collect();

    let mut covered_set = BTreeSet::new();
    for c in &checks_run {
        for f in &c.participating_fields {
            covered_set.insert(f.clone());
        }
    }
    let fields_covered: Vec<String> = covered_set.into_iter().collect();

    let status = if !invalid_fields.is_empty() || !failed_checks.is_empty() {
        ValidationStatus::QUARANTINE
    } else if checks_run.is_empty() {
        ValidationStatus::UNVERIFIED
    } else {
        ValidationStatus::ACCEPT
    };

    let qts_only_validated = status == ValidationStatus::ACCEPT
        && checks_run.len() == 1
        && checks_run[0].check_id == EquationId::QtsFromQmsQes;

    let required_sim_fields = ["fs_hz", "re_ohm", "qes", "qms", "vas_liters", "sd_cm2"];
    let missing_simulation_fields: Vec<String> = required_sim_fields
        .iter()
        .filter(|&&f| !valid_positive.contains_key(f))
        .map(|&f| f.to_string())
        .collect();
    let simulation_ready =
        status == ValidationStatus::ACCEPT && missing_simulation_fields.is_empty();

    DriverValidationRecord {
        canonical_id,
        manufacturer,
        model,
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
        raw_record: record.clone(),
    }
}

pub fn to_simulation_ready_driver(
    record: &Value,
    validation: &DriverValidationRecord,
) -> SimulationReadyDriver {
    let fs_hz = record.get("fs_hz").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let re_ohm = record.get("re_ohm").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let le_mh = record
        .get("le_mh")
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite() && *v >= 0.0)
        .unwrap_or(0.0);
    let qes = record.get("qes").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let qms = record.get("qms").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let vas_liters = record
        .get("vas_liters")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let sd_cm2 = record.get("sd_cm2").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let xmax_mm = record
        .get("xmax_mm")
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite() && *v >= 0.0)
        .unwrap_or(0.0);

    let params = DriverParams {
        fs_hz,
        re_ohm,
        le_h: le_mh * 1e-3,
        qes,
        qms,
        vas_m3: vas_liters * 1e-3,
        sd_m2: sd_cm2 * 1e-4,
        xmax_m: xmax_mm * 1e-3,
        ke: 0.0,
    };

    let z_nom = record
        .get("impedance_nominal_ohm")
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite() && *v > 0.0)
        .unwrap_or(if re_ohm.round() <= 4.0 { 4.0 } else { 8.0 });

    let spl_ref = record
        .get("sensitivity_db_2_83v_1m")
        .and_then(|v| v.as_f64())
        .or_else(|| record.get("sensitivity_db_1w_1m").and_then(|v| v.as_f64()))
        .filter(|v| v.is_finite())
        .unwrap_or(0.0);

    let dia_mm = record
        .get("nominal_size_mm")
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite() && *v > 0.0)
        .or_else(|| {
            record
                .get("overall_diameter_mm")
                .and_then(|v| v.as_f64())
                .filter(|v| v.is_finite() && *v > 0.0)
        })
        .unwrap_or_else(|| 20.0 * (sd_cm2 / std::f64::consts::PI).sqrt());

    SimulationReadyDriver {
        canonical_id: validation.canonical_id.clone(),
        vendor: validation.manufacturer.clone(),
        model: validation.model.clone(),
        params,
        z_nom,
        spl_ref,
        dia_m: dia_mm / 1000.0,
        qts_only_validated: validation.qts_only_validated,
        checks_run_ids: validation.checks_run.iter().map(|c| c.check_id).collect(),
        fields_covered: validation.fields_covered.clone(),
        flagged_for_review: !validation.review_flags.is_empty(),
    }
}

/// Validate and stage an entire `driver-base` snapshot JSON string.
/// Keyed by `canonical_id` so impedance variants stay separate and reruns do not create duplicates.
pub fn import_driver_base_snapshot(
    snapshot_json: &str,
    tolerance_pct: f64,
    review_threshold_pct: f64,
) -> Result<DriverBaseImportResult, String> {
    if snapshot_json.trim().is_empty() {
        return Err("Empty snapshot input".into());
    }
    let root: Value =
        serde_json::from_str(snapshot_json).map_err(|e| format!("JSON parse error: {}", e))?;

    let drivers = root
        .get("drivers")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Invalid driver-base snapshot: missing 'drivers' array".to_string())?;

    if drivers.is_empty() {
        return Err("Invalid driver-base snapshot: 'drivers' array is empty".into());
    }

    let schema_version = root
        .get("schema_version")
        .and_then(|v| v.as_str())
        .unwrap_or("1.0")
        .to_string();
    let generated_at = root
        .get("generated_at")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let mut simulation_ready_drivers = BTreeMap::new();
    let mut validation_by_id = BTreeMap::new();
    let mut quarantine_report = Vec::new();

    let mut accepted = 0;
    let mut quarantined = 0;
    let mut unverified = 0;
    let mut simulation_ready = 0;
    let mut accepted_missing_sim_inputs = 0;
    let mut accepted_qts_only = 0;
    let mut flagged_for_review = 0;

    for raw in drivers {
        let cid = raw
            .get("canonical_id")
            .and_then(|v| v.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "Invalid driver record: missing canonical_id".to_string())?
            .to_string();

        if validation_by_id.contains_key(&cid) {
            continue;
        }

        let v = validate_driver_base_record(raw, tolerance_pct, review_threshold_pct);
        match v.status {
            ValidationStatus::ACCEPT => {
                accepted += 1;
                if v.qts_only_validated {
                    accepted_qts_only += 1;
                }
                if !v.review_flags.is_empty() {
                    flagged_for_review += 1;
                }
                if v.simulation_ready {
                    let sim_driver = to_simulation_ready_driver(raw, &v);
                    // Also verify against solver's existing validate_driver rules
                    crate::validate_driver(&sim_driver.params)?;
                    simulation_ready += 1;
                    simulation_ready_drivers.insert(cid.clone(), sim_driver);
                } else {
                    accepted_missing_sim_inputs += 1;
                }
            }
            ValidationStatus::QUARANTINE => {
                quarantined += 1;
                let mut failures = Vec::new();
                for inv in &v.invalid_fields {
                    failures.push(QuarantineReportFailure {
                        failure_kind: "invalid_field".to_string(),
                        check_id: None,
                        equation: None,
                        invalid_field: Some(inv.field.clone()),
                        invalid_reason: Some(inv.reason.clone()),
                        original_inputs: vec![OriginalInputWithUnit {
                            field: inv.field.clone(),
                            value: inv.raw_value.clone(),
                            unit: inv.unit.clone(),
                            source: raw
                                .get("spec_source")
                                .and_then(|s| s.get(&inv.field))
                                .and_then(|val| val.as_str())
                                .map(|s| s.to_string()),
                        }],
                        published_value: inv.raw_value.as_f64(),
                        predicted_value: None,
                        unit: inv.unit.clone(),
                        error_pct: None,
                    });
                }
                for fc in &v.failed_checks {
                    failures.push(QuarantineReportFailure {
                        failure_kind: "equation_mismatch".to_string(),
                        check_id: Some(fc.check_id),
                        equation: Some(fc.equation.clone()),
                        invalid_field: None,
                        invalid_reason: None,
                        original_inputs: fc.original_inputs.clone(),
                        published_value: Some(fc.published_value),
                        predicted_value: Some(fc.predicted_value),
                        unit: fc.unit.clone(),
                        error_pct: Some(fc.error_pct),
                    });
                }
                quarantine_report.push(QuarantineReportEntry {
                    canonical_id: cid.clone(),
                    manufacturer: v.manufacturer.clone(),
                    model: v.model.clone(),
                    failures,
                    raw_record: raw.clone(),
                });
            }
            ValidationStatus::UNVERIFIED => {
                unverified += 1;
            }
        }
        validation_by_id.insert(cid, v);
    }

    Ok(DriverBaseImportResult {
        source_url: DRIVER_BASE_SOURCE_URL.to_string(),
        attribution: DRIVER_BASE_ATTRIBUTION.to_string(),
        schema_version,
        generated_at,
        tolerance_pct,
        review_threshold_pct,
        counts: ImportCounts {
            total_records: validation_by_id.len(),
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
    })
}

/// Safe staging refresh:
/// - Validates the new snapshot in staging before updating live data.
/// - If a previously accepted driver now fails, removes it from simulation-ready results in the same update.
/// - If downloading, parsing, or validating fails at the import level, keeps the previous successful dataset active.
pub fn refresh_driver_database_safely(
    previous_state: &DriverBaseImportResult,
    new_snapshot_json_or_err: Result<&str, &str>,
    tolerance_pct: f64,
    review_threshold_pct: f64,
) -> SafeRefreshOutcome {
    let raw_json = match new_snapshot_json_or_err {
        Ok(s) => s,
        Err(e) => {
            return SafeRefreshOutcome {
                updated: false,
                error: Some(e.to_string()),
                state: previous_state.clone(),
                removed_from_simulation_ready: Vec::new(),
                added_to_simulation_ready: Vec::new(),
            };
        }
    };

    match import_driver_base_snapshot(raw_json, tolerance_pct, review_threshold_pct) {
        Ok(staged) => {
            let removed_from_simulation_ready: Vec<String> = previous_state
                .simulation_ready_drivers
                .keys()
                .filter(|k| !staged.simulation_ready_drivers.contains_key(*k))
                .cloned()
                .collect();
            let added_to_simulation_ready: Vec<String> = staged
                .simulation_ready_drivers
                .keys()
                .filter(|k| !previous_state.simulation_ready_drivers.contains_key(*k))
                .cloned()
                .collect();
            SafeRefreshOutcome {
                updated: true,
                error: None,
                state: staged,
                removed_from_simulation_ready,
                added_to_simulation_ready,
            }
        }
        Err(e) => SafeRefreshOutcome {
            updated: false,
            error: Some(e),
            state: previous_state.clone(),
            removed_from_simulation_ready: Vec::new(),
            added_to_simulation_ready: Vec::new(),
        },
    }
}

