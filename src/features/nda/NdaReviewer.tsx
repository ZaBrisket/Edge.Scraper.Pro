import React, { useEffect, useMemo, useState } from 'react';

type Issue = {
  id: string;
  ruleId: string;
  title: string;
  category: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKER';
  severity: number;
  status: 'non_compliant' | 'substantial' | 'compliant';
  rationale: string[];
  snippet: string;
  suggestion?: string;
  ranges: Array<{ start: number; end: number }>;
};

type AnalyzePayload = {
  kind: 'docx' | 'text';
  fileBase64?: string;
  text?: string;
};

type AnalyzeResponse = {
  normalizedText: string;
  issues: Issue[];
};

type OriginalSource = { kind: 'docx'; text: string; fileBase64: string } | { kind: 'text'; text: string };

export default function NdaReviewer() {
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<OriginalSource | null>(null);
  const [normalized, setNormalized] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [downloadHref, setDownloadHref] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (downloadHref) {
        URL.revokeObjectURL(downloadHref);
      }
    };
  }, [downloadHref]);

  const selectedEdits = useMemo(() => {
    const edits: Array<{ start: number; end: number; replacement: string }> = [];
    for (const issue of issues) {
      if (!selected[issue.id] || !issue.suggestion) continue;
      for (const range of issue.ranges) {
        edits.push({ start: range.start, end: range.end, replacement: issue.suggestion });
      }
    }
    edits.sort((a, b) => a.start - b.start);
    const merged: typeof edits = [];
    for (const edit of edits) {
      const last = merged[merged.length - 1];
      if (!last || edit.start >= last.end) {
        merged.push(edit);
      }
    }
    return merged;
  }, [issues, selected]);

  async function analyze(payload: AnalyzePayload) {
    setBusy(true);
    setDownloadHref((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setIssues([]);
    setSelected({});
    try {
      const res = await fetch('/.netlify/functions/nda-analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Analyze failed');
      }
      const data: AnalyzeResponse = await res.json();
      setNormalized(data.normalizedText || '');
      setIssues(data.issues || []);
      const defaults: Record<string, boolean> = {};
      for (const issue of data.issues || []) {
        if ((issue.level === 'HIGH' || issue.level === 'BLOCKER') && issue.suggestion) {
          defaults[issue.id] = true;
        }
      }
      setSelected(defaults);
    } catch (err) {
      console.error(err);
      alert('Unable to analyze NDA. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function exportDocx() {
    if (!source) return;
    setBusy(true);
    try {
      const res = await fetch('/.netlify/functions/nda-export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalKind: source.kind,
          originalFileBase64: source.kind === 'docx' ? source.fileBase64 : undefined,
          originalText: source.text,
          normalizedText: normalized,
          edits: selectedEdits,
          downloadName: 'nda-tracked-changes.docx'
        })
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Export failed');
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      setDownloadHref(href);
    } catch (err) {
      console.error(err);
      alert('Export failed. Please confirm Aspose credentials are configured.');
    } finally {
      setBusy(false);
    }
  }

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.docx')) {
        const base64 = await readFileAsBase64(file);
        const nextSource: OriginalSource = { kind: 'docx', text: '', fileBase64: base64 };
        setSource(nextSource);
        await analyze({ kind: 'docx', fileBase64: base64 });
      } else if (file.name.toLowerCase().endsWith('.txt')) {
        const text = await file.text();
        const nextSource: OriginalSource = { kind: 'text', text };
        setSource(nextSource);
        await analyze({ kind: 'text', text });
      } else {
        alert('Please upload a .docx or .txt file.');
      }
    } catch (err) {
      console.error(err);
      alert('Unable to read file.');
    }
  }

  function onTextChange(event: React.FormEvent<HTMLTextAreaElement>) {
    const value = event.currentTarget.value;
    const nextSource: OriginalSource = { kind: 'text', text: value };
    setSource(nextSource);
  }

  const previewAfter = useMemo(() => applyPreview(normalized, issues, selected), [normalized, issues, selected]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-2">NDA Reviewer</h1>
      <p className="text-sm text-gray-600 mb-6">
        Upload an inbound NDA (.docx or .txt). The reviewer compares language against the Edgewater checklist, highlights gaps,
        and exports native Word tracked changes.
      </p>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <input type="file" accept=".docx,.txt" onChange={onFileSelected} />
        <span className="text-gray-500">or paste text:</span>
      </div>

      <textarea
        className="w-full border rounded p-2 h-32 mb-2"
        placeholder="Paste NDA text here…"
        onInput={onTextChange}
        defaultValue={source?.kind === 'text' ? source.text : ''}
      />

      <button
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        disabled={busy || !source || (source.kind === 'text' && !source.text.trim())}
        onClick={() => {
          if (!source) return;
          const payload = source.kind === 'docx' ? { kind: 'docx', fileBase64: source.fileBase64 } : { kind: 'text', text: source.text };
          void analyze(payload);
        }}
      >
        {busy ? 'Working…' : 'Analyze'}
      </button>

      {issues.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-2">Issues &amp; Suggestions</h2>
          <p className="text-sm text-gray-600 mb-4">Select which edits to apply before exporting tracked changes.</p>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-2">Apply</th>
                  <th className="py-2 pr-2">Rule</th>
                  <th className="py-2 pr-2">Severity</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id} className="border-b align-top">
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={!!selected[issue.id]}
                        disabled={!issue.suggestion || issue.ranges.length === 0}
                        onChange={() => setSelected((prev) => ({ ...prev, [issue.id]: !prev[issue.id] }))}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="font-medium">{issue.title}</div>
                      <div className="text-gray-500">{issue.category}</div>
                    </td>
                    <td className="py-2 pr-2">{issue.level} ({issue.severity})</td>
                    <td className="py-2 pr-2">
                      {issue.status === 'substantial' ? 'Substantial compliance' : issue.status === 'non_compliant' ? 'Needs edit' : 'Compliant'}
                    </td>
                    <td className="py-2 pr-2">
                      <ul className="list-disc ml-5">
                        {issue.rationale.map((text, index) => (
                          <li key={index}>{text}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <h3 className="font-semibold mb-2">Preview</h3>
            <DiffView before={normalized} after={previewAfter} />
          </div>

          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <button
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
              disabled={busy || !source || selectedEdits.length === 0}
              onClick={() => void exportDocx()}
            >
              {busy ? 'Exporting…' : 'Export tracked changes (.docx)'}
            </button>
            {downloadHref && (
              <a download="nda-tracked-changes.docx" href={downloadHref} className="text-blue-600 underline">
                Download file
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function applyPreview(text: string, issues: Issue[], selected: Record<string, boolean>) {
  if (!text) return text;
  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  for (const issue of issues) {
    if (!selected[issue.id] || !issue.suggestion) continue;
    for (const range of issue.ranges) {
      edits.push({ start: range.start, end: range.end, replacement: issue.suggestion });
    }
  }
  edits.sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const edit of edits) {
    out += text.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  out += text.slice(cursor);
  return out;
}

function DiffView({ before, after }: { before: string; after: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div>
        <div className="font-medium mb-1">Original</div>
        <pre className="p-2 border rounded whitespace-pre-wrap">{before}</pre>
      </div>
      <div>
        <div className="font-medium mb-1">With Selected Edits</div>
        <pre className="p-2 border rounded whitespace-pre-wrap">{after}</pre>
      </div>
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected file reader result.'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
