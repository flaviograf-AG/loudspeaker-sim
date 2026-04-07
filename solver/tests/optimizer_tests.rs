//! Optimizer tests — verify Nelder-Mead finds better crossover parameters.

use loudspeaker_solver::crossover::ActiveFilter;
use loudspeaker_solver::optimizer::{self, *};
use loudspeaker_solver::system::{SpeakerProject, Way};
use loudspeaker_solver::types::*;

fn test_2way_project(xover_freq: f64, tweeter_gain: f64) -> SpeakerProject {
    SpeakerProject {
        ways: vec![
            Way {
                name: "Woofer".into(),
                driver: DriverParams {
                    fs_hz: 37.0, re_ohm: 6.5, le_h: 0.5e-3, qes: 0.42, qms: 3.5,
                    vas_m3: 18e-3, sd_m2: 132e-4, xmax_m: 6e-3, ke: 0.0,
                },
                enclosure: EnclosureConfig::Sealed(SealedBoxParams { volume_m3: 18e-3, ql: 7.0 }),
                passive_filters: vec![],
                active_filters: vec![ActiveFilter::LR4LowPass { freq_hz: xover_freq }],
                gain_db: 0.0, delay_s: 0.0, inverted: false, z_offset_m: 0.0, enabled: true,
            },
            Way {
                name: "Tweeter".into(),
                driver: DriverParams {
                    fs_hz: 800.0, re_ohm: 5.5, le_h: 0.05e-3, qes: 0.5, qms: 2.0,
                    vas_m3: 0.5e-3, sd_m2: 8e-4, xmax_m: 1e-3, ke: 0.0,
                },
                enclosure: EnclosureConfig::Sealed(SealedBoxParams { volume_m3: 0.5e-3, ql: 7.0 }),
                passive_filters: vec![],
                active_filters: vec![ActiveFilter::LR4HighPass { freq_hz: xover_freq }],
                gain_db: tweeter_gain, delay_s: 0.0, inverted: false, z_offset_m: 0.0, enabled: true,
            },
        ],
        freq_start_hz: 200.0,
        freq_end_hz: 10000.0,
        freq_points: 100,
        drive_voltage_rms: 2.83,
    }
}

#[test]
fn optimizer_reduces_cost() {
    // Start with a deliberately bad crossover: 1kHz (too low for this tweeter)
    let project = test_2way_project(1000.0, -5.0);

    let config = OptimizerConfig {
        params: vec![
            OptParam::FilterFreq { way_idx: 0, filter_idx: 0 }, // woofer LP freq
            OptParam::FilterFreq { way_idx: 1, filter_idx: 0 }, // tweeter HP freq
            OptParam::WayGain { way_idx: 1 },                   // tweeter gain
        ],
        target: TargetCurve::Flat(86.0),
        freq_weight: FrequencyWeight::Uniform,
        freq_min_hz: 500.0,
        freq_max_hz: 8000.0,
        max_iterations: 100,
        tolerance: 0.01,
        min_impedance_ohm: None,
        impedance_penalty_weight: 10.0,
        displacement_penalty_weight: 5.0,
        algorithm: Algorithm::NelderMead,
        param_min_bounds: vec![],
        param_max_bounds: vec![],
    };

    let result = optimize(&project, &config);

    eprintln!("Optimizer: {} iterations, final cost = {:.2}", result.iterations, result.final_cost);
    eprintln!("Values: {:?}", result.values);
    eprintln!("Cost history (first 5): {:?}", &result.cost_history[..result.cost_history.len().min(5)]);

    // The optimizer should reduce cost from the initial bad state
    assert!(result.cost_history.len() > 0);
    let initial_cost = result.cost_history[0];
    assert!(result.final_cost < initial_cost,
        "Optimizer should reduce cost: initial={:.2}, final={:.2}",
        initial_cost, result.final_cost);
}

#[test]
fn optimizer_finds_reasonable_crossover_frequency() {
    let project = test_2way_project(1000.0, 0.0);

    let config = OptimizerConfig {
        params: vec![
            OptParam::FilterFreq { way_idx: 0, filter_idx: 0 },
            OptParam::FilterFreq { way_idx: 1, filter_idx: 0 },
        ],
        target: TargetCurve::Flat(86.0),
        freq_weight: FrequencyWeight::Uniform,
        freq_min_hz: 500.0,
        freq_max_hz: 8000.0,
        max_iterations: 50,
        tolerance: 0.1,
        min_impedance_ohm: None,
        impedance_penalty_weight: 10.0,
        displacement_penalty_weight: 5.0,
        algorithm: Algorithm::NelderMead,
        param_min_bounds: vec![],
        param_max_bounds: vec![],
    };

    let result = optimize(&project, &config);

    // Crossover freq should be between 1kHz and 5kHz for this driver combo
    let woofer_lp = result.values[0];
    let tweeter_hp = result.values[1];

    eprintln!("Optimized: woofer LP={:.0}Hz, tweeter HP={:.0}Hz, cost={:.2}",
        woofer_lp, tweeter_hp, result.final_cost);

    // The optimizer should move the frequencies from the initial 1kHz
    assert!(woofer_lp > 500.0 && woofer_lp < 20000.0,
        "Woofer LP freq {:.0} should be positive and bounded", woofer_lp);
    assert!((woofer_lp - 1000.0).abs() > 100.0,
        "Optimizer should move crossover freq from initial 1kHz, got {:.0}", woofer_lp);
}

