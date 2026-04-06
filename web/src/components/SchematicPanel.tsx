import { useState } from 'react';
import type { EnclosureConfig, PassiveFilter } from '../types';
import { EnclosureSchematic } from './EnclosureSchematic';
import { CrossoverSchematic } from './CrossoverSchematic';

interface Props {
  enclosureConfig?: EnclosureConfig;
  driverSd?: number;
  passiveFilters?: PassiveFilter[];
  driverRe?: number;
}

export function SchematicPanel({ enclosureConfig, driverSd, passiveFilters, driverRe }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasEnclosure = !!enclosureConfig;
  const hasFilters = passiveFilters && passiveFilters.length > 0;

  if (!hasEnclosure && !hasFilters) return null;

  return (
    <div style={{
      borderTop: '1px solid var(--graf-border, #e8e4dc)',
      background: 'var(--graf-surface, #fff)',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', padding: '6px 16px', border: 'none', background: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13, color: 'var(--graf-primary, #00809E)', fontWeight: 600,
        }}
        title={expanded ? 'Collapse schematics panel' : 'Expand schematics panel'}
      >
        <span style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▲</span>
        Schematics
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {hasEnclosure && (
            <div style={{ flex: '1 1 300px', minWidth: 280 }}>
              <div style={{ fontSize: 11, color: 'var(--graf-warm-500)', marginBottom: 4, fontWeight: 600 }}>ENCLOSURE</div>
              <EnclosureSchematic config={enclosureConfig!} driverSd={driverSd} />
            </div>
          )}
          {hasFilters && (
            <div style={{ flex: '1 1 400px', minWidth: 300 }}>
              <div style={{ fontSize: 11, color: 'var(--graf-warm-500)', marginBottom: 4, fontWeight: 600 }}>CROSSOVER</div>
              <CrossoverSchematic filters={passiveFilters!} driverRe={driverRe} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
