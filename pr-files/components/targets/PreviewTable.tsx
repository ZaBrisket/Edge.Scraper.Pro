import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

interface PreviewTableProps {
  datasetId: string;
  templateId: string;
  customMapping?: Record<string, string>;
  sampleSize?: number;
}

interface PreviewData {
  dataset: {
    id: string;
    name: string;
    rowsEstimated: number;
    fileSize: number;
  };
  template: {
    id: string;
    name: string;
    version: string;
  };
  columns: {
    detected: string[];
    target: Array<{
      name: string;
      required: boolean;
      transform?: string;
      defaultValue?: string;
    }>;
  };
  mapping: Record<string, string>;
  mappingStats: {
    totalHeaders: number;
    mappedHeaders: number;
    unmappedHeaders: number;
    requiredFieldsTotal: number;
    requiredFieldsMapped: number;
    mappingComplete: boolean;
  };
  sampleRows: {
    original: Array<Record<string, any>>;
    transformed: Array<Record<string, any>>;
  };
  unmappedHeaders: string[];
}

export default function PreviewTable({ 
  datasetId, 
  templateId, 
  customMapping,
  sampleSize = 50 
}: PreviewTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Fetch preview data
  const { data, isLoading, error } = useQuery<PreviewData>({
    queryKey: ['preview', datasetId, templateId, customMapping, sampleSize],
    queryFn: async () => {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId,
          templateId,
          customMapping,
          sampleSize,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to load preview');
      }

      return response.json();
    },
  });

  // Virtual scrolling for large datasets
  const rowVirtualizer = useVirtualizer({
    count: data?.sampleRows.transformed.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Estimated row height
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h4 className="font-semibold text-red-900 mb-2">Preview Error</h4>
        <p className="text-red-800">{(error as Error).message}</p>
      </div>
    );
  }

  if (!data) return null;

  const targetColumns = data.columns.target.filter(col => 
    Object.values(data.mapping).includes(col.name)
  );

  return (
    <div className="space-y-6">
      {/* Dataset info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900">Dataset</h4>
          <p className="text-blue-800">{data.dataset.name}</p>
          <p className="text-sm text-blue-700">
            ~{data.dataset.rowsEstimated?.toLocaleString()} rows
          </p>
        </div>
        
        <div className="bg-green-50 rounded-lg p-4">
          <h4 className="font-semibold text-green-900">Template</h4>
          <p className="text-green-800">{data.template.name}</p>
          <p className="text-sm text-green-700">v{data.template.version}</p>
        </div>
        
        <div className="bg-purple-50 rounded-lg p-4">
          <h4 className="font-semibold text-purple-900">Mapping Quality</h4>
          <div className="flex items-center space-x-2">
            <span className={`badge ${
              data.mappingStats.mappingComplete ? 'badge-success' : 'badge-warning'
            }`}>
              {data.mappingStats.mappedHeaders}/{data.mappingStats.totalHeaders} mapped
            </span>
          </div>
          <p className="text-sm text-purple-700">
            {data.mappingStats.requiredFieldsMapped}/{data.mappingStats.requiredFieldsTotal} required
          </p>
        </div>
      </div>

      {/* Mapping warnings */}
      {(!data.mappingStats.mappingComplete || data.unmappedHeaders.length > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-semibold text-yellow-900 mb-2">Mapping Warnings</h4>
          <div className="space-y-2 text-sm">
            {!data.mappingStats.mappingComplete && (
              <p className="text-yellow-800">
                • Some required fields are not mapped and may result in incomplete data
              </p>
            )}
            {data.unmappedHeaders.length > 0 && (
              <p className="text-yellow-800">
                • Unmapped columns: {data.unmappedHeaders.join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Preview table */}
      <div className="card">
        <div className="card-header">
          <h3>Data Preview ({data.sampleRows.transformed.length} sample rows)</h3>
          <p className="text-sm text-gray-600">
            Showing transformed data as it will appear in the final export
          </p>
        </div>
        
        <div className="card-body p-0">
          <div 
            ref={parentRef}
            className="h-96 overflow-auto"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {/* Table header */}
              <div className="sticky top-0 z-10 bg-gray-50 border-b">
                <div className="flex">
                  {targetColumns.map((column) => (
                    <div
                      key={column.name}
                      className="flex-1 min-w-32 px-4 py-3 text-sm font-medium text-gray-900 border-r"
                    >
                      <div className="flex items-center space-x-2">
                        <span>{column.name}</span>
                        {column.required && (
                          <span className="badge badge-error text-xs">Required</span>
                        )}
                      </div>
                      {column.transform && (
                        <div className="text-xs text-gray-500 mt-1">
                          Transform: {column.transform}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Virtual rows */}
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = data.sampleRows.transformed[virtualRow.index];
                
                return (
                  <div
                    key={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`flex ${
                      virtualRow.index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    } border-b hover:bg-blue-50`}
                  >
                    {targetColumns.map((column) => (
                      <div
                        key={column.name}
                        className="flex-1 min-w-32 px-4 py-3 text-sm border-r"
                      >
                        <div className="truncate" title={row[column.name]?.toString()}>
                          {row[column.name] !== null && row[column.name] !== undefined
                            ? row[column.name].toString()
                            : (
                              <span className="text-gray-400 italic">
                                {column.defaultValue || 'N/A'}
                              </span>
                            )
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Data statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-gray-900">
            {data.sampleRows.transformed.length}
          </div>
          <div className="text-sm text-gray-600">Sample Rows</div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-gray-900">
            {targetColumns.length}
          </div>
          <div className="text-sm text-gray-600">Mapped Fields</div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-gray-900">
            {data.mappingStats.requiredFieldsMapped}
          </div>
          <div className="text-sm text-gray-600">Required Fields</div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-gray-900">
            {Math.round((data.mappingStats.mappedHeaders / data.mappingStats.totalHeaders) * 100)}%
          </div>
          <div className="text-sm text-gray-600">Coverage</div>
        </div>
      </div>
    </div>
  );
}