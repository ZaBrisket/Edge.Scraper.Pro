import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

interface JobStatusProps {
  jobId: string;
  onComplete?: (jobId: string) => void;
}

interface JobData {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  format: string;
  progress: number;
  duration: number;
  estimatedCompletionTime?: string;
  artifacts: Array<{
    id: string;
    filename: string;
    contentType: string;
    fileSize: number;
  }>;
  logs: Array<{
    id: string;
    level: string;
    message: string;
    createdAt: string;
  }>;
}

export default function JobStatus({ jobId, onComplete }: JobStatusProps) {
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});

  // Poll job status
  const { data: job, refetch } = useQuery<JobData>({
    queryKey: ['job-status', jobId],
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch job status');
      }
      return response.json();
    },
    refetchInterval: 2000, // Poll every 2 seconds
    refetchIntervalInBackground: false,
  });

  // Handle job completion
  useEffect(() => {
    if (job?.status === 'completed' && onComplete) {
      onComplete(jobId);
    }
  }, [job?.status, jobId, onComplete]);

  // Generate download URLs for completed jobs
  const handleDownload = async (artifactId: string) => {
    if (downloadUrls[artifactId]) {
      // Use cached URL
      window.open(downloadUrls[artifactId], '_blank');
      return;
    }

    try {
      const response = await fetch(`/api/artifacts/${artifactId}/signed-url`);
      if (!response.ok) {
        throw new Error('Failed to generate download URL');
      }

      const data = await response.json();
      setDownloadUrls(prev => ({
        ...prev,
        [artifactId]: data.downloadUrl,
      }));

      // Open download
      window.open(data.downloadUrl, '_blank');
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file. Please try again.');
    }
  };

  if (!job) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued':
        return 'text-yellow-600 bg-yellow-100';
      case 'processing':
        return 'text-blue-600 bg-blue-100';
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return '⏳';
      case 'processing':
        return '⚙️';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '❓';
    }
  };

  return (
    <div className="card">
      <div className="card-body">
        {/* Job header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">{getStatusIcon(job.status)}</span>
            <div>
              <h4 className="font-semibold">{job.format.toUpperCase()} Export</h4>
              <p className="text-sm text-gray-600">Job ID: {job.id.slice(-8)}</p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(job.status)}`}
          >
            {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
          </span>
        </div>

        {/* Progress bar */}
        {(job.status === 'queued' || job.status === 'processing') && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
              <span>Progress</span>
              <span>{job.progress}%</span>
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${job.progress}%` }}></div>
            </div>
            {job.estimatedCompletionTime && (
              <p className="text-xs text-gray-500 mt-1">
                Estimated completion: {new Date(job.estimatedCompletionTime).toLocaleTimeString()}
              </p>
            )}
          </div>
        )}

        {/* Job details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
          <div>
            <span className="font-medium text-gray-500">Format:</span>
            <span className="ml-2 text-gray-900">{job.format.toUpperCase()}</span>
          </div>
          <div>
            <span className="font-medium text-gray-500">Duration:</span>
            <span className="ml-2 text-gray-900">
              {Math.floor(job.duration / 60)}m {job.duration % 60}s
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-500">Status:</span>
            <span className="ml-2 text-gray-900 capitalize">{job.status}</span>
          </div>
          <div>
            <span className="font-medium text-gray-500">Files:</span>
            <span className="ml-2 text-gray-900">{job.artifacts.length}</span>
          </div>
        </div>

        {/* Download buttons */}
        {job.status === 'completed' && job.artifacts.length > 0 && (
          <div className="mb-4">
            <h5 className="font-medium text-gray-700 mb-2">Downloads</h5>
            <div className="space-y-2">
              {job.artifacts.map(artifact => (
                <div
                  key={artifact.id}
                  className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                >
                  <div>
                    <div className="font-medium text-gray-900">{artifact.filename}</div>
                    <div className="text-sm text-gray-600">
                      {(artifact.fileSize / 1024 / 1024).toFixed(2)} MB • {artifact.contentType}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(artifact.id)}
                    className="btn-primary text-sm px-3 py-1"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error logs */}
        {job.status === 'failed' && job.logs.length > 0 && (
          <div className="mb-4">
            <h5 className="font-medium text-red-700 mb-2">Error Details</h5>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              {job.logs
                .filter(log => log.level === 'error')
                .slice(0, 3)
                .map(log => (
                  <div key={log.id} className="text-sm text-red-800">
                    <span className="font-medium">
                      {new Date(log.createdAt).toLocaleTimeString()}:
                    </span>
                    <span className="ml-2">{log.message}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Recent logs */}
        {job.logs.length > 0 && job.status !== 'failed' && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
              View Logs ({job.logs.length})
            </summary>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
              {job.logs.slice(0, 10).map(log => (
                <div key={log.id} className="flex items-start space-x-2 text-xs">
                  <span className="text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                  <span
                    className={`px-1 rounded text-xs ${
                      log.level === 'error'
                        ? 'bg-red-100 text-red-800'
                        : log.level === 'warn'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-gray-700">{log.message}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
