import { useState } from 'react';
import type { CabinetDimensions, EnclosureConfig, PassiveFilter, WayDesign } from '../types';
import { EnclosureSchematic } from './EnclosureSchematic';
import { CrossoverSchematic } from './CrossoverSchematic';

interface Props {
  enclosureConfig?: EnclosureConfig;
  driverSd?: number;
  passiveFilters?: PassiveFilter[];
  driverRe?: number;
  ways?: WayDesign[];
  cabinet?: CabinetDimensions;
}

interface BomItem {
  wayName: string;
  role: string;
  partType: 'Inductor' | 'Capacitor' | 'Resistor';
  valueStr: string;
  specNote: string;
}

function extractPassiveBom(ways: WayDesign[]): BomItem[] {
  const items: BomItem[] = [];
  ways.forEach((w) => {
    w.passive_filters
      .filter((pf) => !pf.bypassed)
      .forEach((pf, idx) => {
        const tag = `#${idx + 1}`;
        switch (pf.type) {
          case 'SeriesL':
            items.push({
              wayName: w.name,
              role: `Series L (${tag})`,
              partType: 'Inductor',
              valueStr: `${(pf.henries * 1e3).toFixed(2)} mH (DCR ${pf.dcr_ohms.toFixed(2)} Ω)`,
              specNote: pf.henries * 1e3 > 1.8 ? 'Air-core 14–16 AWG or low-saturation laminated core' : 'Air-core 16–18 AWG copper',
            });
            break;
          case 'ShuntL':
            items.push({
              wayName: w.name,
              role: `Shunt L (${tag})`,
              partType: 'Inductor',
              valueStr: `${(pf.henries * 1e3).toFixed(2)} mH (DCR ${pf.dcr_ohms.toFixed(2)} Ω)`,
              specNote: 'Air-core 18 AWG copper',
            });
            break;
          case 'SeriesC':
            items.push({
              wayName: w.name,
              role: `Series C (${tag})`,
              partType: 'Capacitor',
              valueStr: `${(pf.farads * 1e6).toFixed(2)} µF`,
              specNote: 'Metallized Polypropylene (MKP) ≥ 250V',
            });
            break;
          case 'ShuntC':
            items.push({
              wayName: w.name,
              role: `Shunt C (${tag})`,
              partType: 'Capacitor',
              valueStr: `${(pf.farads * 1e6).toFixed(2)} µF`,
              specNote: pf.farads * 1e6 > 22 ? 'MKP film or low-loss Bi-Polar Electrolytic (MKT/BPE)' : 'Metallized Polypropylene (MKP)',
            });
            break;
          case 'SeriesR':
          case 'ShuntR':
            items.push({
              wayName: w.name,
              role: `${pf.type === 'SeriesR' ? 'Series' : 'Shunt'} R (${tag})`,
              partType: 'Resistor',
              valueStr: `${pf.ohms.toFixed(2)} Ω`,
              specNote: '10W non-inductive MOX / wirewound',
            });
            break;
          case 'ZobelShunt':
            items.push(
              {
                wayName: w.name,
                role: `Zobel R (${tag})`,
                partType: 'Resistor',
                valueStr: `${pf.ohms.toFixed(2)} Ω`,
                specNote: '10W non-inductive MOX',
              },
              {
                wayName: w.name,
                role: `Zobel C (${tag})`,
                partType: 'Capacitor',
                valueStr: `${(pf.farads * 1e6).toFixed(2)} µF`,
                specNote: 'MKT / MKP film ≥ 100V',
              }
            );
            break;
          case 'LPad':
            items.push(
              {
                wayName: w.name,
                role: `L-Pad Series R (${tag})`,
                partType: 'Resistor',
                valueStr: `${pf.series_ohms.toFixed(2)} Ω`,
                specNote: '10W non-inductive MOX',
              },
              {
                wayName: w.name,
                role: `L-Pad Shunt R (${tag})`,
                partType: 'Resistor',
                valueStr: `${pf.shunt_ohms.toFixed(2)} Ω`,
                specNote: '10W non-inductive MOX',
              }
            );
            break;
          case 'SeriesParallelRC':
            items.push(
              {
                wayName: w.name,
                role: `Series R∥C Resistor (${tag})`,
                partType: 'Resistor',
                valueStr: `${pf.ohms.toFixed(2)} Ω`,
                specNote: '10W non-inductive MOX',
              },
              {
                wayName: w.name,
                role: `Series R∥C Bypass Cap (${tag})`,
                partType: 'Capacitor',
                valueStr: `${(pf.farads * 1e6).toFixed(2)} µF`,
                specNote: 'Metallized Polypropylene (MKP)',
              }
            );
            break;
          case 'SeriesParallelRL':
            items.push(
              {
                wayName: w.name,
                role: `Baffle-Step R∥L Resistor (${tag})`,
                partType: 'Resistor',
                valueStr: `${pf.ohms.toFixed(2)} Ω`,
                specNote: '10W–20W non-inductive MOX',
              },
              {
                wayName: w.name,
                role: `Baffle-Step R∥L Inductor (${tag})`,
                partType: 'Inductor',
                valueStr: `${(pf.henries * 1e3).toFixed(2)} mH (DCR ${pf.dcr_ohms.toFixed(2)} Ω)`,
                specNote: 'Air-core or laminated-core 16 AWG',
              }
            );
            break;
          case 'NotchShunt':
          case 'NotchSeries':
          case 'SeriesParallelRLC':
          case 'ShuntSeriesRLC':
            items.push(
              {
                wayName: w.name,
                role: `${pf.type} R (${tag})`,
                partType: 'Resistor',
                valueStr: `${pf.ohms.toFixed(2)} Ω`,
                specNote: '10W non-inductive MOX',
              },
              {
                wayName: w.name,
                role: `${pf.type} L (${tag})`,
                partType: 'Inductor',
                valueStr: `${(pf.henries * 1e3).toFixed(2)} mH`,
                specNote: 'Air-core 18 AWG',
              },
              {
                wayName: w.name,
                role: `${pf.type} C (${tag})`,
                partType: 'Capacitor',
                valueStr: `${(pf.farads * 1e6).toFixed(2)} µF`,
                specNote: 'MKP / MKT film',
              }
            );
            break;
        }
      });
  });
  return items;
}

