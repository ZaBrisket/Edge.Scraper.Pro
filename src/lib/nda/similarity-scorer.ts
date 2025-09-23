import { WordTokenizer, TfIdf, PorterStemmer, stopwords as defaultStopwords } from 'natural';
import { ChecklistItem, DocxParagraph, ProvisionMatch } from './types';

const tokenizer = new WordTokenizer();
const stopwordSet = new Set(defaultStopwords);

function normalizeText(input: string): string {
  return input
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  return tokenizer
    .tokenize(normalized)
    .map((token) => PorterStemmer.stem(token))
    .filter((token) => token && !stopwordSet.has(token));
}

function buildVector(tokens: string[]): Map<string, number> {
  const vector = new Map<string, number>();
  for (const token of tokens) {
    vector.set(token, (vector.get(token) ?? 0) + 1);
  }
  return vector;
}

function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const value of vecA.values()) {
    magnitudeA += value * value;
  }

  for (const value of vecB.values()) {
    magnitudeB += value * value;
  }

  const uniqueTokens = new Set([...vecA.keys(), ...vecB.keys()]);
  for (const token of uniqueTokens) {
    const weightA = vecA.get(token) ?? 0;
    const weightB = vecB.get(token) ?? 0;
    dotProduct += weightA * weightB;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / Math.sqrt(magnitudeA * magnitudeB);
}

export function scoreSimilarity(a: string, b: string): number {
  if (!a?.trim() || !b?.trim()) {
    return 0;
  }

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (!tokensA.length || !tokensB.length) {
    return 0;
  }

  // Boost semantics with TF-IDF weighting across combined corpus
  const tfidf = new TfIdf();
  tfidf.addDocument(tokensA.join(' '));
  tfidf.addDocument(tokensB.join(' '));

  const weightedA = new Map<string, number>();
  const weightedB = new Map<string, number>();

  for (const token of new Set([...tokensA, ...tokensB])) {
    weightedA.set(token, tfidf.tfidf(token, 0));
    weightedB.set(token, tfidf.tfidf(token, 1));
  }

  return Number(cosineSimilarity(weightedA, weightedB).toFixed(4));
}

export function findProvisionMatches(
  paragraphs: DocxParagraph[],
  checklist: ChecklistItem[],
): ProvisionMatch[] {
  return checklist.map((item) => {
    let bestMatch: ProvisionMatch = {
      checklistItem: item,
      similarity: 0,
      missing: true,
    };

    paragraphs.forEach((paragraph) => {
      if (!paragraph.text.trim()) {
        return;
      }

      const similarity = scoreSimilarity(paragraph.text, item.standardText);
      if (similarity > bestMatch.similarity) {
        bestMatch = {
          checklistItem: item,
          similarity,
          paragraphId: paragraph.id,
          paragraphText: paragraph.text,
          missing: similarity < 0.5,
        };
      }
    });

    if (bestMatch.similarity >= 0.5) {
      bestMatch.missing = false;
    }

    return bestMatch;
  });
}

export const EDGEWATER_CHECKLIST: ChecklistItem[] = [
  {
    id: 'confidential-information-scope',
    title: 'Scope of Confidential Information',
    description: 'Defines what information is considered confidential and any exclusions.',
    category: 'Definitions',
    severity: 'critical',
    standardText:
      'Confidential Information means any non-public business, technical, or financial information disclosed by either party, excluding information that is or becomes public through no fault of the recipient, was rightfully known prior to disclosure, or is independently developed without reference to the disclosed materials.',
  },
  {
    id: 'permitted-use',
    title: 'Permitted Use',
    description: 'Clarifies the limited purpose for which disclosed information may be used.',
    category: 'Use Restrictions',
    severity: 'critical',
    standardText:
      'The recipient shall use the Confidential Information solely for evaluating a potential business relationship with the disclosing party and for no other purpose.',
  },
  {
    id: 'non-disclosure',
    title: 'Non-Disclosure Obligations',
    description: 'Obligation to protect and not disclose confidential information.',
    category: 'Use Restrictions',
    severity: 'critical',
    standardText:
      'Recipient agrees to hold all Confidential Information in strict confidence and will not disclose it to any third party except as expressly permitted under this Agreement.',
  },
  {
    id: 'care-standard',
    title: 'Standard of Care',
    description: 'Specifies the level of care required to protect information.',
    category: 'Security',
    severity: 'medium',
    standardText:
      'Recipient shall protect Confidential Information using at least the same degree of care it uses to protect its own confidential information, and in no event less than a commercially reasonable standard of care.',
  },
  {
    id: 'representatives',
    title: 'Authorized Representatives',
    description: 'Limits disclosure to representatives with need to know and protective obligations.',
    category: 'Disclosure',
    severity: 'medium',
    standardText:
      'Recipient may disclose Confidential Information to its employees, agents, and advisors who have a need to know for the Permitted Purpose and are bound by confidentiality obligations no less protective than those in this Agreement.',
  },
  {
    id: 'compelled-disclosure',
    title: 'Compelled Disclosure',
    description: 'Process when disclosure is legally required.',
    category: 'Disclosure',
    severity: 'medium',
    standardText:
      'If recipient is required by law to disclose Confidential Information, it shall provide prompt written notice to the disclosing party and cooperate to seek a protective order or other appropriate remedy.',
  },
  {
    id: 'term-and-survival',
    title: 'Term and Survival',
    description: 'Duration of obligations and survival of confidentiality duties.',
    category: 'Term',
    severity: 'critical',
    standardText:
      'This Agreement commences on the Effective Date and continues for two (2) years. Confidentiality obligations survive for three (3) years following termination or expiration.',
  },
  {
    id: 'return-or-destruction',
    title: 'Return or Destruction',
    description: 'Obligation to return or destroy information upon request or termination.',
    category: 'Post-Termination',
    severity: 'critical',
    standardText:
      'Upon written request, recipient shall promptly return or destroy all Confidential Information and certify such destruction, except as required to be retained by law or archival policy.',
  },
  {
    id: 'no-license',
    title: 'No License Granted',
    description: 'Clarifies that no intellectual property rights are transferred.',
    category: 'Intellectual Property',
    severity: 'low',
    standardText:
      'Nothing in this Agreement grants the recipient any rights, by license or otherwise, to the disclosing party’s intellectual property except as expressly stated herein.',
  },
  {
    id: 'remedies',
    title: 'Equitable Remedies',
    description: 'Allows injunctive relief for breaches.',
    category: 'Remedies',
    severity: 'medium',
    standardText:
      'Recipient acknowledges that unauthorized disclosure may cause irreparable harm and agrees that the disclosing party may seek injunctive or other equitable relief in addition to legal remedies.',
  },
  {
    id: 'governing-law',
    title: 'Governing Law and Venue',
    description: 'Specifies governing law and forum.',
    category: 'Legal Terms',
    severity: 'low',
    standardText:
      'This Agreement shall be governed by and construed in accordance with the laws of the State of Illinois, without regard to its conflict of law principles. The parties consent to exclusive jurisdiction in state and federal courts located in Cook County, Illinois.',
  },
  {
    id: 'non-solicitation',
    title: 'Non-Solicitation',
    description: 'Optional non-solicitation of personnel or clients.',
    category: 'Additional Protections',
    severity: 'low',
    standardText:
      'During the term of this Agreement and for twelve (12) months thereafter, neither party will directly solicit for employment any employees of the other party with whom they had material contact in connection with the Permitted Purpose.',
  },
];
