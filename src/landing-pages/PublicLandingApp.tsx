import { useEffect, useState } from "react";
import { getPublicLandingPage, submitPublicLandingLead, trackPublicLandingPropertyView } from "../services/landingPagesApi";
import type { LandingPageDocument } from "./model";
import { LandingPageRenderer } from "./LandingPageRenderer";

interface StoredPreview { createdAt: number; page: LandingPageDocument }

function readPreview(): LandingPageDocument | null {
  const key = new URLSearchParams(location.search).get("previewKey");
  if (!key) return null;
  const storageKey = `imob:landing-preview:${key}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredPreview;
    if (!stored.page || Date.now() - stored.createdAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return stored.page;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}

function successMessage(page: LandingPageDocument): string {
  const value = page.sections.find((section) => section.type === "contact")?.content.successMessage;
  return typeof value === "string" && value.trim() ? value : "Mensagem enviada. Em breve entraremos em contato.";
}

export function PublicLandingApp() {
  const preview = location.pathname.startsWith("/imob/preview");
  const slug = decodeURIComponent(location.pathname.replace(/^\/imob\//u, "").replace(/\/+$/u, ""));
  const [page, setPage] = useState<LandingPageDocument | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (preview) {
      const stored = readPreview();
      if (!stored) { setError("A prévia expirou ou não está mais disponível."); return; }
      setPage(stored);
      document.title = `Prévia — ${stored.seo.title || stored.name}`;
      return;
    }
    void getPublicLandingPage(slug).then((value) => {
      setPage(value);
      document.title = value.seo.title || value.name;
      let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!description) { description = document.createElement("meta"); description.name = "description"; document.head.appendChild(description); }
      description.content = value.seo.description || "";
    }).catch(() => setError("Esta página não existe ou ainda não foi publicada."));
  }, [preview, slug]);

  if (error) return <main className="lp-public-state"><h1>Página indisponível</h1><p>{error}</p></main>;
  if (!page) return <main className="lp-public-state"><span>Carregando...</span></main>;
  return <><LandingPageRenderer page={page} onPropertyView={(propertyId)=>preview?undefined:trackPublicLandingPropertyView(slug,propertyId)} onSubmit={async (data) => { if (!preview) await submitPublicLandingLead(slug, data); setSent(true); }}/>{sent && <div className="lp-toast" role="status">{successMessage(page)}</div>}</>;
}
