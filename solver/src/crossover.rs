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
/// The ladder is: source → [Z_source] → [block1] → [block2] → ... → load
/// Series blocks add impedance in the signal path.
/// Shunt blocks connect to ground (voltage divider).
///
/// Uses ABCD matrix cascading for the ladder:
/// Each block is either a series Z or shunt Y element.
///
/// A small source impedance (0.1 Ω) is included so that shunt-to-ground
/// components correctly divert current and reduce driver voltage.
/// Without source impedance, shunt elements have no effect on an ideal
/// voltage source — which is mathematically correct but physically
/// unrealistic and makes standalone shunt components useless.
/// Real amplifiers have 0.01–1 Ω output impedance; 0.1 Ω is typical.
pub fn passive_transfer_function(
    blocks: &[PassiveBlock],
    load_impedance: Complex<f64>,
    omega: f64,
) -> Complex<f64> {
    // Source impedance: models amplifier output impedance + cable resistance.
    // Typical values: amp output 0.05Ω (damping factor 160) + cable 0.3Ω = ~0.35Ω.
    // Without this, shunt-to-ground elements (capacitors, Zobel, notch filters)
    // have zero effect — mathematically correct for ideal voltage sources but
    // physically unrealistic and useless for crossover design.
    // Ref: Dickason, "Loudspeaker Design Cookbook", Ch. 5 — passive crossover
    // analysis always includes source impedance in the circuit model.
    let z_source = Complex::new(0.35, 0.0);

    // ABCD matrix for the cascade, starting with source impedance
    // Source impedance is a series element: [[1, Z_s], [0, 1]]
    let mut a = Complex::new(1.0, 0.0);
    let mut b = z_source;
    let mut c = Complex::new(0.0, 0.0);
    let mut d = Complex::new(1.0, 0.0);

    for block in blocks {
        let (z_series, z_shunt) = block_impedances(block, omega);

        // Series element: [[1, Z], [0, 1]]
        if z_series.norm() > 1e-12 && z_shunt.norm() > 1e12 {
            // Pure series
            let new_b = a * z_series + b;
            let new_d = c * z_series + d;
            b = new_b; d = new_d;
        }
        // Shunt element: [[1, 0], [1/Z, 1]]
        else if z_series.norm() < 1e-12 && z_shunt.norm() < 1e12 {
            // Pure shunt
            let y = 1.0 / z_shunt;
            let new_c = a * y + c;
            let new_d = b * y + d;
            c = new_c; d = new_d;
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
    /// Linkwitz-Riley 2nd order low-pass (Q=0.5, 12dB/oct)
    LR2LowPass { freq_hz: f64 },
    /// Linkwitz-Riley 2nd order high-pass
    LR2HighPass { freq_hz: f64 },
    /// Low shelf: boost/cut below freq_hz
    ShelfLow { freq_hz: f64, gain_db: f64 },
    /// High shelf: boost/cut above freq_hz
    ShelfHigh { freq_hz: f64, gain_db: f64 },
    /// Linkwitz Transform: reshape sealed-box resonance
    /// fo/qo = current system Fc/Qtc, fp/qp = target
    LinkwitzTransform { fo: f64, qo: f64, fp: f64, qp: f64 },
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
        ActiveFilter::LR2LowPass { freq_hz: fc } => {
            let wc = 2.0 * PI * fc;
            let wc2 = wc * wc;
            let q = 0.5; // LR2 = critically damped
            wc2 / (s * s + s * wc / q + wc2)
        }
        ActiveFilter::LR2HighPass { freq_hz: fc } => {
            let wc = 2.0 * PI * fc;
            let wc2 = wc * wc;
            let q = 0.5;
            s * s / (s * s + s * wc / q + wc2)
        }
        ActiveFilter::ShelfLow { freq_hz: fc, gain_db } => {
            // Low shelf: H(s) = (s + ωc×√A) / (s + ωc/√A)
            let wc = 2.0 * PI * fc;
            let a = 10.0_f64.powf(*gain_db / 40.0);
            (s + wc * a) / (s + wc / a)
        }
        ActiveFilter::ShelfHigh { freq_hz: fc, gain_db } => {
            // High shelf: H(s) = A × (s + ωc/√A) / (s + ωc×√A)
            let wc = 2.0 * PI * fc;
            let a = 10.0_f64.powf(*gain_db / 40.0);
            let a_full = 10.0_f64.powf(*gain_db / 20.0);
            Complex::new(a_full, 0.0) * (s + wc / a) / (s + wc * a)
        }
        ActiveFilter::LinkwitzTransform { fo, qo, fp, qp } => {
            // Pole-zero remapping: cancel original resonance, insert new one
            // H(s) = [(s² + s×ωo/Qo + ωo²) / (s² + s×ωp/Qp + ωp²)]
            let wo = 2.0 * PI * fo;
            let wp = 2.0 * PI * fp;
            (s * s + s * wo / qo + wo * wo) / (s * s + s * wp / qp + wp * wp)
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

/// Digital biquad coefficients: H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 + a1*z^-1 + a2*z^-2)
#[derive(Debug, Clone)]
pub struct BiquadCoeffs {
    pub b0: f64,
    pub b1: f64,
    pub b2: f64,
    pub a1: f64,
    pub a2: f64,
}

/// Convert an active filter to digital biquad coefficients via bilinear transform.
/// Uses the standard Audio EQ Cookbook (Robert Bristow-Johnson) formulations.
///
/// Reference: Bristow-Johnson, "Cookbook formulae for audio EQ biquad filter coefficients"
pub fn filter_to_biquad(filter: &ActiveFilter, sample_rate: f64) -> Vec<BiquadCoeffs> {
    let fs = sample_rate;

    match filter {
        ActiveFilter::LowPass1 { freq_hz } => {
            let w0 = 2.0 * PI * freq_hz / fs;
            let alpha = w0.sin() / 2.0;
            let cos_w0 = w0.cos();
            let b0 = (1.0 - cos_w0) / 2.0;
            let b1 = 1.0 - cos_w0;
            let b2 = (1.0 - cos_w0) / 2.0;
            let a0 = 1.0 + alpha;
            let a1 = -2.0 * cos_w0;
            let a2 = 1.0 - alpha;
            vec![BiquadCoeffs { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }]
        }
        ActiveFilter::HighPass1 { freq_hz } => {
            let w0 = 2.0 * PI * freq_hz / fs;
            let alpha = w0.sin() / 2.0;
            let cos_w0 = w0.cos();
            let b0 = (1.0 + cos_w0) / 2.0;
            let b1 = -(1.0 + cos_w0);
            let b2 = (1.0 + cos_w0) / 2.0;
            let a0 = 1.0 + alpha;
            let a1 = -2.0 * cos_w0;
            let a2 = 1.0 - alpha;
            vec![BiquadCoeffs { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }]
        }
        ActiveFilter::LowPass2 { freq_hz, q } => {
            let w0 = 2.0 * PI * freq_hz / fs;
            let alpha = w0.sin() / (2.0 * q);
            let cos_w0 = w0.cos();
            let b0 = (1.0 - cos_w0) / 2.0;
            let b1 = 1.0 - cos_w0;
            let b2 = (1.0 - cos_w0) / 2.0;
            let a0 = 1.0 + alpha;
            let a1 = -2.0 * cos_w0;
            let a2 = 1.0 - alpha;
            vec![BiquadCoeffs { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }]
        }
        ActiveFilter::HighPass2 { freq_hz, q } => {
            let w0 = 2.0 * PI * freq_hz / fs;
            let alpha = w0.sin() / (2.0 * q);
            let cos_w0 = w0.cos();
            let b0 = (1.0 + cos_w0) / 2.0;
            let b1 = -(1.0 + cos_w0);
            let b2 = (1.0 + cos_w0) / 2.0;
            let a0 = 1.0 + alpha;
            let a1 = -2.0 * cos_w0;
            let a2 = 1.0 - alpha;
            vec![BiquadCoeffs { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }]
        }
        ActiveFilter::LR4LowPass { freq_hz } => {
            // Two cascaded BW2 LP (Q=0.7071)
            let bq = filter_to_biquad(&ActiveFilter::LowPass2 { freq_hz: *freq_hz, q: std::f64::consts::FRAC_1_SQRT_2 }, fs);
            vec![bq[0].clone(), bq[0].clone()]
        }
        ActiveFilter::LR4HighPass { freq_hz } => {
            let bq = filter_to_biquad(&ActiveFilter::HighPass2 { freq_hz: *freq_hz, q: std::f64::consts::FRAC_1_SQRT_2 }, fs);
            vec![bq[0].clone(), bq[0].clone()]
        }
        ActiveFilter::PEQ { freq_hz, q, gain_db } => {
            let a = 10.0_f64.powf(*gain_db / 40.0);
            let w0 = 2.0 * PI * freq_hz / fs;
            let alpha = w0.sin() / (2.0 * q);
            let cos_w0 = w0.cos();
            let b0 = 1.0 + alpha * a;
            let b1 = -2.0 * cos_w0;
            let b2 = 1.0 - alpha * a;
            let a0 = 1.0 + alpha / a;
            let a1 = -2.0 * cos_w0;
            let a2 = 1.0 - alpha / a;
            vec![BiquadCoeffs { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }]
        }
        ActiveFilter::AllPass1 { freq_hz } => {
            let w0 = 2.0 * PI * freq_hz / fs;
            let alpha = w0.sin() / 2.0;
            let cos_w0 = w0.cos();
            let b0 = 1.0 - alpha;
            let b1 = -2.0 * cos_w0;
            let b2 = 1.0 + alpha;
            let a0 = 1.0 + alpha;
            let a1 = -2.0 * cos_w0;
            let a2 = 1.0 - alpha;
            vec![BiquadCoeffs { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }]
        }
        ActiveFilter::AllPass2 { freq_hz, q } => {
            let w0 = 2.0 * PI * freq_hz / fs;
            let alpha = w0.sin() / (2.0 * q);
            let cos_w0 = w0.cos();
            let b0 = 1.0 - alpha;
            let b1 = -2.0 * cos_w0;
            let b2 = 1.0 + alpha;
            let a0 = 1.0 + alpha;
            let a1 = -2.0 * cos_w0;
            let a2 = 1.0 - alpha;
            vec![BiquadCoeffs { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }]
        }
        ActiveFilter::ShelfLow { freq_hz, gain_db } => {
            let a = 10.0_f64.powf(*gain_db / 40.0);
            let w0 = 2.0 * PI * freq_hz / fs;
            let alpha = w0.sin() / 2.0 * ((a + 1.0/a) * (1.0/1.0 - 1.0) + 2.0).sqrt();
            let cos_w0 = w0.cos();
            let sq = 2.0 * a.sqrt() * alpha;
            let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + sq);
            let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
            let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - sq);
            let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + sq;
            let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
            let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - sq;
            vec![BiquadCoeffs { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }]
        }
        ActiveFilter::ShelfHigh { freq_hz, gain_db } => {
            let a = 10.0_f64.powf(*gain_db / 40.0);
            let w0 = 2.0 * PI * freq_hz / fs;
            let alpha = w0.sin() / 2.0 * ((a + 1.0/a) * (1.0/1.0 - 1.0) + 2.0).sqrt();
            let cos_w0 = w0.cos();
            let sq = 2.0 * a.sqrt() * alpha;
            let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + sq);
            let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
            let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - sq);
            let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + sq;
            let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
            let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - sq;
            vec![BiquadCoeffs { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }]
        }
        ActiveFilter::LR2LowPass { freq_hz } => {
            filter_to_biquad(&ActiveFilter::LowPass2 { freq_hz: *freq_hz, q: 0.5 }, fs)
        }
        ActiveFilter::LR2HighPass { freq_hz } => {
            filter_to_biquad(&ActiveFilter::HighPass2 { freq_hz: *freq_hz, q: 0.5 }, fs)
        }
        ActiveFilter::LinkwitzTransform { fo, qo, fp, qp } => {
            // Two biquads: one to cancel original resonance, one to insert new
            let w0o = 2.0 * PI * fo / fs;
            let w0p = 2.0 * PI * fp / fs;
            let alpha_o = w0o.sin() / (2.0 * qo);
            let alpha_p = w0p.sin() / (2.0 * qp);
            let cos_o = w0o.cos();
            let cos_p = w0p.cos();
            // Numerator: zeros at original resonance
            let n_b0 = 1.0 + alpha_o;
            let n_b1 = -2.0 * cos_o;
            let n_b2 = 1.0 - alpha_o;
            // Denominator: poles at new resonance
            let n_a0 = 1.0 + alpha_p;
            let n_a1 = -2.0 * cos_p;
            let n_a2 = 1.0 - alpha_p;
            vec![BiquadCoeffs { b0: n_b0/n_a0, b1: n_b1/n_a0, b2: n_b2/n_a0, a1: n_a1/n_a0, a2: n_a2/n_a0 }]
        }
        ActiveFilter::Gain { db } => {
            let g = 10.0_f64.powf(*db / 20.0);
            vec![BiquadCoeffs { b0: g, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0 }]
        }
        ActiveFilter::Invert => {
            vec![BiquadCoeffs { b0: -1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0 }]
        }
    }
}

/// E-series standard component values.
pub mod e_series {
    const E12: [f64; 12] = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
    const E24: [f64; 24] = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
                             3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];

    /// Round a value to the nearest E12 standard value.
    pub fn round_e12(value: f64) -> f64 { round_to_series(value, &E12) }

    /// Round a value to the nearest E24 standard value.
    pub fn round_e24(value: f64) -> f64 { round_to_series(value, &E24) }

    fn round_to_series(value: f64, series: &[f64]) -> f64 {
        if value <= 0.0 { return 0.0; }
        let decade = 10.0_f64.powf(value.log10().floor());
        let mantissa = value / decade;
        let mut best = series[0];
        let mut best_ratio = (mantissa / best - 1.0).abs();
        for &s in series {
            let ratio = (mantissa / s - 1.0).abs();
            if ratio < best_ratio { best = s; best_ratio = ratio; }
        }
        // Also check first value of next decade
        let next = series[0] * 10.0;
        if (mantissa / next * 10.0 - 1.0).abs() < best_ratio {
            return next * decade / 10.0;
        }
        best * decade
    }
}
