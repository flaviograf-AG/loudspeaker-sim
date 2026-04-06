import type { ReactElement } from 'react';
import type { PassiveFilter } from '../types';

interface Props {
  filters: PassiveFilter[];
  driverRe?: number;
}

const W = 500;
const H = 120;
const Y_TOP = 25;
const Y_BOT = 95;
const Y_MID = (Y_TOP + Y_BOT) / 2;
const COMP_W = 40;

function drawInductor(x: number, y: number, label: string): ReactElement {
  // Coil symbol (3 humps)
  const d = `M${x},${y} c3,-8 9,-8 12,0 c3,8 9,8 12,0 c3,-8 9,-8 12,0`;
  return <g key={`L${x}${y}`}>
    <path d={d} fill="none" stroke="#c0392b" strokeWidth={1.5} />
    <text x={x + 18} y={y - 10} fontSize={8} textAnchor="middle" fill="#333">{label}</text>
  </g>;
}

function drawCapacitor(x: number, y: number, label: string): ReactElement {
  return <g key={`C${x}${y}`}>
    <line x1={x} y1={y} x2={x + 15} y2={y} stroke="#2980b9" strokeWidth={1.5} />
    <line x1={x + 15} y1={y - 8} x2={x + 15} y2={y + 8} stroke="#2980b9" strokeWidth={2} />
    <line x1={x + 21} y1={y - 8} x2={x + 21} y2={y + 8} stroke="#2980b9" strokeWidth={2} />
    <line x1={x + 21} y1={y} x2={x + 36} y2={y} stroke="#2980b9" strokeWidth={1.5} />
    <text x={x + 18} y={y - 10} fontSize={8} textAnchor="middle" fill="#333">{label}</text>
  </g>;
}

function drawResistor(x: number, y: number, label: string): ReactElement {
  const d = `M${x},${y} l4,-6 8,12 8,-12 8,12 8,-12 4,6`;
  return <g key={`R${x}${y}`}>
    <path d={d} fill="none" stroke="#27ae60" strokeWidth={1.5} />
    <text x={x + 20} y={y - 10} fontSize={8} textAnchor="middle" fill="#333">{label}</text>
  </g>;
}

function fmtL(h: number): string { return h >= 1e-3 ? `${(h * 1e3).toFixed(2)}mH` : `${(h * 1e6).toFixed(0)}µH`; }
function fmtC(f: number): string { return f >= 1e-6 ? `${(f * 1e6).toFixed(1)}µF` : `${(f * 1e9).toFixed(0)}nF`; }
function fmtR(r: number): string { return `${r.toFixed(1)}Ω`; }

