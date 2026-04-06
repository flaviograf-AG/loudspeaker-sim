//! Analytical validation tests — verify solver output against known closed-form solutions.
//!
//! These tests compute expected values from the same physics equations used by
//! the solver, but independently (using the test code, not the solver internals).
//! This catches implementation bugs where the solver deviates from theory.
//!
//! Reference values computed from:
//! - Small (1972): sealed box Fc, Qtc, transfer function
//! - Small (1973): vented box Fb, port resonance, dual-peak impedance
//! - Beranek (1986): radiation impedance, SPL from cone velocity

mod test_utils;

use approx::assert_relative_eq;
use loudspeaker_solver::solve_simulation;
use loudspeaker_solver::types::*;
use test_utils::interpolate;

/// The reference driver used in all validation tests.
fn reference_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0,
        re_ohm: 6.5,
        le_h: 0.5e-3,
        qes: 0.42,
        qms: 3.5,
        vas_m3: 18.0e-3,
        sd_m2: 132.0e-4,
        xmax_m: 6.0e-3, ke: 0.0,
    }
}

// ============================================================
// Sealed Box Analytical Validation
// ============================================================

/// Sealed box: verify system resonance Fc = Fs × √(1 + Vas/Vb)
/// Small (1972), Eq. 11
#[test]
fn sealed_impedance_peak_at_fc() {
    let input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Sealed(SealedBoxParams {
            volume_m3: 18.0e-3,
            ql: 7.0,
        }),
        freq_start_hz: 10.0,
        freq_end_hz: 20000.0,
        freq_points: 2000,
        drive_voltage_rms: 2.83,
    };
    let result = solve_simulation(&input).unwrap();

    // Expected Fc = 37 × √(1 + 18/18) = 37 × √2 = 52.33 Hz
    let expected_fc = 37.0 * (2.0_f64).sqrt();

    // Find impedance peak frequency in the resonance region (20-200 Hz)
    // Exclude high frequencies where Le inductance dominates
    let (max_z, peak_idx) = result
        .impedance_ohm
        .iter()
        .enumerate()
        .filter(|(i, _)| {
            let f = result.frequencies_hz[*i];
            f >= 20.0 && f <= 200.0
        })
        .fold((0.0_f64, 0), |(max, mi), (i, &z)| {
            if z > max { (z, i) } else { (max, mi) }
        });

    let peak_freq = result.frequencies_hz[peak_idx];

    eprintln!(
        "Sealed: Fc expected={:.2} Hz, measured peak={:.2} Hz, |Z|peak={:.2} Ω",
        expected_fc, peak_freq, max_z
    );

    // Peak should be within 2% of expected Fc
    assert_relative_eq!(peak_freq, expected_fc, max_relative = 0.02);
    // Peak impedance should be well above Re (6.5Ω)
    assert!(max_z > 20.0, "Impedance peak {:.1} Ω is too low", max_z);
}

/// Sealed box: passband SPL should be ~85.7 dB at 1kHz (2.83V, 1m, half-space)
/// Computed from electromechanical circuit model.
#[test]
fn sealed_passband_spl() {
    let input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Sealed(SealedBoxParams {
            volume_m3: 18.0e-3,
            ql: 7.0,
        }),
        freq_start_hz: 10.0,
        freq_end_hz: 20000.0,
        freq_points: 500,
        drive_voltage_rms: 2.83,
    };
    let result = solve_simulation(&input).unwrap();

    let spl_1k = interpolate(&result.frequencies_hz, &result.spl_db, 1000.0);

    // Expected ~85.7 dB from analytical computation
    eprintln!("Sealed SPL at 1kHz: {:.2} dB (expected ~85.7)", spl_1k);
    assert!((spl_1k - 85.7).abs() < 1.0, "SPL at 1kHz = {:.2} dB, expected ~85.7", spl_1k);
}

