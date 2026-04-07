import type { ReactElement } from 'react';
import type { PassiveFilter } from '../types';

interface Props {
  filters: PassiveFilter[];
  driverRe?: number;
}

const H = 160;
const Y_TOP = 20;
const Y_BOT = 135;
const Y_MID = 50;
const SERIES_W = 56;  // width of a series component + trailing wire
const SHUNT_GAP = 24; // horizontal space for a shunt branch

// --- Component drawing functions (IEC-style) ---

function drawInductor(x: number, y: number, label: string, vertical = false): ReactElement {
  // 4-hump sine-wave coil
  const w = 36;
  const amp = 6;
  const d = vertical
    ? `M${x},${y} c${amp},3 ${amp},9 0,12 c-${amp},3 -${amp},9 0,12 c${amp},3 ${amp},9 0,12`
    : `M${x},${y} c3,-${amp} 9,-${amp} 12,0 c3,${amp} 9,${amp} 12,0 c3,-${amp} 9,-${amp} 12,0`;
  const tx = vertical ? x + 12 : x + w / 2;
  const ty = vertical ? y + 18 : y - 12;
  return <g key={`L${x}${y}${vertical ? 'v' : ''}`}>
    <path d={d} fill="none" stroke="#c0392b" strokeWidth={1.8} />
    <text x={tx} y={ty} fontSize={10} textAnchor={vertical ? 'start' : 'middle'} fill="#333" fontWeight={500}>{label}</text>
  </g>;
}

function drawCapacitor(x: number, y: number, label: string, vertical = false): ReactElement {
  const gap = 5;
  const plateH = 10;
  const tx = vertical ? x + 14 : x + 18;
  const ty = vertical ? y + 14 : y - 12;
  if (vertical) {
    return <g key={`C${x}${y}v`}>
      <line x1={x} y1={y} x2={x} y2={y + 10} stroke="#2980b9" strokeWidth={1.5} />
      <line x1={x - plateH} y1={y + 10} x2={x + plateH} y2={y + 10} stroke="#2980b9" strokeWidth={2.5} />
      <line x1={x - plateH} y1={y + 10 + gap} x2={x + plateH} y2={y + 10 + gap} stroke="#2980b9" strokeWidth={2.5} />
      <line x1={x} y1={y + 10 + gap} x2={x} y2={y + 10 + gap + 10} stroke="#2980b9" strokeWidth={1.5} />
      <text x={tx} y={ty} fontSize={10} textAnchor="start" fill="#333" fontWeight={500}>{label}</text>
    </g>;
  }
  return <g key={`C${x}${y}`}>
    <line x1={x} y1={y} x2={x + 14} y2={y} stroke="#2980b9" strokeWidth={1.5} />
    <line x1={x + 14} y1={y - plateH} x2={x + 14} y2={y + plateH} stroke="#2980b9" strokeWidth={2.5} />
    <line x1={x + 14 + gap} y1={y - plateH} x2={x + 14 + gap} y2={y + plateH} stroke="#2980b9" strokeWidth={2.5} />
    <line x1={x + 14 + gap} y1={y} x2={x + 36} y2={y} stroke="#2980b9" strokeWidth={1.5} />
    <text x={tx} y={ty} fontSize={10} textAnchor="middle" fill="#333" fontWeight={500}>{label}</text>
  </g>;
}

function drawResistor(x: number, y: number, label: string, vertical = false): ReactElement {
  const tx = vertical ? x + 14 : x + 22;
  const ty = vertical ? y + 18 : y - 12;
  if (vertical) {
    const d = `M${x},${y} l-5,4 10,8 -10,8 10,8 -10,8 5,4`;
    return <g key={`R${x}${y}v`}>
      <path d={d} fill="none" stroke="#27ae60" strokeWidth={1.8} />
      <text x={tx} y={ty} fontSize={10} textAnchor="start" fill="#333" fontWeight={500}>{label}</text>
    </g>;
  }
  const d = `M${x},${y} l4,-5 8,10 8,-10 8,10 8,-10 8,10 4,-5`;
  return <g key={`R${x}${y}`}>
    <path d={d} fill="none" stroke="#27ae60" strokeWidth={1.8} />
    <text x={tx} y={ty} fontSize={10} textAnchor="middle" fill="#333" fontWeight={500}>{label}</text>
  </g>;
}

// Junction dot at T-junction
function dot(x: number, y: number): ReactElement {
  return <circle key={`dot${x}${y}`} cx={x} cy={y} r={2.5} fill="#333" />;
}

// Ground symbol (3 horizontal lines, decreasing width)
function groundSymbol(x: number, y: number): ReactElement {
  return <g key={`gnd${x}${y}`}>
    <line x1={x - 8} y1={y} x2={x + 8} y2={y} stroke="#666" strokeWidth={1.5} />
    <line x1={x - 5} y1={y + 4} x2={x + 5} y2={y + 4} stroke="#666" strokeWidth={1.5} />
    <line x1={x - 2} y1={y + 8} x2={x + 2} y2={y + 8} stroke="#666" strokeWidth={1.5} />
  </g>;
}

