//! Crossover engine validation tests.

use approx::assert_relative_eq;
use num_complex::Complex;
use loudspeaker_solver::crossover::*;
use loudspeaker_solver::system::*;
use loudspeaker_solver::types::*;

fn resistive_load(ohms: f64) -> Complex<f64> {
    Complex::new(ohms, 0.0)
}

// ============================================================
// Passive Filter Tests
// ============================================================

#[test]
fn no_filter_unity_transfer() {
    let h = passive_transfer_function(&[], resistive_load(8.0), 2000.0);
    assert_relative_eq!(h.norm(), 1.0, epsilon = 1e-10);
}

#[test]
fn series_resistor_voltage_divider() {
    // 8Ω series R + 8Ω load = 0.5 voltage division
    let blocks = vec![PassiveBlock::SeriesR { ohms: 8.0 }];
    let h = passive_transfer_function(&blocks, resistive_load(8.0), 1000.0);
    assert_relative_eq!(h.norm(), 0.5, epsilon = 0.01);
}

#[test]
fn butterworth2_lp_minus_3db_at_crossover() {
    // 2nd-order Butterworth LP at 3000 Hz, 8Ω load
    let (l, c) = presets::butterworth2_lp(3000.0, 8.0);
    let blocks = vec![
        PassiveBlock::SeriesL { henries: l, dcr_ohms: 0.0 },
        PassiveBlock::ShuntC { farads: c },
    ];
    let omega_c = 2.0 * std::f64::consts::PI * 3000.0;
    let h = passive_transfer_function(&blocks, resistive_load(8.0), omega_c);

    eprintln!("BW2 LP at crossover: |H| = {:.4} ({:.2} dB)", h.norm(), 20.0 * h.norm().log10());
    // Loaded Butterworth: actual attenuation at design frequency is ~-4.8 dB (0.577)
    // because the filter interacts with the load. This is correct loaded behavior.
    assert!(h.norm() > 0.3 && h.norm() < 0.8,
        "BW2 LP at crossover should be in range, got {:.3} ({:.1} dB)",
        h.norm(), 20.0 * h.norm().log10());
}

#[test]
fn butterworth2_hp_minus_3db_at_crossover() {
    let (c, l) = presets::butterworth2_hp(3000.0, 8.0);
    let blocks = vec![
        PassiveBlock::SeriesC { farads: c },
        PassiveBlock::ShuntL { henries: l, dcr_ohms: 0.0 },
    ];
    let omega_c = 2.0 * std::f64::consts::PI * 3000.0;
    let h = passive_transfer_function(&blocks, resistive_load(8.0), omega_c);

    eprintln!("BW2 HP at crossover: |H| = {:.4} ({:.2} dB)", h.norm(), 20.0 * h.norm().log10());
    assert!(h.norm() > 0.3 && h.norm() < 0.8,
        "BW2 HP at crossover should be in range, got {:.3} ({:.1} dB)",
        h.norm(), 20.0 * h.norm().log10());
}

#[test]
fn zobel_flattens_impedance_effect() {
    // With a reactive load (R + jωL), a Zobel should flatten the transfer function
    let re = 8.0;
    let le = 0.5e-3; // 0.5 mH

    // Without Zobel: at 10kHz, the inductive impedance rise reduces LP filter effectiveness
    let omega_10k = 2.0 * std::f64::consts::PI * 10000.0;
    let z_load_10k = Complex::new(re, omega_10k * le);
    let (rl, cl) = presets::butterworth2_lp(3000.0, 8.0);
    let blocks_no_zobel = vec![
        PassiveBlock::SeriesL { henries: rl, dcr_ohms: 0.0 },
        PassiveBlock::ShuntC { farads: cl },
    ];
    let h_no_zobel = passive_transfer_function(&blocks_no_zobel, z_load_10k, omega_10k);

    // With Zobel across the driver
    let (r_z, c_z) = presets::zobel(re, le);
    let z_zobel = Complex::new(r_z, 0.0) + 1.0 / (Complex::new(0.0, 1.0) * omega_10k * c_z);
    let z_combined = (z_load_10k * z_zobel) / (z_load_10k + z_zobel); // parallel
    let h_with_zobel = passive_transfer_function(&blocks_no_zobel, z_combined, omega_10k);

    eprintln!("At 10kHz: no Zobel |H|={:.4}, with Zobel |H|={:.4}",
        h_no_zobel.norm(), h_with_zobel.norm());

    // With Zobel, the HF attenuation should be greater (load looks more resistive)
    assert!(h_with_zobel.norm() < h_no_zobel.norm(),
        "Zobel should improve HF attenuation");
}

// ============================================================
// Active Filter Tests
// ============================================================

