import fs from "node:fs";
import path from "node:path";
import type { EdgewaterChecklist } from "./types";

export function loadDefaultChecklist(): EdgewaterChecklist {
  const p = path.join(process.cwd(), "schemas", "edgewater-nda-checklist.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

export function loadChecklistFromJson(json?: string): EdgewaterChecklist {
  if (!json) return loadDefaultChecklist();
  const obj = JSON.parse(json);
  if (!obj?.provisions?.length) return loadDefaultChecklist();
  return obj;
}
