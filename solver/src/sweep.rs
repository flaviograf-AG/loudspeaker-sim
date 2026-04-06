//! Frequency sweep generation and level conversion utilities.

use crate::constants::P_REF;

/// Generate a logarithmically-spaced frequency array.
///
/// N points from f_start to f_end (inclusive), equally spaced on a log scale.
/// This is the standard for acoustic frequency response plots.
pub fn log_frequency_sweep(f_start: f64, f_end: f64, n_points: usize) -> Vec<f64> {
    assert!(n_points >= 2, "Need at least 2 frequency points");
    assert!(f_start > 0.0 && f_end > f_start, "Invalid frequency range");

    let log_start = f_start.ln();
    let log_end = f_end.ln();
    let step = (log_end - log_start) / (n_points as f64 - 1.0);

    (0..n_points)
        .map(|i| (log_start + step * i as f64).exp())
        .collect()
}

/// Convert RMS pressure (Pa) to SPL in dB.
///
/// SPL = 20 × log₁₀(p / p_ref), where p_ref = 20 µPa
/// Reference: Beranek, "Acoustics" (1954), Ch. 1
pub fn pressure_to_spl_db(p_rms: f64) -> f64 {
    20.0 * (p_rms / P_REF).log10()
}
