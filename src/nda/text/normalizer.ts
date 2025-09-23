export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitSections(text: string): { heading: string; body: string; start: number; end: number }[] {
  const lines = text.split('\n');
  const sections: any[] = [];
  let cur = { heading: 'Preamble', body: [] as string[], start: 0, end: 0 };
  let pos = 0;

  const headingRe = /^(section\s+\d+(\.\d+)*|article\s+\d+|[A-Z][A-Z \-/]{6,}|[A-Z][\w \-]{0,40}:)$/i;

  for (const line of lines) {
    if (headingRe.test(line.trim())) {
      if (cur.body.length) {
        cur.end = pos;
        sections.push({ ...cur, body: cur.body.join('\n') });
      }
      cur = { heading: line.trim(), body: [], start: pos, end: 0 };
    } else {
      cur.body.push(line);
    }
    pos += line.length + 1;
  }
  cur.end = pos;
  sections.push({ ...cur, body: cur.body.join('\n') });
  return sections;
}
