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
///   Z_c = (ρ₀c₀/S) × √(1 + Rf/(jωρ₀))
///
/// Porous stuffing increases effective gas density ρ_eff = ρ₀(1 + Rf/(jωρ₀)),
/// so Z_c = √(ρ_eff × K)/S = Z₀ × √(1 + Rf/(jωρ₀)).
/// For no stuffing (Rf=0), reduces to the real-valued ρ₀c₀/S.
///
/// Reference: Bradbury (1976), Eq. 11–13.
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
    Complex::new(z0, 0.0) * (Complex::new(1.0, 0.0) + ratio).sqrt()
}

/// Characteristic acoustic impedance for a duct (lossless).
///
/// Z₀ = ρ₀ × c₀ / S
pub fn characteristic_impedance(rho0: f64, c0: f64, area: f64) -> Complex<f64> {
    Complex::new(rho0 * c0 / area, 0.0)
}

/// Broadband radiation impedance of a circular piston of area `area_m2`
/// radiating into solid angle `solid_angle_sr` (default 2π for half-space).
///
/// Uses exact Bessel/Struve power series for ka < 5 and asymptotic expansion
/// for ka >= 5:
///   Z_rad(ka) = (ρ₀c₀ / S) × [R₁(2ka) + j X₁(2ka)]
/// where R₁(2ka) = 1 - 2 J₁(2ka)/(2ka) → 0.5(ka)² for ka << 1, and → 1 for ka >> 1;
///       X₁(2ka) = 2 H₁(2ka)/(2ka)     → (8/3π)ka for ka << 1, and → 2/(π ka) for ka >> 1.
///
/// Reference: Beranek, L.L. "Acoustics" (1986), Eq. 5.10–5.14;
/// Kinsler, Frey, Coppens & Sanders, "Fundamentals of Acoustics", Ch. 7.
pub fn piston_radiation_impedance(
    omega: f64,
    rho0: f64,
    c0: f64,
    area_m2: f64,
    solid_angle_sr: f64,
) -> Complex<f64> {
    if area_m2 <= 0.0 {
        return Complex::new(0.0, 0.0);
    }
    let a = (area_m2 / std::f64::consts::PI).sqrt();
    let ka = (omega / c0) * a;
    let x = 2.0 * ka;
    let z0 = rho0 * c0 / area_m2;

    // Solid angle scaling relative to half-space (2π steradians).
    // At low frequencies, radiating into a narrower solid angle increases
    // radiation loading by 2π / Ω, while high-frequency plane-wave resistance
    // saturates at Z₀.
    let ang_scale = if solid_angle_sr > 0.0 {
        (2.0 * std::f64::consts::PI / solid_angle_sr).clamp(0.25, 8.0)
    } else {
        1.0
    };

    let (r1, x1) = if x < 10.0 {
        // Convergent series for R₁(x) = 1 - 2 J₁(x)/x and X₁(x) = 2 H₁(x)/x
        // R₁(x) = sum_{m=1..24} (-1)^(m+1) * (x/2)^(2m) / (m! * (m+1)!)
        let half_x2 = 0.25 * x * x;
        let mut r_sum = 0.0;
        let mut r_term = half_x2 * 0.5; // m=1: (x/2)^2 / (1! * 2!)
        for m in 1..=24 {
            r_sum += r_term;
            let m_f = m as f64;
            r_term *= -half_x2 / ((m_f + 1.0) * (m_f + 2.0));
        }

        // X₁(x) = (2/π) * sum_{m=0..24} (-1)^m * x^(2m+1) / ((2m+1)!! * (2m+3)!!)
        let x2 = x * x;
        let mut x_sum = 0.0;
        let mut x_term = x / 3.0; // m=0: x / (1!! * 3!!)
        for m in 0..=24 {
            x_sum += x_term;
            let d1 = (2 * m + 3) as f64;
            let d2 = (2 * m + 5) as f64;
            x_term *= -x2 / (d1 * d2);
        }
        let x1_val = (2.0 / std::f64::consts::PI) * x_sum;
        (r_sum.max(0.0), x1_val)
    } else {
        // Asymptotic expansion for x >= 10 (ka >= 5)
        let amp = (2.0 / (std::f64::consts::PI * x)).sqrt() * (2.0 / x);
        let phase = x - 0.75 * std::f64::consts::PI;
        let r1_val = 1.0 - amp * phase.cos();
        let x1_val = 4.0 / (std::f64::consts::PI * x) + amp * phase.sin();
        (r1_val.max(0.0), x1_val)
    };

    // Apply solid-angle factor at low ka, smoothly saturating R to 1.0 at high ka
    let r_eff = (r1 * ang_scale).min(1.0_f64.max(r1));
    let x_eff = x1 * ang_scale.sqrt();
    Complex::new(z0 * r_eff, z0 * x_eff)
}
