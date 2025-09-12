# Adding a New Task/Tab

This guide explains how to add a new scraping task to the Edge.Scraper.Pro modular architecture.

## Overview

The modular task architecture consists of:
- **Core Module** (`/core`): Shared utilities and abstractions
- **Task Modules** (`/tasks/<name>`): Individual scraping tasks
- **API Layer** (`/api`): HTTP endpoints and controllers
- **UI Components** (`/components/scrape`): Reusable React components

## Step 1: Create Task Module

Create a new directory for your task:

```bash
mkdir -p tasks/your-task-name
```

### 1.1 Define Schemas (`schema.ts`)

```typescript
import { z } from 'zod';

// Input schema
export const YourTaskInputSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(1500),
  options: z.object({
    concurrency: z.number().min(1).max(20),
    delayMs: z.number().min(0).max(10000),
    timeout: z.number().min(1000).max(60000),
    maxRetries: z.number().min(0).max(5),
    // Add your specific options here
    yourOption: z.boolean(),
  }),
});

// Output schema
export const YourTaskOutputSchema = z.object({
  results: z.array(z.object({
    url: z.string(),
    // Add your specific output fields here
    extractedData: z.string(),
  })),
  summary: z.object({
    total: z.number(),
    successful: z.number(),
    failed: z.number(),
    averageTime: z.number(),
    errors: z.array(z.object({
      url: z.string(),
      error: z.string(),
      category: z.string(),
    })),
  }),
  metadata: z.object({
    jobId: z.string(),
    task: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    duration: z.number(),
  }),
});

// Type exports
export type YourTaskInput = z.infer<typeof YourTaskInputSchema>;
export type YourTaskOutput = z.infer<typeof YourTaskOutputSchema>;
```

### 1.2 Implement Task (`task.ts`)

```typescript
import { ScrapeTask, TaskContext } from '../../core/types';
import { YourTaskInputSchema, YourTaskOutputSchema, YourTaskInput, YourTaskOutput } from './schema';
import { createLogger } from '../../core/log';
import { createBatchProcessor } from '../../core/batchProcessor';

export class YourTask implements ScrapeTask<YourTaskInput, YourTaskOutput> {
  public readonly name = 'your-task-name';
  public readonly input = YourTaskInputSchema;
  public readonly output = YourTaskOutputSchema;

  private logger = createLogger('your-task');

  async run(input: YourTaskInput, ctx: TaskContext): Promise<YourTaskOutput> {
    this.logger.info('Starting your task', {
      taskName: this.name,
      requestId: ctx.correlationId,
      jobId: ctx.jobId,
      urlCount: input.urls.length,
    });

    const startTime = Date.now();

    try {
      // Create batch processor
      const processor = createBatchProcessor({
        concurrency: input.options.concurrency,
        delayMs: input.options.delayMs,
        timeout: input.options.timeout,
        maxRetries: input.options.maxRetries,
      });

      // Process URLs
      const results = await processor.process(
        input.urls,
        async (url: string, index: number) => {
          return await this.processUrl(url, input.options, ctx);
        }
      );

      // Calculate summary
      const successful = results.filter(r => r).length;
      const failed = results.length - successful;

      const output: YourTaskOutput = {
        results: results.filter(r => r),
        summary: {
          total: input.urls.length,
          successful,
          failed,
          averageTime: (Date.now() - startTime) / input.urls.length,
          errors: [],
        },
        metadata: {
          jobId: ctx.jobId || 'unknown',
          task: this.name,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date().toISOString(),
          duration: Date.now() - startTime,
        },
      };

      this.logger.info('Your task completed', {
        taskName: this.name,
        summary: output.summary,
      });

      return output;
    } catch (error) {
      this.logger.error('Your task failed', {
        taskName: this.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async processUrl(url: string, options: YourTaskInput['options'], ctx: TaskContext): Promise<any> {
    // Implement your URL processing logic here
    return {
      url,
      extractedData: `Data from ${url}`,
    };
  }
}
```

### 1.3 Create Index File (`index.ts`)

```typescript
export { YourTask } from './task';
export { YourTaskInputSchema, YourTaskOutputSchema } from './schema';
export type { YourTaskInput, YourTaskOutput } from './schema';

// Create and export the task instance
import { YourTask } from './task';
export const yourTask = new YourTask();
```

## Step 2: Register Task

Add your task to the main task registry:

```typescript
// In tasks/index.ts
import { yourTask } from './your-task-name';

// Register the task
registerTask(yourTask);
```

## Step 3: Create UI Page

Create a new page for your task:

