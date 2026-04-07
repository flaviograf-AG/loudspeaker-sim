import type { ReactElement } from 'react';
import type { EnclosureConfig } from '../types';

interface Props {
  config: EnclosureConfig;
  driverSd?: number; // m²
}

const W = 280;
const H = 160;

function boxRect(x: number, y: number, w: number, h: number, label?: string) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#f5f0e8" stroke="#333" strokeWidth={1.5} rx={2} />
      {label && <text x={x + w / 2} y={y + h + 12} fontSize={8} textAnchor="middle" fill="#666">{label}</text>}
    </g>
  );
}

function driverSymbol(x: number, y: number, size: number) {
  // Cone shape pointing right
  const half = size / 2;
  return (
    <g>
      <rect x={x - 2} y={y - half} width={4} height={size} fill="#555" stroke="#333" strokeWidth={1} />
      <line x1={x + 2} y1={y - half} x2={x + 12} y2={y - half * 1.3} stroke="#333" strokeWidth={1.5} />
      <line x1={x + 2} y1={y + half} x2={x + 12} y2={y + half * 1.3} stroke="#333" strokeWidth={1.5} />
      <line x1={x + 12} y1={y - half * 1.3} x2={x + 12} y2={y + half * 1.3} stroke="#333" strokeWidth={1} />
    </g>
  );
}

function portTube(x: number, y: number, length: number, diameter: number) {
  const half = diameter / 2;
  return (
    <g>
      <rect x={x} y={y - half} width={length} height={diameter} fill="none" stroke="#2980b9" strokeWidth={1.5} />
      <text x={x + length / 2} y={y + half + 10} fontSize={7} textAnchor="middle" fill="#2980b9">port</text>
    </g>
  );
}

