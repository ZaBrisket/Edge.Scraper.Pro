import React, { useMemo } from 'react';
import { NDASuggestion } from '../../src/lib/nda/types';

interface IssueSelectorProps {
  issues: NDASuggestion[];
  selectedIssueIds: Set<string>;
  onToggleIssue: (issueId: string) => void;
}

const severityOrder: Array<'critical' | 'medium' | 'low'> = ['critical', 'medium', 'low'];

const severityLabels: Record<'critical' | 'medium' | 'low', string> = {
  critical: 'Critical',
  medium: 'Medium',
  low: 'Low',
};

export const IssueSelector: React.FC<IssueSelectorProps> = ({ issues, selectedIssueIds, onToggleIssue }) => {
  const grouped = useMemo(() => {
    const map = new Map<'critical' | 'medium' | 'low', NDASuggestion[]>();
    severityOrder.forEach((severity) => map.set(severity, []));
    issues.forEach((issue) => {
      const bucket = map.get(issue.severity) ?? [];
      bucket.push(issue);
      map.set(issue.severity, bucket);
    });
    return map;
  }, [issues]);

  if (!issues.length) {
    return <p className="nda-issue-selector__empty">No issues detected for this document.</p>;
  }

  return (
    <div className="nda-issue-selector">
      {severityOrder.map((severity) => {
        const issuesForSeverity = grouped.get(severity) ?? [];
        if (!issuesForSeverity.length) {
          return null;
        }

        return (
          <section key={severity} className={`nda-issue-selector__group nda-issue-selector__group--${severity}`}>
            <header className="nda-issue-selector__group-header">
              <h3>{severityLabels[severity]}</h3>
              <span>{issuesForSeverity.length} issue(s)</span>
            </header>
            <ul className="nda-issue-selector__list">
              {issuesForSeverity.map((issue) => {
                const isSelected = selectedIssueIds.has(issue.id);
                return (
                  <li key={issue.id} className="nda-issue-selector__item">
                    <label className="nda-issue-selector__item-label">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleIssue(issue.id)}
                      />
                      <div className="nda-issue-selector__item-content">
                        <div className="nda-issue-selector__item-header">
                          <h4>{issue.title}</h4>
                          <span className={`nda-issue-selector__badge nda-issue-selector__badge--${issue.action}`}>
                            {issue.action.replace('-', ' ')}
                          </span>
                        </div>
                        <dl className="nda-issue-selector__details">
                          <div>
                            <dt>Original</dt>
                            <dd>{issue.originalText ?? '—'}</dd>
                          </div>
                          <div>
                            <dt>Suggested</dt>
                            <dd>{issue.suggestedText}</dd>
                          </div>
                          <div>
                            <dt>Rationale</dt>
                            <dd>{issue.rationale}</dd>
                          </div>
                        </dl>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

export default IssueSelector;
