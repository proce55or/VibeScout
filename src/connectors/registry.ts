import { hackerNewsConnector } from "./hackernews.js";
import { rssConnector } from "./rss.js";
import { emptyResult, type Connector } from "./types.js";

/**
 * Rejestr konektorów. Konektory niewdrożone mają implemented=false i wyraźny status —
 * nie udają działających. Przewidziana struktura pozwala je później dodać.
 */

function stub(id: string, name: string, coverage: string): Connector {
  return {
    id,
    name,
    implemented: false,
    coverage,
    async collect() {
      return emptyResult(`Konektor „${name}" nie jest jeszcze wdrożony (v1).`);
    },
  };
}

export const CONNECTORS: Connector[] = [
  hackerNewsConnector,
  rssConnector,
  stub(
    "github",
    "GitHub",
    "Planowany. Wymaga osobnego wdrożenia (np. wyszukiwanie publicznych repo/README z deklaracją + wyodrębnienie działającego adresu). Niewdrożony w v1.",
  ),
  stub(
    "reddit",
    "Reddit",
    "Planowany. Tylko dozwoloną metodą i z wymaganą autoryzacją, po sprawdzeniu aktualnych zasad. Niewdrożony w v1.",
  ),
  stub(
    "facebook",
    "Facebook / grupy zamknięte",
    "W v1 obsługiwane wyłącznie przez ręczne wprowadzenie danych. Nie używamy prywatnych sesji ani obchodzenia logowania.",
  ),
];

export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export function implementedConnectorIds(): string[] {
  return CONNECTORS.filter((c) => c.implemented).map((c) => c.id);
}
