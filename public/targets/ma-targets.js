(function(){
  const $ = (sel) => document.querySelector(sel);
  const fileInput = $("#fileInput");
  const mapDiv = $("#mappingSummary");
  const tableBody = $("#resultsTable tbody");
  const btnCsv = $("#btnExportCsv");
  const btnXlsx = $("#btnExportXlsx");

  let latestRows = [];

  fileInput.addEventListener("change", async (e)=>{
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    mapDiv.textContent = "Parsing…";
    tableBody.innerHTML = "";
    latestRows = [];
    btnCsv.disabled = true; btnXlsx.disabled = true;

    try{
      const ext = (f.name.split(".").pop()||"").toLowerCase();
      if (ext === "csv"){
        await parseCsv(f);
      } else if (ext==="xlsx" || ext==="xls"){
        await parseXlsx(f);
      } else {
        throw new Error("Unsupported file type. Use CSV/XLSX.");
      }
    }catch(err){
      console.error(err);
      mapDiv.textContent = `Error: ${err.message||String(err)}`;
    }
  });

  async function parseCsv(file){
    return new Promise((resolve,reject)=>{
      Papa.parse(file,{
        header:true, // still run embedded-header promotion if needed
        skipEmptyLines:true,
        worker:false,
        complete: (res)=>{
          try {
            const records = res.data || [];
            finish(records);
          } catch (err) {
            console.error(err);
            mapDiv.textContent = `Error: ${err.message||String(err)}`;
          }
          resolve();
        },
        error: (err)=>reject(err)
      });
    });
  }

  async function parseXlsx(file){
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type:"array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json(ws, { defval:"", raw:false });
      finish(records);
    } catch (err) {
      console.error(err);
      mapDiv.textContent = `Error: ${err.message||String(err)}`;
    }
  }

  function finish(records){
    if (!window.CDSEngine || typeof window.CDSEngine.processRecords !== 'function'){
      mapDiv.textContent = 'Error: Standardization engine unavailable';
      return;
    }
    const result = window.CDSEngine.processRecords(records);
    latestRows = result.rows || [];

    // Mapping summary
    const cols = result.cols || {};
    const lines = [];
    lines.push("Auto-mapped columns:");
    for (const k of ["companyName","website","description","specialties","products","endMarkets","industries"]){
      lines.push(`• ${k}: ${cols && cols[k] ? "\""+cols[k]+"\"" : "(not found)"}`);
    }
    if (result.messages && result.messages.length){
      lines.push("");
      lines.push("Notes:");
      for (const m of result.messages) lines.push(`– ${m}`);
    }
    mapDiv.innerHTML = lines.join("<br>");

    // Render table (preserve input order)
    const frag = document.createDocumentFragment();
    for (const r of latestRows){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r["Company Name"]||"")}</td>
        <td>${escapeHtml(r["Website"]||"")}</td>
        <td>${escapeHtml(r["Summary"]||"")}</td>
      `;
      frag.appendChild(tr);
    }
    tableBody.innerHTML = "";
    tableBody.appendChild(frag);

    // Enable exports if we have rows
    const has = latestRows && latestRows.length>0;
    btnCsv.disabled = !has; btnXlsx.disabled = !has;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g,(c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
  }

  // Exports (CSV + XLSX)
  btnCsv.addEventListener("click", ()=>{
    const csv = toCsv(latestRows, ["Company Name","Website","Summary"]);
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    download(url, "ma_targets_standardized.csv");
  });

  btnXlsx.addEventListener("click", ()=>{
    const ws = XLSX.utils.json_to_sheet(latestRows, { header:["Company Name","Website","Summary"] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Targets");
    const out = XLSX.write(wb, { bookType:"xlsx", type:"array" });
    const blob = new Blob([out], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url = URL.createObjectURL(blob);
    download(url, "ma_targets_standardized.xlsx");
  });

  function toCsv(rows, headers){
    const escapeCell = (v)=>{
      let s = String(v==null?"":v);
      // Prevent CSV / formula injection (Excel etc.)
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      if (s.includes('"') || s.includes(",") || s.includes("\n")) s = `"${s.replace(/"/g,'""')}"`;
      return s;
    };
    const out = [];
    out.push(headers.join(","));
    for (const r of rows) out.push(headers.map(h=>escapeCell(r[h])).join(","));
    return out.join("\n");
  }

  function download(url, filename){
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
})();