```typescript
// pages/scrape/your-task-name.tsx
import React, { useState } from 'react';
import Layout from '../../components/Layout';
import TabNavigation from '../../components/scrape/TabNavigation';
import TaskForm from '../../components/scrape/TaskForm';
import TaskRunner from '../../components/scrape/TaskRunner';
import TaskResults from '../../components/scrape/TaskResults';

export default function YourTaskPage() {
  const [jobInput, setJobInput] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = (data: any) => {
    const urlList = data.urls
      .split('\n')
      .map((url: string) => url.trim())
      .filter((url: string) => url.length > 0);

    if (urlList.length === 0) {
      alert('Please enter at least one URL');
      return;
    }

    setJobInput({
      urls: urlList,
      options: data.options || {},
    });
  };

  const handleJobComplete = (result: any) => {
    setResult(result);
  };

  const handleJobError = (error: any) => {
    console.error('Job failed:', error);
  };

  const downloadResults = (format: 'json' | 'csv') => {
    if (!result) return;

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify(result, null, 2);
      filename = `your-task-${Date.now()}.json`;
      mimeType = 'application/json';
    } else {
      // Convert to CSV
      const headers = ['URL', 'Extracted Data'];
      const rows = result.results.map((item: any) => [
        item.url,
        item.extractedData || '',
      ]);

      content = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      filename = `your-task-${Date.now()}.csv`;
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Layout title="Web Scraping - Your Task">
      <div className="px-4 sm:px-6 lg:px-8">
        <TabNavigation />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input Form */}
          <div className="lg:col-span-2">
            <TaskForm
              taskName="your-task-name"
              onSubmit={handleSubmit}
              isSubmitting={!!jobInput}
            >
              <div className="space-y-4">
                <div>
                  <label htmlFor="urls" className="block text-sm font-medium text-gray-700">
                    URLs
                  </label>
                  <textarea
                    id="urls"
                    name="urls"
                    rows={6}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Enter URLs, one per line"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="concurrency" className="block text-sm font-medium text-gray-700">
                      Concurrency
                    </label>
                    <input
                      type="number"
                      id="concurrency"
                      name="concurrency"
                      min="1"
                      max="20"
                      defaultValue="3"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="delayMs" className="block text-sm font-medium text-gray-700">
                      Delay (ms)
                    </label>
                    <input
                      type="number"
                      id="delayMs"
                      name="delayMs"
                      min="0"
                      max="10000"
                      defaultValue="1000"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>

                {/* Add your specific form fields here */}
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="yourOption"
                      className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                    />
                    <span className="ml-2 text-sm text-gray-700">Your Option</span>
                  </label>
                </div>
              </div>
            </TaskForm>
          </div>

          {/* Job Status & Results */}
          <div className="lg:col-span-1">
            {jobInput && (
              <TaskRunner
                taskName="your-task-name"
                input={jobInput}
                onComplete={handleJobComplete}
                onError={handleJobError}
              />
            )}

            {result && (
              <TaskResults
                result={result}
                taskName="your-task-name"
                onDownload={downloadResults}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
```

## Step 4: Update Navigation

Add your task to the tab navigation:

```typescript
// In components/scrape/TabNavigation.tsx
const tabs = [
  { name: 'News', href: '/scrape/news', current: false },
  { name: 'Sports', href: '/scrape/sports', current: false },
  { name: 'Companies', href: '/scrape/companies', current: false },
  { name: 'Your Task', href: '/scrape/your-task-name', current: false }, // Add this
];
```

## Step 5: Add Tests

Create tests for your task:

```typescript
// tasks/your-task-name/__tests__/task.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { YourTask } from '../task';

describe('Your Task', () => {
  let task: YourTask;

  beforeEach(() => {
    task = new YourTask();
  });

  it('should have correct properties', () => {
    assert.strictEqual(task.name, 'your-task-name');
    assert.ok(task.input);
    assert.ok(task.output);
  });

  it('should validate input correctly', () => {
    const validInput = {
      urls: ['https://example.com'],
      options: {
        concurrency: 3,
        delayMs: 1000,
        timeout: 15000,
        maxRetries: 2,
        yourOption: true,
      },
    };

    const result = task.input.parse(validInput);
    assert.ok(result);
    assert.strictEqual(result.urls.length, 1);
  });

  // Add more tests as needed
});
```

## Step 6: Update Documentation

Update the main README to include your new task in the list of available tasks.

## Best Practices

1. **Schema Design**: Make your schemas strict and well-validated
2. **Error Handling**: Always handle errors gracefully and log them
3. **Logging**: Use structured logging with consistent context
4. **Testing**: Write comprehensive tests for your task
5. **Performance**: Consider rate limiting and batch processing
6. **Documentation**: Document any special requirements or limitations

## Example Payloads

### Input Example
```json
{
  "urls": [
    "https://example.com/page1",
    "https://example.com/page2"
  ],
  "options": {
    "concurrency": 3,
    "delayMs": 1000,
    "timeout": 15000,
    "maxRetries": 2,
    "yourOption": true
  }
}
```

### Output Example
```json
{
  "results": [
    {
      "url": "https://example.com/page1",
      "extractedData": "Data from page1"
    },
    {
      "url": "https://example.com/page2",
      "extractedData": "Data from page2"
    }
  ],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "averageTime": 1500,
    "errors": []
  },
  "metadata": {
    "jobId": "job-123",
    "task": "your-task-name",
    "startTime": "2025-01-01T00:00:00.000Z",
    "endTime": "2025-01-01T00:00:03.000Z",
    "duration": 3000
  }
}
```

This completes the process of adding a new task to the modular architecture. The task will be automatically available through the API and UI once registered.