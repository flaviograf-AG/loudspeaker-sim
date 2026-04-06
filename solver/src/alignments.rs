//! Classical loudspeaker alignment calculators.
//!
//! Given a driver's T/S parameters, compute the optimal enclosure
//! dimensions for standard alignments (Butterworth, Bessel, etc.)
//!
//! References:
//! - Small, R.H. "Closed-Box Loudspeaker Systems" (JAES, 1972)
//! - Small, R.H. "Vented-Box Loudspeaker Systems Part III: Synthesis" (JAES, 1973)
//! - Thiele, A.N. "Loudspeakers in Vented Boxes" (JAES, 1971)

use crate::constants::{C_0, TWO_PI};

/// Result of an alignment calculation.
#[derive(Debug, Clone)]
pub struct AlignmentResult {
    /// Alignment name
    pub name: &'static str,
    /// Recommended box volume (m³)
    pub volume_m3: f64,
    /// Port tuning frequency (Hz) — None for sealed
    pub fb_hz: Option<f64>,
    /// System resonance (Hz)
    pub fc_hz: f64,
    /// System Q
    pub qtc: f64,
    /// -3dB frequency (Hz)
    pub f3_hz: f64,
}

/// Sealed box alignments.
pub fn sealed_alignments(fs: f64, qts: f64, vas: f64) -> Vec<AlignmentResult> {
    let mut results = Vec::new();

    // Butterworth (Qtc = 0.707): maximally flat
    let qtc_bw = 0.707;
    let alpha_bw = (qtc_bw / qts).powi(2) - 1.0;
    if alpha_bw > 0.0 {
        let vb = vas / alpha_bw;
        let fc = fs * (1.0 + alpha_bw).sqrt();
        let f3 = fc; // -3dB at Fc for Butterworth
        results.push(AlignmentResult {
            name: "Butterworth (Qtc=0.707)",
            volume_m3: vb, fb_hz: None, fc_hz: fc, qtc: qtc_bw, f3_hz: f3,
        });
    }

    // Bessel (Qtc = 0.577): best transient response
    let qtc_be = 0.577;
    let alpha_be = (qtc_be / qts).powi(2) - 1.0;
    if alpha_be > 0.0 {
        let vb = vas / alpha_be;
        let fc = fs * (1.0 + alpha_be).sqrt();
        let f3 = fc * 1.55; // Bessel -3dB is ~1.55× Fc
        results.push(AlignmentResult {
            name: "Bessel (Qtc=0.577)",
            volume_m3: vb, fb_hz: None, fc_hz: fc, qtc: qtc_be, f3_hz: f3,
        });
    }

    // Cheby 1dB (Qtc = 0.957): peaky but extended
    let qtc_ch = 0.957;
    let alpha_ch = (qtc_ch / qts).powi(2) - 1.0;
    if alpha_ch > 0.0 {
        let vb = vas / alpha_ch;
        let fc = fs * (1.0 + alpha_ch).sqrt();
        let f3 = fc * 0.7; // Chebyshev -3dB is below Fc
        results.push(AlignmentResult {
            name: "Chebyshev 1dB (Qtc=0.957)",
            volume_m3: vb, fb_hz: None, fc_hz: fc, qtc: qtc_ch, f3_hz: f3,
        });
    }

    results
}

/// Vented box alignments.
/// Reference: Small (1973) alignment tables, Thiele (1971).
pub fn vented_alignments(fs: f64, qts: f64, vas: f64) -> Vec<AlignmentResult> {
    let mut results = Vec::new();

    // B4 (Butterworth 4th-order): Vb ≈ Vas, Fb ≈ Fs
    // Exact: for Qts ≈ 0.383
    {
        let vb = vas;
        let fb = fs;
        let fc = fs;
        let f3 = fb; // -3dB near Fb for B4
        results.push(AlignmentResult {
            name: "B4 (Butterworth, Vb≈Vas)",
            volume_m3: vb, fb_hz: Some(fb), fc_hz: fc, qtc: 0.383, f3_hz: f3,
        });
    }

    // QB3 (Quasi-Butterworth): smaller box, Fb slightly above Fs
    // Empirical: Vb ≈ 15×Vas×Qts^2.87, Fb ≈ 0.26×Fs×Qts^(-1.4)
    {
        let vb = 15.0 * vas * qts.powf(2.87);
        let fb = 0.26 * fs * qts.powf(-1.4);
        let f3 = fb * 0.9;
        results.push(AlignmentResult {
            name: "QB3 (Quasi-Butterworth)",
            volume_m3: vb, fb_hz: Some(fb), fc_hz: fs, qtc: qts, f3_hz: f3,
        });
    }

    // SC4 (Sub-Chebyshev): extended bass, larger box
    // Empirical: Vb ≈ 2.0×Vas, Fb ≈ 0.9×Fs
    {
        let vb = 2.0 * vas;
        let fb = 0.9 * fs;
        let f3 = fb * 0.85;
        results.push(AlignmentResult {
            name: "SC4 (Sub-Chebyshev)",
            volume_m3: vb, fb_hz: Some(fb), fc_hz: fs, qtc: qts, f3_hz: f3,
        });
    }

    // Extended bass (EBS): maximize extension, large box
    // Fb = 0.42×Fs, Vb = 3.0×Vas
    {
        let vb = 3.0 * vas;
        let fb = 0.42 * fs;
        let f3 = fb;
        results.push(AlignmentResult {
            name: "EBS (Extended Bass Shelf)",
            volume_m3: vb, fb_hz: Some(fb), fc_hz: fs, qtc: qts, f3_hz: f3,
        });
    }

    results
}

/// Compute port length for a given tuning frequency, box volume, and port area.
/// Returns physical port length in meters (before end corrections are added internally).
pub fn port_length_for_fb(fb_hz: f64, volume_m3: f64, port_area_m2: f64, flanged: bool) -> f64 {
    let omega_b = TWO_PI * fb_hz;
    let lp_eff = port_area_m2 / (volume_m3 * (omega_b / C_0).powi(2));
    let port_d = (4.0 * port_area_m2 / std::f64::consts::PI).sqrt();
    let radius = port_d / 2.0;
    let correction = if flanged { 0.85 * radius } else { 0.6 * radius };
    (lp_eff - 2.0 * correction).max(0.01)
}
