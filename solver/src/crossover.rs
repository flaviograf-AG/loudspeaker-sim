//! Crossover network solver.
//!
//! Models passive RLC networks as a ladder (series-shunt chain) between
//! the amplifier source and a frequency-dependent driver load impedance.
//! Computes the complex voltage transfer function H(f) = V_driver / V_source
//! at each frequency point.
//!
//! Also provides active filter blocks as ideal voltage-gain transfer functions
//! (biquad IIR filters computed in the analog s-domain).
//!
//! Reference: Chung-Wen Ho et al. "The Modified Nodal Approach to Network
//! Analysis" (IEEE, 1975) — simplified to ladder topology for performance.

use num_complex::Complex;
use std::f64::consts::PI;

/// A single passive component in the crossover network.
#[derive(Debug, Clone)]
pub enum PassiveBlock {
    /// Series resistor
    SeriesR { ohms: f64 },
    /// Series inductor with DC resistance
    SeriesL { henries: f64, dcr_ohms: f64 },
    /// Series capacitor
    SeriesC { farads: f64 },
    /// Shunt resistor (to ground)
    ShuntR { ohms: f64 },
    /// Shunt inductor with DCR (to ground)
    ShuntL { henries: f64, dcr_ohms: f64 },
    /// Shunt capacitor (to ground)
    ShuntC { farads: f64 },
    /// Zobel network: R + C in series, shunted to ground.
    /// Compensates voice coil inductance rise.
    ZobelShunt { ohms: f64, farads: f64 },
    /// L-pad: series R + shunt R to ground.
    /// Attenuates driver level while maintaining impedance.
    LPad { series_ohms: f64, shunt_ohms: f64 },
    /// Parallel notch: (R + L + C) in parallel, shunted to ground.
    /// Suppresses a resonance peak.
    NotchShunt { ohms: f64, henries: f64, farads: f64 },
    /// Series notch: R + L + C in series.
    /// Blocks a narrow frequency band.
    NotchSeries { ohms: f64, henries: f64, farads: f64 },
}

/// Compute the impedance of a passive block at angular frequency omega.
/// Returns (series_Z, shunt_Z) — one will be zero for pure series/shunt blocks.
fn block_impedances(block: &PassiveBlock, omega: f64) -> (Complex<f64>, Complex<f64>) {
    let j = Complex::new(0.0, 1.0);
    let zero = Complex::new(0.0, 0.0);
    let inf = Complex::new(1e15, 0.0); // open circuit

    match block {
        PassiveBlock::SeriesR { ohms } =>
            (Complex::new(*ohms, 0.0), inf),
        PassiveBlock::SeriesL { henries, dcr_ohms } =>
            (Complex::new(*dcr_ohms, 0.0) + j * omega * henries, inf),
        PassiveBlock::SeriesC { farads } =>
            (1.0 / (j * omega * farads), inf),
        PassiveBlock::ShuntR { ohms } =>
            (zero, Complex::new(*ohms, 0.0)),
        PassiveBlock::ShuntL { henries, dcr_ohms } =>
            (zero, Complex::new(*dcr_ohms, 0.0) + j * omega * henries),
        PassiveBlock::ShuntC { farads } =>
            (zero, 1.0 / (j * omega * farads)),
        PassiveBlock::ZobelShunt { ohms, farads } =>
            // R + C in series, shunted to ground
            (zero, Complex::new(*ohms, 0.0) + 1.0 / (j * omega * farads)),
        PassiveBlock::LPad { series_ohms, shunt_ohms } =>
            (Complex::new(*series_ohms, 0.0), Complex::new(*shunt_ohms, 0.0)),
        PassiveBlock::NotchShunt { ohms, henries, farads } => {
            // R + L + C in parallel, shunted to ground
            let z_r = Complex::new(*ohms, 0.0);
            let z_l = j * omega * henries;
            let z_c = 1.0 / (j * omega * farads);
            let y_total = 1.0 / z_r + 1.0 / z_l + 1.0 / z_c;
            (zero, 1.0 / y_total)
        }
        PassiveBlock::NotchSeries { ohms, henries, farads } =>
            // R + L + C in series
            (Complex::new(*ohms, 0.0) + j * omega * henries + 1.0 / (j * omega * farads), inf),
    }
}

