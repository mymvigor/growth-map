import type { ContentItem } from "./types";

export interface AIProvider {
  structureCapture(input: string): Promise<Partial<ContentItem>>;
  askKnowledgeBase(question: string, context: ContentItem[]): Promise<string>;
  challengeHypothesis(hypothesis: ContentItem, context: ContentItem[]): Promise<string>;
  summarizeCases(cases: ContentItem[]): Promise<string>;
}

export class DisabledProvider implements AIProvider {
  private unavailable(): never {
    throw new Error("AI is not configured. Growth Map works fully without AI.");
  }

  async structureCapture(_input: string): Promise<Partial<ContentItem>> {
    return this.unavailable();
  }

  async askKnowledgeBase(_question: string, _context: ContentItem[]): Promise<string> {
    return this.unavailable();
  }

  async challengeHypothesis(_hypothesis: ContentItem, _context: ContentItem[]): Promise<string> {
    return this.unavailable();
  }

  async summarizeCases(_cases: ContentItem[]): Promise<string> {
    return this.unavailable();
  }
}
