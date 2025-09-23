import React, { useCallback, useMemo, useState } from 'react';
import FileUpload from './FileUpload';
import IssueSelector from './IssueSelector';
import { AnalyzeNdaResponse, NDASuggestion } from '../../src/lib/nda/types';

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file as base64.'));
        return;
      }

      const [, base64] = result.split(',');
      if (!base64) {
        reject(new Error('Failed to convert document to base64.'));
        return;
      }

      resolve(base64);
    };
    reader.onerror = () => {
      reject(new Error('Unable to read uploaded file.'));
    };
    reader.readAsDataURL(file);
  });
}

export const NDAReviewer: React.FC = () => {
  const [sessionId] = useState<string>(() => generateSessionId());
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [issues, setIssues] = useState<NDASuggestion[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisMetrics, setAnalysisMetrics] = useState<AnalyzeNdaResponse['metrics'] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const toggleIssue = useCallback(
    (issueId: string) => {
      setSelectedIssueIds((current) => {
        const next = new Set(current);
        if (next.has(issueId)) {
          next.delete(issueId);
        } else {
          next.add(issueId);
        }
        return next;
      });
    },
    [],
  );

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setError(null);
    setWarnings([]);

    try {
      const payload: Record<string, unknown> = {
        sessionId,
        text: textInput.trim() ? textInput : undefined,
        includeDocxExport: false,
      };

      if (selectedFile) {
        payload.fileName = selectedFile.name;
        payload.mimeType = selectedFile.type;
        payload.fileBase64 = await fileToBase64(selectedFile);
      }

      const response = await fetch('/api/nda-analyzer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Unable to analyze NDA document.');
      }

      const result = (await response.json()) as AnalyzeNdaResponse;
      setIssues(result.issues);
      setSelectedIssueIds(new Set(result.issues.filter((issue) => issue.defaultSelected).map((issue) => issue.id)));
      setAnalysisMetrics(result.metrics);
      setWarnings(result.warnings ?? []);
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Unexpected error during analysis.';
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedFile, sessionId, textInput]);

  const handleExport = useCallback(async () => {
    if (!issues.length || !selectedIssueIds.size) {
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        sessionId,
        text: textInput.trim() ? textInput : undefined,
        includeDocxExport: true,
        selectedIssueIds: Array.from(selectedIssueIds),
      };

      if (selectedFile) {
        payload.fileName = selectedFile.name;
        payload.mimeType = selectedFile.type;
        payload.fileBase64 = await fileToBase64(selectedFile);
      }

      const response = await fetch('/api/nda-analyzer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Unable to export tracked changes document.');
      }

      const result = (await response.json()) as AnalyzeNdaResponse;
      if (!result.exportDocumentBase64) {
        throw new Error('Export failed to generate a Word document.');
      }

      const blob = await fetch(
        `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${result.exportDocumentBase64}`,
      ).then((res) => res.blob());
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'nda-review-tracked-changes.docx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : 'Unable to export tracked changes document.';
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [issues.length, selectedFile, selectedIssueIds, sessionId, textInput]);

  const disableExport = useMemo(() => !issues.length || !selectedIssueIds.size, [issues.length, selectedIssueIds]);

  return (
    <div className="nda-reviewer">
      <section className="nda-reviewer__input">
        <h2>Intelligent NDA Reviewer v2</h2>
        <p>Paste NDA text or upload a Word document to generate contextual redlines.</p>
        <textarea
          className="nda-reviewer__textarea"
          value={textInput}
          onChange={(event) => setTextInput(event.target.value)}
          placeholder="Paste NDA text here (optional if uploading a document)"
          rows={10}
        />
        <FileUpload onFileSelected={setSelectedFile} disabled={isAnalyzing} error={error} />
        <div className="nda-reviewer__actions">
          <button type="button" onClick={handleAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? 'Analyzing…' : 'Analyze NDA'}
          </button>
          <button type="button" onClick={handleExport} disabled={isAnalyzing || disableExport}>
            Export Tracked Changes
          </button>
        </div>
        {error && <p className="nda-reviewer__error">{error}</p>}
        {warnings.length > 0 && (
          <ul className="nda-reviewer__warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        {analysisMetrics && (
          <div className="nda-reviewer__metrics">
            <p>Total clauses scanned: {analysisMetrics.totalClauses}</p>
            <p>Checklist matches: {analysisMetrics.matchedClauses}</p>
            <p>Missing provisions: {analysisMetrics.missingClauses}</p>
          </div>
        )}
      </section>
      <section className="nda-reviewer__issues">
        <h3>Review Issues</h3>
        <IssueSelector issues={issues} selectedIssueIds={selectedIssueIds} onToggleIssue={toggleIssue} />
      </section>
    </div>
  );
};

export default NDAReviewer;
