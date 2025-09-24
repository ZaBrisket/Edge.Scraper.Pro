import { Document, Packer, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import { Builder } from 'xml2js';
import { NDASuggestion, DocxStructure, DocxParagraph } from './types';
import { extractStructuredDocx } from './docx-processor';

function cloneDeep<T>(input: T): T {
  return JSON.parse(JSON.stringify(input));
}

function buildInsertionRun(text: string) {
  return [
    {
      'w:rPr': [],
      'w:t': [
        {
          _: text,
        },
      ],
    },
  ];
}

function buildDeletionRun(text: string) {
  return [
    {
      'w:rPr': [],
      'w:delText': [
        {
          _: text,
        },
      ],
    },
  ];
}

function applyTrackedChange(
  paragraphNode: any,
  suggestion: NDASuggestion,
  changeId: number,
  author: string,
  timestamp: string,
): void {
  if (!suggestion.suggestedText) {
    return;
  }

  const deletionText = suggestion.originalText ?? '';

  if (!paragraphNode['w:pPr']) {
    paragraphNode['w:pPr'] = [];
  }

  paragraphNode['w:r'] = [];

  if (deletionText) {
    paragraphNode['w:del'] = [
      {
        $: {
          'w:id': `${changeId}0`,
          'w:author': author,
          'w:date': timestamp,
        },
        'w:r': buildDeletionRun(deletionText),
      },
    ];
  }

  paragraphNode['w:ins'] = [
    {
      $: {
        'w:id': `${changeId}1`,
        'w:author': author,
        'w:date': timestamp,
      },
      'w:r': buildInsertionRun(suggestion.suggestedText),
    },
  ];
}

function createInsertedParagraph(
  text: string,
  changeId: number,
  author: string,
  timestamp: string,
): any {
  return {
    'w:pPr': [],
    'w:ins': [
      {
        $: {
          'w:id': `${changeId}0`,
          'w:author': author,
          'w:date': timestamp,
        },
        'w:r': buildInsertionRun(text),
      },
    ],
  };
}

async function ensureDocxStructure(structure: DocxStructure): Promise<DocxStructure> {
  if (structure.source === 'docx') {
    if (structure.paragraphIdAliasMap) {
      return structure;
    }

    const aliasMap: Record<string, string> = {};
    structure.paragraphs.forEach((paragraph) => {
      aliasMap[paragraph.id] = paragraph.id;
    });

    return { ...structure, paragraphIdAliasMap: aliasMap };
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: structure.paragraphs.map(
          (paragraph) =>
            new Paragraph({
              children: [new TextRun({ text: paragraph.text })],
            }),
        ),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const rebuilt = await extractStructuredDocx(Buffer.from(buffer));

  const aliasMap: Record<string, string> = {
    ...(rebuilt.paragraphIdAliasMap ?? {}),
  };

  const matchedIndices = new Set<number>();
  const normalize = (value: string | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  structure.paragraphs.forEach((paragraph, index) => {
    let selectedIndex = rebuilt.paragraphs.findIndex((candidate, candidateIndex) => {
      if (matchedIndices.has(candidateIndex)) {
        return false;
      }

      return normalize(candidate.text) === normalize(paragraph.text);
    });

    if (selectedIndex === -1 && index < rebuilt.paragraphs.length) {
      selectedIndex = index;
    }

    if (selectedIndex !== -1) {
      aliasMap[paragraph.id] = rebuilt.paragraphs[selectedIndex].id;
      matchedIndices.add(selectedIndex);
    }
  });

  return {
    ...rebuilt,
    plainText: structure.plainText,
    paragraphIdAliasMap: aliasMap,
  };
}

export async function generateTrackedChangesDoc(
  structure: DocxStructure,
  suggestions: NDASuggestion[],
  author = 'EdgeScraperPro',
): Promise<Buffer> {
  if (!suggestions.length) {
    throw new Error('No accepted suggestions provided for export.');
  }

  const workingStructure = await ensureDocxStructure(structure);
  if (!workingStructure.xmlDocument || !workingStructure.originalBuffer) {
    throw new Error('Document structure is incomplete for tracked changes export.');
  }

  const xmlClone = cloneDeep(workingStructure.xmlDocument);
  const paragraphs = xmlClone['w:document']?.['w:body']?.[0]?.['w:p'];
  if (!Array.isArray(paragraphs)) {
    throw new Error('Unable to locate paragraph nodes in document XML.');
  }

  const paragraphMap = new Map<string, DocxParagraph>();
  workingStructure.paragraphs.forEach((paragraph) => {
    paragraphMap.set(paragraph.id, paragraph);
  });

  if (workingStructure.paragraphIdAliasMap) {
    Object.entries(workingStructure.paragraphIdAliasMap).forEach(([aliasId, canonicalId]) => {
      const canonicalParagraph = paragraphMap.get(canonicalId);
      if (canonicalParagraph) {
        paragraphMap.set(aliasId, canonicalParagraph);
      }
    });
  }

  const timestamp = new Date().toISOString();
  let changeId = 1;

  suggestions.forEach((suggestion) => {
    if (suggestion.action === 'flag') {
      return;
    }

    if (suggestion.location) {
      const targetParagraph = paragraphMap.get(suggestion.location.paragraphId);
      if (!targetParagraph) {
        return;
      }

      const xmlParagraph = paragraphs[targetParagraph.nodeIndex];
      if (!xmlParagraph) {
        return;
      }

      applyTrackedChange(xmlParagraph, suggestion, changeId, author, timestamp);
      changeId += 1;
    } else if (suggestion.suggestedText) {
      paragraphs.push(createInsertedParagraph(suggestion.suggestedText, changeId, author, timestamp));
      changeId += 1;
    }
  });

  const builder = new Builder({ headless: true });
  const updatedXml = builder.buildObject(xmlClone);
  const zip = await JSZip.loadAsync(workingStructure.originalBuffer);
  zip.file('word/document.xml', updatedXml);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return Buffer.from(buffer);
}
