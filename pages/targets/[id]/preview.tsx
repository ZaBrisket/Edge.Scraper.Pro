import { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation } from '@tanstack/react-query';
import Head from 'next/head';
import PreviewTable from '../../../components/targets/PreviewTable';
import ExportButtons from '../../../components/targets/ExportButtons';
import JobStatus from '../../../components/targets/JobStatus';

export default function DatasetPreview() {
  const router = useRouter();
  const { id: datasetId } = router.query;
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customMapping, setCustomMapping] = useState<Record<string, string>>({});
  const [activeJobs, setActiveJobs] = useState<string[]>([]);

  // Fetch available templates
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await fetch('/api/templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  // Fetch dataset info
  const { data: dataset } = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: async () => {
      // This would be a proper dataset endpoint in a full implementation
      return {
        id: datasetId,
        name: `Dataset ${datasetId}`,
        rowsEstimated: 1000,
        fileSize: 1024000,
      };
    },
    enabled: !!datasetId,
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async ({ format, templateId }: { format: 'xlsx' | 'pdf'; templateId: string }) => {
      const response = await fetch('/api/jobs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId,
          templateId,
          format,
          theme: 'utss-2025',
          customMapping: Object.keys(customMapping).length > 0 ? customMapping : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Export failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setActiveJobs(prev => [...prev, data.jobId]);
    },
  });

  const handleExport = (format: 'xlsx' | 'pdf') => {
    if (!selectedTemplate) {
      alert('Please select a template first');
      return;
    }
    exportMutation.mutate({ format, templateId: selectedTemplate });
  };

  const handleJobComplete = (jobId: string) => {
    setActiveJobs(prev => prev.filter(id => id !== jobId));
  };

  // Auto-select first template
  useState(() => {
    if (templates?.templates?.length > 0 && !selectedTemplate) {
      const sourceScrubTemplate = templates.templates.find((t: any) => 
        t.sourceHint?.toLowerCase().includes('sourcescrub')
      );
      setSelectedTemplate(sourceScrubTemplate?.id || templates.templates[0].id);
    }
  });

  if (!datasetId) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <Head>
        <title>Preview Dataset - Edge Scraper Pro</title>
        <meta name="description" content="Preview and export target list dataset" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* UTSS-style header */}
        <header className="utss-header">
          <div className="container">
            <h1>Target List Preview</h1>
            <p>Review → Export → Download</p>
          </div>
        </header>

        <main className="container py-8">
          {/* Navigation */}
          <div className="mb-6">
            <nav className="flex items-center space-x-2 text-sm">
              <a href="/targets/new" className="text-blue-600 hover:text-blue-800">
                Target Lists
              </a>
              <span className="text-gray-400">/</span>
              <span className="text-gray-600">Preview</span>
            </nav>
          </div>

          {/* Dataset info and controls */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
              <div className="card">
                <div className="card-header">
                  <h2>Dataset Information</h2>
                </div>
                <div className="card-body">
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Name</dt>
                      <dd className="text-sm text-gray-900">{dataset?.name}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Estimated Rows</dt>
                      <dd className="text-sm text-gray-900">{dataset?.rowsEstimated?.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">File Size</dt>
                      <dd className="text-sm text-gray-900">
                        {dataset?.fileSize ? `${(dataset.fileSize / 1024 / 1024).toFixed(2)} MB` : 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Status</dt>
                      <dd>
                        <span className="badge badge-success">Ready for Export</span>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            <div>
              <div className="card">
                <div className="card-header">
                  <h3>Export Options</h3>
                </div>
                <div className="card-body space-y-4">
                  {/* Template selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mapping Template
                    </label>
                    <select
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="w-full"
                    >
                      <option value="">Select template...</option>
                      {templates?.templates?.map((template: any) => (
                        <option key={template.id} value={template.id}>
                          {template.name} v{template.version}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Export buttons */}
                  <div className="space-y-2">
                    <button
                      onClick={() => handleExport('xlsx')}
                      disabled={!selectedTemplate || exportMutation.isPending}
                      className="btn-primary w-full"
                    >
                      {exportMutation.isPending ? 'Exporting...' : 'Export Excel (XLSX)'}
                    </button>
                    
                    <button
                      onClick={() => handleExport('pdf')}
                      disabled={!selectedTemplate || exportMutation.isPending}
                      className="btn-secondary w-full"
                    >
                      {exportMutation.isPending ? 'Exporting...' : 'Export PDF'}
                    </button>
                  </div>

                  {/* Export info */}
                  <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded">
                    <p className="font-medium mb-1">Export Features:</p>
                    <ul className="space-y-1">
                      <li>• UTSS-style formatting</li>
                      <li>• Data validation & transforms</li>
                      <li>• Excel injection protection</li>
                      <li>• Professional page layout</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Active jobs status */}
          {activeJobs.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4">Export Jobs</h3>
              <div className="space-y-4">
                {activeJobs.map(jobId => (
                  <JobStatus
                    key={jobId}
                    jobId={jobId}
                    onComplete={() => handleJobComplete(jobId)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Data preview */}
          {selectedTemplate && (
            <div className="card">
              <div className="card-header">
                <h2>Data Preview</h2>
                <p className="text-sm text-gray-600">
                  Preview of how your data will appear in the export
                </p>
              </div>
              <div className="card-body">
                <PreviewTable
                  datasetId={datasetId as string}
                  templateId={selectedTemplate}
                  customMapping={customMapping}
                  sampleSize={50}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}