/// Compute the voltage transfer function H(f) = V_load / V_source
/// for a passive ladder network terminated by a frequency-dependent load.
///
/// The ladder is: source → [block1] → [block2] → ... → load
/// Series blocks add impedance in the signal path.
/// Shunt blocks connect to ground (voltage divider).
///
/// Uses ABCD matrix cascading for the ladder:
/// Each block is either a series Z or shunt Y element.
pub fn passive_transfer_function(
    blocks: &[PassiveBlock],
    load_impedance: Complex<f64>,
    omega: f64,
) -> Complex<f64> {
    // ABCD matrix for the cascade
    let mut a = Complex::new(1.0, 0.0);
    let mut b = Complex::new(0.0, 0.0);
    let mut c = Complex::new(0.0, 0.0);
    let mut d = Complex::new(1.0, 0.0);

    for block in blocks {
        let (z_series, z_shunt) = block_impedances(block, omega);

        // Series element: [[1, Z], [0, 1]]
        if z_series.norm() > 1e-12 && z_shunt.norm() > 1e12 {
            // Pure series
            let new_a = a + b * Complex::new(0.0, 0.0); // a stays
            let new_b = a * z_series + b;
            let new_c = c;
            let new_d = c * z_series + d;
            a = new_a; b = new_b; c = new_c; d = new_d;
        }
        // Shunt element: [[1, 0], [1/Z, 1]]
        else if z_series.norm() < 1e-12 && z_shunt.norm() < 1e12 {
            // Pure shunt
            let y = 1.0 / z_shunt;
            let new_a = a;
            let new_b = b;
            let new_c = a * y + c;
            let new_d = b * y + d;
            a = new_a; b = new_b; c = new_c; d = new_d;
        }
        // L-pad type: series + shunt combined
        else {
            // Series first: [[1, Zs], [0, 1]]
            if z_series.norm() > 1e-12 {
                let nb = a * z_series + b;
                let nd = c * z_series + d;
                b = nb; d = nd;
            }
            // Then shunt: [[1, 0], [1/Zp, 1]]
            if z_shunt.norm() < 1e12 {
                let y = 1.0 / z_shunt;
                let nc = a * y + c;
                let nd = b * y + d;
                c = nc; d = nd;
            }
        }
    }

    // Transfer function: H = Z_load / (A×Z_load + B)
    load_impedance / (a * load_impedance + b)
}

/// An active (DSP/analog) filter block — ideal voltage gain.
#[derive(Debug, Clone)]
pub enum ActiveFilter {
    /// 1st-order low-pass: H(s) = ωc / (s + ωc)
    LowPass1 { freq_hz: f64 },
    /// 1st-order high-pass: H(s) = s / (s + ωc)
    HighPass1 { freq_hz: f64 },
    /// 2nd-order low-pass with Q: H(s) = ωc² / (s² + s×ωc/Q + ωc²)
    LowPass2 { freq_hz: f64, q: f64 },
    /// 2nd-order high-pass with Q: H(s) = s² / (s² + s×ωc/Q + ωc²)
    HighPass2 { freq_hz: f64, q: f64 },
    /// Linkwitz-Riley 4th order low-pass (two cascaded 2nd-order Butterworth)
    LR4LowPass { freq_hz: f64 },
    /// Linkwitz-Riley 4th order high-pass
    LR4HighPass { freq_hz: f64 },
    /// Parametric EQ (peaking): H(s) based on Robert Bristow-Johnson cookbook
    PEQ { freq_hz: f64, q: f64, gain_db: f64 },
    /// All-pass (1st order): H(s) = (s - ωc) / (s + ωc)
    AllPass1 { freq_hz: f64 },
    /// All-pass (2nd order): H(s) = (s² - s×ωc/Q + ωc²) / (s² + s×ωc/Q + ωc²)
    AllPass2 { freq_hz: f64, q: f64 },
    /// Gain (dB)
    Gain { db: f64 },
    /// Polarity inversion (-1)
    Invert,
}

