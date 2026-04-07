import type { SystemInput, SystemTopology } from '../types';

const STORAGE_KEY = 'ls-designs';

export interface SavedDesign {
  name: string;
  timestamp: number;
  topology: SystemTopology;
  system: SystemInput;
}

export function loadDesigns(): SavedDesign[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Migrate legacy format
    return parsed.map((d: any) => {
      if ('input' in d && !('system' in d)) {
        return {
          name: d.name,
          timestamp: d.timestamp,
          topology: '1-way' as SystemTopology,
          system: {
            ways: [{
              name: 'Full Range', driver: d.input.driver, enclosure: d.input.enclosure,
              passive_filters: [], active_filters: [],
              gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
            }],
            freq_start_hz: d.input.freq_start_hz, freq_end_hz: d.input.freq_end_hz,
            freq_points: d.input.freq_points, drive_voltage_rms: d.input.drive_voltage_rms,
          },
        };
      }
      return d;
    });
  } catch { return []; }
}

export function saveDesign(name: string, topology: SystemTopology, system: SystemInput): void {
  const designs = loadDesigns();
  designs.push({ name, timestamp: Date.now(), topology, system });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
}

export function deleteDesign(index: number): void {
  const designs = loadDesigns();
  designs.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
}
