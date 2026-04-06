//! Alignment calculator tests.
//!
//! Verify that alignment presets produce physically reasonable enclosure
//! parameters for known driver T/S values.

use loudspeaker_solver::alignments::*;

// Reference driver: Generic 6.5" woofer
// Fs=37, Qes=0.42, Qms=3.5 → Qts=0.375, Vas=18L
const FS: f64 = 37.0;
const QTS: f64 = 0.375;
const VAS: f64 = 18.0e-3;

#[test]
fn sealed_butterworth_produces_valid_volume() {
    let results = sealed_alignments(FS, QTS, VAS);
    let bw = results.iter().find(|r| r.name.contains("Butterworth")).unwrap();

    eprintln!("Sealed BW: Vb={:.1}L, Fc={:.1}Hz, Qtc={:.3}",
        bw.volume_m3 * 1000.0, bw.fc_hz, bw.qtc);

    assert!(bw.volume_m3 > 0.001, "Volume should be positive");
    assert!(bw.volume_m3 < 0.5, "Volume should be reasonable (<500L)");
    assert!((bw.qtc - 0.707).abs() < 0.01, "Qtc should be 0.707 for Butterworth");
    assert!(bw.fc_hz > FS, "Fc should be above Fs for sealed");
}

#[test]
fn sealed_bessel_has_lower_qtc() {
    let results = sealed_alignments(FS, QTS, VAS);
    let be = results.iter().find(|r| r.name.contains("Bessel")).unwrap();
    let bw = results.iter().find(|r| r.name.contains("Butterworth")).unwrap();

    eprintln!("Sealed Bessel: Vb={:.1}L, Qtc={:.3}", be.volume_m3 * 1000.0, be.qtc);

    assert!(be.qtc < bw.qtc, "Bessel Qtc ({:.3}) should be lower than BW ({:.3})",
        be.qtc, bw.qtc);
    // Lower Qtc requires MORE damping → LARGER box (more compliance to lower the Q)
    assert!(be.volume_m3 > bw.volume_m3, "Bessel needs larger box than BW for lower Qtc");
}

#[test]
fn vented_b4_uses_vas_volume() {
    let results = vented_alignments(FS, QTS, VAS);
    let b4 = results.iter().find(|r| r.name.contains("B4")).unwrap();

    eprintln!("Vented B4: Vb={:.1}L, Fb={:.1}Hz", b4.volume_m3 * 1000.0, b4.fb_hz.unwrap());

    assert!((b4.volume_m3 - VAS).abs() / VAS < 0.01, "B4 Vb should ≈ Vas");
    assert!((b4.fb_hz.unwrap() - FS).abs() / FS < 0.01, "B4 Fb should ≈ Fs");
}

#[test]
fn vented_alignments_have_positive_volumes() {
    let results = vented_alignments(FS, QTS, VAS);

    for r in &results {
        eprintln!("{}: Vb={:.1}L, Fb={:.1}Hz, f3={:.1}Hz",
            r.name, r.volume_m3 * 1000.0, r.fb_hz.unwrap(), r.f3_hz);
        assert!(r.volume_m3 > 0.0, "{} should have positive volume", r.name);
        assert!(r.fb_hz.unwrap() > 0.0, "{} should have positive Fb", r.name);
        assert!(r.f3_hz > 0.0, "{} should have positive f3", r.name);
    }
}

#[test]
fn port_length_is_reasonable() {
    // For a vented box: 25L, port area 20cm², target Fb = 35Hz
    let length = port_length_for_fb(35.0, 25.0e-3, 20.0e-4, true);

    eprintln!("Port length for Fb=35Hz, Vb=25L, Sp=20cm²: {:.1}cm", length * 100.0);

    assert!(length > 0.01, "Port length should be positive");
    assert!(length < 1.0, "Port length should be <1m for this config");
}

#[test]
fn sealed_alignment_then_simulate_matches_target_qtc() {
    // Get the BW alignment, then simulate to verify Qtc is achieved
    let results = sealed_alignments(FS, QTS, VAS);
    let bw = results.iter().find(|r| r.name.contains("Butterworth")).unwrap();

    // Use the alignment's Vb in a simulation
    let input = loudspeaker_solver::types::SimulationInput {
        driver: loudspeaker_solver::types::DriverParams {
            fs_hz: FS, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5,
            vas_m3: VAS, sd_m2: 132.0e-4, xmax_m: 6.0e-3,
        },
        enclosure: loudspeaker_solver::types::EnclosureConfig::Sealed(
            loudspeaker_solver::types::SealedBoxParams {
                volume_m3: bw.volume_m3,
                ql: 7.0,
            }
        ),
        freq_start_hz: 10.0, freq_end_hz: 500.0, freq_points: 1000,
        drive_voltage_rms: 2.83,
    };
    let result = loudspeaker_solver::solve_simulation(&input).unwrap();

    // Find the impedance peak → that's Fc
    let (_, peak_idx) = result.impedance_ohm.iter().enumerate()
        .filter(|(i, _)| result.frequencies_hz[*i] > 20.0 && result.frequencies_hz[*i] < 200.0)
        .fold((0.0_f64, 0), |(max, mi), (i, &z)| if z > max { (z, i) } else { (max, mi) });
    let sim_fc = result.frequencies_hz[peak_idx];

    eprintln!("Alignment Fc={:.1}Hz, Simulated peak at {:.1}Hz", bw.fc_hz, sim_fc);

    // Simulated Fc should be close to the alignment's predicted Fc
    assert!((sim_fc - bw.fc_hz).abs() / bw.fc_hz < 0.05,
        "Simulated Fc ({:.1}) should match alignment Fc ({:.1})", sim_fc, bw.fc_hz);
}
