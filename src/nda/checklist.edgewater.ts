import type { Checklist } from './types';

export const EDGEWATER_CHECKLIST_V1_0: Checklist = {
  id: 'edgewater-nda',
  version: '1.0.0',
  updatedAt: '2024-06-01',
  clauses: [
    {
      name: 'Definition of Confidential Information',
      aliases: ['Confidential Information', 'Definition of CI', 'Definition'],
      mustInclude: ['non-public', 'business'],
      shouldInclude: ['oral or written'],
      severity: 'MEDIUM',
      advice:
        'Ensure core categories of information are expressly covered and exceptions are narrow.',
    },
    {
      name: 'Use Restriction',
      aliases: ['Use', 'Use of Confidential Information'],
      logic: { kind: 'ALL_OF', terms: ['evaluate', 'transaction'] },
      mustNotInclude: ['any purpose'],
      severity: 'HIGH',
      advice: 'Limit the use to evaluating the transaction only.',
    },
    {
      name: 'Term',
      aliases: ['Term', 'Duration', 'Survival'],
      numberBounds: { kind: 'YEARS', min: 1, max: 5 },
      severity: 'MEDIUM',
      advice: 'Survival should be at least 1 year and ideally align with sponsor expectations.',
    },
    {
      name: 'Non-Solicitation',
      aliases: ['Non-Solicitation', 'No Hire'],
      numberBounds: { kind: 'MONTHS', min: 12, max: 24 },
      severity: 'MEDIUM',
      advice: 'Include employees/contractors carve-outs for general advertising where possible.',
    },
    {
      name: 'Non-Competition',
      aliases: ['Non-Competition', 'No Compete'],
      mustNotInclude: ['non-compete'],
      severity: 'HIGH',
      advice: 'Avoid non-compete language in evaluation NDAs.',
    },
  ],
};

export const EDGEWATER_CHECKLIST_V1_1: Checklist = {
  id: 'edgewater-nda',
  version: '1.1.0',
  updatedAt: '2025-09-23',
  clauses: [
    {
      name: 'Definition of Confidential Information',
      aliases: ['Confidential Information', 'Definition of CI', 'Definition'],
      mustInclude: ['non-public', 'business', 'financial', 'technical'],
      shouldInclude: ['trade secret', 'oral or written', 'electronic', 'notes', 'analyses'],
      severity: 'HIGH',
      advice:
        'Definition should be broad and form-agnostic with standard exceptions drafted narrowly.',
    },
    {
      name: 'Use Restriction',
      aliases: ['Use', 'Use of Confidential Information', 'Use Restrictions'],
      logic: { kind: 'ALL_OF', terms: ['evaluate', 'propose', 'transaction'] },
      synonyms: {
        evaluate: ['assessment', 'due diligence', 'review', 'analyzing'],
        propose: ['potential', 'contemplated', 'prospective', 'possible'],
      },
      mustNotInclude: ['any purpose', 'commercialize'],
      severity: 'BLOCKER',
      advice: 'Use must be limited strictly to evaluating the proposed transaction.',
    },
    {
      name: 'Term',
      aliases: ['Term', 'Duration', 'Survival'],
      numberBounds: { kind: 'YEARS', min: 2, max: 5 },
      logic: { kind: 'ANY_OF', terms: ['survive', 'return', 'destroy'] },
      severity: 'MEDIUM',
      advice: 'Target 3-5 years survival; include return/destroy provisions.',
    },
    {
      name: 'Non-Solicitation',
      aliases: ['Non-Solicitation', 'No Hire', 'No-Poach'],
      shouldInclude: ['employees', 'contractors'],
      numberBounds: { kind: 'MONTHS', min: 12, max: 24 },
      severity: 'MEDIUM',
      advice: '12-24 months; carve-outs for general ads and unsolicited applications.',
    },
    {
      name: 'Non-Competition',
      aliases: ['Non-Competition', 'No Compete', 'Non-Compete'],
      mustNotInclude: ['non-compete', 'no compete', 'compete with'],
      severity: 'HIGH',
      advice: 'Avoid NCAs in evaluation NDAs; scope should be limited to use/solicit only.',
    },
    {
      name: 'Residuals',
      aliases: ['Residuals', 'Unaided Memory'],
      logic: { kind: 'NOT', node: { kind: 'ANY_OF', terms: ['residual', 'unaided'] } },
      severity: 'HIGH',
      advice: 'Residuals/unaided memory carve-outs are typically unacceptable for PE diligence.',
    },
    {
      name: 'Governing Law & Venue',
      aliases: ['Governing Law', 'Jurisdiction', 'Venue', 'Disputes'],
      structuredHints: { law: ['DE', 'NY', 'IL'], venue: ['NYC', 'Cook County', 'Wilmington'] },
      severity: 'LOW',
      advice: 'Prefer DE/NY/IL law; avoid unfavorable venues.',
    },
    {
      name: 'Assignment',
      aliases: ['Assignment', 'Successors and Assigns'],
      shouldInclude: ['successors', 'assigns', 'financing sources'],
      severity: 'MEDIUM',
      advice: 'Allow assignment to affiliates/successors or financing sources on notice.',
    },
    {
      name: 'Affiliates/Representatives',
      aliases: ['Representatives', 'Affiliates', 'Permitted Disclosures'],
      mustInclude: ['advisors', 'counsel', 'financing sources'],
      severity: 'HIGH',
      advice: 'Ensure disclosure to reps is permitted, bound by same obligations.',
    },
    {
      name: 'Equitable Relief',
      aliases: ['Injunctive Relief', 'Equitable Remedies', 'Specific Performance'],
      shouldInclude: ['irreparable harm', 'injunctive'],
      severity: 'LOW',
      advice: 'Customary injunctive relief language is acceptable.',
    },
  ],
};

export const EDGEWATER_CHECKLIST = EDGEWATER_CHECKLIST_V1_1;
