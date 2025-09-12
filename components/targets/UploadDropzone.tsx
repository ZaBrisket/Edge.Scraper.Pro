import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';

interface UploadDropzoneProps {
  onUploadComplete: (data: {
    datasetId: string;
    uploadId: string;
    detectedHeaders: string[];
  }) => void;
}

interface UploadState {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  progress: number;
  error?: string;
}

export default function UploadDropzone({ onUploadComplete }: UploadDropzoneProps) {
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', progress: 0 });
  const [dragOver, setDragOver] = useState(false);

  // Presign upload mutation
  const presignMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to get upload URL');
      }

      return response.json();
    },
  });

  // Commit upload mutation
  const commitMutation = useMutation({
    mutationFn: async (s3Key: string) => {
      const response = await fetch('/api/uploads/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3Key }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to commit upload');
      }

      return response.json();
    },
  });

  const uploadFile = async (file: File) => {
    try {
      setUploadState({ status: 'uploading', progress: 0 });

      // Step 1: Get presigned URL
      const presignData = await presignMutation.mutateAsync(file);
      setUploadState({ status: 'uploading', progress: 25 });

      // Step 2: Upload to S3
      const uploadResponse = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      setUploadState({ status: 'processing', progress: 75 });

      // Step 3: Commit upload
      const commitData = await commitMutation.mutateAsync(presignData.s3Key);

      setUploadState({ status: 'success', progress: 100 });

      // Call completion handler
      onUploadComplete({
        datasetId: commitData.datasetId,
        uploadId: commitData.uploadId,
        detectedHeaders: commitData.detectedHeaders,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadState({
        status: 'error',
        progress: 0,
        error: error.message || 'Upload failed',
      });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const file = files[0];

    if (!file) return;

    // Validate file type
    const validTypes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];

    if (!validTypes.includes(file.type)) {
      setUploadState({
        status: 'error',
        progress: 0,
        error: 'Please upload a CSV or Excel file (.csv, .xlsx, .xls)',
      });
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setUploadState({
        status: 'error',
        progress: 0,
        error: 'File size must be less than 10MB',
      });
      return;
    }

    uploadFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  }, []);

  const resetUpload = () => {
    setUploadState({ status: 'idle', progress: 0 });
  };

  const isUploading = uploadState.status === 'uploading' || uploadState.status === 'processing';

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        className={`
          dropzone
          ${dragOver ? 'dragover' : ''}
          ${uploadState.status === 'error' ? 'error' : ''}
          ${isUploading ? 'pointer-events-none opacity-50' : ''}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />

        <div className="text-center">
          {uploadState.status === 'idle' && (
            <>
              <div className="text-4xl mb-4">📁</div>
              <h3 className="text-lg font-semibold mb-2">Drop your target list here</h3>
              <p className="text-gray-600 mb-4">or click to browse files</p>
              <p className="text-sm text-gray-500">Supports CSV and Excel files (max 10MB)</p>
            </>
          )}

          {isUploading && (
            <>
              <div className="text-4xl mb-4">⏳</div>
              <h3 className="text-lg font-semibold mb-2">
                {uploadState.status === 'uploading' ? 'Uploading...' : 'Processing...'}
              </h3>
              <div className="progress mb-4">
                <div className="progress-bar" style={{ width: `${uploadState.progress}%` }}></div>
              </div>
              <p className="text-sm text-gray-500">
                {uploadState.status === 'uploading'
                  ? 'Uploading file to secure storage...'
                  : 'Analyzing file structure and detecting columns...'}
              </p>
            </>
          )}

          {uploadState.status === 'success' && (
            <>
              <div className="text-4xl mb-4">✅</div>
              <h3 className="text-lg font-semibold mb-2 text-green-600">Upload Complete!</h3>
              <p className="text-sm text-gray-600">
                File processed successfully. Moving to column mapping...
              </p>
            </>
          )}

          {uploadState.status === 'error' && (
            <>
              <div className="text-4xl mb-4">❌</div>
              <h3 className="text-lg font-semibold mb-2 text-red-600">Upload Failed</h3>
              <p className="text-sm text-red-600 mb-4">{uploadState.error}</p>
              <button onClick={resetUpload} className="btn-primary">
                Try Again
              </button>
            </>
          )}
        </div>
      </div>

      {/* File requirements */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">File Requirements</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• CSV or Excel format (.csv, .xlsx, .xls)</li>
          <li>• Maximum file size: 10MB</li>
          <li>• First row should contain column headers</li>
          <li>• At least one column with company names</li>
          <li>• Recommended: Include city, state, revenue, and executive data</li>
        </ul>
      </div>
    </div>
  );
}
