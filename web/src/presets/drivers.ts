import type { DriverParams } from '../types';

export interface DriverPreset {
  name: string;
  description: string;
  params: DriverParams;
}

export const DRIVER_PRESETS: DriverPreset[] = [
  {
    name: 'Generic 6.5" Woofer',
    description: 'Typical mid-woofer for 2-way bookshelf speakers',
    params: {
      fs_hz: 37, re_ohm: 6.5, le_h: 0.5e-3,
      qes: 0.42, qms: 3.5, vas_m3: 18e-3,
      sd_m2: 132e-4, xmax_m: 6e-3,
    },
  },
  {
    name: 'Generic 10" Subwoofer',
    description: 'Long-throw subwoofer for sealed or vented boxes',
    params: {
      fs_hz: 25, re_ohm: 3.5, le_h: 1.2e-3,
      qes: 0.45, qms: 6.0, vas_m3: 80e-3,
      sd_m2: 346e-4, xmax_m: 12e-3,
    },
  },
  {
    name: 'Generic 5" Midrange',
    description: 'Dedicated midrange for 3-way systems',
    params: {
      fs_hz: 55, re_ohm: 5.5, le_h: 0.3e-3,
      qes: 0.35, qms: 4.0, vas_m3: 8e-3,
      sd_m2: 83e-4, xmax_m: 4e-3,
    },
  },
  {
    name: 'Generic 8" Full-Range',
    description: 'Wide-band driver for transmission line enclosures',
    params: {
      fs_hz: 40, re_ohm: 8.0, le_h: 0.6e-3,
      qes: 0.38, qms: 4.5, vas_m3: 35e-3,
      sd_m2: 214e-4, xmax_m: 5e-3,
    },
  },
  {
    name: 'Generic 12" PA Woofer',
    description: 'High-sensitivity woofer for horn-loaded or vented PA cabs',
    params: {
      fs_hz: 45, re_ohm: 5.5, le_h: 0.8e-3,
      qes: 0.30, qms: 8.0, vas_m3: 120e-3,
      sd_m2: 480e-4, xmax_m: 5e-3,
    },
  },
];
