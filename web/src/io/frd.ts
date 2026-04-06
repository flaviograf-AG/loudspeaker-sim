/**
 * FRD (Frequency Response Data) format — standard DIY audio format.
 * Used by Hornresp, XSim, VituixCAD, REW, ARTA, etc.
 *
 * Format: whitespace-separated, one measurement per line
 *   frequency_hz  spl_db  phase_deg
 * Comment lines start with * or !
 */

export interface FrdData {
  frequencies: number[];
  spl_db: number[];
  phase_deg: number[];
}

export function parseFrd(text: string): FrdData {
  const frequencies: number[] = [];
  const spl_db: number[] = [];
  const phase_deg: number[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('*') || trimmed.startsWith('!')) continue;
    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.length >= 2 && parts.every((n) => !isNaN(n))) {
      frequencies.push(parts[0]);
      spl_db.push(parts[1]);
      phase_deg.push(parts.length >= 3 ? parts[2] : 0);
    }
  }
  return { frequencies, spl_db, phase_deg };
}

export function writeFrd(data: FrdData): string {
  const lines = ['* Frequency Response Data — exported from ls.graf.me.uk'];
  for (let i = 0; i < data.frequencies.length; i++) {
    lines.push(
      `${data.frequencies[i].toFixed(2)}\t${data.spl_db[i].toFixed(3)}\t${data.phase_deg[i].toFixed(3)}`
    );
  }
  return lines.join('\n');
}
