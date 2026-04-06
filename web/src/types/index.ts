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

export interface TransmissionLineParams {
  length_m: number;
  area_driver_m2: number;
  area_mouth_m2: number;
  num_segments: number;
  stuffing_density_kg_m3: number;
  flow_resistivity_pa_s_m2: number;
  open_end: boolean;
}

// Matches Rust #[serde(tag = "type")] enum
export type EnclosureConfig =
  | { type: 'Sealed'; volume_m3: number; ql: number }
  | { type: 'Vented'; volume_m3: number; port_area_m2: number; port_length_m: number; num_ports: number; port_flanged: boolean; ql: number }
  | { type: 'TransmissionLine'; length_m: number; area_driver_m2: number; area_mouth_m2: number; num_segments: number; stuffing_density_kg_m3: number; flow_resistivity_pa_s_m2: number; open_end: boolean };

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

export type EnclosureType = 'Sealed' | 'Vented' | 'TransmissionLine';
