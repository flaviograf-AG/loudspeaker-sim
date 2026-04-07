export interface DriverParams {
  fs_hz: number;
  re_ohm: number;
  le_h: number;
  qes: number;
  qms: number;
  vas_m3: number;
  sd_m2: number;
  xmax_m: number;
  ke?: number;
}

export interface SealedBoxParams {
  volume_m3: number;
  ql: number;
}

export type PortShape =
  | { type: 'Circular' }
  | { type: 'Slot'; width_m: number; height_m: number };

export interface VentedBoxParams {
  volume_m3: number;
  port_area_m2: number;
  port_length_m: number;
  num_ports: number;
  port_flanged: boolean;
  ql: number;
  port_shape: PortShape;
}

export type TaperProfile =
  | { type: 'Straight' }
  | { type: 'Exponential' }
  | { type: 'Conical' };

export interface StuffingZone {
  start_pct: number;
  end_pct: number;
  density_kg_m3: number;
  flow_resistivity_pa_s_m2: number;
}

export type MouthTermination =
  | { type: 'Flush' }
  | { type: 'Flared'; flare_radius_m: number };

export interface TransmissionLineParams {
  length_m: number;
  area_driver_m2: number;
  area_mouth_m2: number;
  num_segments: number;
  stuffing_density_kg_m3: number;
  flow_resistivity_pa_s_m2: number;
  open_end: boolean;
  driver_position: number;
  taper_profile: TaperProfile;
  stuffing_zones: StuffingZone[];
  mouth_termination: MouthTermination;
  num_folds: number;
}

export type HornProfile =
  | { type: 'Conical' }
  | { type: 'Exponential' }
  | { type: 'Hyperbolic'; t_param: number }
  | { type: 'Tractrix' };

export interface HornSegment {
  area_start_m2: number;
  area_end_m2: number;
  length_m: number;
  profile: HornProfile;
  cutoff_hz: number;
}

export type RearChamber =
  | { type: 'Sealed'; volume_m3: number; depth_m: number; flow_resistivity_pa_s_m2: number; lining_thickness_m: number; ql: number }
  | { type: 'Vented'; volume_m3: number; port_area_m2: number; port_length_m: number; ql: number };

export interface ThroatChamber {
  volume_m3: number;
  area_m2: number;
}

export interface HornParams {
  segments: HornSegment[];
  rear_chamber: RearChamber;
  throat_chamber: ThroatChamber | null;
  radiation_angle_sr: number;
  num_tmm_segments: number;
  stuffing_zones: StuffingZone[];
}

export interface BandpassParams {
  rear_volume_m3: number;
  front_volume_m3: number;
  port_area_m2: number;
  port_length_m: number;
  port_flanged: boolean;
  rear_ql: number;
  front_ql: number;
}

export interface PassiveRadiatorParams {
  volume_m3: number;
  pr_sd_m2: number;
  pr_cms: number;
  pr_mms_kg: number;
  pr_rms: number;
  ql: number;
}

export interface OpenBaffleParams {
  width_m: number;
  height_m: number;
  driver_offset_m: number;
}

// Matches Rust #[serde(tag = "type")] enum
export type EnclosureConfig =
  | { type: 'Sealed'; volume_m3: number; ql: number }
  | { type: 'Vented'; volume_m3: number; port_area_m2: number; port_length_m: number; num_ports: number; port_flanged: boolean; ql: number; port_shape: PortShape }
  | { type: 'TransmissionLine'; length_m: number; area_driver_m2: number; area_mouth_m2: number; num_segments: number; stuffing_density_kg_m3: number; flow_resistivity_pa_s_m2: number; open_end: boolean; driver_position: number; taper_profile: TaperProfile; stuffing_zones: StuffingZone[]; mouth_termination: MouthTermination; num_folds: number }
  | { type: 'Horn'; segments: HornSegment[]; rear_chamber: RearChamber; throat_chamber: ThroatChamber | null; radiation_angle_sr: number; num_tmm_segments: number; stuffing_zones: StuffingZone[] }
  | { type: 'Bandpass'; rear_volume_m3: number; front_volume_m3: number; port_area_m2: number; port_length_m: number; port_flanged: boolean; rear_ql: number; front_ql: number }
  | { type: 'PassiveRadiator'; volume_m3: number; pr_sd_m2: number; pr_cms: number; pr_mms_kg: number; pr_rms: number; ql: number }
  | { type: 'OpenBaffle'; width_m: number; height_m: number; driver_offset_m: number };

export interface SimulationInput {
  driver: DriverParams;
  enclosure: EnclosureConfig;
  freq_start_hz: number;
  freq_end_hz: number;
  freq_points: number;
  drive_voltage_rms: number;
}

