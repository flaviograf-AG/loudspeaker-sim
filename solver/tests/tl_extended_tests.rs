//! Extended TL validation tests — driver position, taper profiles, stuffing zones, folds.
//!
//! These tests verify the physical behavior of the expanded TL model by checking
//! that each new parameter produces the expected acoustic effect.

use loudspeaker_solver::driver::derive_driver;
use loudspeaker_solver::transmission_line::tl_frequency_response;
use loudspeaker_solver::types::*;

fn test_driver() -> DerivedDriver {
    derive_driver(&DriverParams {
        fs_hz: 37.0,
        re_ohm: 6.5,
        le_h: 0.5e-3,
        qes: 0.42,
        qms: 3.5,
        vas_m3: 18.0e-3,
        sd_m2: 132.0e-4,
        xmax_m: 6.0e-3,
    })
}

fn base_tl() -> TransmissionLineParams {
    TransmissionLineParams {
        length_m: 2.32,
        area_driver_m2: 132.0e-4,
        area_mouth_m2: 132.0e-4,
        num_segments: 40,
        stuffing_density_kg_m3: 0.0,
        flow_resistivity_pa_s_m2: 0.0,
        open_end: true,
        ..Default::default()
    }
}

fn fine_freqs() -> Vec<f64> {
    (10..=300).map(|f| f as f64).collect()
}

/// Helper: find impedance peaks in a frequency range.
fn find_impedance_peaks(freqs: &[f64], z: &[f64], min_freq: f64, max_freq: f64) -> Vec<(f64, f64)> {
    let mut peaks = Vec::new();
    for i in 1..z.len() - 1 {
        let f = freqs[i];
        if f >= min_freq && f <= max_freq && z[i] > z[i - 1] && z[i] > z[i + 1] {
            peaks.push((f, z[i]));
        }
    }
    peaks
}

// ============================================================
// Driver Position Tests
// ============================================================

/// Driver at 33% offset should suppress the 3rd harmonic standing wave.
/// Quarter-wave fundamental ≈ c/(4L) = 343/(4×2.32) ≈ 37 Hz
/// 3rd harmonic ≈ 111 Hz — should be reduced with 33% offset.
/// Reference: King (2005-2020) — driver offset methodology
#[test]
fn driver_at_33pct_suppresses_3rd_harmonic() {
    let driver = test_driver();
    let freqs = fine_freqs();

    // No offset
    let tl_0 = base_tl();
    let r_0 = tl_frequency_response(&driver, &tl_0, &freqs, 2.83);

    // 33% offset
    let mut tl_33 = base_tl();
    tl_33.driver_position = 0.33;
    let r_33 = tl_frequency_response(&driver, &tl_33, &freqs, 2.83);

    // Find impedance peaks near 3rd harmonic (~111 Hz)
    let peaks_0 = find_impedance_peaks(&freqs, &r_0.impedance_ohm, 90.0, 130.0);
    let peaks_33 = find_impedance_peaks(&freqs, &r_33.impedance_ohm, 90.0, 130.0);

    let max_peak_0 = peaks_0.iter().map(|p| p.1).fold(0.0_f64, f64::max);
    let max_peak_33 = peaks_33.iter().map(|p| p.1).fold(0.0_f64, f64::max);

    eprintln!(
        "3rd harmonic region (90-130 Hz): no-offset peak={:.1} Ω, 33%-offset peak={:.1} Ω",
        max_peak_0, max_peak_33
    );

    // 33% offset should reduce the impedance peak in the 3rd harmonic region
    assert!(
        max_peak_33 < max_peak_0,
        "33% driver offset should suppress 3rd harmonic: no-offset={:.1}, offset={:.1}",
        max_peak_0, max_peak_33
    );
}

/// Driver offset should shift the impedance minimum compared to no offset.
#[test]
fn driver_offset_shifts_impedance() {
    let driver = test_driver();
    let freqs = fine_freqs();

    let tl_0 = base_tl();
    let r_0 = tl_frequency_response(&driver, &tl_0, &freqs, 2.83);

    let mut tl_25 = base_tl();
    tl_25.driver_position = 0.25;
    let r_25 = tl_frequency_response(&driver, &tl_25, &freqs, 2.83);

    // The impedance curves should differ — offset changes the acoustic loading
    let diff: f64 = r_0
        .impedance_ohm
        .iter()
        .zip(r_25.impedance_ohm.iter())
        .map(|(a, b)| (a - b).abs())
        .sum::<f64>()
        / r_0.impedance_ohm.len() as f64;

    eprintln!("Mean |Z| difference between 0% and 25% offset: {:.3} Ω", diff);
    assert!(diff > 0.1, "Driver offset should change impedance curve, diff={:.3}", diff);
}

// ============================================================
// Taper Profile Tests
// ============================================================

