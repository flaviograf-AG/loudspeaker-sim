use approx::assert_relative_eq;
use loudspeaker_solver::driver::derive_driver;
use loudspeaker_solver::sealed::*;
use loudspeaker_solver::types::{DriverParams, SealedBoxParams};

fn test_driver() -> DriverParams {
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

#[test]
fn sealed_system_resonance() {
    let driver = derive_driver(&test_driver());
    let enclosure = SealedBoxParams {
        volume_m3: 18.0e-3, // Vb = Vas → α = 1 → Fc = Fs × √2
        ql: 7.0,
    };
    let params = sealed_system_params(&driver, &enclosure);

    // When Vb = Vas, compliance ratio α = Vas/Vb = 1
    // Fc = Fs × √(1 + α) = 37 × √2 ≈ 52.33
    let expected_fc = 37.0 * 2.0_f64.sqrt();
    assert_relative_eq!(params.fc_hz, expected_fc, epsilon = 0.1);
}

#[test]
fn sealed_system_qtc() {
    let driver = derive_driver(&test_driver());
    let enclosure = SealedBoxParams {
        volume_m3: 18.0e-3,
        ql: 7.0,
    };
    let params = sealed_system_params(&driver, &enclosure);

    // Qtc = 1 / (1/Qtc_lossless + 1/Ql)
    // where Qtc_lossless = Qts × √(1 + α)
    // Reference: Small (1972), Eq. 12-13
    let qts = (0.42 * 3.5) / (0.42 + 3.5);
    let qtc_lossless = qts * 2.0_f64.sqrt();
    let expected_qtc = 1.0 / (1.0 / qtc_lossless + 1.0 / 7.0);
    assert_relative_eq!(params.qtc, expected_qtc, epsilon = 0.01);
}

#[test]
fn sealed_spl_is_flat_above_resonance() {
    let driver = derive_driver(&test_driver());
    let enclosure = SealedBoxParams {
        volume_m3: 18.0e-3,
        ql: 7.0,
    };

    // SPL at 200Hz and 400Hz should be nearly identical (flat passband)
    // Using lower freqs to avoid Le rolloff at high frequencies
    let result = sealed_frequency_response(&driver, &enclosure, &[200.0, 400.0], 2.83);
    let diff = (result.spl_db[0] - result.spl_db[1]).abs();
    assert!(diff < 0.5, "Passband should be flat, got {} dB difference", diff);
}

#[test]
fn sealed_spl_rolls_off_below_resonance() {
    let driver = derive_driver(&test_driver());
    let enclosure = SealedBoxParams {
        volume_m3: 18.0e-3,
        ql: 7.0,
    };

    // Well below Fc, sealed box rolls off at -12 dB/octave
    // Check SPL at 10 Hz vs 20 Hz (one octave apart, both well below Fc ≈ 52 Hz)
    let result = sealed_frequency_response(&driver, &enclosure, &[10.0, 20.0], 2.83);
    let rolloff = result.spl_db[1] - result.spl_db[0]; // should be ~12 dB
    assert!(rolloff > 10.0 && rolloff < 14.0,
        "Expected ~12 dB/octave rolloff, got {} dB", rolloff);
}

#[test]
fn sealed_impedance_peak_at_fc() {
    let driver = derive_driver(&test_driver());
    let enclosure = SealedBoxParams {
        volume_m3: 18.0e-3,
        ql: 7.0,
    };

    // Sweep around Fc, impedance should peak there
    let freqs: Vec<f64> = (20..=100).map(|f| f as f64).collect();
    let result = sealed_frequency_response(&driver, &enclosure, &freqs, 2.83);

    let max_idx = result.impedance_ohm.iter()
        .enumerate()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
        .unwrap().0;

    let peak_freq = freqs[max_idx];
    let expected_fc = 37.0 * 2.0_f64.sqrt();
    assert!((peak_freq - expected_fc).abs() < 5.0,
        "Impedance peak at {} Hz, expected ~{:.0} Hz", peak_freq, expected_fc);
}
