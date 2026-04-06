import type { WayInput, ActiveFilter } from '../types';

interface Props {
  ways: WayInput[];
  sampleRate?: number;
}

// Compute biquad coefficients client-side (matches Rust crossover::filter_to_biquad)
function filterToBiquad(filter: ActiveFilter, fs: number): { b0: number; b1: number; b2: number; a1: number; a2: number }[] {
  const PI2 = 2 * Math.PI;

  function lp2(fc: number, q: number) {
    const w0 = PI2 * fc / fs, alpha = Math.sin(w0) / (2 * q), cos_w0 = Math.cos(w0);
    const b0 = (1 - cos_w0) / 2, b1 = 1 - cos_w0, b2 = (1 - cos_w0) / 2;
    const a0 = 1 + alpha, a1 = -2 * cos_w0, a2 = 1 - alpha;
    return [{ b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }];
  }
  function hp2(fc: number, q: number) {
    const w0 = PI2 * fc / fs, alpha = Math.sin(w0) / (2 * q), cos_w0 = Math.cos(w0);
    const b0 = (1 + cos_w0) / 2, b1 = -(1 + cos_w0), b2 = (1 + cos_w0) / 2;
    const a0 = 1 + alpha, a1 = -2 * cos_w0, a2 = 1 - alpha;
    return [{ b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }];
  }
  function peq(fc: number, q: number, gain_db: number) {
    const a = Math.pow(10, gain_db / 40);
    const w0 = PI2 * fc / fs, alpha = Math.sin(w0) / (2 * q), cos_w0 = Math.cos(w0);
    const b0 = 1 + alpha * a, b1 = -2 * cos_w0, b2 = 1 - alpha * a;
    const a0 = 1 + alpha / a, a1 = -2 * cos_w0, a2 = 1 - alpha / a;
    return [{ b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }];
  }

  switch (filter.type) {
    case 'LowPass1': return lp2(filter.freq_hz, 0.5);
    case 'HighPass1': return hp2(filter.freq_hz, 0.5);
    case 'LowPass2': return lp2(filter.freq_hz, filter.q);
    case 'HighPass2': return hp2(filter.freq_hz, filter.q);
    case 'LR4LowPass': { const bq = lp2(filter.freq_hz, Math.SQRT1_2); return [bq[0], bq[0]]; }
    case 'LR4HighPass': { const bq = hp2(filter.freq_hz, Math.SQRT1_2); return [bq[0], bq[0]]; }
    case 'LR2LowPass': return lp2(filter.freq_hz, 0.5);
    case 'LR2HighPass': return hp2(filter.freq_hz, 0.5);
    case 'PEQ': return peq(filter.freq_hz, filter.q, filter.gain_db);
    case 'Gain': return [{ b0: Math.pow(10, filter.db / 20), b1: 0, b2: 0, a1: 0, a2: 0 }];
    case 'Invert': return [{ b0: -1, b1: 0, b2: 0, a1: 0, a2: 0 }];
    default: return [{ b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }];
  }
}

export function BiquadExport({ ways, sampleRate = 48000 }: Props) {
  const handleExport = () => {
    const lines: string[] = [
      `# Biquad Coefficients — LS Graf Simulator`,
      `# Sample rate: ${sampleRate} Hz`,
      `# Format: b0, b1, b2, a1, a2 (miniDSP Advanced compatible)`,
      `# H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 + a1*z^-1 + a2*z^-2)`,
      ``,
    ];

    for (const way of ways) {
      if (!way.enabled || way.active_filters.length === 0) continue;
      lines.push(`## ${way.name}`);
      let section = 1;
      for (const filter of way.active_filters) {
        const biquads = filterToBiquad(filter, sampleRate);
        for (const bq of biquads) {
          lines.push(`# Section ${section} (${filter.type})`);
          lines.push(`b0 = ${bq.b0.toFixed(15)}`);
          lines.push(`b1 = ${bq.b1.toFixed(15)}`);
          lines.push(`b2 = ${bq.b2.toFixed(15)}`);
          lines.push(`a1 = ${bq.a1.toFixed(15)}`);
          lines.push(`a2 = ${bq.a2.toFixed(15)}`);
          lines.push(``);
          section++;
        }
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'biquad-coefficients.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = ways.some(w => w.enabled && w.active_filters.length > 0);
  if (!hasFilters) return null;

  return (
    <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={handleExport}
      title="Export digital biquad coefficients for miniDSP or other DSP platforms. Uses bilinear transform at 48kHz."
    >Export DSP Biquads</button>
  );
}
