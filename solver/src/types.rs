//! Core data types for the loudspeaker solver.

use serde::{Deserialize, Serialize};

/// Thiele-Small parameters as entered by the user.
/// Reference: Small, R.H. "Direct-Radiator Loudspeaker System Analysis" (JAES, 1972)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverParams {
    /// Resonant frequency (Hz)
    pub fs_hz: f64,
    /// DC resistance (Ω)
    pub re_ohm: f64,
    /// Voice coil inductance (H) — user enters mH, convert before storing
    pub le_h: f64,
    /// Electrical Q factor (dimensionless)
    pub qes: f64,
    /// Mechanical Q factor (dimensionless)
    pub qms: f64,
    /// Equivalent compliance volume (m³) — user enters L, convert before storing
    pub vas_m3: f64,
    /// Effective cone area (m²) — user enters cm², convert before storing
    pub sd_m2: f64,
    /// Maximum linear excursion (m) — user enters mm, convert before storing
    pub xmax_m: f64,
    /// Semi-inductance coefficient (H·s^0.5) — optional extended impedance model.
    /// When > 0, replaces simple sLe with Ke×s^0.5 for more accurate HF impedance.
    /// Reference: Thorborg et al. "Improved Loudspeaker Motor Impedance Model" (JAES, 2010)
    #[serde(default)]
    pub ke: f64,
}

/// Derived electromechanical parameters (computed from DriverParams).
/// These are the canonical form used by the solver.
#[derive(Debug, Clone)]
pub struct DerivedDriver {
    /// All user-facing params preserved
    pub params: DriverParams,
    /// Total Q factor: Qts = (Qes × Qms) / (Qes + Qms)
    pub qts: f64,
    /// Mechanical compliance (m/N)
    pub cms: f64,
    /// Moving mass (kg)
    pub mms: f64,
    /// Mechanical resistance (N·s/m)
    pub rms: f64,
    /// Force factor (T·m)
    pub bl: f64,
}

/// Sealed box enclosure parameters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SealedBoxParams {
    /// Internal box volume (m³) — user enters L, convert before storing
    pub volume_m3: f64,
    /// Box loss factor Ql (dimensionless, typically 5–15; default 7)
    pub ql: f64,
}

/// Port shape — circular or rectangular slot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PortShape {
    /// Circular port (default). Area = π×r².
    Circular,
    /// Rectangular slot port. Area = width × height.
    Slot { width_m: f64, height_m: f64 },
}

impl Default for PortShape {
    fn default() -> Self {
        PortShape::Circular
    }
}

/// Vented box (bass reflex) enclosure parameters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VentedBoxParams {
    /// Internal box volume (m³)
    pub volume_m3: f64,
    /// Port cross-sectional area (m²)
    pub port_area_m2: f64,
    /// Port physical length (m) — before end corrections
    pub port_length_m: f64,
    /// Number of ports (default 1)
    pub num_ports: u32,
    /// Port is flanged (affects end correction)
    pub port_flanged: bool,
    /// Box loss factor Ql
    pub ql: f64,
    /// Port shape — circular or rectangular slot
    #[serde(default)]
    pub port_shape: PortShape,
}

/// Taper profile for transmission line cross-section variation.
/// Reference: King, M.J. "Quarter Wavelength Loudspeaker Design" (2005-2020)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TaperProfile {
    /// Linear taper in radius (area varies quadratically). Default.
    Straight,
    /// Exponential taper: S(x) = S_driver × e^(m×x), m = ln(S_mouth/S_driver)/L
    Exponential,
    /// Conical taper: linear in area, S(x) = S_driver + (S_mouth-S_driver)×x/L
    Conical,
}

impl Default for TaperProfile {
    fn default() -> Self {
        TaperProfile::Straight
    }
}

/// A stuffing zone within the transmission line.
/// Multiple zones allow heavy stuffing near the driver and light near the mouth.
/// Reference: Bradbury, L.J.S. "The Use of Fibrous Materials in Loudspeaker Enclosures" (JAES, 1976)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StuffingZone {
    /// Start position as fraction of line length (0.0 = driver end)
    pub start_pct: f64,
    /// End position as fraction of line length (1.0 = mouth)
    pub end_pct: f64,
    /// Stuffing density (kg/m³)
    pub density_kg_m3: f64,
    /// Specific flow resistivity (Pa·s/m²)
    pub flow_resistivity_pa_s_m2: f64,
}

/// Mouth termination type affecting radiation impedance.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MouthTermination {
    /// Standard flush opening — simple piston radiation impedance.
    Flush,
    /// Flared mouth with larger effective radiating area.
    Flared { flare_radius_m: f64 },
}

impl Default for MouthTermination {
    fn default() -> Self {
        MouthTermination::Flush
    }
}

