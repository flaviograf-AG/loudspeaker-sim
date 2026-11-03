//! Integration & regression tests for the `driver-base` Thiele/Small dataset importer.

use loudspeaker_solver::driver_import::{
    import_driver_base_snapshot, refresh_driver_database_safely, validate_driver_base_record,
    EquationId, ValidationStatus,
};
use serde_json::{json, Value};

const FROZEN_SNAPSHOT_JSON: &str = include_str!("../../web/src/presets/driver_base_snapshot.json");

#[test]
fn test_frozen_fixture_beyma_12br70_8ohm() {
    let root: Value = serde_json::from_str(FROZEN_SNAPSHOT_JSON).unwrap();
    let drivers = root.get("drivers").unwrap().as_array().unwrap();
    let beyma = drivers
        .iter()
        .find(|d| d.get("canonical_id").and_then(|v| v.as_str()) == Some("beyma__12br70__8ohm"))
        .expect("beyma__12br70__8ohm must exist in frozen snapshot");

    assert_eq!(beyma.get("mms_g").and_then(|v| v.as_f64()), Some(0.074));
    assert_eq!(beyma.get("cms_mm_per_n").and_then(|v| v.as_f64()), Some(0.345));
    assert_eq!(beyma.get("fs_hz").and_then(|v| v.as_f64()), Some(31.0));

    // 1. Bad fixture (mms_g = 0.074) -> predicts Fs ≈ 996.1 Hz vs 31 Hz -> QUARANTINE
    let bad_res = validate_driver_base_record(beyma, 10.0, 5.0);
    assert_eq!(bad_res.status, ValidationStatus::QUARANTINE);
    assert!(!bad_res.simulation_ready);

    let fs_fail = bad_res
        .failed_checks
        .iter()
        .find(|c| c.check_id == EquationId::FsFromMmsCms)
        .expect("FsFromMmsCms must fail on mms_g=0.074");
    assert!((fs_fail.predicted_value - 996.11).abs() < 0.5);
    assert_eq!(fs_fail.published_value, 31.0);
    assert!(fs_fail.error_pct > 3000.0);

    // 2. Corrected fixture (mms_g = 74.0) -> predicts Fs ≈ 31.5 Hz -> ACCEPT
    let mut fixed_beyma = beyma.clone();
    fixed_beyma["mms_g"] = json!(74.0);
    let fixed_res = validate_driver_base_record(&fixed_beyma, 10.0, 5.0);
    assert_eq!(fixed_res.status, ValidationStatus::ACCEPT);
    assert!(fixed_res.simulation_ready);

    let fs_pass = fixed_res
        .checks_run
        .iter()
        .find(|c| c.check_id == EquationId::FsFromMmsCms)
        .expect("FsFromMmsCms must run on corrected mms_g=74.0");
    assert!(fs_pass.passed);
    assert!((fs_pass.predicted_value - 31.5).abs() < 0.1);
}

