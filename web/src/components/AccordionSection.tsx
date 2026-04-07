import type { ReactNode } from 'react';

interface Props {
  title: string;
  summary: string;    // one-line text shown when collapsed
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function AccordionSection({ title, summary, expanded, onToggle, children }: Props) {
  return (
    <div className={`accordion-section ${expanded ? 'accordion-expanded' : ''}`}>
      <button className="accordion-header" onClick={onToggle} type="button">
        <span className="accordion-arrow">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="accordion-title">{title}</span>
        {!expanded && <span className="accordion-summary">{summary}</span>}
      </button>
      {expanded && <div className="accordion-body">{children}</div>}
    </div>
  );
}
