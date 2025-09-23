import { describe, expect, it } from 'vitest';

describe('nda-export contract', () => {
  it('fails fast when Aspose credentials are not configured', async () => {
    const originalSid = process.env.ASPOSE_WORDS_APP_SID;
    const originalKey = process.env.ASPOSE_WORDS_APP_KEY;
    delete process.env.ASPOSE_WORDS_APP_SID;
    delete process.env.ASPOSE_WORDS_APP_KEY;

    try {
      const module = await import('../../netlify/functions/nda-export');
      const response = await module.handler({
        httpMethod: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalKind: 'text',
          originalText: 'Example',
          normalizedText: 'Example',
          edits: []
        })
      } as any);

      expect(response.statusCode).toBe(400);
    } finally {
      process.env.ASPOSE_WORDS_APP_SID = originalSid;
      process.env.ASPOSE_WORDS_APP_KEY = originalKey;
    }
  });
});
