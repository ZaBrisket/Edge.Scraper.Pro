import { EDGEWATER_CHECKLIST, findProvisionMatches, scoreSimilarity } from './similarity-scorer';
import { DocxParagraph } from './types';

describe('similarity scorer', () => {
  it('returns higher score for identical clauses', () => {
    const standard = EDGEWATER_CHECKLIST.find((item) => item.id === 'non-disclosure')?.standardText ?? '';

    const similarScore = scoreSimilarity(standard, standard);
    const dissimilarScore = scoreSimilarity('This clause talks about payment terms and pricing schedules.', standard);

    expect(similarScore).toBeGreaterThan(0.9);
    expect(dissimilarScore).toBeLessThan(similarScore);
  });

  it('identifies missing provisions when similarity is low', () => {
    const definitionText = EDGEWATER_CHECKLIST[0].standardText;
    const paragraphs: DocxParagraph[] = [
      {
        id: 'p-0',
        text: definitionText,
        numbering: null,
        level: undefined,
        nodeIndex: 0,
      },
      {
        id: 'p-1',
        text: 'This agreement shall be governed by the laws of Illinois.',
        numbering: null,
        level: undefined,
        nodeIndex: 1,
      },
    ];

    const matches = findProvisionMatches(paragraphs, EDGEWATER_CHECKLIST);
    const missing = matches.filter((match) => match.missing);
    const matched = matches.filter((match) => !match.missing);

    expect(matches).toHaveLength(EDGEWATER_CHECKLIST.length);
    expect(missing.length).toBeGreaterThan(0);
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.find((item) => item.checklistItem.id === EDGEWATER_CHECKLIST[0].id)?.paragraphId).toBeDefined();
  });
});