/// Compute the complex transfer function of an active filter at frequency f.
pub fn active_filter_response(filter: &ActiveFilter, freq_hz: f64) -> Complex<f64> {
    let omega = 2.0 * PI * freq_hz;
    let j = Complex::new(0.0, 1.0);
    let s = j * omega;

    match filter {
        ActiveFilter::LowPass1 { freq_hz: fc } => {
            let wc = 2.0 * PI * fc;
            wc / (s + wc)
        }
        ActiveFilter::HighPass1 { freq_hz: fc } => {
            let wc = 2.0 * PI * fc;
            s / (s + wc)
        }
        ActiveFilter::LowPass2 { freq_hz: fc, q } => {
            let wc = 2.0 * PI * fc;
            let wc2 = wc * wc;
            wc2 / (s * s + s * wc / q + wc2)
        }
        ActiveFilter::HighPass2 { freq_hz: fc, q } => {
            let wc = 2.0 * PI * fc;
            let wc2 = wc * wc;
            s * s / (s * s + s * wc / q + wc2)
        }
        ActiveFilter::LR4LowPass { freq_hz: fc } => {
            // Two cascaded 2nd-order Butterworth (Q = 0.7071)
            let wc = 2.0 * PI * fc;
            let wc2 = wc * wc;
            let q = std::f64::consts::FRAC_1_SQRT_2;
            let h = wc2 / (s * s + s * wc / q + wc2);
            h * h
        }
        ActiveFilter::LR4HighPass { freq_hz: fc } => {
            let wc = 2.0 * PI * fc;
            let wc2 = wc * wc;
            let q = std::f64::consts::FRAC_1_SQRT_2;
            let h = s * s / (s * s + s * wc / q + wc2);
            h * h
        }
        ActiveFilter::PEQ { freq_hz: fc, q, gain_db } => {
            let wc = 2.0 * PI * fc;
            let a = 10.0_f64.powf(*gain_db / 40.0);
            let wc2 = wc * wc;
            // Peaking EQ: H(s) = (s² + s×(A×ωc/Q) + ωc²) / (s² + s×(ωc/(A×Q)) + ωc²)
            (s * s + s * a * wc / q + wc2) / (s * s + s * wc / (a * q) + wc2)
        }
        ActiveFilter::AllPass1 { freq_hz: fc } => {
            let wc = 2.0 * PI * fc;
            (s - wc) / (s + wc)
        }
        ActiveFilter::AllPass2 { freq_hz: fc, q } => {
            let wc = 2.0 * PI * fc;
            let wc2 = wc * wc;
            (s * s - s * wc / q + wc2) / (s * s + s * wc / q + wc2)
        }
        ActiveFilter::Gain { db } => {
            Complex::new(10.0_f64.powf(*db / 20.0), 0.0)
        }
        ActiveFilter::Invert => {
            Complex::new(-1.0, 0.0)
        }
    }
}

/// Standard crossover filter presets — compute component values.
pub mod presets {
    /// Compute 2nd-order Butterworth low-pass component values.
    /// Returns (series L in H, shunt C in F) for the given crossover frequency and load impedance.
    pub fn butterworth2_lp(freq_hz: f64, z_load: f64) -> (f64, f64) {
        let wc = 2.0 * std::f64::consts::PI * freq_hz;
        let l = z_load * std::f64::consts::SQRT_2 / wc;
        let c = std::f64::consts::SQRT_2 / (wc * z_load);
        (l, c)
    }

    /// Compute 2nd-order Butterworth high-pass component values.
    /// Returns (series C in F, shunt L in H).
    pub fn butterworth2_hp(freq_hz: f64, z_load: f64) -> (f64, f64) {
        let wc = 2.0 * std::f64::consts::PI * freq_hz;
        let c = 1.0 / (std::f64::consts::SQRT_2 * wc * z_load);
        let l = z_load / (std::f64::consts::SQRT_2 * wc);
        (c, l)
    }

    /// Compute Zobel network values to flatten impedance rise from Le.
    /// Returns (R_zobel in Ω, C_zobel in F).
    pub fn zobel(re: f64, le: f64) -> (f64, f64) {
        let r = re;
        let c = le / (re * re);
        (r, c)
    }

    /// Compute L-pad values for attenuation.
    /// Returns (series R in Ω, shunt R in Ω).
    pub fn l_pad(z_load: f64, attenuation_db: f64) -> (f64, f64) {
        let ratio = 10.0_f64.powf(attenuation_db / 20.0);
        let r_series = z_load * (ratio - 1.0) / ratio;
        let r_shunt = z_load * ratio / (ratio - 1.0);
        (r_series, r_shunt)
    }

    /// Compute 4th-order Linkwitz-Riley low-pass component values.
    /// Two cascaded 2nd-order Butterworth sections.
    /// Returns (L1, C1, L2, C2) all in SI units.
    pub fn lr4_lp(freq_hz: f64, z_load: f64) -> (f64, f64, f64, f64) {
        let (l, c) = butterworth2_lp(freq_hz, z_load);
        (l, c, l, c) // Two identical sections
    }

    /// Compute 4th-order Linkwitz-Riley high-pass.
    pub fn lr4_hp(freq_hz: f64, z_load: f64) -> (f64, f64, f64, f64) {
        let (c, l) = butterworth2_hp(freq_hz, z_load);
        (c, l, c, l)
    }
}
