import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { AnalyzeNdaRequest, AnalyzeNdaResponse, NDASuggestion } from '../../lib/nda/types';
import {
  EDGEWATER_CHECKLIST,
  findProvisionMatches,
  scoreSimilarity,
} from '../../lib/nda/similarity-scorer';
import { assessBurden } from '../../lib/nda/burden-assessor';
import {
  buildStructureFromPlainText,
  extractStructuredDocx,
  sanitizePlainText,
  validateDocxInput,
} from '../../lib/nda/docx-processor';
import { generateTrackedChangesDoc } from '../../lib/nda/change-tracker';

const PROCESSING_TIMEOUT_MS = 30_000;
const FEATURE_ENABLED = process.env.NDA_V2_ENABLED !== 'false';
const activeSessions = new Set<string>();

type DecisionAction = 'flag' | 'targeted-edit' | 'replace' | 'add';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('NDA analysis timed out. Please simplify the document.'));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function buildTargetedEdit(originalText: string, standardText: string): string {
  let edited = originalText;
  edited = edited.replace(/best efforts/gi, 'commercially reasonable efforts');
  edited = edited.replace(/immediate/gi, 'prompt');
  edited = edited.replace(/at all times/gi, 'as reasonably necessary');
  edited = edited.replace(/sole discretion/gi, 'mutual agreement');
  edited = edited.replace(/without limitation/gi, 'as necessary for the Permitted Purpose');

  const similarity = scoreSimilarity(edited, standardText);
  if (similarity < 0.5) {
    return standardText;
  }

  return edited;
}

function deriveAction(similarity: number, burden: 'low' | 'medium' | 'high', missing: boolean): DecisionAction {
  if (missing) {
    return 'add';
  }

  if (similarity > 0.85 && burden === 'low') {
    return 'flag';
  }

  if (similarity > 0.85 && burden !== 'low') {
    return 'targeted-edit';
  }

  if (similarity < 0.5) {
    return 'replace';
  }

  return 'targeted-edit';
}

function determineSeverity(
  checklistSeverity: 'critical' | 'medium' | 'low',
  burden: 'low' | 'medium' | 'high',
  missing: boolean,
): 'critical' | 'medium' | 'low' {
  if (missing || burden === 'high') {
    return 'critical';
  }

  if (burden === 'medium' && checklistSeverity === 'low') {
    return 'medium';
  }

  return checklistSeverity;
}

function summarizeRationale(
  matchSimilarity: number,
  burdenExplanation: string,
  action: DecisionAction,
  missing: boolean,
): string {
  if (missing) {
    return 'Checklist provision is missing from the inbound agreement.';
  }

  const parts = [`Similarity score: ${(matchSimilarity * 100).toFixed(1)}%.`, burdenExplanation];
  switch (action) {
    case 'flag':
      parts.push('Clause aligns closely with the standard. No redline proposed.');
      break;
    case 'targeted-edit':
      parts.push('Clause is generally aligned but carries additional burden. Applying targeted edits.');
      break;
    case 'replace':
      parts.push('Clause diverges significantly from the standard. Full replacement recommended.');
      break;
    case 'add':
      parts.push('Provision absent. Recommended to add the standard clause.');
      break;
    default:
      break;
  }

  return parts.join(' ');
}