/// Transmission line enclosure parameters.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TransmissionLineParams {
    /// Line physical length (m)
    pub length_m: f64,
    /// Cross-sectional area at driver end (m²)
    pub area_driver_m2: f64,
    /// Cross-sectional area at open end (m²) — same as driver end if straight
    pub area_mouth_m2: f64,
    /// Number of segments for TMM discretization (default 20)
    pub num_segments: u32,
    /// Stuffing density (kg/m³) — 0 = no stuffing. Used when stuffing_zones is empty.
    pub stuffing_density_kg_m3: f64,
    /// Specific flow resistivity of stuffing material (Pa·s/m²)
    /// Typical polyester fill: ~3500–8000; fiberglass: ~10000–40000
    /// Reference: Bradbury (1976)
    pub flow_resistivity_pa_s_m2: f64,
    /// Open end (true = quarter-wave TL) or closed end
    pub open_end: bool,
    /// Driver offset from closed end as fraction of line length (0.0 = at wall, default)
    /// Placing driver at 1/3 suppresses 3rd harmonic standing wave.
    /// Reference: King (2005-2020)
    #[serde(default)]
    pub driver_position: f64,
    /// Taper profile for cross-section variation along the line
    #[serde(default)]
    pub taper_profile: TaperProfile,
    /// Per-zone stuffing configuration. When non-empty, overrides the global
    /// stuffing_density_kg_m3 and flow_resistivity_pa_s_m2 fields.
    #[serde(default)]
    pub stuffing_zones: Vec<StuffingZone>,
    /// Mouth termination type
    #[serde(default)]
    pub mouth_termination: MouthTermination,
    /// Number of folds in the line. Each fold adds acoustic mass.
    /// Reference: practical TL construction constraint.
    #[serde(default)]
    pub num_folds: u32,
}

/// Horn flare profile for a single segment.
/// The T-parameter system from Hornresp: T=0 catenoidal, T=1 exponential,
/// T>1 sinh, T=99999 conical.
/// Reference: Keele, D.B. "Optimum Horn Mouth Size" (AES, 1979)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum HornProfile {
    /// Conical — linear area expansion, no cutoff frequency.
    Conical,
    /// Exponential — area grows as e^(mx). Has a theoretical cutoff frequency.
    Exponential,
    /// Hyperbolic — generalized family parameterized by T.
    /// T=0: catenoidal, 0<T<1: cosh, T=1: exponential, T>1: sinh.
    Hyperbolic { t_param: f64 },
    /// Tractrix — smooth tangential curve, favored for midrange/tweeter horns.
    Tractrix,
    /// Parabolic — S(x) = S1 × (1 + x/L × (√(S2/S1) - 1))²
    Parabolic,
    /// Le Cléac'h — optimized for minimal internal reflections and phase coherence.
    /// Near-zero reflections inside the horn body.
    LeCleach,
}

impl Default for HornProfile {
    fn default() -> Self {
        HornProfile::Exponential
    }
}

/// A single horn segment (from area_start to area_end over a given length).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HornSegment {
    /// Cross-sectional area at start of segment (m²)
    pub area_start_m2: f64,
    /// Cross-sectional area at end of segment (m²)
    pub area_end_m2: f64,
    /// Axial length of segment (m)
    pub length_m: f64,
    /// Flare profile for this segment
    pub profile: HornProfile,
    /// Flare cutoff frequency (Hz) — only used for exponential/hyperbolic profiles
    #[serde(default)]
    pub cutoff_hz: f64,
}

/// Rear chamber type — determines what sits behind the driver.
/// Mirrors Hornresp's Chamber Type selector.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RearChamber {
    /// Sealed (lined) rear chamber with optional absorption.
    Sealed {
        volume_m3: f64,
        depth_m: f64,
        flow_resistivity_pa_s_m2: f64,
        lining_thickness_m: f64,
        ql: f64,
    },
    /// Vented (bass reflex) rear chamber with port.
    Vented {
        volume_m3: f64,
        port_area_m2: f64,
        port_length_m: f64,
        ql: f64,
    },
}

impl Default for RearChamber {
    fn default() -> Self {
        RearChamber::Sealed {
            volume_m3: 5.0e-3,
            depth_m: 0.1,
            flow_resistivity_pa_s_m2: 0.0,
            lining_thickness_m: 0.0,
            ql: 7.0,
        }
    }
}

/// Throat chamber — small volume between driver cone and horn throat.
/// Acts as an acoustic low-pass filter, smoothing the response.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThroatChamber {
    /// Throat chamber volume (m³)
    pub volume_m3: f64,
    /// Throat chamber average cross-sectional area (m²)
    pub area_m2: f64,
}

