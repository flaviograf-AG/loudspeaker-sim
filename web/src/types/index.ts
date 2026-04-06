export interface DriverParams {
  fs_hz: number;
  re_ohm: number;
  le_h: number;
  qes: number;
  qms: number;
  vas_m3: number;
  sd_m2: number;
  xmax_m: number;
}

export interface SealedBoxParams {
  volume_m3: number;
  ql: number;
}

export interface VentedBoxParams {
  volume_m3: number;
  port_area_m2: number;
  port_length_m: number;
  num_ports: number;
  port_flanged: boolean;
  ql: number;
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

// Matches Rust #[serde(tag = "type")] enum
export type EnclosureConfig =
  | { type: 'Sealed'; volume_m3: number; ql: number }
  | { type: 'Vented'; volume_m3: number; port_area_m2: number; port_length_m: number; num_ports: number; port_flanged: boolean; ql: number }
  | { type: 'TransmissionLine'; length_m: number; area_driver_m2: number; area_mouth_m2: number; num_segments: number; stuffing_density_kg_m3: number; flow_resistivity_pa_s_m2: number; open_end: boolean; driver_position: number; taper_profile: TaperProfile; stuffing_zones: StuffingZone[]; mouth_termination: MouthTermination; num_folds: number }
  | { type: 'Horn'; segments: HornSegment[]; rear_chamber: RearChamber; throat_chamber: ThroatChamber | null; radiation_angle_sr: number; num_tmm_segments: number; stuffing_zones: StuffingZone[] };

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
  port_velocity_ms: number[] | null;
}

export type EnclosureType = 'Sealed' | 'Vented' | 'TransmissionLine' | 'Horn';