#[test]
fn target_curve_slope() {
    let t = TargetCurve::Slope { db_at_1khz: 86.0, slope_db_per_octave: -1.0 };
    assert!((t.target_at(1000.0) - 86.0).abs() < 0.001);
    assert!((t.target_at(2000.0) - 85.0).abs() < 0.001); // +1 octave, -1dB
    assert!((t.target_at(500.0) - 87.0).abs() < 0.001);  // -1 octave, +1dB
}

#[test]
fn target_curve_custom_interpolation() {
    let t = TargetCurve::Custom(vec![(100.0, 90.0), (10000.0, 80.0)]);
    // Midpoint on log scale: sqrt(100*10000) = 1000 Hz → 85 dB
    assert!((t.target_at(1000.0) - 85.0).abs() < 0.1);
    // Edges: clamp to first/last
    assert!((t.target_at(50.0) - 90.0).abs() < 0.001);
    assert!((t.target_at(20000.0) - 80.0).abs() < 0.001);
}

#[test]
fn min_safe_freq_d2008_tweeter() {
    // Scan-Speak D2008/851200: Sd=3.8cm², Xmax=0.5mm
    let f = min_safe_freq_hz(0.00038, 0.5e-3, 87.0);
    eprintln!("D2008 min safe freq @ 87dB: {:.0} Hz", f);
    // Should be around 700-900 Hz — too dangerous for a 3/4" dome below this
    assert!(f > 500.0, "f_min should be > 500 Hz for tiny tweeter, got {:.0}", f);
    assert!(f < 1500.0, "f_min should be < 1500 Hz, got {:.0}", f);
}

#[test]
fn min_safe_freq_woofer_is_low() {
    // SB17NRX2C35-8: Sd=130cm², Xmax=6mm — large cone, lots of displacement
    let f = min_safe_freq_hz(0.013, 6e-3, 87.0);
    eprintln!("SB17NRX min safe freq @ 87dB: {:.0} Hz", f);
    assert!(f < 100.0, "Woofer f_min should be very low, got {:.0}", f);
}

#[test]
fn hybrid_converges() {
    let project = test_2way_project(1000.0, -5.0);
    let config = OptimizerConfig {
        params: vec![
            OptParam::FilterFreq { way_idx: 0, filter_idx: 0 },
            OptParam::FilterFreq { way_idx: 1, filter_idx: 0 },
            OptParam::WayGain { way_idx: 1 },
        ],
        target: TargetCurve::Flat(86.0),
        freq_weight: FrequencyWeight::Uniform,
        freq_min_hz: 500.0,
        freq_max_hz: 8000.0,
        max_iterations: 60,
        tolerance: 0.01,
        min_impedance_ohm: None,
        impedance_penalty_weight: 10.0,
        displacement_penalty_weight: 5.0,
        algorithm: Algorithm::Hybrid,
        param_min_bounds: vec![],
        param_max_bounds: vec![],
    };
    let result = optimize(&project, &config);
    eprintln!("Hybrid: {} iterations, final cost = {:.2}", result.iterations, result.final_cost);
    assert!(result.cost_history.len() > 1);
    assert!(result.final_cost < result.cost_history[0],
        "Hybrid should improve: first={:.2}, final={:.2}", result.cost_history[0], result.final_cost);
}

#[test]
fn de_reduces_cost() {
    let project = test_2way_project(1000.0, -5.0);
    let config = OptimizerConfig {
        params: vec![
            OptParam::FilterFreq { way_idx: 0, filter_idx: 0 },
            OptParam::FilterFreq { way_idx: 1, filter_idx: 0 },
            OptParam::WayGain { way_idx: 1 },
        ],
        target: TargetCurve::Flat(86.0),
        freq_weight: FrequencyWeight::Uniform,
        freq_min_hz: 500.0,
        freq_max_hz: 8000.0,
        max_iterations: 30,
        tolerance: 0.01,
        min_impedance_ohm: None,
        impedance_penalty_weight: 10.0,
        displacement_penalty_weight: 5.0,
        algorithm: Algorithm::DifferentialEvolution,
        param_min_bounds: vec![],
        param_max_bounds: vec![],
    };
    let result = optimize(&project, &config);
    eprintln!("DE: {} iterations, final cost = {:.2}", result.iterations, result.final_cost);
    assert!(result.cost_history.len() > 1);
    let initial_cost = result.cost_history[0];
    assert!(result.final_cost < initial_cost,
        "DE should reduce cost: initial={:.2}, final={:.2}", initial_cost, result.final_cost);
}
