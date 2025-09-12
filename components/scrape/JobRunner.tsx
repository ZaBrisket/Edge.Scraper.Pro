/**
 * Job Runner Component
 * Universal job execution with real-time progress updates
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface JobRunnerProps {
  mode: string;
  input: any;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

interface JobStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    completed: number;
    total: number;
    percentage: number;
    errors: number;
  };
  result?: any;
  error?: string;
  startTime: string;
  endTime?: string;
}

export default function JobRunner({ mode, input, onComplete, onError }: JobRunnerProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);

  // Start job mutation
  const startJobMutation = useMutation({
    mutationFn: async (jobInput: any) => {
      const response = await fetch('/api/scrape/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode,
          input: jobInput,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start job');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setJobId(data.jobId);
      setIsStarted(true);
    },
    onError: (error: Error) => {
      onError?.(error.message);
    },
  });

  // Poll job status
  const { data: jobStatus, error: statusError } = useQuery<JobStatus>({
    queryKey: ['jobStatus', jobId],
    queryFn: async () => {
      if (!jobId) throw new Error('No job ID');
      
      const response = await fetch(`/api/scrape/status/${jobId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch job status');
      }
      return response.json();
    },
    enabled: !!jobId && isStarted,
    refetchInterval: (data) => {
      // Stop polling when job is complete or failed
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      return 1000; // Poll every second
    },
  });

  // Handle job completion
  useEffect(() => {
    if (jobStatus?.status === 'completed' && jobStatus.result) {
      onComplete?.(jobStatus.result);
    } else if (jobStatus?.status === 'failed' && jobStatus.error) {
      onError?.(jobStatus.error);
    }
  }, [jobStatus, onComplete, onError]);

  // Handle status error
  useEffect(() => {
    if (statusError) {
      onError?.(statusError.message);
    }
  }, [statusError, onError]);

  const handleStart = () => {
    startJobMutation.mutate(input);
  };

  const handleCancel = async () => {
    if (jobId) {
      try {
        await fetch(`/api/scrape/cancel/${jobId}`, { method: 'POST' });
        setJobId(null);
        setIsStarted(false);
      } catch (error) {
        console.error('Failed to cancel job:', error);
      }
    }
  };

  if (!isStarted) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Ready to Start</h3>
            <p className="text-sm text-gray-500">
              Click start to begin processing {input?.urls?.length || 0} URLs
            </p>
          </div>
          <button
            onClick={handleStart}
            disabled={startJobMutation.isPending}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {startJobMutation.isPending ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Starting...
              </>
            ) : (
              'Start Processing'
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            Processing Job
          </h3>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              jobStatus?.status === 'running'
                ? 'bg-blue-100 text-blue-800'
                : jobStatus?.status === 'completed'
                ? 'bg-green-100 text-green-800'
                : jobStatus?.status === 'failed'
                ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {jobStatus?.status || 'pending'}
            </span>
            {jobStatus?.status === 'running' && (
              <button
                onClick={handleCancel}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
        {jobId && (
          <p className="text-sm text-gray-500 font-mono">Job ID: {jobId}</p>
        )}
      </div>

      {jobStatus?.progress && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>
              {jobStatus.progress.completed} / {jobStatus.progress.total} URLs
              {jobStatus.progress.errors > 0 && (
                <span className="text-red-600 ml-2">
                  ({jobStatus.progress.errors} errors)
                </span>
              )}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${jobStatus.progress.percentage}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{jobStatus.progress.percentage}% complete</span>
            {jobStatus.startTime && (
              <span>
                Started: {new Date(jobStatus.startTime).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}

      {jobStatus?.status === 'completed' && jobStatus.result && (
        <div className="mt-4 space-y-4">
          {/* Success Summary */}
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  Job Completed Successfully
                </h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>
                    Processed {jobStatus.result.summary?.total || 0} URLs with{' '}
                    {jobStatus.result.summary?.successful || 0} successful extractions
                  </p>
                  {jobStatus.endTime && (
                    <p className="mt-1">
                      Duration: {Math.round(
                        (new Date(jobStatus.endTime).getTime() - 
                         new Date(jobStatus.startTime).getTime()) / 1000
                      )}s
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* URL Preservation Info */}
          {jobStatus.result.urlPreservation && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <h4 className="text-sm font-medium text-blue-800 mb-2">URL Processing Details</h4>
              <div className="text-sm text-blue-700 space-y-1">
                <div className="flex justify-between">
                  <span>Source URLs (submitted):</span>
                  <span className="font-medium">{jobStatus.result.urlPreservation.sourceUrls?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>URLs processed:</span>
                  <span className="font-medium">{jobStatus.result.urlPreservation.processedUrls?.length || 0}</span>
                </div>
                {jobStatus.result.urlPreservation.discoveredUrls?.length > 0 && (
                  <div className="flex justify-between">
                    <span>URLs discovered (pagination):</span>
                    <span className="font-medium text-green-600">{jobStatus.result.urlPreservation.discoveredUrls.length}</span>
                  </div>
                )}
              </div>
              <div className="mt-2 text-xs text-blue-600">
                ✓ Original URL list preserved and accessible in results
              </div>
            </div>
          )}
        </div>
      )}

      {jobStatus?.status === 'failed' && jobStatus.error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Job Failed</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{jobStatus.error}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}