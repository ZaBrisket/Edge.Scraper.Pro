import { useState, useEffect } from 'react';
import posthog from 'posthog-js';

export default function NdaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [useOCR, setUseOCR] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [proposedDocx, setProposedDocx] = useState<File | null>(null);
  const [consented, setConsented] = useState(false);
  const [useAspose, setUseAspose] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      process.env.NEXT_PUBLIC_POSTHOG_KEY &&
      !(posthog as any).__loaded
    ) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      });
      (posthog as any).__loaded = true;
    }
  }, []);

  async function runReview() {
    if (!file || !consented) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('options', JSON.stringify({ useOCR }));
      const res = await fetch('/api/nda/review', { method: 'POST', body: form });
      if (res.status === 412) {
        alert('Scanned PDF requires OCR. Try Server Assist or upload a text-native PDF.');
        return;
      }
      if (res.status === 503) {
        alert('Service temporarily unavailable. Please try again later.');
        return;
      }
      if (res.status === 429) {
        const d = await res.json();
        alert(`Rate limit exceeded. Try again in ${d.reset} seconds.`);
        return;
      }
      const data = await res.json();
      setResult(data.data);
      await capture('nda_review_completed', {
        findings_pass: data?.data?.findings?.filter((f: any) => f.status === 'PASS').length || 0,
        findings_fail: data?.data?.findings?.filter((f: any) => f.status === 'FAIL').length || 0,
        findings_warn: data?.data?.findings?.filter((f: any) => f.status === 'WARN').length || 0,
        pages: data?.data?.stats?.pages || 0,
        processingMs: data?.data?.stats?.processingMs || 0,
      });
    } finally {
      setLoading(false);
    }
  }

  async function exportDocx() {
    if (!result || !file || !proposedDocx || !consented) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append('original', file);
      form.append('proposed', proposedDocx);
      form.append('resultFileName', `nda_redlines_${Date.now()}.docx`);
      let res = await fetch('/api/nda/export-docx', {
        method: 'POST',
        body: form,
      });
      if (res.status === 503) {
        alert('Aspose unavailable, using basic export...');
        await exportBasic();
        return;
      }
      if (!res.ok) {
        alert('Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: 'nda_redlines.docx',
      });
      a.click();
      URL.revokeObjectURL(url);
      await capture('nda_export_success', { mode: 'aspose' });
    } finally {
      setLoading(false);
    }
  }

  async function exportBasic() {
    if (!result || !consented) return;
    setLoading(true);
    try {
      const text =
        result?.findings
          ?.map((f: any) => `${f.clause}: ${f.status}\n${f.rationale || ''}\n${f.notes?.[0] || ''}`)
          .join('\n\n') || '';
      const res = await fetch('/api/nda/export-basic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalText: '', proposedText: text }),
      });
      if (!res.ok) {
        alert('Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: 'nda_redlines_basic.docx',
      });
      a.click();
      URL.revokeObjectURL(url);
      await capture('nda_export_success', { mode: 'basic' });
    } finally {
      setLoading(false);
    }
  }

  async function capture(event: string, props: any) {
    try {
      if ((posthog as any).__loaded) posthog.capture(event, props);
      await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, props }),
      });
    } catch (telemetryError) {
      // ignore telemetry failures
    }
  }

  return (
    <main className="container mx-auto px-4 py-6 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">NDA Reviewer v1.1</h1>
      <p className="text-sm text-gray-600 mb-4">
        This tool provides automated checklist analysis only. It is <b>NOT legal advice</b>. All
        exports are watermarked. You must confirm consent before processing.
      </p>

      <div className="border border-yellow-400 bg-yellow-50 p-3 rounded mb-4">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={consented}
            onChange={e => setConsented(e.target.checked)}
            className="w-4 h-4"
          />
          <span>I understand this is not legal advice and consent to processing</span>
        </label>
      </div>

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload Document</h2>
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="mb-3"
        />
        <div className="flex gap-4 items-center mb-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={useOCR} onChange={e => setUseOCR(e.target.checked)} />
            <span className="text-sm">Use OCR for scanned PDFs</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useAspose}
              onChange={e => setUseAspose(e.target.checked)}
            />
            <span className="text-sm">Use Aspose (tracked changes)</span>
          </label>
        </div>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={runReview}
          disabled={!file || !consented || loading}
        >
          {loading ? 'Processing...' : 'Run Review'}
        </button>
      </div>

      {result && (
        <>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Checklist Compliance</h2>
              <div className="overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Clause</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.findings.map((f: any) => (
                      <tr
                        key={f.clause}
                        className={
                          f.status === 'FAIL'
                            ? 'bg-red-50'
                            : f.status === 'WARN'
                              ? 'bg-yellow-50'
                              : 'bg-green-50'
                        }
                      >
                        <td className="px-3 py-2">{f.clause}</td>
                        <td className="px-3 py-2 font-semibold">{f.status}</td>
                        <td className="px-3 py-2">{f.severity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-xs text-gray-600">
                Version: {result.checklistVersion} | Variant: {result.variant} | Pages:{' '}
                {result.stats.pages || 'N/A'}
              </div>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Evidence</h2>
              <div className="space-y-3 overflow-auto max-h-96">
                {result.findings.slice(0, 5).map((f: any) => (
                  <div key={f.clause} className="border-l-4 border-gray-300 pl-3">
                    <p className="font-medium">{f.clause}</p>
                    <p className="text-sm text-gray-700">{f.rationale}</p>
                    {f.evidence?.[0]?.text && (
                      <pre className="bg-gray-50 p-2 text-xs whitespace-pre-wrap mt-1">
                        {f.evidence[0].text.slice(0, 200)}...
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4">Export Options</h3>
            {useAspose && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Upload revised DOCX to generate tracked changes:
                </p>
                <input
                  type="file"
                  accept=".docx"
                  onChange={e => setProposedDocx(e.target.files?.[0] ?? null)}
                />
                <button
                  className="ml-3 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  onClick={exportDocx}
                  disabled={!proposedDocx || !file || !consented || loading}
                >
                  Export with Tracked Changes
                </button>
              </div>
            )}
            <button
              className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              onClick={exportBasic}
              disabled={!result || !consented || loading}
            >
              Export Basic DOCX
            </button>
          </div>
        </>
      )}
    </main>
  );
}