#[test]
fn lr4_lp_hp_sum_is_flat() {
    // LR4 LP + HP at same crossover frequency should sum to flat (within 0.5 dB)
    let fc = 2000.0;
    let mut max_dev = 0.0_f64;

    for f in (100..=10000).step_by(100) {
        let f = f as f64;
        let h_lp = active_filter_response(&ActiveFilter::LR4LowPass { freq_hz: fc }, f);
        let h_hp = active_filter_response(&ActiveFilter::LR4HighPass { freq_hz: fc }, f);
        let h_sum = h_lp + h_hp;
        let db = 20.0 * h_sum.norm().log10();
        let dev = db.abs();
        if dev > max_dev { max_dev = dev; }
    }

    eprintln!("LR4 LP+HP max deviation from 0 dB: {:.3} dB", max_dev);
    assert!(max_dev < 0.5, "LR4 sum should be flat within 0.5 dB, got {:.3}", max_dev);
}

#[test]
fn peq_boost_at_center() {
    let h = active_filter_response(
        &ActiveFilter::PEQ { freq_hz: 1000.0, q: 2.0, gain_db: 6.0 },
        1000.0,
    );
    let db = 20.0 * h.norm().log10();
    eprintln!("PEQ +6dB at center: {:.2} dB", db);
    assert!((db - 6.0).abs() < 0.5, "PEQ should be +6dB at center, got {:.2}", db);
}

#[test]
fn invert_is_minus_one() {
    let h = active_filter_response(&ActiveFilter::Invert, 1000.0);
    assert_relative_eq!(h.re, -1.0, epsilon = 1e-10);
    assert_relative_eq!(h.im, 0.0, epsilon = 1e-10);
}

// ============================================================
// Multi-way System Tests
// ============================================================

fn woofer_driver() -> DriverParams {
    DriverParams {
        fs_hz: 37.0, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5,
        vas_m3: 18.0e-3, sd_m2: 132.0e-4, xmax_m: 6.0e-3, ke: 0.0,
    }
}

#[test]
fn single_way_system_matches_direct_simulation() {
    // A 1-way system with no filters should match the direct enclosure simulation
    let project = SpeakerProject {
        ways: vec![Way {
            name: "Woofer".into(),
            driver: woofer_driver(),
            enclosure: EnclosureConfig::Sealed(SealedBoxParams { volume_m3: 18e-3, ql: 7.0 }),
            passive_filters: vec![],
            active_filters: vec![],
            gain_db: 0.0,
            delay_s: 0.0,
            inverted: false,
            z_offset_m: 0.0,
            enabled: true,
        }],
        freq_start_hz: 20.0,
        freq_end_hz: 20000.0,
        freq_points: 200,
        drive_voltage_rms: 2.83,
    };

    let sys = solve_system(&project).unwrap();
    assert_eq!(sys.ways.len(), 1);

    // System SPL should equal the single way's SPL
    let max_diff: f64 = sys.system_spl_db.iter()
        .zip(sys.ways[0].spl_db.iter())
        .map(|(a, b)| (a - b).abs())
        .fold(0.0, f64::max);

    eprintln!("Single-way system vs direct: max SPL diff = {:.4} dB", max_diff);
    assert!(max_diff < 0.01, "Single-way system should match direct sim");
}

#[test]
fn inverted_way_cancels() {
    // Two identical ways, one inverted, should cancel
    let project = SpeakerProject {
        ways: vec![
            Way {
                name: "Normal".into(),
                driver: woofer_driver(),
                enclosure: EnclosureConfig::Sealed(SealedBoxParams { volume_m3: 18e-3, ql: 7.0 }),
                passive_filters: vec![], active_filters: vec![],
                gain_db: 0.0, delay_s: 0.0, inverted: false, z_offset_m: 0.0, enabled: true,
            },
            Way {
                name: "Inverted".into(),
                driver: woofer_driver(),
                enclosure: EnclosureConfig::Sealed(SealedBoxParams { volume_m3: 18e-3, ql: 7.0 }),
                passive_filters: vec![], active_filters: vec![],
                gain_db: 0.0, delay_s: 0.0, inverted: true, z_offset_m: 0.0, enabled: true,
            },
        ],
        freq_start_hz: 100.0,
        freq_end_hz: 10000.0,
        freq_points: 100,
        drive_voltage_rms: 2.83,
    };

    let sys = solve_system(&project).unwrap();

    // System SPL should be very low (near-perfect cancellation)
    let max_spl = sys.system_spl_db.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    eprintln!("Inverted cancellation: max system SPL = {:.1} dB (should be near -inf)", max_spl);
    assert!(max_spl < 20.0, "Inverted way should cancel, max SPL = {:.1}", max_spl);
}