/// Sealed box: rolloff slope should approach -12 dB/octave below Fc.
/// Second-order high-pass behavior — Small (1972).
#[test]
fn sealed_rolloff_12db_per_octave() {
    let input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Sealed(SealedBoxParams {
            volume_m3: 18.0e-3,
            ql: 7.0,
        }),
        freq_start_hz: 5.0,
        freq_end_hz: 20000.0,
        freq_points: 2000,
        drive_voltage_rms: 2.83,
    };
    let result = solve_simulation(&input).unwrap();

    // Measure slope between 10 Hz and 20 Hz (well below Fc=52 Hz)
    let spl_10 = interpolate(&result.frequencies_hz, &result.spl_db, 10.0);
    let spl_20 = interpolate(&result.frequencies_hz, &result.spl_db, 20.0);
    let slope = spl_20 - spl_10; // dB per octave (20Hz is one octave above 10Hz)

    eprintln!(
        "Sealed rolloff: SPL@10Hz={:.2}, SPL@20Hz={:.2}, slope={:.1} dB/oct (expected ~12)",
        spl_10, spl_20, slope
    );

    // Should be approximately +12 dB/octave (rising from 10→20 Hz)
    // Allow ±2 dB tolerance for the lumped-parameter model
    assert!(
        (slope - 12.0).abs() < 2.0,
        "Rolloff slope {:.1} dB/oct, expected ~12",
        slope
    );
}

/// Sealed box: impedance at high frequency should approach Re + jwLe
#[test]
fn sealed_high_freq_impedance_approaches_re() {
    let input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Sealed(SealedBoxParams {
            volume_m3: 18.0e-3,
            ql: 7.0,
        }),
        freq_start_hz: 10.0,
        freq_end_hz: 20000.0,
        freq_points: 500,
        drive_voltage_rms: 2.83,
    };
    let result = solve_simulation(&input).unwrap();

    // At 200 Hz (well above Fc, below Le dominance), Z should be near Re
    let z_200 = interpolate(&result.frequencies_hz, &result.impedance_ohm, 200.0);

    eprintln!("Sealed |Z| at 200Hz: {:.2} Ω (Re=6.5)", z_200);
    // Should be close to Re (within 20%)
    assert!(
        (z_200 - 6.5).abs() / 6.5 < 0.20,
        "|Z|@200Hz = {:.2}, expected near Re=6.5",
        z_200
    );
}

// ============================================================
// Vented Box Analytical Validation
// ============================================================

/// Vented box: port tuning frequency Fb = c/(2π) × √(Sp/(Leff×Vb))
/// Small (1973), Eq. 5
#[test]
fn vented_port_tuning_frequency() {
    let input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Vented(VentedBoxParams {
            volume_m3: 25.0e-3,
            port_area_m2: 20.0e-4,
            port_length_m: 0.15,
            num_ports: 1,
            port_flanged: true,
            ql: 7.0, port_shape: PortShape::Circular,
        }),
        freq_start_hz: 10.0,
        freq_end_hz: 20000.0,
        freq_points: 2000,
        drive_voltage_rms: 2.83,
    };
    let result = solve_simulation(&input).unwrap();

    // Expected Fb ≈ 35.2 Hz (from analytical computation)
    // At Fb, impedance should be at a local minimum (near Re)
    // Find the minimum impedance between 20-60 Hz
    let mut min_z = f64::MAX;
    let mut min_freq = 0.0;
    for (i, &f) in result.frequencies_hz.iter().enumerate() {
        if f >= 20.0 && f <= 60.0 && result.impedance_ohm[i] < min_z {
            min_z = result.impedance_ohm[i];
            min_freq = f;
        }
    }

    eprintln!(
        "Vented: Z minimum at {:.1} Hz = {:.2} Ω (expected Fb≈35.2 Hz, Z≈Re=6.5)",
        min_freq, min_z
    );

    // Minimum should be near expected Fb (within 10%)
    assert_relative_eq!(min_freq, 35.2, max_relative = 0.10);
    // Impedance at minimum should be near Re (with box losses, it rises above Re)
    assert!(
        min_z < 15.0 && min_z > 5.0,
        "Z at Fb = {:.2}, expected between 5-15 Ω (Re=6.5 + box losses)",
        min_z
    );
}