export function CrossoverSchematic({ filters, driverRe }: Props) {
  if (filters.length === 0) return null;

  const elements: ReactElement[] = [];
  let x = 30; // current position along the signal path

  // Input terminal
  elements.push(
    <text key="in" x={5} y={Y_MID + 4} fontSize={9} fill="#666">AMP</text>
  );
  elements.push(
    <line key="in-wire" x1={25} y1={Y_MID} x2={x} y2={Y_MID} stroke="#333" strokeWidth={1} />
  );

  // Ground bus at bottom
  elements.push(
    <line key="gnd" x1={25} y1={Y_BOT} x2={W - 25} y2={Y_BOT} stroke="#999" strokeWidth={0.5} strokeDasharray="4,2" />
  );
  elements.push(
    <text key="gnd-label" x={W / 2} y={Y_BOT + 12} fontSize={8} textAnchor="middle" fill="#999">GND</text>
  );

  for (const pf of filters) {
    if (pf.type === 'SeriesL') {
      elements.push(drawInductor(x, Y_MID, fmtL(pf.henries)));
      elements.push(<line key={`w${x}`} x1={x + 36} y1={Y_MID} x2={x + COMP_W + 10} y2={Y_MID} stroke="#333" strokeWidth={1} />);
      x += COMP_W + 10;
    } else if (pf.type === 'SeriesC') {
      elements.push(drawCapacitor(x, Y_MID, fmtC(pf.farads)));
      elements.push(<line key={`w${x}`} x1={x + 36} y1={Y_MID} x2={x + COMP_W + 10} y2={Y_MID} stroke="#333" strokeWidth={1} />);
      x += COMP_W + 10;
    } else if (pf.type === 'SeriesR') {
      elements.push(drawResistor(x, Y_MID, fmtR(pf.ohms)));
      elements.push(<line key={`w${x}`} x1={x + 40} y1={Y_MID} x2={x + COMP_W + 10} y2={Y_MID} stroke="#333" strokeWidth={1} />);
      x += COMP_W + 10;
    } else if (pf.type === 'ShuntC') {
      // Vertical cap to ground
      elements.push(<line key={`jn${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 5} stroke="#333" strokeWidth={1} />);
      elements.push(drawCapacitor(x - 18, Y_MID + 20, fmtC(pf.farads)));
      // Rotate: draw vertical
      elements.push(
        <g key={`vc${x}`} transform={`translate(${x},${Y_MID + 8}) rotate(90)`}>
          <line x1={0} y1={0} x2={10} y2={0} stroke="#2980b9" strokeWidth={1.5} />
          <line x1={10} y1={-6} x2={10} y2={6} stroke="#2980b9" strokeWidth={2} />
          <line x1={14} y1={-6} x2={14} y2={6} stroke="#2980b9" strokeWidth={2} />
          <line x1={14} y1={0} x2={24} y2={0} stroke="#2980b9" strokeWidth={1.5} />
        </g>
      );
      elements.push(<text key={`vct${x}`} x={x + 10} y={Y_MID + 22} fontSize={7} fill="#333">{fmtC(pf.farads)}</text>);
      elements.push(<line key={`vg${x}`} x1={x} y1={Y_MID + 32} x2={x} y2={Y_BOT} stroke="#999" strokeWidth={0.5} />);
      // Continue signal path
      elements.push(<line key={`ws${x}`} x1={x} y1={Y_MID} x2={x + 15} y2={Y_MID} stroke="#333" strokeWidth={1} />);
      x += 15;
    } else if (pf.type === 'ShuntL') {
      elements.push(<line key={`jn${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 5} stroke="#333" strokeWidth={1} />);
      elements.push(
        <g key={`vl${x}`} transform={`translate(${x},${Y_MID + 8}) rotate(90)`}>
          <path d={`M0,0 c2,-6 6,-6 8,0 c2,6 6,6 8,0 c2,-6 6,-6 8,0`} fill="none" stroke="#c0392b" strokeWidth={1.5} />
        </g>
      );
      elements.push(<text key={`vlt${x}`} x={x + 10} y={Y_MID + 22} fontSize={7} fill="#333">{fmtL(pf.henries)}</text>);
      elements.push(<line key={`vg${x}`} x1={x} y1={Y_MID + 32} x2={x} y2={Y_BOT} stroke="#999" strokeWidth={0.5} />);
      elements.push(<line key={`ws${x}`} x1={x} y1={Y_MID} x2={x + 15} y2={Y_MID} stroke="#333" strokeWidth={1} />);
      x += 15;
    } else if (pf.type === 'ShuntR') {
      elements.push(<line key={`jn${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 5} stroke="#333" strokeWidth={1} />);
      elements.push(
        <g key={`vr${x}`} transform={`translate(${x},${Y_MID + 8}) rotate(90)`}>
          <path d={`M0,0 l3,-4 6,8 6,-8 6,8 6,-8 3,4`} fill="none" stroke="#27ae60" strokeWidth={1.5} />
        </g>
      );
      elements.push(<text key={`vrt${x}`} x={x + 10} y={Y_MID + 22} fontSize={7} fill="#333">{fmtR(pf.ohms)}</text>);
      elements.push(<line key={`vg${x}`} x1={x} y1={Y_MID + 32} x2={x} y2={Y_BOT} stroke="#999" strokeWidth={0.5} />);
      elements.push(<line key={`ws${x}`} x1={x} y1={Y_MID} x2={x + 15} y2={Y_MID} stroke="#333" strokeWidth={1} />);
      x += 15;
    } else if (pf.type === 'ZobelShunt') {
      elements.push(<line key={`jn${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 5} stroke="#333" strokeWidth={1} />);
      elements.push(<text key={`zt${x}`} x={x + 8} y={Y_MID + 18} fontSize={7} fill="#333">Z</text>);
      elements.push(<text key={`zv${x}`} x={x + 8} y={Y_MID + 27} fontSize={6} fill="#666">{fmtR(pf.ohms)}+{fmtC(pf.farads)}</text>);
      elements.push(<rect key={`zb${x}`} x={x - 5} y={Y_MID + 8} width={25} height={24} rx={3} fill="none" stroke="#8e44ad" strokeWidth={1} />);
      elements.push(<line key={`vg${x}`} x1={x} y1={Y_MID + 32} x2={x} y2={Y_BOT} stroke="#999" strokeWidth={0.5} />);
      elements.push(<line key={`ws${x}`} x1={x} y1={Y_MID} x2={x + 15} y2={Y_MID} stroke="#333" strokeWidth={1} />);
      x += 15;
    } else if (pf.type === 'LPad') {
      elements.push(drawResistor(x, Y_MID, `${fmtR(pf.series_ohms)}ser`));
      x += COMP_W + 5;
      elements.push(<line key={`jn${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 5} stroke="#333" strokeWidth={1} />);
      elements.push(<text key={`lpt${x}`} x={x + 8} y={Y_MID + 20} fontSize={7} fill="#333">{fmtR(pf.shunt_ohms)}</text>);
      elements.push(<line key={`vg${x}`} x1={x} y1={Y_MID + 25} x2={x} y2={Y_BOT} stroke="#999" strokeWidth={0.5} />);
      elements.push(<line key={`ws${x}`} x1={x} y1={Y_MID} x2={x + 15} y2={Y_MID} stroke="#333" strokeWidth={1} />);
      x += 15;
    } else if (pf.type === 'NotchShunt' || pf.type === 'NotchSeries') {
      elements.push(<line key={`jn${x}`} x1={x} y1={Y_MID} x2={x} y2={Y_MID + 5} stroke="#333" strokeWidth={1} />);
      elements.push(<text key={`nt${x}`} x={x + 8} y={Y_MID + 18} fontSize={7} fill="#333">N</text>);
      elements.push(<rect key={`nb${x}`} x={x - 5} y={Y_MID + 8} width={25} height={20} rx={3} fill="none" stroke="#e67e22" strokeWidth={1} />);
      elements.push(<line key={`vg${x}`} x1={x} y1={Y_MID + 28} x2={x} y2={Y_BOT} stroke="#999" strokeWidth={0.5} />);
      elements.push(<line key={`ws${x}`} x1={x} y1={Y_MID} x2={x + 15} y2={Y_MID} stroke="#333" strokeWidth={1} />);
      x += 15;
    }
  }

  // Driver load (speaker symbol)
  const drvX = Math.min(x + 10, W - 50);
  elements.push(<line key="drv-wire" x1={x} y1={Y_MID} x2={drvX} y2={Y_MID} stroke="#333" strokeWidth={1} />);
  // Speaker symbol
  elements.push(
    <g key="spk" transform={`translate(${drvX},${Y_MID - 12})`}>
      <rect x={0} y={4} width={10} height={16} fill="none" stroke="#333" strokeWidth={1.5} />
      <polygon points="10,0 24,0 24,24 10,24" fill="none" stroke="#333" strokeWidth={1.5} />
      <text x={12} y={36} fontSize={8} fill="#666">{driverRe ? `${driverRe}Ω` : 'Driver'}</text>
    </g>
  );
  // Driver to ground
  elements.push(<line key="drv-gnd" x1={drvX + 5} y1={Y_MID + 12} x2={drvX + 5} y2={Y_BOT} stroke="#999" strokeWidth={0.5} />);

  const viewW = Math.max(drvX + 60, W);

  return (
    <div style={{ overflowX: 'auto', marginTop: 4 }}>
      <svg width="100%" viewBox={`0 0 ${viewW} ${H}`} style={{ minHeight: 100, background: '#fafafa', borderRadius: 4, border: '1px solid var(--graf-warm-200)' }}>
        {elements}
      </svg>
    </div>
  );
}