export function SchematicPanel({ enclosureConfig, driverSd, passiveFilters, driverRe, ways, cabinet }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [showBom, setShowBom] = useState(false);
  const [copiedBom, setCopiedBom] = useState(false);
  const hasEnclosure = !!enclosureConfig;
  const hasFilters = passiveFilters && passiveFilters.length > 0;
  const bomItems = ways ? extractPassiveBom(ways) : [];

  if (!hasEnclosure && !hasFilters) return null;

  const copyBomMarkdown = () => {
    const lines: string[] = ['# Loudspeaker Build Sheet & BOM\n'];
    if (cabinet) {
      lines.push(
        `## Cabinet Dimensions\n- External (H × W × D): ${cabinet.height_cm} × ${cabinet.width_cm} × ${cabinet.depth_cm} cm\n- Wall Thickness: ${cabinet.wall_thickness_mm} mm\n`
      );
    }
    if (ways && ways.length > 0) {
      lines.push('## Drivers & Enclosures');
      ways.forEach((w) => {
        lines.push(`- **${w.name}**: ${w.preset_name || 'Custom'} (${w.enclosure.type}, Re=${w.driver.re_ohm}Ω, Fs=${w.driver.fs_hz}Hz)`);
      });
      lines.push('');
    }
    if (bomItems.length > 0) {
      lines.push('## Passive Crossover Bill of Materials (per speaker)');
      lines.push('| Way | Role | Type | Value | Recommended Spec |');
      lines.push('|---|---|---|---|---|');
      bomItems.forEach((item) => {
        lines.push(`| ${item.wayName} | ${item.role} | ${item.partType} | ${item.valueStr} | ${item.specNote} |`);
      });
    }
    try {
      navigator.clipboard.writeText(lines.join('\n'));
      setCopiedBom(true);
      setTimeout(() => setCopiedBom(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{
      borderTop: '1px solid var(--graf-border, #e8e4dc)',
      background: 'var(--graf-surface, #fff)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            padding: '6px 16px', border: 'none', background: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, color: 'var(--graf-primary, #00809E)', fontWeight: 600,
          }}
          title={expanded ? 'Collapse schematics panel' : 'Expand schematics panel'}
        >
          <span style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▲</span>
          Schematics {bomItems.length > 0 ? `& Passive BOM (${bomItems.length} parts)` : ''}
        </button>
        {expanded && bomItems.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`graf-btn graf-btn-sm ${showBom ? 'graf-btn-primary' : 'graf-btn-outline'}`}
              style={{ fontSize: 10, padding: '2px 8px' }}
              onClick={() => setShowBom(!showBom)}
              data-testid="toggle-bom-btn"
            >
              {showBom ? 'Hide BOM Table' : `Show BOM (${bomItems.length} parts)`}
            </button>
            <button
              type="button"
              className="graf-btn graf-btn-sm graf-btn-outline"
              style={{ fontSize: 10, padding: '2px 8px' }}
              onClick={copyBomMarkdown}
              title="Copy Markdown Bill of Materials & Cabinet Summary to clipboard"
            >
              {copiedBom ? '✓ Copied Markdown' : 'Copy Build Sheet'}
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
          {showBom && bomItems.length > 0 && (
            <div
              data-testid="passive-bom-table"
              style={{
                marginTop: 8,
                padding: '6px 10px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                overflowX: 'auto',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                Passive Crossover Bill of Materials (per speaker)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '3px 6px' }}>Way</th>
                    <th style={{ padding: '3px 6px' }}>Circuit Role</th>
                    <th style={{ padding: '3px 6px' }}>Component</th>
                    <th style={{ padding: '3px 6px' }}>Value</th>
                    <th style={{ padding: '3px 6px' }}>Recommended Part Spec</th>
                  </tr>
                </thead>
                <tbody>
                  {bomItems.map((item, idx) => (
                    <tr key={`${item.wayName}-${item.role}-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '3px 6px', fontWeight: 600 }}>{item.wayName}</td>
                      <td style={{ padding: '3px 6px' }}>{item.role}</td>
                      <td style={{ padding: '3px 6px' }}>{item.partType}</td>
                      <td style={{ padding: '3px 6px', fontFamily: 'var(--graf-font-mono)', fontWeight: 600 }}>
                        {item.valueStr}
                      </td>
                      <td style={{ padding: '3px 6px', color: '#475569' }}>{item.specNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
