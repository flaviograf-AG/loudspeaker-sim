//! Validation tests for Bandpass, Passive Radiator, and Open Baffle enclosures.

use loudspeaker_solver::solve_simulation;
use loudspeaker_solver::types::*;

fn test_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5,
        vas_m3: 18.0e-3, sd_m2: 132.0e-4, xmax_m: 6.0e-3,
    }
}

// ============================================================
// Bandpass
// ============================================================

#[test]
fn bandpass_produces_finite_output() {
    let r = solve_simulation(&SimulationInput {
        driver: test_driver(),
        enclosure: EnclosureConfig::Bandpass(BandpassParams {
            rear_volume_m3: 15e-3, front_volume_m3: 20e-3,
            port_area_m2: 20e-4, port_length_m: 0.12,
            port_flanged: true, rear_ql: 7.0, front_ql: 7.0,
        }),
        freq_start_hz: 10.0, freq_end_hz: 500.0, freq_points: 500, drive_voltage_rms: 2.83,
    }).unwrap();
    assert!(r.spl_db.iter().all(|v| v.is_finite()));
    assert!(r.impedance_ohm.iter().all(|v| v.is_finite()));
}

#[test]
fn bandpass_has_bandpass_shape() {
    let r = solve_simulation(&SimulationInput {
        driver: test_driver(),
        enclosure: EnclosureConfig::Bandpass(BandpassParams {
            rear_volume_m3: 15e-3, front_volume_m3: 20e-3,
            port_area_m2: 20e-4, port_length_m: 0.12,
            port_flanged: true, rear_ql: 7.0, front_ql: 7.0,
        }),
        freq_start_hz: 10.0, freq_end_hz: 500.0, freq_points: 500, drive_voltage_rms: 2.83,
    }).unwrap();

    // SPL at extreme low and high frequencies should be lower than mid
    let spl_low = r.spl_db[5];   // ~10 Hz
    let spl_high = r.spl_db[490]; // ~500 Hz

    // Find peak SPL
    let spl_peak = r.spl_db.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let peak_idx = r.spl_db.iter().position(|&v| v == spl_peak).unwrap();
    let peak_freq = r.frequencies_hz[peak_idx];

    eprintln!("Bandpass: peak={:.1} dB at {:.0} Hz, low={:.1} dB, high={:.1} dB",
        spl_peak, peak_freq, spl_low, spl_high);

    // Both extremes should be significantly below peak (bandpass shape)
    assert!(spl_peak - spl_low > 10.0, "Low end should roll off");
    assert!(spl_peak - spl_high > 10.0, "High end should roll off");
}

// ============================================================
// Passive Radiator
// ============================================================

#[test]
fn passive_radiator_produces_finite_output() {
    let r = solve_simulation(&SimulationInput {
        driver: test_driver(),
        enclosure: EnclosureConfig::PassiveRadiator(PassiveRadiatorParams {
            volume_m3: 20e-3, pr_sd_m2: 200e-4,
            pr_cms: 1.0e-3, pr_mms_kg: 0.050, pr_rms: 1.0, ql: 7.0,
        }),
        freq_start_hz: 10.0, freq_end_hz: 500.0, freq_points: 500, drive_voltage_rms: 2.83,
    }).unwrap();
    assert!(r.spl_db.iter().all(|v| v.is_finite()));
}

#[test]
fn passive_radiator_has_two_impedance_peaks() {
    let r = solve_simulation(&SimulationInput {
        driver: test_driver(),
        enclosure: EnclosureConfig::PassiveRadiator(PassiveRadiatorParams {
            volume_m3: 20e-3, pr_sd_m2: 200e-4,
            pr_cms: 1.0e-3, pr_mms_kg: 0.050, pr_rms: 1.0, ql: 7.0,
        }),
        freq_start_hz: 10.0, freq_end_hz: 200.0, freq_points: 1000, drive_voltage_rms: 2.83,
    }).unwrap();

    // Like vented, PR should produce 2 impedance peaks
    let z = &r.impedance_ohm;
    let mut peaks = 0;
    for i in 1..z.len() - 1 {
        if z[i] > z[i-1] && z[i] > z[i+1] && z[i] > 10.0 {
            peaks += 1;
            eprintln!("PR impedance peak at {:.1} Hz = {:.1} Ω", r.frequencies_hz[i], z[i]);
        }
    }
    assert!(peaks >= 2, "PR should have at least 2 impedance peaks, found {}", peaks);
}

// ============================================================
// Open Baffle
// ============================================================

#[test]
fn open_baffle_produces_finite_output() {
    let r = solve_simulation(&SimulationInput {
        driver: test_driver(),
        enclosure: EnclosureConfig::OpenBaffle(OpenBaffleParams {
            width_m: 0.40, height_m: 0.60, driver_offset_m: 0.0,
        }),
        freq_start_hz: 10.0, freq_end_hz: 5000.0, freq_points: 500, drive_voltage_rms: 2.83,
    }).unwrap();
    assert!(r.spl_db.iter().all(|v| v.is_finite()));
}

#[test]
fn open_baffle_rolls_off_below_baffle_step() {
    let r = solve_simulation(&SimulationInput {
        driver: test_driver(),
        enclosure: EnclosureConfig::OpenBaffle(OpenBaffleParams {
            width_m: 0.40, height_m: 0.60, driver_offset_m: 0.0,
        }),
        freq_start_hz: 10.0, freq_end_hz: 5000.0, freq_points: 2000, drive_voltage_rms: 2.83,
    }).unwrap();

    // Baffle step freq ≈ c/(π×w) = 343/(π×0.4) ≈ 273 Hz
    // SPL above step should be higher than below
    // Find SPL at 50 Hz (well below) vs 1000 Hz (well above)
    let idx_50 = r.frequencies_hz.iter().position(|&f| f >= 50.0).unwrap();
    let idx_1k = r.frequencies_hz.iter().position(|&f| f >= 1000.0).unwrap();

    let spl_50 = r.spl_db[idx_50];
    let spl_1k = r.spl_db[idx_1k];

    eprintln!("Open baffle: SPL@50Hz={:.1}, SPL@1kHz={:.1}, step ≈273 Hz", spl_50, spl_1k);
    assert!(spl_1k > spl_50, "SPL above baffle step ({:.1}) should exceed below ({:.1})",
        spl_1k, spl_50);
}

#[test]
fn open_baffle_impedance_shows_driver_resonance() {
    let r = solve_simulation(&SimulationInput {
        driver: test_driver(),
        enclosure: EnclosureConfig::OpenBaffle(OpenBaffleParams {
            width_m: 0.40, height_m: 0.60, driver_offset_m: 0.0,
        }),
        freq_start_hz: 10.0, freq_end_hz: 200.0, freq_points: 1000, drive_voltage_rms: 2.83,
    }).unwrap();

    // Open baffle impedance should peak at the driver's free-air Fs (37 Hz)
    let z = &r.impedance_ohm;
    let (max_z, peak_idx) = z.iter().enumerate()
        .fold((0.0_f64, 0), |(max, mi), (i, &v)| if v > max { (v, i) } else { (max, mi) });
    let peak_freq = r.frequencies_hz[peak_idx];

    eprintln!("Open baffle Z peak: {:.1} Ω at {:.1} Hz (Fs=37 Hz)", max_z, peak_freq);
    assert!((peak_freq - 37.0).abs() < 5.0,
        "Z peak at {:.1} Hz should be near Fs=37 Hz", peak_freq);
}
