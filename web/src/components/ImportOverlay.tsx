import { parseFrd, type FrdData } from '../io/frd';
import { parseZma, type ZmaData } from '../io/zma';

export interface OverlayData {
  frd: FrdData | null;
  zma: ZmaData | null;
}

interface Props {
  overlay: OverlayData;
  onChange: (overlay: OverlayData) => void;
}

function loadFile(accept: string, onLoad: (text: string) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(reader.result as string);
    reader.readAsText(file);
  };
  input.click();
}

export function ImportOverlay({ overlay, onChange }: Props) {
  return (
    <div className="section-card">
      <div className="section-title">Import Overlay</div>
      <div className="btn-row">
        <button className="graf-btn graf-btn-sm graf-btn-outline"
          title="Import FRD file (frequency response) — overlays on SPL plot as dashed trace"
          onClick={() => loadFile('.frd,.txt', (text) => {
            const frd = parseFrd(text);
            if (frd.frequencies.length > 0) onChange({ ...overlay, frd });
          })}
        >
          {overlay.frd ? `FRD (${overlay.frd.frequencies.length}pts)` : 'Import FRD'}
        </button>
        <button className="graf-btn graf-btn-sm graf-btn-outline"
          title="Import ZMA file (impedance) — overlays on impedance plot as dashed trace"
          onClick={() => loadFile('.zma,.txt', (text) => {
            const zma = parseZma(text);
            if (zma.frequencies.length > 0) onChange({ ...overlay, zma });
          })}
        >
          {overlay.zma ? `ZMA (${overlay.zma.frequencies.length}pts)` : 'Import ZMA'}
        </button>
        {(overlay.frd || overlay.zma) && (
          <button className="graf-btn graf-btn-sm"
            title="Clear all imported overlays"
            onClick={() => onChange({ frd: null, zma: null })}
            style={{ color: 'var(--graf-danger)' }}
          >Clear</button>
        )}
      </div>
    </div>
  );
}
