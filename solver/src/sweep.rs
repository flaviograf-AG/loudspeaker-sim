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

/// Compute group delay from a vector of phase values (radians) and frequencies (Hz).
///
/// Group delay = -dφ/dω = -dφ/(2π×df)
/// Uses central differences for interior points, forward/backward at endpoints.
/// Handles phase wrapping by differentiating unwrapped phase.
pub fn compute_group_delay_ms(frequencies_hz: &[f64], phases_rad: &[f64]) -> Vec<f64> {
    let n = frequencies_hz.len();
    if n < 2 {
        return vec![0.0; n];
    }

    let mut gd = Vec::with_capacity(n);
    let twopi = 2.0 * std::f64::consts::PI;

    for i in 0..n {
        let (df, dphi) = if i == 0 {
            let df = frequencies_hz[1] - frequencies_hz[0];
            let mut dp = phases_rad[1] - phases_rad[0];
            while dp > std::f64::consts::PI { dp -= twopi; }
            while dp < -std::f64::consts::PI { dp += twopi; }
            (df, dp)
        } else if i == n - 1 {
            let df = frequencies_hz[n - 1] - frequencies_hz[n - 2];
            let mut dp = phases_rad[n - 1] - phases_rad[n - 2];
            while dp > std::f64::consts::PI { dp -= twopi; }
            while dp < -std::f64::consts::PI { dp += twopi; }
            (df, dp)
        } else {
            let df = frequencies_hz[i + 1] - frequencies_hz[i - 1];
            let mut dp = phases_rad[i + 1] - phases_rad[i - 1];
            while dp > std::f64::consts::PI { dp -= twopi; }
            while dp < -std::f64::consts::PI { dp += twopi; }
            (df, dp)
        };

        // τ_g = -dφ/dω = -dφ/(2π×df), convert to ms
        let gd_s = -dphi / (twopi * df);
        gd.push(gd_s * 1000.0);
    }

    gd
}
