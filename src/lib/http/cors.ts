// src/lib/http/cors.ts
const DEFAULT_ALLOWED = [
  'https://edgescraperpro.com',
  'https://www.edgescraperpro.com',
  'http://localhost:3000'
];

export function corsHeaders(origin?: string) {
  const allowed = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED.join(','))
    .split(',')
    .map(s => s.trim());

  const allow = origin && allowed.includes(origin) ? origin : allowed[0];

  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}