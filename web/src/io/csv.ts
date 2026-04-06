import type { SimulationResult } from '../types';

export function writeAllDataCsv(result: SimulationResult): string {
  const headers = [
    'Frequency (Hz)', 'SPL (dB)', 'Acoustic Phase (deg)', 'Impedance (Ohm)',
    'Impedance Phase (deg)', 'Displacement (mm)', 'Group Delay (ms)',
  ];
  if (result.port_velocity_ms) headers.push('Port Velocity (m/s)');

  const lines = [headers.join(',')];
  for (let i = 0; i < result.frequencies_hz.length; i++) {
    const row = [
      result.frequencies_hz[i].toFixed(2),
      result.spl_db[i].toFixed(3),
      result.acoustic_phase_deg[i].toFixed(3),
      result.impedance_ohm[i].toFixed(3),
      result.impedance_phase_deg[i].toFixed(3),
      result.cone_displacement_mm[i].toFixed(4),
      result.group_delay_ms[i].toFixed(4),
    ];
    if (result.port_velocity_ms) row.push(result.port_velocity_ms[i].toFixed(4));
    lines.push(row.join(','));
  }
  return lines.join('\n');
}