function mapSuggestion(
  match: ReturnType<typeof findProvisionMatches>[number],
  burdenExplanation: ReturnType<typeof assessBurden>,
): NDASuggestion {
  const action = deriveAction(match.similarity, burdenExplanation.burdenLevel, match.missing);
  const stableIdHash = createHash('sha256');
  stableIdHash.update(match.checklistItem.id);
  stableIdHash.update('|');
  stableIdHash.update(match.paragraphId ?? 'missing');
  stableIdHash.update('|');
  stableIdHash.update(action);
  const suggestionId = stableIdHash.digest('hex').slice(0, 16);
  const severity = determineSeverity(
    match.checklistItem.severity,
    burdenExplanation.burdenLevel,
    match.missing,
  );

  const suggestedText = match.missing
    ? match.checklistItem.standardText
    : action === 'replace'
    ? match.checklistItem.standardText
    : action === 'targeted-edit'
    ? buildTargetedEdit(match.paragraphText ?? '', match.checklistItem.standardText)
    : match.paragraphText ?? match.checklistItem.standardText;

  return {
    id: suggestionId,
    checklistId: match.checklistItem.id,
    title: match.checklistItem.title,
    category: match.checklistItem.category,
    severity,
    similarity: Number(match.similarity.toFixed(4)),
    burden: burdenExplanation.burdenLevel,
    action,
    rationale: summarizeRationale(match.similarity, burdenExplanation.explanation, action, match.missing),
    originalText: match.paragraphText,
    suggestedText,
    burdenDetails: burdenExplanation,
    location: match.paragraphId
      ? {
          paragraphId: match.paragraphId,
          index: 0,
        }
      : undefined,
    defaultSelected: action !== 'flag',
  };
}

async function enforceSingleSession(sessionKey: string, handler: () => Promise<AnalyzeNdaResponse>) {
  if (activeSessions.has(sessionKey)) {
    throw new Error('Another NDA analysis is already in progress for this session.');
  }

  activeSessions.add(sessionKey);
  try {
    return await handler();
  } finally {
    activeSessions.delete(sessionKey);
  }
}

export async function analyzeNda(request: AnalyzeNdaRequest): Promise<AnalyzeNdaResponse> {
  const sessionKey = request.sessionId ?? 'global';

  if (!FEATURE_ENABLED) {
    const sanitizedText = sanitizePlainText(request.text ?? '');
    const blocks = sanitizedText ? sanitizedText.split(/\n+/) : [];
    return {
      issues: [],
      extractedText: sanitizedText,
      warnings: ['NDA reviewer v2 disabled via feature flag. Returning sanitized text only.'],
      metrics: {
        totalClauses: blocks.length,
        matchedClauses: 0,
        missingClauses: EDGEWATER_CHECKLIST.length,
      },
    };
  }

  if (!request.text && !request.fileBuffer) {
    throw new Error('Either text or a .docx document must be provided for analysis.');
  }

  return enforceSingleSession(sessionKey, async () => {
    const warnings: string[] = [];
    const checklist = request.checklistOverride ?? EDGEWATER_CHECKLIST;

    const structure = await withTimeout(
      (async () => {
        const incomingBuffer =
          request.fileBuffer ?? (request.fileBase64 ? Buffer.from(request.fileBase64, 'base64') : undefined);

        if (incomingBuffer) {
          validateDocxInput(request.fileName, request.mimeType, incomingBuffer);
          return extractStructuredDocx(incomingBuffer);
        }

        return buildStructureFromPlainText(request.text ?? '');
      })(),
      PROCESSING_TIMEOUT_MS,
    );

    if (!structure.paragraphs.length) {
      warnings.push('No paragraphs detected in the provided input.');
    }

    const matches = findProvisionMatches(structure.paragraphs, checklist);

    const issues: NDASuggestion[] = matches.map((match) => {
      const burdenAssessment = match.missing
        ? assessBurden(match.checklistItem.standardText, match.checklistItem.standardText)
        : assessBurden(match.paragraphText ?? '', match.checklistItem.standardText);

      return mapSuggestion(match, burdenAssessment);
    });

    let exportDocumentBase64: string | undefined;
    if (request.includeDocxExport && request.selectedIssueIds?.length) {
      const accepted = issues.filter((issue) => request.selectedIssueIds?.includes(issue.id));
      if (accepted.length) {
        const buffer = await withTimeout(
          generateTrackedChangesDoc(structure, accepted),
          PROCESSING_TIMEOUT_MS,
        );
        exportDocumentBase64 = buffer.toString('base64');
      }
    }

    const matchedClauses = matches.filter((match) => !match.missing).length;

    return {
      issues,
      extractedText: structure.plainText,
      exportDocumentBase64,
      warnings,
      metrics: {
        totalClauses: structure.paragraphs.length,
        matchedClauses,
        missingClauses: checklist.length - matchedClauses,
      },
    };
  });
}

