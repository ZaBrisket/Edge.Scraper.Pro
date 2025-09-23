import DiffMatchPatch = require('diff-match-patch');

type Diff = [number, string];

class DiffMatchPatchEx extends DiffMatchPatch.diff_match_patch {}

export function previewDiff(before: string, after: string): Diff[] {
  const dmp = new DiffMatchPatchEx();
  dmp.Diff_Timeout = 1;
  const diffs = dmp.diff_main(before, after);
  dmp.diff_cleanupSemantic(diffs);
  return diffs as Diff[];
}

export function applyRanges(
  text: string,
  edits: Array<{ start: number; end: number; replacement: string }>
): string {
  if (!edits.length) return text;
  let out = '';
  let cursor = 0;
  for (const edit of edits) {
    out += text.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  out += text.slice(cursor);
  return out;
}
