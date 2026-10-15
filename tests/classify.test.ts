import { describe, it, expect } from "vitest";
import { classify, qualifiesForAutoChecks } from "../src/classify/classify.js";

describe("klasyfikacja ogłoszeń", () => {
  it("Przykład A: deklaracja autora z narzędziem → declared_ai, wysoka pewność", () => {
    const c = classify("I built this habit tracker with Claude Code over a weekend.");
    expect(c.origin).toBe("declared_ai");
    expect(c.confidence).toBe("high");
    expect(c.tool).toBe("Claude Code");
    expect(qualifiesForAutoChecks(c)).toBe(true);
  });

  it("Przykład B: aplikacja oferuje czat z modelem → uses_ai, nie declared_ai", () => {
    const c = classify("Our app lets you chat with Gemini. No signup required.");
    expect(c.origin).toBe("uses_ai");
    expect(qualifiesForAutoChecks(c)).toBe(false);
  });

  it("deklaracja po polsku (vibe coding) → declared_ai", () => {
    const c = classify("Zbudowałem tę aplikację do notatek przy pomocy Cursora. Zvibecodowane w kilka godzin.");
    expect(c.origin).toBe("declared_ai");
    expect(c.tool).toBe("Cursor");
    expect(c.language).toBe("pl");
  });

  it("sama nazwa modelu bez deklaracji → indirect, niska pewność", () => {
    const c = classify("A tool that mentions GPT somewhere in the description.");
    expect(c.origin).toBe("indirect");
    expect(c.confidence).toBe("low");
    expect(qualifiesForAutoChecks(c)).toBe(false);
  });

  it("brak jakiejkolwiek wzmianki → unknown", () => {
    const c = classify("A simple todo list for teams.");
    expect(c.origin).toBe("unknown");
  });

  it("deklaracja + negacja → conflicting", () => {
    const c = classify("Built with Claude, but actually hand-coded, no AI involved.");
    expect(c.origin).toBe("conflicting");
  });

  it('samo "vibe coded" bez narzędzia → declared_ai, pewność średnia', () => {
    const c = classify("Vibe coded this little game last night.");
    expect(c.origin).toBe("declared_ai");
    expect(c.confidence).toBe("medium");
  });

  it("słabe źródło (same tagi) z tokenem vibe-coding → NIE declared_ai", () => {
    const c = classify("tagi: gemini, llm, ollama, openai, php, vibe-coding", { weakSource: true });
    expect(c.origin).not.toBe("declared_ai");
  });

  it("słabe źródło, ale wyraźne zdanie Built-using-Gemini → declared_ai zostaje", () => {
    const c = classify("Monster Hunter inspired boss battler. Built & vibe-coded using Gemini Flash 3.8.", { weakSource: true });
    expect(c.origin).toBe("declared_ai");
  });
});
