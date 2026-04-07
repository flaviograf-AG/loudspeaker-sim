import type { WayInput, ActiveFilter } from '../types';

/** "Scan-Speak 18W · 37Hz · 6.5ohm · Qts 0.38" or "Custom · 37Hz · 6.5ohm · Qts 0.38" */
export function driverSummary(way: WayInput, presetName?: string): string {
  const d = way.driver;
  const qts = ((d.qes * d.qms) / (d.qes + d.qms)).toFixed(2);
  const name = presetName || 'Custom';
  return `${name} · ${d.fs_hz}Hz · ${d.re_ohm}\u03A9 · Qts ${qts}`;
}

/** "Sealed 20L · Fc 52Hz" or "Vented 30L · Fb 38Hz" */
export function enclosureSummary(way: WayInput): string {
  const enc = way.enclosure;
  switch (enc.type) {
    case 'Sealed': return `Sealed ${(enc.volume_m3 * 1000).toFixed(1)}L`;
    case 'Vented': return `Vented ${(enc.volume_m3 * 1000).toFixed(1)}L`;
    case 'TransmissionLine': return `T-Line ${(enc.length_m * 100).toFixed(0)}cm`;
    case 'Horn': return `Horn ${enc.segments.length} seg`;
    case 'Bandpass': return `BP ${(enc.rear_volume_m3 * 1000).toFixed(1)}+${(enc.front_volume_m3 * 1000).toFixed(1)}L`;
    case 'PassiveRadiator': return `PR ${(enc.volume_m3 * 1000).toFixed(1)}L`;
    case 'OpenBaffle': return `OB ${(enc.width_m * 100).toFixed(0)}\u00D7${(enc.height_m * 100).toFixed(0)}cm`;
  }
}

function activeFilterLabel(f: ActiveFilter): string {
  switch (f.type) {
    case 'LR4LowPass': return `LR4 LP ${f.freq_hz}`;
    case 'LR4HighPass': return `LR4 HP ${f.freq_hz}`;
    case 'LR2LowPass': return `LR2 LP ${f.freq_hz}`;
    case 'LR2HighPass': return `LR2 HP ${f.freq_hz}`;
    case 'LowPass1': return `LP1 ${f.freq_hz}`;
    case 'HighPass1': return `HP1 ${f.freq_hz}`;
    case 'LowPass2': return `LP2 ${f.freq_hz}`;
    case 'HighPass2': return `HP2 ${f.freq_hz}`;
    case 'PEQ': return `PEQ ${f.freq_hz}Hz`;
    case 'AllPass1': return `AP1 ${f.freq_hz}`;
    case 'AllPass2': return `AP2 ${f.freq_hz}`;
    case 'ShelfLow': return `LoS ${f.gain_db}dB`;
    case 'ShelfHigh': return `HiS ${f.gain_db}dB`;
    case 'LinkwitzTransform': return 'LT';
    case 'Gain': return `${f.db}dB`;
    case 'Invert': return 'Inv';
  }
}

/** "LR4 HP 2500 + Zobel" or "No filters" */
export function crossoverSummary(way: WayInput): string {
  const parts: string[] = [];
  for (const f of way.active_filters) parts.push(activeFilterLabel(f));
  if (way.passive_filters.length > 0) parts.push(`${way.passive_filters.length} passive`);
  return parts.length > 0 ? parts.join(' + ') : 'No filters';
}
