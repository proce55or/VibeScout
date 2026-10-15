import { escapeHtml, safeHref } from "../util/escape.js";
import {
  ORIGIN_LABEL,
  CONFIDENCE_LABEL,
  EXECUTION_LABEL,
  SEVERITY_LABEL,
  SUMMARY_LABEL,
  type ReportModel,
} from "./report.js";

/**
 * Bezpieczny HTML raportu. Cała treść pochodząca z badanych stron/ogłoszeń jest
 * escapowana — NIE renderujemy surowego HTML cudzych stron. Czytelny wydruk,
 * bez osobnej usługi PDF (można drukować przez przeglądarkę do PDF).
 */
export function toSafeHtml(model: ReportModel): string {
  const p = model.project;
  const c = model.check;
  const e = escapeHtml;

  const obsHtml = c
    ? c.observations
        .map(
          (o) => `
      <section class="obs sev-${e(o.severity)}">
        <h3><span class="tag">${e(o.check)}</span> ${e(o.title)}</h3>
        <dl>
          <dt>Stan wykonania</dt><dd>${e(EXECUTION_LABEL[o.execution])}</dd>
          <dt>Waga</dt><dd>${e(SEVERITY_LABEL[o.severity])}</dd>
          <dt>Zaobserwowano</dt><dd>${e(o.observed)}</dd>
          <dt>Dowód (zredagowany)</dt><dd><code>${e(o.evidence)}</code></dd>
          <dt>Można wnioskować</dt><dd>${e(o.inference)}</dd>
          <dt>Nie potwierdzono</dt><dd>${e(o.notConfirmed)}</dd>
          <dt>Sugerowany krok</dt><dd>${e(o.nextStep)}</dd>
        </dl>
      </section>`,
        )
        .join("")
    : "<p>Kontroli nie wykonano.</p>";

  const appLink = p.appUrl ? `<a href="${safeHref(p.appUrl)}" rel="noopener noreferrer nofollow">${e(p.appUrl)}</a>` : "—";
  const annLink = p.announcementUrl
    ? `<a href="${safeHref(p.announcementUrl)}" rel="noopener noreferrer nofollow">${e(p.announcementUrl)}</a>`
    : "—";

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Raport VibeScout: ${e(p.name)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 15px/1.6 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #fff; }
  h1 { font-size: 1.6rem; } h2 { margin-top: 2rem; border-bottom: 2px solid #eee; padding-bottom: .3rem; }
  .meta dt { font-weight: 600; } dl { display: grid; grid-template-columns: 220px 1fr; gap: .2rem .8rem; }
  dt { color: #555; } dd { margin: 0; }
  .obs { border: 1px solid #e3e3e3; border-left: 4px solid #bbb; border-radius: 6px; padding: .6rem 1rem; margin: .8rem 0; }
  .obs.sev-needs_check { border-left-color: #d08700; background: #fffdf5; }
  .obs.sev-recommendation { border-left-color: #2563eb; }
  .obs.sev-info { border-left-color: #9aa0a6; }
  .tag { display: inline-block; background: #111; color: #fff; border-radius: 4px; padding: 0 .4rem; font-size: .8rem; }
  code { background: #f4f4f5; padding: .05rem .3rem; border-radius: 3px; word-break: break-all; }
  .note { background: #f7f7f8; border-left: 4px solid #999; padding: .6rem 1rem; border-radius: 6px; }
  footer { margin-top: 2rem; color: #777; font-size: .85rem; }
</style>
</head>
<body>
  <h1>Raport VibeScout: ${e(p.name)}</h1>
  <dl class="meta">
    <dt>Adres aplikacji</dt><dd>${appLink}</dd>
    <dt>Źródło odkrycia</dt><dd>${e(p.source)} — ${annLink}</dd>
    <dt>Data publikacji</dt><dd>${e(p.publishedAt ?? "—")}</dd>
    <dt>Czas kontroli</dt><dd>${c ? `${e(c.startedAt)} → ${e(c.finishedAt)}` : "nie wykonano"}</dd>
    ${c?.resolvedIp ? `<dt>Adres IP (zweryfikowany)</dt><dd>${e(c.resolvedIp)}</dd>` : ""}
  </dl>

  <h2>Klasyfikacja pochodzenia</h2>
  <dl>
    <dt>Ocena</dt><dd>${e(ORIGIN_LABEL[p.classification.origin])}</dd>
    <dt>Zadeklarowane narzędzie</dt><dd>${e(p.classification.tool ?? "—")}</dd>
    <dt>Poziom pewności</dt><dd>${e(CONFIDENCE_LABEL[p.classification.confidence])}</dd>
    <dt>Język</dt><dd>${e(p.classification.language)}</dd>
    ${p.classification.evidenceSnippet ? `<dt>Fragment (zredagowany)</dt><dd>„${e(p.classification.evidenceSnippet)}"</dd>` : ""}
  </dl>

  <h2>Zakres i ograniczenia</h2>
  <p class="note">Wykonano wyłącznie ograniczone, publiczne odczyty (kontrole A–F). <strong>Poza zakresem</strong> (nie wykonywano): SQL injection, XSS z payloadami, zgadywanie haseł, enumeracja ścieżek, poszukiwanie .env/.git, eksploatacja CVE, testy obciążeniowe. <strong>To nie jest pentest ani gwarancja bezpieczeństwa.</strong> Brak zaobserwowanych problemów nie oznacza, że aplikacja jest bezpieczna.</p>

  <h2>Obserwacje</h2>
  ${obsHtml}

  <h2>Podsumowanie</h2>
  <p><strong>${c ? e(SUMMARY_LABEL[c.summary]) : "Kontroli nie wykonano"}.</strong></p>
  ${c ? `<p>Budżet: ${c.budget.httpRequests} żądań, ${c.budget.redirects} przekierowań, ${c.budget.bytes} B, ${c.budget.elapsedMs} ms${c.budget.truncated ? " (treść przycięta do limitu)" : ""}.</p>` : ""}

  <footer>Wygenerowano: ${e(model.generatedAt)}. Raport prywatny, do użytku autora. VibeScout v1.</footer>
</body>
</html>`;
}
