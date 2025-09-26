const path = require('node:path');

describe('Targets mapping heuristics', () => {
  const modulePath = path.join(__dirname, '..', '..', 'public', 'targets', 'ma-targets.js');
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const mapping = require(modulePath);

  test('extractCanonicalWebsite unwraps aggregator URLs', () => {
    const raw = 'https://app.sourcescrub.com/?url=https%3A%2F%2Fwww.acme.com%2Fabout';
    expect(mapping.extractCanonicalWebsite(raw)).toBe('https://www.acme.com');
  });

  test('extractCanonicalWebsite normalizes bare domains to https origin', () => {
    expect(mapping.extractCanonicalWebsite('acme.com')).toBe('https://acme.com');
  });

  test('extractCanonicalWebsite returns null when only aggregator host present', () => {
    const raw = 'https://app.sourcescrub.com/companies/12345';
    expect(mapping.extractCanonicalWebsite(raw)).toBeNull();
  });

  test('pickColumn prefers real website domains over aggregator search URLs', () => {
    const headers = ['Company Name', 'Search URL', 'Website'];
    const rows = [
      {
        'Company Name': 'Acme Industrial',
        'Search URL': 'https://google.com/search?q=Acme',
        Website: 'acmeindustrial.com',
      },
      {
        'Company Name': 'Beta Labs',
        'Search URL': 'https://app.sourcescrub.com/?url=https%3A%2F%2Fwww.betalabs.io%2Foverview',
        Website: 'www.betalabs.io',
      },
    ];
    expect(mapping.pickColumn('website', headers, rows)).toBe('Website');
  });

  test('normalizeRows omits aggregator-only websites', () => {
    const rows = [
      {
        Company: 'Aggregator Only',
        Website: 'https://app.sourcescrub.com/company/123',
        Description: 'Example company',
      },
    ];
    const normalized = mapping.normalizeRows(rows, { setSummary: jest.fn() });
    expect(normalized).toHaveLength(1);
    expect(normalized[0].Website).toBe('');
    expect(normalized[0]['Company Name']).toBe('Aggregator Only');
  });
});
