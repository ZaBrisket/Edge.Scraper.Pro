/**
 * Generic Task Runner Component
 * Handles task execution and status updates
 */

import React, { useState, useEffect } from 'react';

export interface TaskRunnerProps {
  taskName: string;
  input: any;
  onComplete: (result: any) => void;
  onError: (error: string) => void;
}

export default function TaskRunner({ taskName, input, onComplete, onError }: TaskRunnerProps) {
  const [status, setStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending');
  const [progress, setProgress] = useState({ completed: 0, total: 0, percentage: 0, errors: 0 });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!input) return;

    const startJob = async () => {
      try {
        setStatus('running');
        
        // Start the job
        const startResponse = await fetch('/api/tasks/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskName, input }),
        });

        if (!startResponse.ok) {
          throw new Error('Failed to start job');
        }

        const { jobId } = await startResponse.json();

        // Poll for status updates
        const pollStatus = async () => {
          try {
            const statusResponse = await fetch(`/api/tasks/status/${jobId}`);
            if (!statusResponse.ok) {
              throw new Error('Failed to get job status');
            }

            const jobStatus = await statusResponse.json();
            setStatus(jobStatus.status);
            setProgress(jobStatus.progress || { completed: 0, total: 0, percentage: 0, errors: 0 });

            if (jobStatus.status === 'completed') {
              setResult(jobStatus.result);
              onComplete(jobStatus.result);
            } else if (jobStatus.status === 'failed') {
              setError(jobStatus.error);
              onError(jobStatus.error);
            } else if (jobStatus.status === 'running') {
              // Continue polling
              setTimeout(pollStatus, 1000);
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            onError(err instanceof Error ? err.message : 'Unknown error');
          }
        };

        // Start polling
        setTimeout(pollStatus, 1000);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        onError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    startJob();
  }, [input, taskName, onComplete, onError]);

  if (status === 'pending') {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Job Status</h3>
        <div className="text-center text-gray-500">Preparing job...</div>
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Job Status</h3>
        
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Status:</span>
            <span className="font-medium text-blue-600">Running</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Progress:</span>
            <span className="font-medium">{progress.completed} / {progress.total}</span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          
          {progress.errors > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Errors:</span>
              <span className="font-medium text-red-600">{progress.errors}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Job Failed</h3>
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return null;
}