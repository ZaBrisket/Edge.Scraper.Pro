const $ = (s) => document.querySelector(s);
const fileEl = $("#file");
const checklistEl = $("#checklist");
const analyzeBtn = $("#analyze");
const exportBtn = $("#export");
const statusEl = $("#status");
const tableBody = $("#issuesTable tbody");
const previewEl = $("#preview");
const analysisCard = $("#analysisCard");
const downloadA = $("#download");

const MAX_BYTES = 25 * 1024 * 1024;

let lastAnalysis = null;
let originalDocBase64 = null;
let lastUploadWasDocx = false;

analyzeBtn.addEventListener("click", async () => {
  const file = fileEl.files?.[0];
  if (!file) return status("Please choose a file.");
  if (file.size > MAX_BYTES) {
    return status("File too large. Maximum size is 25MB.");
  }
  status("Uploading...");
  lastUploadWasDocx =
    /\.docx$/i.test(file.name || "") ||
    (file.type || "").includes("wordprocessingml.document");
  resetDownloadLink();
  const fd = new FormData();
  fd.append("file", file);
  const checklist = checklistEl.files?.[0];
  if (checklist) {
    const txt = await checklist.text();
    fd.append("checklist", txt);
  }

  const res = await fetch("/.netlify/functions/nda-reviewer", { method: "POST", body: fd });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    return status("Error: " + (e.error || res.statusText));
  }
  lastAnalysis = await res.json();
  originalDocBase64 = lastUploadWasDocx ? await fileToBase64(file) : null;

  renderIssues(lastAnalysis.issues || []);
  previewEl.textContent = (lastAnalysis.textPreview || "").slice(0, 5000);
  analysisCard.classList.remove("hidden");
  resetDownloadLink();
  const issueCount = (lastAnalysis.issues || []).length;
  exportBtn.disabled = !lastUploadWasDocx || issueCount === 0;
  if (!lastUploadWasDocx) {
    exportBtn.title = "Upload a .docx file to export tracked changes.";
    status(
      `Found ${issueCount} issue(s). Redline export requires .docx format. Convert your document first.`
    );
  } else {
    exportBtn.removeAttribute("title");
    status(`Found ${issueCount} issue(s).`);
  }
});

exportBtn.addEventListener("click", async () => {
  if (!lastUploadWasDocx)
    return status("Redline export requires .docx format. Convert your document first.");
  if (!originalDocBase64) return status("Missing original document payload.");
  const checks = [...document.querySelectorAll("[data-apply]")].filter((c) => c.checked);
  if (checks.length === 0) return status("Select at least one edit.");
  const selected = checks.map((c) => JSON.parse(c.dataset.payload));
  status("Building redline...");
  const res = await fetch("/.netlify/functions/nda-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ originalDocBase64, edits: selected, author: "Edgewater NDA Reviewer" })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    return status("Export error: " + (e.error || res.statusText));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  downloadA.href = url;
  downloadA.download = "Edgewater-NDA-Redline.docx";
  downloadA.textContent = "Download Edgewater-NDA-Redline.docx";
  downloadA.classList.remove("hidden");
  status("Redline ready.");
});

function renderIssues(issues) {
  tableBody.innerHTML = "";
  for (const it of issues) {
    const sev = it.severity >= 0.75 ? "high" : it.severity >= 0.45 ? "med" : "low";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-apply data-payload='${JSON.stringify({
        originalText: it.originalText,
        suggestedText: it.suggestedText,
        reason: it.reason,
        provisionId: it.provisionId
      }).replace(/'/g, "&apos;")}' checked/></td>
      <td>${escapeHtml(it.provisionId || "")}</td>
      <td>${escapeHtml(it.reason || "")}</td>
      <td class="sev ${sev}">${(it.severity * 100) | 0}%</td>
    `;
    tableBody.appendChild(tr);
  }
}

function status(msg) {
  statusEl.textContent = msg;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}
function resetDownloadLink() {
  const href = downloadA.getAttribute("href");
  if (href && href.startsWith("blob:")) URL.revokeObjectURL(href);
  downloadA.removeAttribute("href");
  downloadA.classList.add("hidden");
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result || "").toString().split(",").pop());
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