export default analyzeNda;

function normalizeJsonPayload(body: any): AnalyzeNdaRequest {
  const includeExportRaw = body?.includeDocxExport;
  const includeDocxExport =
    includeExportRaw === true || includeExportRaw === 'true' || includeExportRaw === 1 || includeExportRaw === '1';

  const request: AnalyzeNdaRequest = {
    text: typeof body?.text === 'string' ? body.text : undefined,
    fileName: typeof body?.fileName === 'string' ? body.fileName : undefined,
    mimeType: typeof body?.mimeType === 'string' ? body.mimeType : undefined,
    fileBase64: typeof body?.fileBase64 === 'string' ? body.fileBase64 : undefined,
    sessionId: typeof body?.sessionId === 'string' ? body.sessionId : undefined,
    includeDocxExport,
    selectedIssueIds: Array.isArray(body?.selectedIssueIds)
      ? body.selectedIssueIds.filter((id: unknown): id is string => typeof id === 'string')
      : undefined,
  };

  if (Array.isArray(body?.checklistOverride)) {
    request.checklistOverride = body.checklistOverride as any;
  } else if (body?.checklistOverride) {
    throw new Error('checklistOverride must be an array of checklist items.');
  }

  return request;
}

async function normalizeFormPayload(formData: FormData): Promise<AnalyzeNdaRequest> {
  const text = formData.get('text');
  const sessionId = formData.get('sessionId');
  const includeDocxExport = formData.get('includeDocxExport');
  const checklistOverride = formData.get('checklistOverride');
  const selectedIssueIds = formData.getAll('selectedIssueIds');

  let fileBuffer: Buffer | undefined;
  let fileName: string | undefined;
  let mimeType: string | undefined;

  const fileValue = formData.get('file');
  if (fileValue && typeof (fileValue as any).arrayBuffer === 'function') {
    const fileLike = fileValue as any;
    fileName = typeof fileLike.name === 'string' ? fileLike.name : undefined;
    mimeType = typeof fileLike.type === 'string' ? fileLike.type : undefined;
    const arrayBuffer = await fileLike.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  }

  let parsedChecklist: any;
  if (typeof checklistOverride === 'string' && checklistOverride.trim()) {
    try {
      parsedChecklist = JSON.parse(checklistOverride);
    } catch (error) {
      throw new Error('Invalid checklistOverride payload. Must be valid JSON.');
    }
  }

  if (parsedChecklist && !Array.isArray(parsedChecklist)) {
    throw new Error('checklistOverride must be provided as a JSON array.');
  }

  const filteredIssueIds = selectedIssueIds
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => id.trim())
    .filter((id) => id.length);

  const payload: AnalyzeNdaRequest = {
    text: typeof text === 'string' ? text : undefined,
    sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    includeDocxExport: includeDocxExport === 'true' || includeDocxExport === '1',
    fileBuffer,
    fileName,
    mimeType,
    selectedIssueIds: filteredIssueIds.length ? filteredIssueIds : undefined,
    checklistOverride: parsedChecklist,
  };

  return payload;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const contentType = req.headers.get('content-type') ?? 'application/json';
    let requestPayload: AnalyzeNdaRequest;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      requestPayload = await normalizeFormPayload(form);
    } else {
      const body = await req.json().catch(() => ({}));
      requestPayload = normalizeJsonPayload(body);
    }

    const result = await analyzeNda(requestPayload);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error during NDA analysis.';
    const status = message.includes('already in progress')
      ? 429
      : message.includes('timed out')
      ? 504
      : 400;

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