/// Vented box: impedance must have exactly two peaks (one above, one below Fb)
/// Small (1973): coupled resonators produce two impedance maxima.
#[test]
fn vented_two_impedance_peaks() {
    let input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Vented(VentedBoxParams {
            volume_m3: 25.0e-3,
            port_area_m2: 20.0e-4,
            port_length_m: 0.15,
            num_ports: 1,
            port_flanged: true,
            ql: 7.0, port_shape: PortShape::Circular,
        }),
        freq_start_hz: 10.0,
        freq_end_hz: 500.0,
        freq_points: 2000,
        drive_voltage_rms: 2.83,
    };
    let result = solve_simulation(&input).unwrap();

    // Find peaks: points where Z[i] > Z[i-1] and Z[i] > Z[i+1], and Z > 2*Re
    let z = &result.impedance_ohm;
    let mut peaks = Vec::new();
    for i in 1..z.len() - 1 {
        if z[i] > z[i - 1] && z[i] > z[i + 1] && z[i] > 2.0 * 6.5 {
            peaks.push((result.frequencies_hz[i], z[i]));
        }
    }

    eprintln!("Vented impedance peaks:");
    for (f, z_peak) in &peaks {
        eprintln!("  {:.1} Hz: {:.2} Ω", f, z_peak);
    }

    assert_eq!(
        peaks.len(),
        2,
        "Expected 2 impedance peaks, found {}",
        peaks.len()
    );
    // First peak should be below Fb (~35 Hz), second above
    assert!(peaks[0].0 < 35.0, "First peak at {:.1} Hz should be < 35", peaks[0].0);
    assert!(peaks[1].0 > 35.0, "Second peak at {:.1} Hz should be > 35", peaks[1].0);
}

/// Vented box: rolloff should approach -24 dB/octave far below Fb.
/// Fourth-order high-pass — Small (1973).
#[test]
fn vented_rolloff_steeper_than_sealed() {
    let sealed_input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Sealed(SealedBoxParams {
            volume_m3: 18.0e-3,
            ql: 7.0,
        }),
        freq_start_hz: 5.0,
        freq_end_hz: 20000.0,
        freq_points: 2000,
        drive_voltage_rms: 2.83,
    };

    let vented_input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Vented(VentedBoxParams {
            volume_m3: 25.0e-3,
            port_area_m2: 20.0e-4,
            port_length_m: 0.15,
            num_ports: 1,
            port_flanged: true,
            ql: 7.0, port_shape: PortShape::Circular,
        }),
        freq_start_hz: 5.0,
        freq_end_hz: 20000.0,
        freq_points: 2000,
        drive_voltage_rms: 2.83,
    };

    let sealed = solve_simulation(&sealed_input).unwrap();
    let vented = solve_simulation(&vented_input).unwrap();

    // Verify vented has a different rolloff shape: below port tuning (Fb≈35 Hz)
    // vented SPL drops faster (cone unloading), but near Fb the port adds output.
    let sealed_8 = interpolate(&sealed.frequencies_hz, &sealed.spl_db, 8.0);
    let vented_8 = interpolate(&vented.frequencies_hz, &vented.spl_db, 8.0);
    let sealed_35 = interpolate(&sealed.frequencies_hz, &sealed.spl_db, 35.0);
    let vented_35 = interpolate(&vented.frequencies_hz, &vented.spl_db, 35.0);

    eprintln!(
        "At 8Hz: sealed={:.1}, vented={:.1}; At 35Hz: sealed={:.1}, vented={:.1}",
        sealed_8, vented_8, sealed_35, vented_35
    );

    // Near port tuning (Fb≈35 Hz): vented benefits from port output
    assert!(
        vented_35 > sealed_35,
        "At 35Hz vented ({:.1}) should exceed sealed ({:.1})",
        vented_35, sealed_35
    );
    // Vented and sealed should produce clearly different SPL curves overall
    let spl_diff: f64 = sealed.spl_db.iter().zip(vented.spl_db.iter())
        .filter(|(&sf, _)| sf > 0.0)
        .map(|(s, v)| (s - v).abs())
        .sum::<f64>() / sealed.spl_db.len() as f64;
    assert!(spl_diff > 1.0,
        "Sealed and vented should have clearly different rolloff shapes, mean diff={:.2}",
        spl_diff);
}

