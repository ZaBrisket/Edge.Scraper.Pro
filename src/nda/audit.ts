import crypto from 'node:crypto';
import fs from 'node:fs';

export function sha256Hex(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return crypto.createHash('sha256').update(b).digest('hex');
}

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(path);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
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
