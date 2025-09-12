/**
 * Generic Task Form Component
 * Reusable form component for all scraping tasks
 */

import React, { useState } from 'react';

export interface TaskFormProps {
  taskName: string;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
  children: React.ReactNode;
}

export default function TaskForm({ taskName, onSubmit, isSubmitting, children }: TaskFormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({});
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          {taskName.charAt(0).toUpperCase() + taskName.slice(1)} URLs
        </h3>

        {children}

        <div className="mt-6">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Processing...' : 'Start Extraction'}
          </button>
        </div>
      </div>
    </form>
  );
}