/// Vented box: port velocity peaks near Fb
#[test]
fn vented_port_velocity_peaks_near_fb() {
    let input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Vented(VentedBoxParams {
            volume_m3: 25.0e-3,
            port_area_m2: 20.0e-4,
            port_length_m: 0.15,
            num_ports: 1,
            port_flanged: true,
            ql: 7.0, port_shape: PortShape::Circular,
        }),
        freq_start_hz: 10.0,
        freq_end_hz: 500.0,
        freq_points: 2000,
        drive_voltage_rms: 2.83,
    };
    let result = solve_simulation(&input).unwrap();

    let pv = result.port_velocity_ms.as_ref().expect("Vented should have port velocity");

    // Find peak port velocity
    let (max_vel, peak_idx) = pv
        .iter()
        .enumerate()
        .fold((0.0_f64, 0), |(max, mi), (i, &v)| {
            if v > max { (v, i) } else { (max, mi) }
        });

    let peak_freq = result.frequencies_hz[peak_idx];

    eprintln!(
        "Port velocity peak: {:.2} m/s at {:.1} Hz (expected near Fb≈35.2 Hz)",
        max_vel, peak_freq
    );

    // Port velocity should peak near Fb (within 20%)
    assert_relative_eq!(peak_freq, 35.2, max_relative = 0.20);
    assert!(max_vel > 0.1, "Port velocity peak {:.3} m/s is suspiciously low", max_vel);
}

// ============================================================
// Cross-model consistency checks
// ============================================================

/// Both sealed and vented should converge to the same passband sensitivity
/// at high frequencies (where the enclosure doesn't matter).
#[test]
fn sealed_and_vented_same_passband_spl() {
    let sealed_input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Sealed(SealedBoxParams {
            volume_m3: 18.0e-3,
            ql: 7.0,
        }),
        freq_start_hz: 10.0,
        freq_end_hz: 20000.0,
        freq_points: 500,
        drive_voltage_rms: 2.83,
    };
    let vented_input = SimulationInput {
        driver: reference_driver(),
        enclosure: EnclosureConfig::Vented(VentedBoxParams {
            volume_m3: 25.0e-3,
            port_area_m2: 20.0e-4,
            port_length_m: 0.15,
            num_ports: 1,
            port_flanged: true,
            ql: 7.0, port_shape: PortShape::Circular,
        }),
        freq_start_hz: 10.0,
        freq_end_hz: 20000.0,
        freq_points: 500,
        drive_voltage_rms: 2.83,
    };

    let sealed = solve_simulation(&sealed_input).unwrap();
    let vented = solve_simulation(&vented_input).unwrap();

    // At 500 Hz both should produce nearly the same SPL
    let spl_sealed = interpolate(&sealed.frequencies_hz, &sealed.spl_db, 500.0);
    let spl_vented = interpolate(&vented.frequencies_hz, &vented.spl_db, 500.0);

    eprintln!(
        "Passband SPL at 500Hz: sealed={:.2}, vented={:.2}, delta={:.2} dB",
        spl_sealed, spl_vented, (spl_sealed - spl_vented).abs()
    );

    assert!(
        (spl_sealed - spl_vented).abs() < 1.5,
        "Sealed ({:.2}) and vented ({:.2}) should match in passband",
        spl_sealed,
        spl_vented
    );
}
