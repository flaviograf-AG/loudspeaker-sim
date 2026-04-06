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

/// Compute impulse response from complex pressure via inverse DFT.
/// Returns time samples at the given sample rate.
/// The input is assumed to be single-sided (positive frequencies only).
pub fn impulse_response(
    frequencies_hz: &[f64],
    pressure_phases: &[f64],
    spl_db: &[f64],
    sample_rate: f64,
) -> (Vec<f64>, Vec<f64>) {
    let n_freq = frequencies_hz.len();
    let n_fft = 2 * n_freq; // mirror for full spectrum
    let dt = 1.0 / sample_rate;

    // Build complex spectrum (positive side)
    let mut spectrum_re = vec![0.0; n_fft];
    let mut spectrum_im = vec![0.0; n_fft];

    for i in 0..n_freq {
        let mag = 10.0_f64.powf(spl_db[i] / 20.0) * P_REF;
        let phase = pressure_phases[i];
        spectrum_re[i] = mag * phase.cos();
        spectrum_im[i] = mag * phase.sin();
        // Mirror (conjugate symmetry for real output)
        if i > 0 && i < n_fft - i {
            spectrum_re[n_fft - i] = spectrum_re[i];
            spectrum_im[n_fft - i] = -spectrum_im[i];
        }
    }

    // Simple DFT (not FFT — acceptable for 500-1000 points)
    let mut ir = Vec::with_capacity(n_fft);
    let mut time = Vec::with_capacity(n_fft);
    let twopi_n = 2.0 * std::f64::consts::PI / n_fft as f64;

    // Only compute first 256 samples (enough for visualization)
    let n_out = n_fft.min(512);
    for k in 0..n_out {
        let mut sum = 0.0;
        for n in 0..n_fft {
            let angle = twopi_n * (k as f64) * (n as f64);
            sum += spectrum_re[n] * angle.cos() - spectrum_im[n] * angle.sin();
        }
        ir.push(sum / n_fft as f64);
        time.push(k as f64 * dt * 1000.0); // ms
    }

    (time, ir)
}