export function EnclosureSchematic({ config, driverSd }: Props) {
  const sd = driverSd || 132e-4;
  const driverSize = Math.min(40, Math.sqrt(sd * 1e4) * 3);

  if (config.type === 'Sealed') {
    const boxW = Math.min(100, Math.max(50, config.volume_m3 * 4000));
    const boxH = Math.min(100, Math.max(40, boxW * 0.8));
    const bx = (W - boxW) / 2;
    const by = (H - boxH) / 2;
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minHeight: 80, background: '#fafafa', borderRadius: 4, border: '1px solid var(--graf-warm-200)' }}>
        {boxRect(bx, by, boxW, boxH, `${(config.volume_m3 * 1000).toFixed(1)}L`)}
        {driverSymbol(bx, by + boxH / 2, driverSize)}
        <text x={bx + boxW / 2} y={by - 5} fontSize={9} textAnchor="middle" fill="#333">Sealed Box</text>
      </svg>
    );
  }

  if (config.type === 'Vented') {
    const boxW = Math.min(110, Math.max(50, config.volume_m3 * 3500));
    const boxH = Math.min(100, Math.max(40, boxW * 0.8));
    const bx = (W - boxW) / 2;
    const by = (H - boxH) / 2;
    const portLen = Math.min(boxW * 0.6, config.port_length_m * 300);
    const portDia = Math.min(15, Math.sqrt(config.port_area_m2 * 1e4) * 2);
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minHeight: 80, background: '#fafafa', borderRadius: 4, border: '1px solid var(--graf-warm-200)' }}>
        {boxRect(bx, by, boxW, boxH, `${(config.volume_m3 * 1000).toFixed(1)}L`)}
        {driverSymbol(bx, by + boxH * 0.35, driverSize)}
        {portTube(bx + boxW - portLen, by + boxH * 0.7, portLen + 10, portDia)}
        <text x={bx + boxW / 2} y={by - 5} fontSize={9} textAnchor="middle" fill="#333">Vented Box</text>
      </svg>
    );
  }

  if (config.type === 'TransmissionLine') {
    // Folded pipe: driver at left wall firing left (toward listener),
    // pipe extends to the right and folds downward, mouth at pipe end.
    const pipeW = 170;
    const pipeH = 20;
    const folds = Math.max(1, config.num_folds || 1);
    const foldH = Math.min(100, 90 / folds);
    const startX = 55;
    const startY = 22;
    const segments: ReactElement[] = [];

    for (let i = 0; i < Math.min(folds + 1, 4); i++) {
      const y = startY + i * (foldH + 5);
      const x = i % 2 === 0 ? startX : startX + pipeW - 60;
      const w = i % 2 === 0 ? pipeW : -pipeW + 60;
      segments.push(
        <rect key={`seg${i}`} x={Math.min(x, x + w)} y={y} width={Math.abs(w)} height={pipeH}
          fill="#e8f4f8" stroke="#00809E" strokeWidth={1} rx={2} />
      );
      if (config.stuffing_density_kg_m3 > 0) {
        segments.push(
          <rect key={`stuff${i}`} x={Math.min(x, x + w) + 2} y={y + 2} width={Math.abs(w) - 4} height={pipeH - 4}
            fill="#ddd" fillOpacity={0.3 + config.stuffing_density_kg_m3 * 0.03} rx={1} />
        );
      }
    }

    // Driver at left wall of first segment, cone pointing LEFT (toward listener)
    const driverPos = config.driver_position || 0;
    const driverX = startX + driverPos * pipeW;

    // Mouth position: end of last segment
    const lastFold = Math.min(folds, 3);
    const mouthY = startY + lastFold * (foldH + 5) + pipeH / 2;
    const mouthX = lastFold % 2 === 0 ? startX + pipeW : startX;
    const mouthArrow = lastFold % 2 === 0 ? '→' : '←';

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minHeight: 80, background: '#fafafa', borderRadius: 4, border: '1px solid var(--graf-warm-200)' }}>
        {segments}
        {/* Driver: cone faces left (toward listener), shown as mirrored symbol */}
        <g transform={`translate(${driverX}, ${startY + pipeH / 2}) scale(-1,1)`}>
          {driverSymbol(0, 0, Math.min(pipeH, driverSize))}
        </g>
        {/* Arrow showing front radiation direction */}
        <text x={driverX - 18} y={startY + pipeH / 2 + 3} fontSize={8} fill="#333" textAnchor="end">← front</text>
        {/* Mouth label at pipe terminus */}
        <text x={mouthX + (lastFold % 2 === 0 ? 5 : -5)} y={mouthY + 3}
          fontSize={8} fill="#00809E" textAnchor={lastFold % 2 === 0 ? 'start' : 'end'}>
          {mouthArrow} mouth
        </text>
        <text x={W / 2} y={H - 5} fontSize={9} textAnchor="middle" fill="#333">
          T-Line {(config.length_m * 100).toFixed(0)}cm {config.num_folds > 0 ? ` (${config.num_folds} folds)` : ''}
        </text>
      </svg>
    );
  }

  if (config.type === 'Horn') {
    // Draw horn profile from segments
    const totalLen = config.segments.reduce((sum, s) => sum + s.length_m, 0);
    const scaleX = 200 / totalLen;
    const maxArea = Math.max(...config.segments.map(s => Math.max(s.area_start_m2, s.area_end_m2)));
    const scaleY = 50 / Math.sqrt(maxArea * 1e4);
    const startX = 40;
    const midY = H / 2;

    const points: string[] = [];
    const pointsBot: string[] = [];
    let x = startX;

    for (const seg of config.segments) {
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const segX = x + seg.length_m * scaleX * frac;
        // Approximate area at this position
        const area = seg.area_start_m2 + (seg.area_end_m2 - seg.area_start_m2) * frac;
        const halfH = Math.sqrt(area * 1e4) * scaleY / 2;
        points.push(`${segX.toFixed(1)},${(midY - halfH).toFixed(1)}`);
        pointsBot.unshift(`${segX.toFixed(1)},${(midY + halfH).toFixed(1)}`);
      }
      x += seg.length_m * scaleX;
    }

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minHeight: 80, background: '#fafafa', borderRadius: 4, border: '1px solid var(--graf-warm-200)' }}>
        <polygon points={[...points, ...pointsBot].join(' ')} fill="#f0e8d8" stroke="#c0392b" strokeWidth={1.5} />
        {driverSymbol(startX - 5, midY, driverSize * 0.6)}
        <text x={W / 2} y={H - 5} fontSize={9} textAnchor="middle" fill="#333">
          Horn ({config.segments.length} seg, {(totalLen * 100).toFixed(0)}cm)
        </text>
        <text x={startX - 15} y={midY - 20} fontSize={7} fill="#666">throat</text>
        <text x={x + 5} y={midY - 15} fontSize={7} fill="#666">mouth</text>
      </svg>
    );
  }

  if (config.type === 'Bandpass') {
    const rearW = Math.min(60, Math.max(30, config.rear_volume_m3 * 3000));
    const frontW = Math.min(60, Math.max(30, config.front_volume_m3 * 3000));
    const boxH = 70;
    const bx = (W - rearW - frontW - 20) / 2;
    const by = (H - boxH) / 2;
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minHeight: 80, background: '#fafafa', borderRadius: 4, border: '1px solid var(--graf-warm-200)' }}>
        {boxRect(bx, by, rearW, boxH, 'rear')}
        {driverSymbol(bx + rearW, by + boxH / 2, driverSize * 0.7)}
        {boxRect(bx + rearW + 20, by, frontW, boxH, 'front')}
        {portTube(bx + rearW + 20 + frontW - 15, by + boxH * 0.7, 25, 8)}
        <text x={W / 2} y={by - 5} fontSize={9} textAnchor="middle" fill="#333">Bandpass (4th order)</text>
      </svg>
    );
  }

  if (config.type === 'OpenBaffle') {
    const baffleW = Math.min(150, config.width_m * 300);
    const baffleH = Math.min(120, config.height_m * 150);
    const bx = (W - baffleW) / 2;
    const by = (H - baffleH) / 2;
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minHeight: 80, background: '#fafafa', borderRadius: 4, border: '1px solid var(--graf-warm-200)' }}>
        <line x1={bx} y1={by} x2={bx} y2={by + baffleH} stroke="#333" strokeWidth={3} />
        <line x1={bx} y1={by} x2={bx + baffleW} y2={by} stroke="#333" strokeWidth={3} />
        <line x1={bx + baffleW} y1={by} x2={bx + baffleW} y2={by + baffleH} stroke="#333" strokeWidth={3} />
        {driverSymbol(bx + baffleW * 0.4, by + baffleH * 0.4, driverSize)}
        <text x={bx - 15} y={by + baffleH / 2} fontSize={7} fill="#666" transform={`rotate(-90,${bx - 15},${by + baffleH / 2})`}>back</text>
        <text x={bx + baffleW + 20} y={by + baffleH / 2} fontSize={7} fill="#666" transform={`rotate(-90,${bx + baffleW + 20},${by + baffleH / 2})`}>front</text>
        <text x={W / 2} y={H - 5} fontSize={9} textAnchor="middle" fill="#333">Open Baffle {(config.width_m * 100).toFixed(0)}×{(config.height_m * 100).toFixed(0)}cm</text>
      </svg>
    );
  }

  if (config.type === 'PassiveRadiator') {
    const boxW = Math.min(100, Math.max(50, config.volume_m3 * 4000));
    const boxH = Math.min(100, Math.max(40, boxW * 0.8));
    const bx = (W - boxW) / 2;
    const by = (H - boxH) / 2;
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minHeight: 80, background: '#fafafa', borderRadius: 4, border: '1px solid var(--graf-warm-200)' }}>
        {boxRect(bx, by, boxW, boxH, `${(config.volume_m3 * 1000).toFixed(1)}L`)}
        {driverSymbol(bx, by + boxH * 0.35, driverSize)}
        {/* PR symbol — similar to driver but with weight */}
        <g transform={`translate(${bx + boxW}, ${by + boxH * 0.65})`}>
          <rect x={-2} y={-10} width={4} height={20} fill="#8e44ad" stroke="#333" strokeWidth={1} />
          <rect x={-8} y={-6} width={16} height={12} fill="#8e44ad" fillOpacity={0.3} stroke="#8e44ad" strokeWidth={1} rx={2} />
          <text x={0} y={18} fontSize={7} textAnchor="middle" fill="#8e44ad">PR</text>
        </g>
        <text x={bx + boxW / 2} y={by - 5} fontSize={9} textAnchor="middle" fill="#333">Passive Radiator</text>
      </svg>
    );
  }

  return null;
}
