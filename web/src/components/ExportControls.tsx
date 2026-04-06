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

  const btnStyle: React.CSSProperties = {
    fontSize: 12, padding: '3px 8px', cursor: 'pointer',
  };

  const handleFrd = () => {
    const data = writeFrd({
      frequencies: result.frequencies_hz,
      spl_db: result.spl_db,
      phase_deg: result.frequencies_hz.map(() => 0), // phase not tracked in v0.1
    });
    downloadFile(data, 'simulation.frd', 'text/plain');
  };

  const handleZma = () => {
    const data = writeZma({
      frequencies: result.frequencies_hz,
      impedance_ohm: result.impedance_ohm,
      phase_deg: result.impedance_phase_deg,
    });
    downloadFile(data, 'simulation.zma', 'text/plain');
  };

  const handleCsv = () => {
    downloadFile(writeAllDataCsv(result), 'simulation.csv', 'text/csv');
  };

  return (
    <fieldset style={{ border: '1px solid #ccc', padding: 8, marginBottom: 8 }}>
      <legend>Export</legend>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button style={btnStyle} onClick={handleFrd}>FRD (SPL)</button>
        <button style={btnStyle} onClick={handleZma}>ZMA (Z)</button>
        <button style={btnStyle} onClick={handleCsv}>CSV (all)</button>
      </div>
    </fieldset>
  );
}