function fmtL(h: number): string { return h >= 1e-3 ? `${(h * 1e3).toFixed(2)} mH` : `${(h * 1e6).toFixed(0)} µH`; }
function fmtC(f: number): string { return f >= 1e-6 ? `${(f * 1e6).toFixed(1)} µF` : `${(f * 1e9).toFixed(0)} nF`; }
function fmtR(r: number): string { return `${r.toFixed(1)} Ω`; }

export function CrossoverSchematic({ filters, driverRe }: Props) {
  if (filters.length === 0) return null;

  const elements: ReactElement[] = [];
  let x = 40;

  // Input terminal label
  elements.push(
    <g key="input">
      <text x={8} y={Y_MID + 4} fontSize={11} fill="#666" fontWeight={600}>IN</text>
      <line x1={24} y1={Y_MID} x2={x} y2={Y_MID} stroke="#333" strokeWidth={1.2} />
    </g>
  );

  for (const pf of filters) {
    // --- Series components (horizontal, on signal path) ---
    if (pf.type === 'SeriesL') {
      elements.push(drawInductor(x + 4, Y_MID, fmtL(pf.henries)));
      elements.push(<line key={`w${x}`} x1={x + 40} y1={Y_MID} x2={x + SERIES_W} y2={Y_MID} stroke="#333" strokeWidth={1.2} />);
      x += SERIES_W;
    } else if (pf.type === 'SeriesC') {
      elements.push(drawCapacitor(x, Y_MID, fmtC(pf.farads)));
      elements.push(<line key={`w${x}`} x1={x + 36} y1={Y_MID} x2={x + SERIES_W} y2={Y_MID} stroke="#333" strokeWidth={1.2} />);
      x += SERIES_W;
    } else if (pf.type === 'SeriesR') {
      elements.push(drawResistor(x, Y_MID, fmtR(pf.ohms)));
      elements.push(<line key={`w${x}`} x1={x + 48} y1={Y_MID} x2={x + SERIES_W} y2={Y_MID} stroke="#333" strokeWidth={1.2} />);
      x += SERIES_W;

    // --- Shunt components (vertical, branching to ground) ---
    } else if (pf.type === 'ShuntC') {
      elements.push(dot(x, Y_MID));
      elements.push(<line key={`jn${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 8} stroke="#333" strokeWidth={1.2} />);
      elements.push(drawCapacitor(x, Y_MID + 8, fmtC(pf.farads), true));
      elements.push(<line key={`vg${x}`} x1={x} y1={Y_MID + 33} x2={x} y2={Y_BOT - 10} stroke="#666" strokeWidth={0.8} />);
      elements.push(groundSymbol(x, Y_BOT - 10));
      elements.push(<line key={`ws${x}`} x1={x} y1={Y_MID} x2={x + SHUNT_GAP} y2={Y_MID} stroke="#333" strokeWidth={1.2} />);
      x += SHUNT_GAP;

    } else if (pf.type === 'ShuntL') {
      elements.push(dot(x, Y_MID));
      elements.push(<line key={`jn${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 8} stroke="#333" strokeWidth={1.2} />);
      elements.push(drawInductor(x, Y_MID + 8, fmtL(pf.henries), true));
      elements.push(<line key={`vg${x}`} x1={x} y1={Y_MID + 44} x2={x} y2={Y_BOT - 10} stroke="#666" strokeWidth={0.8} />);
      elements.push(groundSymbol(x, Y_BOT - 10));
      elements.push(<line key={`ws${x}`} x1={x} y1={Y_MID} x2={x + SHUNT_GAP} y2={Y_MID} stroke="#333" strokeWidth={1.2} />);
      x += SHUNT_GAP;

    } else if (pf.type === 'ShuntR') {
      elements.push(dot(x, Y_MID));
      elements.push(<line key={`jn${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 6} stroke="#333" strokeWidth={1.2} />);
      elements.push(drawResistor(x, Y_MID + 6, fmtR(pf.ohms), true));
      elements.push(<line key={`vg${x}`} x1={x} y1={Y_MID + 46} x2={x} y2={Y_BOT - 10} stroke="#666" strokeWidth={0.8} />);
      elements.push(groundSymbol(x, Y_BOT - 10));
      elements.push(<line key={`ws${x}`} x1={x} y1={Y_MID} x2={x + SHUNT_GAP} y2={Y_MID} stroke="#333" strokeWidth={1.2} />);
      x += SHUNT_GAP;

    // --- L-Pad: series R then shunt R, proper circuit ---
    } else if (pf.type === 'LPad') {
      // Series resistor
      elements.push(drawResistor(x, Y_MID, `${fmtR(pf.series_ohms)}`));
      x += 52;
      // Junction + shunt resistor
      elements.push(dot(x, Y_MID));
      elements.push(<line key={`lj${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 6} stroke="#333" strokeWidth={1.2} />);
      elements.push(drawResistor(x, Y_MID + 6, `${fmtR(pf.shunt_ohms)}`, true));
      elements.push(<line key={`lg${x}`} x1={x} y1={Y_MID + 46} x2={x} y2={Y_BOT - 10} stroke="#666" strokeWidth={0.8} />);
      elements.push(groundSymbol(x, Y_BOT - 10));
      // "L-Pad" label
      elements.push(<text key={`lpl${x}`} x={x - 20} y={Y_TOP - 2} fontSize={9} textAnchor="middle" fill="#8e44ad" fontWeight={600}>L-PAD</text>);
      elements.push(<line key={`lw${x}`} x1={x} y1={Y_MID} x2={x + 16} y2={Y_MID} stroke="#333" strokeWidth={1.2} />);
      x += 16;

    // --- Zobel: R + C in series, shunted to ground ---
    } else if (pf.type === 'ZobelShunt') {
      elements.push(dot(x, Y_MID));
      elements.push(<line key={`zj${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 4} stroke="#333" strokeWidth={1.2} />);
      elements.push(drawResistor(x, Y_MID + 4, fmtR(pf.ohms), true));
      elements.push(drawCapacitor(x, Y_MID + 46, fmtC(pf.farads), true));
      elements.push(<line key={`zg${x}`} x1={x} y1={Y_MID + 71} x2={x} y2={Y_BOT - 10} stroke="#666" strokeWidth={0.8} />);
      elements.push(groundSymbol(x, Y_BOT - 10));
      elements.push(<text key={`zt${x}`} x={x + 16} y={Y_MID + 52} fontSize={9} fill="#8e44ad" fontWeight={600}>Zobel</text>);
      elements.push(<line key={`zw${x}`} x1={x} y1={Y_MID} x2={x + SHUNT_GAP} y2={Y_MID} stroke="#333" strokeWidth={1.2} />);
      x += SHUNT_GAP;

    // --- Notch filters: show RLC detail ---
    } else if (pf.type === 'NotchShunt' || pf.type === 'NotchSeries') {
      const isShunt = pf.type === 'NotchShunt';
      elements.push(dot(x, Y_MID));
      elements.push(<line key={`nj${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 4} stroke="#333" strokeWidth={1.2} />);
      // Draw R, L, C stacked vertically
      elements.push(drawResistor(x, Y_MID + 4, fmtR(pf.ohms), true));
      elements.push(drawInductor(x, Y_MID + 46, fmtL(pf.henries), true));
      elements.push(drawCapacitor(x, Y_MID + 82, fmtC(pf.farads), true));
      elements.push(<line key={`ng${x}`} x1={x} y1={Y_MID + 107} x2={x} y2={Y_BOT - 10} stroke="#666" strokeWidth={0.8} />);
      elements.push(groundSymbol(x, Y_BOT - 10));
      elements.push(<text key={`nt${x}`} x={x + 16} y={Y_TOP - 2} fontSize={9} fill="#e67e22" fontWeight={600}>{isShunt ? 'Notch∥' : 'Notch—'}</text>);
      elements.push(<line key={`nw${x}`} x1={x} y1={Y_MID} x2={x + SHUNT_GAP} y2={Y_MID} stroke="#333" strokeWidth={1.2} />);
      x += SHUNT_GAP;
    }
  }

  // --- Driver load (speaker symbol) ---
  const drvX = x + 12;
  elements.push(<line key="drv-wire" x1={x} y1={Y_MID} x2={drvX} y2={Y_MID} stroke="#333" strokeWidth={1.2} />);
  // Speaker: rectangle + cone polygon
  elements.push(
    <g key="spk" transform={`translate(${drvX},${Y_MID - 14})`}>
      <rect x={0} y={4} width={12} height={20} fill="#f5f0eb" stroke="#333" strokeWidth={1.8} rx={1} />
      <polygon points="12,0 28,0 28,28 12,28" fill="#f5f0eb" stroke="#333" strokeWidth={1.8} />
      <text x={14} y={42} fontSize={10} fill="#666" fontWeight={500}>{driverRe ? `${driverRe} Ω` : 'Driver'}</text>
    </g>
  );
  // Driver return to ground
  elements.push(<line key="drv-gnd" x1={drvX + 6} y1={Y_MID + 14} x2={drvX + 6} y2={Y_BOT - 10} stroke="#666" strokeWidth={0.8} />);
  elements.push(groundSymbol(drvX + 6, Y_BOT - 10));

  const viewW = Math.max(drvX + 70, 500);

  return (
    <div style={{ overflowX: 'auto', marginTop: 4 }}>
      <svg width="100%" viewBox={`0 0 ${viewW} ${H}`} style={{
        minHeight: 120,
        background: '#fafaf8',
        borderRadius: 6,
        border: '1px solid var(--graf-warm-200)',
      }}>
        {elements}
      </svg>
    </div>
  );
}