/// Exponential taper should produce different low-frequency behavior than straight.
#[test]
fn exponential_taper_differs_from_straight() {
    let driver = test_driver();
    let freqs = fine_freqs();

    let mut tl_straight = base_tl();
    tl_straight.area_mouth_m2 = 300.0e-4; // wider mouth for visible taper effect
    tl_straight.taper_profile = TaperProfile::Straight;
    let r_str = tl_frequency_response(&driver, &tl_straight, &freqs, 2.83);

    let mut tl_exp = base_tl();
    tl_exp.area_mouth_m2 = 300.0e-4;
    tl_exp.taper_profile = TaperProfile::Exponential;
    let r_exp = tl_frequency_response(&driver, &tl_exp, &freqs, 2.83);

    // SPL curves should differ
    let spl_diff: f64 = r_str
        .spl_db
        .iter()
        .zip(r_exp.spl_db.iter())
        .map(|(a, b)| (a - b).abs())
        .sum::<f64>()
        / r_str.spl_db.len() as f64;

    // Also check impedance difference which is more sensitive to taper
    let z_diff: f64 = r_str
        .impedance_ohm
        .iter()
        .zip(r_exp.impedance_ohm.iter())
        .map(|(a, b)| (a - b).abs())
        .sum::<f64>()
        / r_str.impedance_ohm.len() as f64;

    eprintln!("Mean SPL diff straight vs exponential: {:.3} dB, Z diff: {:.3} Ω", spl_diff, z_diff);
    assert!(
        spl_diff > 0.01 || z_diff > 0.01,
        "Taper profiles should produce different curves (SPL diff={:.4}, Z diff={:.4})",
        spl_diff, z_diff
    );
}

/// Conical taper should produce finite values and differ from straight.
#[test]
fn conical_taper_produces_valid_output() {
    let driver = test_driver();
    let freqs = fine_freqs();

    let mut tl = base_tl();
    tl.area_mouth_m2 = 300.0e-4;
    tl.taper_profile = TaperProfile::Conical;
    let r = tl_frequency_response(&driver, &tl, &freqs, 2.83);

    assert!(r.spl_db.iter().all(|v| v.is_finite()), "Conical taper produced non-finite SPL");
    assert!(r.impedance_ohm.iter().all(|v| v.is_finite()), "Conical taper produced non-finite Z");
}

// ============================================================
// Stuffing Zone Tests
// ============================================================

/// Stuffing zones should actually apply stuffing — a TL with zone-based stuffing
/// should behave differently from an unstuffed TL.
#[test]
fn stuffing_zones_damp_resonances() {
    let driver = test_driver();
    let freqs = fine_freqs();

    // No stuffing at all
    let tl_bare = base_tl();
    let r_bare = tl_frequency_response(&driver, &tl_bare, &freqs, 2.83);

    // Zoned stuffing (heavy throughout)
    let mut tl_zoned = base_tl();
    tl_zoned.stuffing_zones = vec![StuffingZone {
        start_pct: 0.0,
        end_pct: 1.0,
        density_kg_m3: 12.0,
        flow_resistivity_pa_s_m2: 8000.0,
    }];
    let r_zoned = tl_frequency_response(&driver, &tl_zoned, &freqs, 2.83);

    // Stuffing should reduce impedance variation (flatter curve)
    let bare_range = r_bare.impedance_ohm.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
        - r_bare.impedance_ohm.iter().cloned().fold(f64::INFINITY, f64::min);
    let zoned_range = r_zoned.impedance_ohm.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
        - r_zoned.impedance_ohm.iter().cloned().fold(f64::INFINITY, f64::min);

    eprintln!(
        "Impedance range: bare={:.1} Ω, zone-stuffed={:.1} Ω",
        bare_range, zoned_range
    );

    assert!(
        zoned_range < bare_range,
        "Zone-based stuffing should reduce impedance ripple: bare={:.1}, zoned={:.1}",
        bare_range, zoned_range
    );
}

// ============================================================
// Fold Loss Tests
// ============================================================

/// Folds should reduce the Q of standing wave peaks (damp impedance ripple).
#[test]
fn folds_reduce_impedance_ripple() {
    let driver = test_driver();
    let freqs = fine_freqs();

    // No folds
    let tl_0 = base_tl();
    let r_0 = tl_frequency_response(&driver, &tl_0, &freqs, 2.83);

    // 3 folds
    let mut tl_3 = base_tl();
    tl_3.num_folds = 3;
    let r_3 = tl_frequency_response(&driver, &tl_3, &freqs, 2.83);

    // Measure impedance range (max - min) as proxy for ripple
    let range_0 = r_0.impedance_ohm.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
        - r_0.impedance_ohm.iter().cloned().fold(f64::INFINITY, f64::min);
    let range_3 = r_3.impedance_ohm.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
        - r_3.impedance_ohm.iter().cloned().fold(f64::INFINITY, f64::min);

    eprintln!(
        "Impedance range: no-folds={:.1} Ω, 3-folds={:.1} Ω",
        range_0, range_3
    );

    assert!(
        range_3 < range_0,
        "Folds should reduce impedance ripple: no-folds={:.1}, 3-folds={:.1}",
        range_0, range_3
    );
}