#[test]
fn test_frozen_fixture_dayton_rss315hf_4_4ohm() {
    let root: Value = serde_json::from_str(FROZEN_SNAPSHOT_JSON).unwrap();
    let drivers = root.get("drivers").unwrap().as_array().unwrap();
    let dayton = drivers
        .iter()
        .find(|d| {
            d.get("canonical_id").and_then(|v| v.as_str()) == Some("dayton__rss315hf_4__4ohm")
        })
        .expect("dayton__rss315hf_4__4ohm must exist in frozen snapshot");

    assert_eq!(dayton.get("bl_tm").and_then(|v| v.as_f64()), Some(1.0));
    assert_eq!(dayton.get("qes").and_then(|v| v.as_f64()), Some(0.45));

    // 1. Bad fixture (bl_tm = 1.0) -> predicts Qes ≈ 88.6 vs 0.45 -> QUARANTINE
    let bad_res = validate_driver_base_record(dayton, 10.0, 5.0);
    assert_eq!(bad_res.status, ValidationStatus::QUARANTINE);
    assert!(!bad_res.simulation_ready);

    // Verify Qts passed yet one failed check is sufficient to quarantine
    let qts_check = bad_res
        .checks_run
        .iter()
        .find(|c| c.check_id == EquationId::QtsFromQmsQes)
        .expect("Qts check should run");
    assert!(qts_check.passed);

    let qes_fail = bad_res
        .failed_checks
        .iter()
        .find(|c| c.check_id == EquationId::QesFromFsMmsReBl)
        .expect("QesFromFsMmsReBl must fail on bl_tm=1.0");
    assert!((qes_fail.predicted_value - 88.615).abs() < 0.1);
    assert_eq!(qes_fail.published_value, 0.45);
    assert!(qes_fail.error_pct > 19000.0);

    // 2. Corrected fixture (bl_tm = 13.99) -> predicts Qes ≈ 0.453 -> ACCEPT
    let mut fixed_dayton = dayton.clone();
    fixed_dayton["bl_tm"] = json!(13.99);
    let fixed_res = validate_driver_base_record(&fixed_dayton, 10.0, 5.0);
    assert_eq!(fixed_res.status, ValidationStatus::ACCEPT);
    assert!(fixed_res.simulation_ready);

    let qes_pass = fixed_res
        .checks_run
        .iter()
        .find(|c| c.check_id == EquationId::QesFromFsMmsReBl)
        .expect("QesFromFsMmsReBl must run on corrected bl_tm=13.99");
    assert!(qes_pass.passed);
    assert!((qes_pass.predicted_value - 0.4528).abs() < 0.005);
}

#[test]
fn test_missing_fields_and_unverified_status() {
    let record = json!({
        "canonical_id": "test__missing_fields__8ohm",
        "manufacturer": "TestAudio",
        "model": "MissingFields",
        "fs_hz": 45.0,
        "re_ohm": 6.2,
        "qes": 0.45,
        "qms": null,
        "qts": null,
        "vas_liters": 25.0,
        "sd_cm2": 135.0,
        "mms_g": null,
        "cms_mm_per_n": null,
        "rms_ns_per_m": null,
        "bl_tm": null
    });

    let res = validate_driver_base_record(&record, 10.0, 5.0);
    assert_eq!(res.status, ValidationStatus::UNVERIFIED);
    assert!(res.checks_run.is_empty());
    assert!(res.invalid_fields.is_empty());
    assert!(!res.simulation_ready);
}

#[test]
fn test_derived_only_checks_skipped() {
    let record = json!({
        "canonical_id": "test__derived_only__8ohm",
        "manufacturer": "TestAudio",
        "model": "DerivedOnly",
        "fs_hz": 40.0,
        "re_ohm": 6.0,
        "qes": 0.5,
        "qms": 4.5,
        "qts": 0.45,
        "vas_liters": 30.0,
        "sd_cm2": 140.0,
        "cms_mm_per_n": 0.916,
        "spec_source": {
            "fs_hz": "html_table",
            "re_ohm": "html_table",
            "qes": "html_table",
            "qms": "html_table",
            "qts": "derived",
            "vas_liters": "html_table",
            "sd_cm2": "html_table",
            "cms_mm_per_n": "derived"
        }
    });

    let res = validate_driver_base_record(&record, 10.0, 5.0);
    assert_eq!(res.status, ValidationStatus::UNVERIFIED);
    assert!(res.checks_run.is_empty());
    assert!(!res.simulation_ready);
    let derived_skips: Vec<_> = res
        .skipped_checks
        .iter()
        .filter(|s| s.reason == "derived_fields")
        .collect();
    assert_eq!(derived_skips.len(), 2);
}

