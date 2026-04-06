import type { SimulationResult } from '../types';
import { writeFrd } from '../io/frd';
import { writeZma } from '../io/zma';
import { writeAllDataCsv } from '../io/csv';

interface Props {
  result: SimulationResult | null;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportControls({ result }: Props) {
  if (!result) return null;

  const handleFrd = () => {
    downloadFile(writeFrd({
      frequencies: result.frequencies_hz,
      spl_db: result.spl_db,
      phase_deg: result.frequencies_hz.map(() => 0),
    }), 'simulation.frd', 'text/plain');
  };

  const handleZma = () => {
    downloadFile(writeZma({
      frequencies: result.frequencies_hz,
      impedance_ohm: result.impedance_ohm,
      phase_deg: result.impedance_phase_deg,
    }), 'simulation.zma', 'text/plain');
  };

  const handleCsv = () => {
    downloadFile(writeAllDataCsv(result), 'simulation.csv', 'text/csv');
  };

  return (
    <div className="section-card">
      <div className="section-title">Export</div>
      <div className="btn-row">
        <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={handleFrd}>FRD (SPL)</button>
        <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={handleZma}>ZMA (Z)</button>
        <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={handleCsv}>CSV (all)</button>
      </div>
    </div>
  );
}
