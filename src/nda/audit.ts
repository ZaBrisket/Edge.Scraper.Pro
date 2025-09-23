import crypto from 'node:crypto';

export function sha256Hex(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return crypto.createHash('sha256').update(b).digest('hex');
}

export interface AuditEvent {
  kind: 'review';
  checklistId: string;
  version: string;
  docSha256: string;
  createdAt: string;
  meta?: Record<string, any>;
}

export async function writeAudit(ev: AuditEvent) {
  console.log('[AUDIT]', JSON.stringify(ev));
}