#[test]
fn test_invalid_supplied_values_vs_missing() {
    let zero_mms = json!({
        "canonical_id": "test__zero_mms__8ohm",
        "manufacturer": "TestAudio",
        "model": "ZeroMms",
        "fs_hz": 50.0,
        "re_ohm": 6.0,
        "qes": 0.5,
        "qms": 4.5,
        "qts": 0.45,
        "mms_g": 0.0,
        "cms_mm_per_n": null,
        "vas_liters": 20.0,
        "sd_cm2": 120.0
    });

    let res = validate_driver_base_record(&zero_mms, 10.0, 5.0);
    assert_eq!(res.status, ValidationStatus::QUARANTINE);
    assert!(!res.simulation_ready);
    assert_eq!(res.invalid_fields.len(), 1);
    assert_eq!(res.invalid_fields[0].field, "mms_g");
    assert_eq!(res.invalid_fields[0].reason, "non_positive");

    let non_finite_bl = json!({
        "canonical_id": "test__nan_bl__8ohm",
        "manufacturer": "TestAudio",
        "model": "NanBl",
        "fs_hz": 50.0,
        "re_ohm": 6.0,
        "qes": 0.5,
        "qms": 4.5,
        "qts": 0.45,
        "bl_tm": "NaN",
        "vas_liters": 20.0,
        "sd_cm2": 120.0
    });
    let res_nf = validate_driver_base_record(&non_finite_bl, 10.0, 5.0);
    assert_eq!(res_nf.status, ValidationStatus::QUARANTINE);
    assert_eq!(res_nf.invalid_fields.len(), 1);
    assert_eq!(res_nf.invalid_fields[0].field, "bl_tm");
    assert_eq!(res_nf.invalid_fields[0].reason, "non_finite");
}

#[test]
fn test_exact_10_percent_boundary_and_review_flag() {
    // qms=1.1, qes=1.1 -> predicted Qts = 0.55; published Qts = 0.50 -> exact 10.0% error
    let exact_10 = json!({
        "canonical_id": "test__boundary_10__8ohm",
        "manufacturer": "TestAudio",
        "model": "Boundary10",
        "fs_hz": 50.0,
        "re_ohm": 6.0,
        "qms": 1.1,
        "qes": 1.1,
        "qts": 0.5,
        "vas_liters": 20.0,
        "sd_cm2": 130.0
    });

    let res_10 = validate_driver_base_record(&exact_10, 10.0, 5.0);
    assert_eq!(res_10.status, ValidationStatus::ACCEPT);
    assert!(res_10.simulation_ready);
    assert!(res_10.qts_only_validated);
    assert_eq!(res_10.review_flags.len(), 1);
    assert!((res_10.checks_run[0].error_pct - 10.0).abs() < 1e-9);

    // Slightly over 10% (predicted = 0.5505 -> 10.1% error)
    let over_10 = json!({
        "canonical_id": "test__over_10__8ohm",
        "manufacturer": "TestAudio",
        "model": "Over10",
        "fs_hz": 50.0,
        "re_ohm": 6.0,
        "qms": 1.101,
        "qes": 1.101,
        "qts": 0.5,
        "vas_liters": 20.0,
        "sd_cm2": 130.0
    });
    let res_over = validate_driver_base_record(&over_10, 10.0, 5.0);
    assert_eq!(res_over.status, ValidationStatus::QUARANTINE);
    assert!(!res_over.simulation_ready);
}

