use loudspeaker_solver::driver::derive_driver;
use loudspeaker_solver::transmission_line::*;
use loudspeaker_solver::types::{DriverParams, TransmissionLineParams};

fn test_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0,
        re_ohm: 6.5,
        le_h: 0.5e-3,
        qes: 0.42,
        qms: 3.5,
        vas_m3: 18.0e-3,
        sd_m2: 132.0e-4,
        xmax_m: 6.0e-3,
    }
}

fn quarter_wave_tl() -> TransmissionLineParams {
    // Quarter wave at ~37 Hz: λ/4 = c/(4×f) = 343/(4×37) ≈ 2.32 m
    TransmissionLineParams {
        length_m: 2.32,
        area_driver_m2: 132.0e-4,
        area_mouth_m2: 132.0e-4,
        num_segments: 20,
        stuffing_density_kg_m3: 0.0,
        flow_resistivity_pa_s_m2: 0.0,
        open_end: true,
    }
}

#[test]
fn tl_quarter_wave_dip_near_fs() {
    let driver = derive_driver(&test_driver());
    let tl = quarter_wave_tl();

    let freqs: Vec<f64> = (25..=50).map(|f| f as f64).collect();
    let result = tl_frequency_response(&driver, &tl, &freqs, 2.83);

    // Impedance should have a minimum near the quarter-wave frequency
    let min_idx = result.impedance_ohm.iter()
        .enumerate()
        .min_by(|a, b| a.1.partial_cmp(b.1).unwrap())
        .unwrap().0;

    let dip_freq = freqs[min_idx];
    assert!((dip_freq - 37.0).abs() < 5.0,
        "Impedance dip at {} Hz, expected near 37 Hz", dip_freq);
}

#[test]
fn tl_with_stuffing_damps_resonances() {
    let driver = derive_driver(&test_driver());
    let mut tl = quarter_wave_tl();

    // Without stuffing
    let freqs: Vec<f64> = (20..=200).map(|f| f as f64).collect();
    let result_bare = tl_frequency_response(&driver, &tl, &freqs, 2.83);

    // With stuffing
    tl.stuffing_density_kg_m3 = 10.0;
    tl.flow_resistivity_pa_s_m2 = 5000.0;
    let result_stuffed = tl_frequency_response(&driver, &tl, &freqs, 2.83);

    // Stuffing should reduce impedance variation (flatter curve)
    let bare_min = result_bare.impedance_ohm.iter().cloned().fold(f64::INFINITY, f64::min);
    let bare_max = result_bare.impedance_ohm.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let stuffed_min = result_stuffed.impedance_ohm.iter().cloned().fold(f64::INFINITY, f64::min);
    let stuffed_max = result_stuffed.impedance_ohm.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    let bare_span = bare_max - bare_min;
    let stuffed_span = stuffed_max - stuffed_min;

    assert!(stuffed_span < bare_span,
        "Stuffing should reduce impedance variation: bare={:.1}, stuffed={:.1}",
        bare_span, stuffed_span);
}

#[test]
fn tapered_tl_produces_finite_values() {
    let driver = derive_driver(&test_driver());
    let mut tl = quarter_wave_tl();
    tl.area_mouth_m2 = 300.0e-4; // wider mouth

    let freqs: Vec<f64> = (20..=60).map(|f| f as f64).collect();
    let result = tl_frequency_response(&driver, &tl, &freqs, 2.83);

    assert!(result.spl_db.iter().all(|v| v.is_finite()),
        "Tapered TL produced non-finite SPL values");
    assert!(result.impedance_ohm.iter().all(|v| v.is_finite()),
        "Tapered TL produced non-finite impedance values");
}
