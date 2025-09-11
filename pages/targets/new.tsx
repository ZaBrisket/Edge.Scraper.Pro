import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import Head from 'next/head';
import UploadDropzone from '../../components/targets/UploadDropzone';
import ColumnMapper from '../../components/targets/ColumnMapper';
import PreviewTable from '../../components/targets/PreviewTable';

interface UploadState {
  step: 'upload' | 'mapping' | 'preview';
  datasetId?: string;
  uploadId?: string;
  detectedHeaders?: string[];
  templateId?: string;
  mapping?: Record<string, string>;
}

export default function NewTargetList() {
  const router = useRouter();
  const [uploadState, setUploadState] = useState<UploadState>({ step: 'upload' });

  // Fetch available templates
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await fetch('/api/templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  const handleUploadComplete = (data: {
    datasetId: string;
    uploadId: string;
    detectedHeaders: string[];
  }) => {
    setUploadState({
      step: 'mapping',
      datasetId: data.datasetId,
      uploadId: data.uploadId,
      detectedHeaders: data.detectedHeaders,
    });
  };

  const handleMappingComplete = (templateId: string, mapping: Record<string, string>) => {
    setUploadState(prev => ({
      ...prev,
      step: 'preview',
      templateId,
      mapping,
    }));
  };

  const handleBackToMapping = () => {
    setUploadState(prev => ({
      ...prev,
      step: 'mapping',
    }));
  };

  const handleStartOver = () => {
    setUploadState({ step: 'upload' });
  };

  const handleProceedToPreview = () => {
    if (uploadState.datasetId) {
      router.push(`/targets/${uploadState.datasetId}/preview`);
    }
  };

  return (
    <>
      <Head>
        <title>New Target List - Edge Scraper Pro</title>
        <meta name="description" content="Upload and format target lists for export" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* UTSS-style header */}
        <header className="utss-header">
          <div className="container">
            <h1>Target List Formatter</h1>
            <p>Upload → Map → Preview → Export</p>
          </div>
        </header>

        <main className="container py-8">
          {/* Progress indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-4">
              <div className={`flex items-center ${uploadState.step === 'upload' ? 'text-blue-600' : uploadState.step === 'mapping' || uploadState.step === 'preview' ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${uploadState.step === 'upload' ? 'bg-blue-600 text-white' : uploadState.step === 'mapping' || uploadState.step === 'preview' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>
                  1
                </div>
                <span className="ml-2">Upload</span>
              </div>
              
              <div className={`w-16 h-1 ${uploadState.step === 'mapping' || uploadState.step === 'preview' ? 'bg-green-600' : 'bg-gray-200'}`}></div>
              
              <div className={`flex items-center ${uploadState.step === 'mapping' ? 'text-blue-600' : uploadState.step === 'preview' ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${uploadState.step === 'mapping' ? 'bg-blue-600 text-white' : uploadState.step === 'preview' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>
                  2
                </div>
                <span className="ml-2">Map Fields</span>
              </div>
              
              <div className={`w-16 h-1 ${uploadState.step === 'preview' ? 'bg-green-600' : 'bg-gray-200'}`}></div>
              
              <div className={`flex items-center ${uploadState.step === 'preview' ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${uploadState.step === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                  3
                </div>
                <span className="ml-2">Preview</span>
              </div>
            </div>
          </div>

          {/* Step content */}
          {uploadState.step === 'upload' && (
            <div className="card">
              <div className="card-header">
                <h2>Upload Target List</h2>
                <p>Upload your CSV or Excel file containing target company data</p>
              </div>
              <div className="card-body">
                <UploadDropzone onUploadComplete={handleUploadComplete} />
              </div>
            </div>
          )}

          {uploadState.step === 'mapping' && uploadState.detectedHeaders && (
            <div className="space-y-6">
              <div className="card">
                <div className="card-header">
                  <h2>Map Columns</h2>
                  <p>Map your source columns to standardized target fields</p>
                </div>
                <div className="card-body">
                  <ColumnMapper
                    detectedHeaders={uploadState.detectedHeaders}
                    templates={templates?.templates || []}
                    onMappingComplete={handleMappingComplete}
                    onBack={handleStartOver}
                  />
                </div>
              </div>
            </div>
          )}

          {uploadState.step === 'preview' && uploadState.datasetId && uploadState.templateId && uploadState.mapping && (
            <div className="space-y-6">
              <div className="card">
                <div className="card-header">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2>Preview Mapped Data</h2>
                      <p>Review the transformed data before proceeding to final preview</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleBackToMapping}
                        className="btn-secondary"
                      >
                        Back to Mapping
                      </button>
                      <button
                        onClick={handleProceedToPreview}
                        className="btn-primary"
                      >
                        Continue to Export
                      </button>
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <PreviewTable
                    datasetId={uploadState.datasetId}
                    templateId={uploadState.templateId}
                    customMapping={uploadState.mapping}
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}