export interface SimulationResult {
  frequencies_hz: number[];
  spl_db: number[];
  impedance_ohm: number[];
  impedance_phase_deg: number[];
  cone_displacement_mm: number[];
  group_delay_ms: number[];
  acoustic_phase_deg: number[];
  port_velocity_ms: number[] | null;
}

export type EnclosureType = 'Sealed' | 'Vented' | 'TransmissionLine' | 'Horn' | 'Bandpass' | 'PassiveRadiator' | 'OpenBaffle';

// Multi-way system types (matches Rust system_api.rs)

export type PassiveFilter =
  | { type: 'SeriesR'; ohms: number }
  | { type: 'SeriesL'; henries: number; dcr_ohms: number }
  | { type: 'SeriesC'; farads: number }
  | { type: 'ShuntR'; ohms: number }
  | { type: 'ShuntL'; henries: number; dcr_ohms: number }
  | { type: 'ShuntC'; farads: number }
  | { type: 'ZobelShunt'; ohms: number; farads: number }
  | { type: 'LPad'; series_ohms: number; shunt_ohms: number }
  | { type: 'NotchShunt'; ohms: number; henries: number; farads: number }
  | { type: 'NotchSeries'; ohms: number; henries: number; farads: number };

export type ActiveFilter =
  | { type: 'LowPass1'; freq_hz: number }
  | { type: 'HighPass1'; freq_hz: number }
  | { type: 'LowPass2'; freq_hz: number; q: number }
  | { type: 'HighPass2'; freq_hz: number; q: number }
  | { type: 'LR4LowPass'; freq_hz: number }
  | { type: 'LR4HighPass'; freq_hz: number }
  | { type: 'PEQ'; freq_hz: number; q: number; gain_db: number }
  | { type: 'AllPass1'; freq_hz: number }
  | { type: 'AllPass2'; freq_hz: number; q: number }
  | { type: 'LR2LowPass'; freq_hz: number }
  | { type: 'LR2HighPass'; freq_hz: number }
  | { type: 'ShelfLow'; freq_hz: number; gain_db: number }
  | { type: 'ShelfHigh'; freq_hz: number; gain_db: number }
  | { type: 'LinkwitzTransform'; fo: number; qo: number; fp: number; qp: number }
  | { type: 'Gain'; db: number }
  | { type: 'Invert' };

export interface WayInput {
  name: string;
  driver: DriverParams;
  enclosure: EnclosureConfig;
  passive_filters: PassiveFilter[];
  active_filters: ActiveFilter[];
  gain_db: number;
  delay_s: number;
  inverted: boolean;
  z_offset_m: number;
  enabled: boolean;
  preset_name?: string;
  measured?: {
    frequencies_hz: number[];
    spl_db: number[];
    phase_deg: number[];
    impedance_ohm: number[];
    impedance_phase_deg: number[];
  };
}

export interface SystemInput {
  ways: WayInput[];
  freq_start_hz: number;
  freq_end_hz: number;
  freq_points: number;
  drive_voltage_rms: number;
}

export interface WayResult {
  name: string;
  spl_db: number[];
  impedance_ohm: number[];
  filter_gain_db: number[];
}

export interface SystemResult {
  frequencies_hz: number[];
  min_impedance_ohm: number;
  min_impedance_freq_hz: number;
  ways: WayResult[];
  system_spl_db: number[];
  system_group_delay_ms: number[];
  system_impedance_ohm: number[];
}

// System topology — decided in setup wizard, rarely changed
export type SystemTopology = '1-way' | '2-way' | '2.5-way' | '3-way' | '3.5-way' | '4-way';

// Describes the skeleton of a system before driver/enclosure details
export interface WayTemplate {
  name: string;
  role: 'full-range' | 'woofer' | 'woofer-bass-only' | 'midrange' | 'tweeter' | 'sub';
  defaultEnclosureType: EnclosureType;
}

// Crossover slope types — maps to LP/HP active filter pairs
export type CrossoverSlope = '1st' | 'BW2' | 'LR2' | 'LR4';

// A crossover point between two adjacent ways (or LP-only for bass-assist)
export interface CrossoverPoint {
  freq_hz: number;
  slope: CrossoverSlope;
  low_way_index: number;
  high_way_index: number | null; // null = LP-only (bass-assist woofer, sub)
}

// Full UI design state — wraps SystemInput with crossover + UI metadata
export interface DesignState {
  system: SystemInput;
  crossover_points: CrossoverPoint[];
  per_way_eq: ActiveFilter[][];
  preset_names: (string | undefined)[];
}
