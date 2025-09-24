import engine from "./policyEngine";

declare global {
interface Window {
  NDAPolicyEngine: typeof engine;
  NDA_ENV?: { MAX_DOCX_MB: number };
}
}

const maxMb = Number(process.env.NDA_MAX_DOCX_MB ?? "5");

const api = engine;

if (typeof window !== "undefined") {
  (window as any).NDAPolicyEngine = api;
  (window as any).NDA_ENV = { MAX_DOCX_MB: maxMb };
}

export default api;
