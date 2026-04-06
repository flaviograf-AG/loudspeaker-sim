use approx::assert_relative_eq;
use loudspeaker_solver::sweep::*;

#[test]
fn log_spacing_endpoints() {
    let freqs = log_frequency_sweep(20.0, 20000.0, 100);
    assert_eq!(freqs.len(), 100);
    assert_relative_eq!(freqs[0], 20.0, epsilon = 1e-10);
    assert_relative_eq!(freqs[99], 20000.0, epsilon = 1e-6);
}

#[test]
fn log_spacing_is_geometric() {
    let freqs = log_frequency_sweep(10.0, 10000.0, 4);
    // 10, 100, 1000, 10000 — ratio of 10 between each
    assert_relative_eq!(freqs[1] / freqs[0], freqs[2] / freqs[1], epsilon = 1e-10);
}

#[test]
fn spl_from_pressure_reference() {
    // 1 Pa = 94 dB SPL
    let spl = pressure_to_spl_db(1.0);
    assert_relative_eq!(spl, 93.979, epsilon = 0.01);
}

#[test]
fn spl_at_reference_is_zero() {
    let spl = pressure_to_spl_db(20e-6);
    assert_relative_eq!(spl, 0.0, epsilon = 0.01);
}
