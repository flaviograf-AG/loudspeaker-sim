import type { ReactNode } from 'react';
import { InfoTooltip } from './InfoTooltip';

const ACCORDION_DOC_KEYS: Record<string, string> = {
  Driver: 'section:driver-accordion',
  Enclosure: 'section:enclosure-accordion',
  Crossover: 'section:crossover-accordion',
  System: 'section:system-accordion',
};

interface Props {
  title: string;
  summary: string;    // one-line text shown when collapsed
  expanded: boolean;
  onToggle: () => void;
  docKey?: string;
  children: ReactNode;
}

export function AccordionSection({ title, summary, expanded, onToggle, docKey, children }: Props) {
  const resolvedDocKey = docKey ?? ACCORDION_DOC_KEYS[title];
  return (
    <div className={`accordion-section ${expanded ? 'accordion-expanded' : ''}`}>
      <button className="accordion-header" onClick={onToggle} type="button">
        <span className="accordion-arrow">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="accordion-title">{title}</span>
        {resolvedDocKey && <InfoTooltip variant="section" docKey={resolvedDocKey} />}
        {!expanded && <span className="accordion-summary">{summary}</span>}
      </button>
      {expanded && <div className="accordion-body">{children}</div>}
    </div>
  );
}
