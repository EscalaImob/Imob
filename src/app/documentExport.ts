function escapeHtml(value: unknown): string {
  return String(value ?? "—").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export interface ExportSection { title: string; fields: Array<[string, unknown]>; }
export interface DocumentBrand { name: string; logoUrl?: string | null; email?: string | null; phone?: string | null; tagline?: string | null; primaryColor?: string | null; secondaryColor?: string | null; }

function documentHtml(title: string, sections: ExportSection[], brand: DocumentBrand) {
  const primary = /^#[0-9a-f]{6}$/i.test(brand.primaryColor ?? "") ? brand.primaryColor : "#101828";
  const secondary = /^#[0-9a-f]{6}$/i.test(brand.secondaryColor ?? "") ? brand.secondaryColor : "#475467";
  const contact = [brand.email, brand.phone].filter(Boolean).map(escapeHtml).join(" &nbsp;·&nbsp; ");
  const content = sections.map((section) => `<section class="document-section"><h2>${escapeHtml(section.title)}</h2><div class="field-grid">${section.fields.map(([label, value]) => `<div class="field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div></section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>:root{--primary:${primary};--secondary:${secondary}}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;max-width:940px;margin:0 auto;padding:42px 48px 90px;color:#1d2939;background:#fff;font-size:11pt}.brand-header{display:flex;align-items:center;justify-content:space-between;gap:28px;padding:0 0 22px;border-bottom:3px solid var(--primary)}.brand{display:flex;align-items:center;gap:16px}.brand img{display:block;max-width:150px;max-height:58px;object-fit:contain}.brand-name{display:grid;gap:4px}.brand-name strong{font-size:16pt;color:#101828}.brand-name span{color:#667085;font-size:9.5pt}.contact{text-align:right;color:#475467;line-height:1.6;font-size:9.5pt}.document-title{padding:30px 0 16px}.document-title small{display:block;color:var(--secondary);font-size:8.5pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.document-title h1{margin:7px 0 0;color:#101828;font-size:23pt;line-height:1.18}.document-section{margin-top:18px;overflow:hidden;border:1px solid #e4e7ec;border-radius:10px;break-inside:avoid}.document-section h2{margin:0;padding:11px 15px;background:#f7f8fa;border-left:4px solid var(--primary);color:#344054;font-size:12pt}.field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0}.field{display:grid;gap:5px;min-height:62px;padding:13px 15px;border-top:1px solid #eaecf0;border-right:1px solid #eaecf0}.field:nth-child(even){border-right:0}.field span{color:#667085;font-size:8pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.field strong{color:#101828;font-size:10pt;line-height:1.45;white-space:pre-wrap}.brand-footer{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-between;gap:20px;padding:12px 48px;border-top:1px solid #d0d5dd;background:#fff;color:#667085;font-size:8pt}.brand-footer strong{color:var(--primary)}@page{margin:16mm 12mm 20mm}@media print{body{max-width:none;padding:0 0 55px}.brand-footer{padding-inline:0}.document-section{break-inside:avoid}.field-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){body{padding:24px 20px 85px}.brand-header{align-items:flex-start;flex-direction:column}.contact{text-align:left}.field-grid{grid-template-columns:1fr}.field{border-right:0}.brand-footer{padding-inline:20px}}</style></head><body><header class="brand-header"><div class="brand">${brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="">` : ""}<div class="brand-name"><strong>${escapeHtml(brand.name)}</strong>${brand.tagline ? `<span>${escapeHtml(brand.tagline)}</span>` : ""}</div></div><div class="contact">${contact || "Contato institucional não informado"}</div></header><div class="document-title"><small>Documento imobiliário</small><h1>${escapeHtml(title)}</h1></div>${content}<footer class="brand-footer"><span><strong>${escapeHtml(brand.name)}</strong>${contact ? ` &nbsp;·&nbsp; ${contact}` : ""}</span><span>Gerado pela plataforma Escala IMOB</span></footer></body></html>`;
}

function finalizedDocumentHtml(title: string, sections: ExportSection[], brand: DocumentBrand): string {
  const compatibilityCss = ".brand-header{display:table!important;width:100%!important;table-layout:fixed!important}.brand,.contact{display:table-cell!important;vertical-align:middle!important}.brand{width:68%!important;white-space:nowrap!important}.contact{width:32%!important}.brand img{display:inline-block!important;width:112px!important;height:48px!important;max-width:112px!important;max-height:48px!important;object-fit:contain!important;vertical-align:middle!important}.brand-name{display:inline-block!important;margin-left:14px!important;vertical-align:middle!important;white-space:normal!important}.brand-name strong,.brand-name span,.field span,.field strong{display:block!important}.field{display:block!important;min-height:68px!important;padding:14px 16px!important}.field span{margin:0 0 8px!important}.brand-footer{display:table!important;width:100%!important}.brand-footer span{display:table-cell!important}.brand-footer span:last-child{text-align:right!important}@page{size:A4;margin:14mm 14mm 19mm}@media print{html,body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{max-width:none!important;margin:0!important;padding:0 0 45px!important}}";
  return documentHtml(title, sections, brand)
    .replace("</style>", compatibilityCss + "</style>")
    .replace("<img src=", '<img width="112" height="48" style="width:112px;height:48px;max-width:112px;max-height:48px;object-fit:contain" src=');
}

export function downloadDoc(title: string, filename: string, sections: ExportSection[], brand: DocumentBrand) {
  const blob = new Blob([finalizedDocumentHtml(title, sections, brand)], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `${filename}.doc`; anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function printPdf(title: string, sections: ExportSection[], brand: DocumentBrand) {
  const popup = globalThis.open("", "_blank");
  if (!popup) return false;
  popup.document.open(); popup.document.write(finalizedDocumentHtml(title, sections, brand)); popup.document.close();
  const printWhenReady = async () => {
    const images = Array.from(popup.document.images);
    await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    })));
    if ("fonts" in popup.document) await popup.document.fonts.ready;
    popup.focus();
    globalThis.setTimeout(() => popup.print(), 150);
  };
  if (popup.document.readyState === "complete") void printWhenReady();
  else popup.addEventListener("load", () => void printWhenReady(), { once: true });
  return true;
}
