import type { LogicNode } from './types';
import { legalLemma } from './legal-lemmatizer';

const WORD_RE = /[A-Za-z0-9]+/g;

export function lemma(w: string): string {
  return legalLemma(w);
}

export function tokenizeToLemmas(text: string): string[] {
  const words = text.toLowerCase().match(WORD_RE) || [];
  return words.map(lemma);
}

function has(tokens: string[], base: string, synonyms?: string[]): boolean {
  const set = new Set([lemma(base), ...(synonyms || []).map(lemma)]);
  return tokens.some(t => set.has(t));
}

export function evalLogic(
  node: LogicNode,
  tokens: string[],
  syn: Record<string, string[]> = {}
): boolean {
  switch (node.kind) {
    case 'ALL_OF':
      return node.terms.every(t => has(tokens, t, syn[t]));
    case 'ANY_OF':
      return node.terms.some(t => has(tokens, t, syn[t]));
    case 'NOT':
      return !evalLogic(node.node, tokens, syn);
    case 'NEAR': {
      const A = [node.a, ...(syn[node.a] || [])].map(lemma);
      const B = [node.b, ...(syn[node.b] || [])].map(lemma);
      const posA: number[] = [];
      const posB: number[] = [];
      tokens.forEach((t, i) => {
        if (A.includes(t)) posA.push(i);
        if (B.includes(t)) posB.push(i);
      });
      return posA.some(i => posB.some(j => Math.abs(i - j) <= node.distance));
    }
  }
}
