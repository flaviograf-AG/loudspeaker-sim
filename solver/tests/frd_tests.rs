//! Tests for measured FRD/ZMA data path in the system solver.

use loudspeaker_solver::crossover::ActiveFilter;
use loudspeaker_solver::system::{solve_system, SpeakerProject, Way};
use loudspeaker_solver::types::*;

/// Create a MeasuredDriverData with flat 90 dB response across 20-20kHz.
fn flat_90db_measured() -> MeasuredDriverData {
    // 50 log-spaced points from 20 to 20000 Hz
    let n = 50;
    let f_start: f64 = 20.0;
    let f_end: f64 = 20000.0;
    let frequencies_hz: Vec<f64> = (0..n)
        .map(|i| f_start * (f_end / f_start).powf(i as f64 / (n - 1) as f64))
        .collect();
    let spl_db = vec![90.0; n];
    let phase_deg = vec![0.0; n];
    let impedance_ohm = vec![8.0; n];
    let impedance_phase_deg = vec![0.0; n];
    MeasuredDriverData {
        frequencies_hz,
        spl_db,
        phase_deg,
        impedance_ohm,
        impedance_phase_deg,
    }
}

/// Dummy driver params (needed for Re fallback, but simulation is bypassed).
fn dummy_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5,
        vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3, ke: 0.0,
    }
}

#[test]
fn measured_data_bypasses_ts_simulation() {
    // A way with flat 90 dB measured data + LR4 LP at 2kHz.
    // Below the LP cutoff, SPL should be ~90 dB.
    // Above the LP cutoff, SPL should roll off significantly.
    let project = SpeakerProject {
        ways: vec![Way {
            name: "Woofer (measured)".into(),
            driver: dummy_driver(),
            enclosure: EnclosureConfig::Sealed(SealedBoxParams { volume_m3: 18e-3, ql: 7.0 }),
            passive_filters: vec![],
            active_filters: vec![ActiveFilter::LR4LowPass { freq_hz: 2000.0 }],
            gain_db: 0.0,
            delay_s: 0.0,
            inverted: false,
            z_offset_m: 0.0,
            enabled: true,
            measured: Some(flat_90db_measured()),
        }],
        freq_start_hz: 100.0,
        freq_end_hz: 10000.0,
        freq_points: 100,
        drive_voltage_rms: 2.83,
    };

    let result = solve_system(&project).unwrap();
    assert_eq!(result.ways.len(), 1);

    // Find SPL at ~500 Hz (well below LP cutoff)
    let idx_500 = result.frequencies_hz.iter()
        .position(|&f| f >= 500.0)
        .expect("Should have a point at or above 500 Hz");
    let spl_500 = result.system_spl_db[idx_500];

    // Find SPL at ~5000 Hz (well above LP cutoff)
    let idx_5k = result.frequencies_hz.iter()
        .position(|&f| f >= 5000.0)
        .expect("Should have a point at or above 5000 Hz");
    let spl_5k = result.system_spl_db[idx_5k];

    eprintln!("Measured data test: SPL@500Hz = {:.1} dB, SPL@5kHz = {:.1} dB", spl_500, spl_5k);

    // Below LP: should be close to 90 dB (measured flat response, minimal filter effect)
    assert!(spl_500 > 85.0 && spl_500 < 95.0,
        "Below LP should be near measured 90 dB, got {:.1}", spl_500);

    // Above LP: LR4 = -24 dB/oct, at 5kHz (~1.3 octaves above 2kHz) expect ~-31 dB rolloff
    assert!(spl_5k < spl_500 - 20.0,
        "Above LP should be rolled off >20 dB, got {:.1} vs {:.1}", spl_5k, spl_500);
}

#[test]
fn measured_data_with_no_zma_uses_re_fallback() {
    // FRD only, no ZMA — impedance should default to Re
    let mut measured = flat_90db_measured();
    measured.impedance_ohm = vec![]; // empty = no ZMA
    measured.impedance_phase_deg = vec![];

    let project = SpeakerProject {
        ways: vec![Way {
            name: "Tweeter (FRD only)".into(),
            driver: dummy_driver(),
            enclosure: EnclosureConfig::Sealed(SealedBoxParams { volume_m3: 0.5e-3, ql: 7.0 }),
            passive_filters: vec![],
            active_filters: vec![],
            gain_db: 0.0,
            delay_s: 0.0,
            inverted: false,
            z_offset_m: 0.0,
            enabled: true,
            measured: Some(measured),
        }],
        freq_start_hz: 100.0,
        freq_end_hz: 10000.0,
        freq_points: 50,
        drive_voltage_rms: 2.83,
    };

    let result = solve_system(&project).unwrap();

    // System impedance should be ~Re (6.5 Ω) since we have no ZMA
    let mid_idx = result.frequencies_hz.len() / 2;
    let z = result.system_impedance_ohm[mid_idx];
    eprintln!("FRD-only impedance at {:.0} Hz = {:.1} Ω (Re = 6.5)", result.frequencies_hz[mid_idx], z);
    assert!((z - 6.5).abs() < 0.1, "Without ZMA, impedance should be Re (6.5 Ω), got {:.1}", z);
}

