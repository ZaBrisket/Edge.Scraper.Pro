const FrameGuard = require('../../public/nda/js/frame-guard.js');

describe('FrameGuard allowlist checks', () => {
  test('allows exact origin match', () => {
    const allowlist = ['https://edgescraperpro.com'];
    expect(FrameGuard.isAllowedReferrer('https://edgescraperpro.com/nda/', allowlist)).toBe(true);
  });

  test('rejects subdomain spoofing attempts', () => {
    const allowlist = ['https://edgescraperpro.com'];
    expect(FrameGuard.isAllowedReferrer('https://evil.edgescraperpro.com', allowlist)).toBe(false);
  });

  test('rejects referrers with embedded credentials', () => {
    const allowlist = ['https://edgescraperpro.com'];
    expect(FrameGuard.isAllowedReferrer('https://attacker:pw@edgescraperpro.com', allowlist)).toBe(false);
  });

  test('rejects empty referrers', () => {
    const allowlist = ['https://edgescraperpro.com'];
    expect(FrameGuard.isAllowedReferrer('', allowlist)).toBe(false);
  });
});