/// Horn enclosure parameters — up to 4 segments with independent flare profiles.
/// Models front-loaded horns, back-loaded horns, tapped horns.
///
/// Acoustic path: DRIVER → [Rear Chamber] → [Throat Chamber] → S1 →[L12]→ S2 →[L23]→ S3 →[L34]→ S4
///
/// Reference: Keele (1979), Hornresp v60 manual
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HornParams {
    /// Horn segments (1 to 4). First segment throat = segments[0].area_start,
    /// last segment mouth = segments[last].area_end.
    pub segments: Vec<HornSegment>,
    /// Rear chamber behind the driver
    #[serde(default)]
    pub rear_chamber: RearChamber,
    /// Optional throat chamber between driver and horn throat
    #[serde(default)]
    pub throat_chamber: Option<ThroatChamber>,
    /// Radiation solid angle (steradians). 2π = half-space (default), 4π = free-space.
    #[serde(default = "default_ang")]
    pub radiation_angle_sr: f64,
    /// Number of TMM segments per horn segment for discretization
    #[serde(default = "default_horn_segments")]
    pub num_tmm_segments: u32,
    /// Stuffing in the horn path
    #[serde(default)]
    pub stuffing_zones: Vec<StuffingZone>,
}

fn default_ang() -> f64 { 2.0 * std::f64::consts::PI }
fn default_horn_segments() -> u32 { 30 }

/// 4th-order bandpass enclosure: sealed rear chamber + vented front chamber.
/// The driver fires into a sealed rear volume; the front volume has a port.
/// All acoustic output comes from the port — the driver is not directly visible.
/// Reference: Fincham, L.R. "A Bandpass Filter Loudspeaker System" (AES, 1983)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BandpassParams {
    /// Rear (sealed) chamber volume (m³)
    pub rear_volume_m3: f64,
    /// Front (vented) chamber volume (m³)
    pub front_volume_m3: f64,
    /// Front port cross-sectional area (m²)
    pub port_area_m2: f64,
    /// Front port physical length (m)
    pub port_length_m: f64,
    /// Port is flanged
    pub port_flanged: bool,
    /// Rear chamber Ql
    pub rear_ql: f64,
    /// Front chamber Ql
    pub front_ql: f64,
}

/// Passive radiator enclosure: sealed box with a mass-loaded passive cone.
/// The passive radiator replaces the port — tuned by adding mass.
/// Reference: Small, R.H. "Passive-Radiator Loudspeaker Systems" (JAES, 1974)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PassiveRadiatorParams {
    /// Box volume (m³)
    pub volume_m3: f64,
    /// Passive radiator effective area (m²)
    pub pr_sd_m2: f64,
    /// Passive radiator compliance (m/N) — from suspension
    pub pr_cms: f64,
    /// Passive radiator total moving mass (kg) — diaphragm + added mass
    pub pr_mms_kg: f64,
    /// Passive radiator mechanical resistance (N·s/m)
    pub pr_rms: f64,
    /// Box Ql
    pub ql: f64,
}

/// Open baffle — no box. Driver radiates into free space front and back.
/// Below the baffle step frequency, front and back radiation cancel (dipole null).
/// Reference: Linkwitz, S. "Open Baffle Loudspeakers" (2007)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenBaffleParams {
    /// Baffle width (m) — determines baffle step frequency
    pub width_m: f64,
    /// Baffle height (m)
    pub height_m: f64,
    /// Driver offset from center (m) — affects diffraction pattern
    #[serde(default)]
    pub driver_offset_m: f64,
}

/// Enclosure configuration — tagged union for all enclosure types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum EnclosureConfig {
    Sealed(SealedBoxParams),
    Vented(VentedBoxParams),
    TransmissionLine(TransmissionLineParams),
    Horn(HornParams),
    Bandpass(BandpassParams),
    PassiveRadiator(PassiveRadiatorParams),
    OpenBaffle(OpenBaffleParams),
}

/// Complete simulation input — everything needed to run a sweep.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationInput {
    pub driver: DriverParams,
    pub enclosure: EnclosureConfig,
    pub freq_start_hz: f64,
    pub freq_end_hz: f64,
    pub freq_points: usize,
    pub drive_voltage_rms: f64,
}

/// Output from a frequency-domain simulation sweep.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationResult {
    /// Frequency points (Hz)
    pub frequencies_hz: Vec<f64>,
    /// Sound pressure level at 1m (dB SPL)
    pub spl_db: Vec<f64>,
    /// Electrical impedance magnitude (Ω)
    pub impedance_ohm: Vec<f64>,
    /// Electrical impedance phase (degrees)
    pub impedance_phase_deg: Vec<f64>,
    /// Cone displacement (mm, peak)
    pub cone_displacement_mm: Vec<f64>,
    /// Group delay (ms)
    pub group_delay_ms: Vec<f64>,
    /// Acoustic pressure phase (degrees)
    pub acoustic_phase_deg: Vec<f64>,
    /// Port air velocity (m/s) — None for sealed boxes
    pub port_velocity_ms: Option<Vec<f64>>,
}
