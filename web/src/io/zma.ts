/**
 * ZMA (impedance measurement) format — standard DIY audio format.
 * Used by Hornresp, XSim, VituixCAD, DATS, etc.
 *
 * Format: whitespace-separated, one measurement per line
 *   frequency_hz  impedance_ohm  phase_deg
 * Comment lines start with * or !
 */

export interface ZmaData {
  frequencies: number[];
  impedance_ohm: number[];
  phase_deg: number[];
}

export function parseZma(text: string): ZmaData {
  const frequencies: number[] = [];
  const impedance_ohm: number[] = [];
  const phase_deg: number[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('*') || trimmed.startsWith('!')) continue;
    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.length >= 2 && parts.every((n) => !isNaN(n))) {
      frequencies.push(parts[0]);
      impedance_ohm.push(parts[1]);
      phase_deg.push(parts.length >= 3 ? parts[2] : 0);
    }
  }
  return { frequencies, impedance_ohm, phase_deg };
}

export function writeZma(data: ZmaData): string {
  const lines = ['* Impedance Data — exported from ls.graf.me.uk'];
  for (let i = 0; i < data.frequencies.length; i++) {
    lines.push(
      `${data.frequencies[i].toFixed(2)}\t${data.impedance_ohm[i].toFixed(3)}\t${data.phase_deg[i].toFixed(3)}`
    );
  }
  return lines.join('\n');
}
