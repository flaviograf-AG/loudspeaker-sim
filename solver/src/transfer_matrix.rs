//! Transfer matrix primitives for acoustic waveguide modeling.
//!
//! The transfer matrix (ABCD matrix) relates pressure and volume velocity
//! at the input of an acoustic element to its output:
//!
//!   |P_in |   | A  B | |P_out |
//!   |U_in | = | C  D | |U_out |
//!
//! For a uniform duct segment of length L:
//!   A = D = cos(kL)
//!   B = j×Z₀×sin(kL)
//!   C = j×sin(kL)/Z₀
//!
//! Reference: Leach, W.M. "Electroacoustics and Audio Amplifier Design",
//! Chapter on transmission line loudspeakers, Eq. 8.25–8.30.

use num_complex::Complex;

/// 2×2 transfer matrix stored as [[A, B], [C, D]].
pub type TransferMatrix2x2 = [[Complex<f64>; 2]; 2];

/// Compute the transfer matrix for a uniform duct segment.
///
/// # Arguments
/// * `k` — Complex wave number (rad/m). Real part = ω/c, imaginary part = -α (absorption)
/// * `z0` — Characteristic acoustic impedance = ρ₀c₀/S (Pa·s/m³)
/// * `length` — Segment length (m)
///
/// Reference: Leach, "Electroacoustics", Eq. 8.26
pub fn duct_transfer_matrix(
    k: Complex<f64>,
    z0: Complex<f64>,
    length: f64,
) -> TransferMatrix2x2 {
    let kl = k * length;
    let cos_kl = kl.cos();
    let sin_kl = kl.sin();
    let j = Complex::new(0.0, 1.0);

    [
        [cos_kl, j * z0 * sin_kl],
        [j * sin_kl / z0, cos_kl],
    ]
}

/// Cascade (multiply) two 2×2 transfer matrices.
///
/// T_total = T1 × T2
/// This models two acoustic elements in series.
pub fn cascade_2x2(t1: &TransferMatrix2x2, t2: &TransferMatrix2x2) -> TransferMatrix2x2 {
    [
        [
            t1[0][0] * t2[0][0] + t1[0][1] * t2[1][0],
            t1[0][0] * t2[0][1] + t1[0][1] * t2[1][1],
        ],
        [
            t1[1][0] * t2[0][0] + t1[1][1] * t2[1][0],
            t1[1][0] * t2[0][1] + t1[1][1] * t2[1][1],
        ],
    ]
}

/// Identity transfer matrix (no-op element).
pub fn identity_2x2() -> TransferMatrix2x2 {
    let zero = Complex::new(0.0, 0.0);
    let one = Complex::new(1.0, 0.0);
    [[one, zero], [zero, one]]
}

/// Compute complex wave number with stuffing absorption.
///
/// Full Bradbury model:
///   k_c = (ω/c₀) × √(1 + Rf/(jωρ₀))
///
/// This modifies both the real part (effective sound speed reduction)
/// and imaginary part (absorption) of the wave number.
///
/// Reference: Bradbury, L.J.S. "The Use of Fibrous Materials in
/// Loudspeaker Enclosures" (JAES, 1976), Eq. 12.
pub fn complex_wave_number(
    omega: f64,
    c0: f64,
    rho0: f64,
    flow_resistivity: f64,
) -> Complex<f64> {
    let k0 = omega / c0;
    if flow_resistivity <= 0.0 {
        return Complex::new(k0, 0.0);
    }
    // k_c = k₀ × √(1 + Rf/(jωρ₀))
    let j = Complex::new(0.0, 1.0);
    let ratio = flow_resistivity / (j * omega * rho0);
    let sqrt_term = (Complex::new(1.0, 0.0) + ratio).sqrt();
    Complex::new(k0, 0.0) * sqrt_term
}

/// Characteristic acoustic impedance for a duct with optional stuffing.
///
/// Full Bradbury model:
///   Z_c = (ρ₀c₀/S) / √(1 + Rf/(jωρ₀))
///
/// For no stuffing (Rf=0), reduces to the real-valued ρ₀c₀/S.
///
/// Reference: Bradbury (1976)
pub fn characteristic_impedance_stuffed(
    omega: f64,
    rho0: f64,
    c0: f64,
    area: f64,
    flow_resistivity: f64,
) -> Complex<f64> {
    let z0 = rho0 * c0 / area;
    if flow_resistivity <= 0.0 {
        return Complex::new(z0, 0.0);
    }
    let j = Complex::new(0.0, 1.0);
    let ratio = flow_resistivity / (j * omega * rho0);
    Complex::new(z0, 0.0) / (Complex::new(1.0, 0.0) + ratio).sqrt()
}

/// Characteristic acoustic impedance for a duct (lossless).
///
/// Z₀ = ρ₀ × c₀ / S
pub fn characteristic_impedance(rho0: f64, c0: f64, area: f64) -> Complex<f64> {
    Complex::new(rho0 * c0 / area, 0.0)
}