#[test]
fn two_way_measured_system_with_crossover() {
    // Two-way system where both ways have measured data.
    // Woofer: flat 90 dB + LR4 LP at 2kHz
    // Tweeter: flat 90 dB + LR4 HP at 2kHz
    // System sum should be ~90 dB across the passband (LR4 sums flat).
    let project = SpeakerProject {
        ways: vec![
            Way {
                name: "Woofer".into(),
                driver: dummy_driver(),
                enclosure: EnclosureConfig::Sealed(SealedBoxParams { volume_m3: 18e-3, ql: 7.0 }),
                passive_filters: vec![],
                active_filters: vec![ActiveFilter::LR4LowPass { freq_hz: 2000.0 }],
                gain_db: 0.0, delay_s: 0.0, inverted: false, z_offset_m: 0.0, enabled: true,
                measured: Some(flat_90db_measured()),
            },
            Way {
                name: "Tweeter".into(),
                driver: DriverParams {
                    fs_hz: 800.0, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0,
                    vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3, ke: 0.0,
                },
                enclosure: EnclosureConfig::Sealed(SealedBoxParams { volume_m3: 0.5e-3, ql: 7.0 }),
                passive_filters: vec![],
                active_filters: vec![ActiveFilter::LR4HighPass { freq_hz: 2000.0 }],
                gain_db: 0.0, delay_s: 0.0, inverted: false, z_offset_m: 0.0, enabled: true,
                measured: Some(flat_90db_measured()),
            },
        ],
        freq_start_hz: 200.0,
        freq_end_hz: 10000.0,
        freq_points: 100,
        drive_voltage_rms: 2.83,
    };

    let result = solve_system(&project).unwrap();
    assert_eq!(result.ways.len(), 2);

    // LR4 LP + LR4 HP with identical flat sources should sum to ~+6 dB at crossover
    // (power sum of two equal-level sources in-phase = +6 dB).
    // Away from crossover, the dominant way should be ~90 dB.
    let idx_2k = result.frequencies_hz.iter()
        .position(|&f| f >= 2000.0)
        .unwrap();
    let spl_xover = result.system_spl_db[idx_2k];

    // LR4 sums flat: each way is -6 dB at crossover, voltage sum = 0.5 + 0.5 = 1.0 = 0 dB.
    // So system SPL at crossover should be ~90 dB (same as passband).
    eprintln!("2-way measured: SPL@2kHz = {:.1} dB (expect ~90)", spl_xover);
    assert!(spl_xover > 87.0 && spl_xover < 93.0,
        "LR4 crossover sum of two flat 90 dB sources should be ~90 dB, got {:.1}", spl_xover);

    // At 500 Hz, woofer dominates, should be ~90 dB
    let idx_500 = result.frequencies_hz.iter()
        .position(|&f| f >= 500.0)
        .unwrap();
    let spl_500 = result.system_spl_db[idx_500];
    eprintln!("2-way measured: SPL@500Hz = {:.1} dB (expect ~90)", spl_500);
    assert!(spl_500 > 87.0 && spl_500 < 93.0,
        "Below crossover, woofer dominates at ~90 dB, got {:.1}", spl_500);
}

#[test]
fn passive_filter_affects_measured_data_system() {
    // 1-way system with flat 90 dB measured data.
    // Without passive filter: SPL should be ~90 dB everywhere.
    // With a series inductor (1st-order LP): SPL should roll off at high frequencies.
    use loudspeaker_solver::crossover::PassiveBlock;

    let base_way = Way {
        name: "Woofer (measured)".into(),
        driver: dummy_driver(),
        enclosure: EnclosureConfig::Sealed(SealedBoxParams { volume_m3: 18e-3, ql: 7.0 }),
        passive_filters: vec![],
        active_filters: vec![],
        gain_db: 0.0, delay_s: 0.0, inverted: false, z_offset_m: 0.0, enabled: true,
        measured: Some(flat_90db_measured()),
    };

    // Without passive filter
    let project_no_filter = SpeakerProject {
        ways: vec![base_way.clone()],
        freq_start_hz: 100.0,
        freq_end_hz: 10000.0,
        freq_points: 100,
        drive_voltage_rms: 2.83,
    };
    let result_no = solve_system(&project_no_filter).unwrap();

    // With a series inductor (1st-order LP, ~0.5 mH, rolls off above ~2 kHz with 8 ohm load)
    let mut way_with_filter = base_way;
    way_with_filter.passive_filters = vec![
        PassiveBlock::SeriesL { henries: 0.5e-3, dcr_ohms: 0.1 },
    ];
    let project_with_filter = SpeakerProject {
        ways: vec![way_with_filter],
        freq_start_hz: 100.0,
        freq_end_hz: 10000.0,
        freq_points: 100,
        drive_voltage_rms: 2.83,
    };
    let result_yes = solve_system(&project_with_filter).unwrap();

    // At ~5 kHz, the inductor should attenuate significantly
    let idx_5k = result_no.frequencies_hz.iter()
        .position(|&f| f >= 5000.0)
        .unwrap();
    let spl_no_5k = result_no.system_spl_db[idx_5k];
    let spl_yes_5k = result_yes.system_spl_db[idx_5k];

    eprintln!("Passive filter + measured: SPL@5kHz without={:.1}, with={:.1}, diff={:.1} dB",
        spl_no_5k, spl_yes_5k, spl_no_5k - spl_yes_5k);

    // Expect >5 dB of attenuation at 5 kHz from the series inductor
    assert!(spl_no_5k - spl_yes_5k > 5.0,
        "Series inductor should attenuate >5 dB at 5 kHz, got {:.1} dB difference",
        spl_no_5k - spl_yes_5k);

    // At 200 Hz, very little change (inductor is negligible at low frequencies)
    let idx_200 = result_no.frequencies_hz.iter()
        .position(|&f| f >= 200.0)
        .unwrap();
    let diff_200 = (result_no.system_spl_db[idx_200] - result_yes.system_spl_db[idx_200]).abs();
    eprintln!("Passive filter + measured: diff@200Hz = {:.1} dB (expect <1)", diff_200);
    assert!(diff_200 < 1.0,
        "At 200 Hz, inductor should have minimal effect, got {:.1} dB diff", diff_200);
}