#[test]
fn test_safe_staging_refresh() {
    let initial_snapshot = json!({
        "schema_version": "1.0",
        "generated_at": "2026-11-01T00:00:00Z",
        "drivers": [
            {
                "canonical_id": "test__driver_a__8ohm",
                "manufacturer": "TestAudio",
                "model": "DriverA",
                "fs_hz": 31.5,
                "re_ohm": 5.8,
                "qms": 6.18,
                "qes": 0.45,
                "qts": 0.42,
                "mms_g": 74.0,
                "cms_mm_per_n": 0.345,
                "vas_liters": 136.85,
                "sd_cm2": 530.0
            },
            {
                "canonical_id": "test__driver_b__8ohm",
                "manufacturer": "TestAudio",
                "model": "DriverB",
                "fs_hz": 31.5,
                "re_ohm": 5.8,
                "qms": 6.18,
                "qes": 0.45,
                "qts": 0.42,
                "mms_g": 74.0,
                "cms_mm_per_n": 0.345,
                "vas_liters": 136.85,
                "sd_cm2": 530.0
            }
        ]
    });

    let state0 =
        import_driver_base_snapshot(&initial_snapshot.to_string(), 10.0, 5.0).unwrap();
    assert_eq!(state0.counts.simulation_ready, 2);

    // Refresh 1: DriverB now fails (mms_g = 0.074) -> must be removed from simulation-ready in the same update
    let update_snapshot = json!({
        "schema_version": "1.0",
        "generated_at": "2026-11-02T00:00:00Z",
        "drivers": [
            {
                "canonical_id": "test__driver_a__8ohm",
                "manufacturer": "TestAudio",
                "model": "DriverA",
                "fs_hz": 31.5,
                "re_ohm": 5.8,
                "qms": 6.18,
                "qes": 0.45,
                "qts": 0.42,
                "mms_g": 74.0,
                "cms_mm_per_n": 0.345,
                "vas_liters": 136.85,
                "sd_cm2": 530.0
            },
            {
                "canonical_id": "test__driver_b__8ohm",
                "manufacturer": "TestAudio",
                "model": "DriverB",
                "fs_hz": 31.5,
                "re_ohm": 5.8,
                "qms": 6.18,
                "qes": 0.45,
                "qts": 0.42,
                "mms_g": 0.074,
                "cms_mm_per_n": 0.345,
                "vas_liters": 136.85,
                "sd_cm2": 530.0
            }
        ]
    });

    let refresh1 = refresh_driver_database_safely(
        &state0,
        Ok(&update_snapshot.to_string()),
        10.0,
        5.0,
    );
    assert!(refresh1.updated);
    assert_eq!(
        refresh1.removed_from_simulation_ready,
        vec!["test__driver_b__8ohm".to_string()]
    );
    assert_eq!(refresh1.state.counts.simulation_ready, 1);
    assert!(refresh1
        .state
        .simulation_ready_drivers
        .contains_key("test__driver_a__8ohm"));
    assert!(!refresh1
        .state
        .simulation_ready_drivers
        .contains_key("test__driver_b__8ohm"));

    // Refresh 2: Corrupted snapshot or download error -> keeps previous successful dataset active
    let refresh2 =
        refresh_driver_database_safely(&refresh1.state, Ok("{ invalid json"), 10.0, 5.0);
    assert!(!refresh2.updated);
    assert!(refresh2.error.is_some());
    assert_eq!(refresh2.state.counts.simulation_ready, 1);
    assert!(refresh2
        .state
        .simulation_ready_drivers
        .contains_key("test__driver_a__8ohm"));
}

#[test]
fn test_full_snapshot_import_counts() {
    let result = import_driver_base_snapshot(FROZEN_SNAPSHOT_JSON, 10.0, 5.0)
        .expect("Full snapshot import must succeed");

    assert_eq!(result.generated_at, "2026-11-02T21:39:46+00:00");
    assert_eq!(result.counts.total_records, 2198);
    assert_eq!(result.counts.accepted, 1360);
    assert_eq!(result.counts.quarantined, 247);
    assert_eq!(result.counts.unverified, 591);
    assert_eq!(result.counts.simulation_ready, 1225);
    assert_eq!(result.counts.accepted_missing_sim_inputs, 135);
    assert_eq!(result.counts.accepted_qts_only, 25);
    assert_eq!(result.counts.flagged_for_review, 226);
    assert_eq!(result.quarantine_report.len(), 247);
}

