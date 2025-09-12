import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';

interface Template {
  id: string;
  name: string;
  version: string;
  description?: string;
  sourceHint?: string;
  fields: Array<{
    id: string;
    target: string;
    sourceHeaders: string[];
    transform?: string;
    required: boolean;
    defaultValue?: string;
  }>;
}

interface ColumnMapperProps {
  detectedHeaders: string[];
  templates: Template[];
  onMappingComplete: (templateId: string, mapping: Record<string, string>) => void;
  onBack: () => void;
}

interface AutoMappingResult {
  matches: Array<{
    sourceHeader: string;
    targetField: string;
    confidence: number;
  }>;
  unmappedHeaders: string[];
  requiredFieldsMissing: string[];
  confidence: number;
}

export default function ColumnMapper({
  detectedHeaders,
  templates,
  onMappingComplete,
  onBack,
}: ColumnMapperProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoMappingResult, setAutoMappingResult] = useState<AutoMappingResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-select best template based on detected headers
  useEffect(() => {
    if (templates.length > 0 && !selectedTemplate) {
      // Simple heuristic: pick SourceScrub if available, otherwise first template
      const sourceScrubTemplate = templates.find(t =>
        t.sourceHint?.toLowerCase().includes('sourcescrub')
      );
      const defaultTemplate = sourceScrubTemplate || templates[0];
      setSelectedTemplate(defaultTemplate);
    }
  }, [templates, selectedTemplate]);

  // Auto-map headers when template changes
  const autoMapMutation = useMutation({
    mutationFn: async (template: Template) => {
      // Client-side auto-mapping logic (simplified)
      const matches: Array<{
        sourceHeader: string;
        targetField: string;
        confidence: number;
      }> = [];

      const newMapping: Record<string, string> = {};
      const usedTargetFields = new Set<string>();

      // For each detected header, find best match in template
      for (const sourceHeader of detectedHeaders) {
        let bestMatch: { targetField: string; confidence: number } | null = null;

        for (const field of template.fields) {
          if (usedTargetFields.has(field.target)) continue;

          // Check for exact matches first
          const normalizedSource = sourceHeader.toLowerCase().replace(/[^a-z0-9]/g, '');

          for (const candidateHeader of field.sourceHeaders) {
            const normalizedCandidate = candidateHeader.toLowerCase().replace(/[^a-z0-9]/g, '');

            if (normalizedSource === normalizedCandidate) {
              bestMatch = { targetField: field.target, confidence: 1.0 };
              break;
            }

            // Partial matches
            if (
              normalizedSource.includes(normalizedCandidate) ||
              normalizedCandidate.includes(normalizedSource)
            ) {
              const confidence =
                Math.min(
                  normalizedCandidate.length / normalizedSource.length,
                  normalizedSource.length / normalizedCandidate.length
                ) * 0.8;

              if (!bestMatch || confidence > bestMatch.confidence) {
                bestMatch = { targetField: field.target, confidence };
              }
            }
          }
        }

        if (bestMatch && bestMatch.confidence >= 0.6) {
          matches.push({
            sourceHeader,
            targetField: bestMatch.targetField,
            confidence: bestMatch.confidence,
          });
          newMapping[sourceHeader] = bestMatch.targetField;
          usedTargetFields.add(bestMatch.targetField);
        }
      }

      const unmappedHeaders = detectedHeaders.filter(h => !newMapping[h]);
      const requiredFieldsMissing = template.fields
        .filter(f => f.required)
        .filter(f => !Object.values(newMapping).includes(f.target))
        .map(f => f.target);

      const overallConfidence =
        matches.length > 0 ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length : 0;

      return {
        matches,
        unmappedHeaders,
        requiredFieldsMissing,
        confidence: overallConfidence,
        mapping: newMapping,
      };
    },
  });

  // Trigger auto-mapping when template changes
  useEffect(() => {
    if (selectedTemplate) {
      autoMapMutation.mutate(selectedTemplate);
    }
  }, [selectedTemplate]);

  // Update mapping when auto-mapping completes
  useEffect(() => {
    if (autoMapMutation.data) {
      setMapping(autoMapMutation.data.mapping);
      setAutoMappingResult({
        matches: autoMapMutation.data.matches,
        unmappedHeaders: autoMapMutation.data.unmappedHeaders,
        requiredFieldsMissing: autoMapMutation.data.requiredFieldsMissing,
        confidence: autoMapMutation.data.confidence,
      });
    }
  }, [autoMapMutation.data]);

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
    }
  };

  const handleMappingChange = (sourceHeader: string, targetField: string) => {
    setMapping(prev => ({
      ...prev,
      [sourceHeader]: targetField,
    }));
  };

  const handleContinue = () => {
    if (selectedTemplate) {
      onMappingComplete(selectedTemplate.id, mapping);
    }
  };

  const getMappingValidation = () => {
    if (!selectedTemplate) return { isValid: false, errors: [] };

    const errors: string[] = [];
    const mappedTargetFields = new Set(Object.values(mapping).filter(Boolean));

    // Check required fields
    const missingRequired = selectedTemplate.fields
      .filter(f => f.required)
      .filter(f => !mappedTargetFields.has(f.target))
      .map(f => f.target);

    if (missingRequired.length > 0) {
      errors.push(`Required fields not mapped: ${missingRequired.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  };

  const validation = getMappingValidation();

  if (!selectedTemplate) {
    return <div>Loading templates...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Template selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Mapping Template
        </label>
        <select
          value={selectedTemplate.id}
          onChange={e => handleTemplateChange(e.target.value)}
          className="w-full"
        >
          {templates.map(template => (
            <option key={template.id} value={template.id}>
              {template.name} v{template.version}
              {template.description && ` - ${template.description}`}
            </option>
          ))}
        </select>
        {selectedTemplate.description && (
          <p className="text-sm text-gray-600 mt-1">{selectedTemplate.description}</p>
        )}
      </div>

      {/* Auto-mapping results */}
      {autoMappingResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-blue-900">Auto-Mapping Results</h4>
            <span
              className={`badge ${
                autoMappingResult.confidence >= 0.8
                  ? 'badge-success'
                  : autoMappingResult.confidence >= 0.6
                    ? 'badge-warning'
                    : 'badge-error'
              }`}
            >
              {Math.round(autoMappingResult.confidence * 100)}% confidence
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium text-blue-800">Mapped:</span>
              <span className="ml-2 text-blue-700">
                {autoMappingResult.matches.length} of {detectedHeaders.length} columns
              </span>
            </div>
            <div>
              <span className="font-medium text-blue-800">Unmapped:</span>
              <span className="ml-2 text-blue-700">
                {autoMappingResult.unmappedHeaders.length} columns
              </span>
            </div>
            <div>
              <span className="font-medium text-blue-800">Missing Required:</span>
              <span
                className={`ml-2 ${
                  autoMappingResult.requiredFieldsMissing.length === 0
                    ? 'text-green-700'
                    : 'text-red-700'
                }`}
              >
                {autoMappingResult.requiredFieldsMissing.length} fields
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Mapping table */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <h3>Column Mapping</h3>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="btn-secondary text-sm"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>
          </div>
        </div>
        <div className="card-body p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left">Source Column</th>
                  <th className="text-left">Target Field</th>
                  <th className="text-left">Required</th>
                  {showAdvanced && <th className="text-left">Transform</th>}
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {detectedHeaders.map(sourceHeader => {
                  const currentMapping = mapping[sourceHeader];
                  const targetField = selectedTemplate.fields.find(
                    f => f.target === currentMapping
                  );
                  const autoMatch = autoMappingResult?.matches.find(
                    m => m.sourceHeader === sourceHeader
                  );

                  return (
                    <tr key={sourceHeader}>
                      <td className="font-medium">
                        {sourceHeader}
                        {autoMatch && (
                          <span className="ml-2 text-xs text-gray-500">
                            ({Math.round(autoMatch.confidence * 100)}% match)
                          </span>
                        )}
                      </td>
                      <td>
                        <select
                          value={currentMapping || ''}
                          onChange={e => handleMappingChange(sourceHeader, e.target.value)}
                          className="w-full"
                        >
                          <option value="">-- Select Target Field --</option>
                          {selectedTemplate.fields.map(field => (
                            <option key={field.target} value={field.target}>
                              {field.target}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {targetField?.required && (
                          <span className="badge badge-error">Required</span>
                        )}
                      </td>
                      {showAdvanced && (
                        <td className="text-sm text-gray-600">
                          {targetField?.transform || 'None'}
                        </td>
                      )}
                      <td>
                        {currentMapping ? (
                          <span className="badge badge-success">Mapped</span>
                        ) : (
                          <span className="badge badge-secondary">Unmapped</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Validation errors */}
      {!validation.isValid && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="font-semibold text-red-900 mb-2">Mapping Issues</h4>
          <ul className="text-sm text-red-800 space-y-1">
            {validation.errors.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn-secondary">
          Back to Upload
        </button>

        <button onClick={handleContinue} disabled={!validation.isValid} className="btn-primary">
          Continue to Preview
        </button>
      </div>
    </div>
  );
}
