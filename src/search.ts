import { capabilityPath, descendantsOf } from "./core";
import type { Capability, Confidence, ContentItem, ContentStatus, ContentType } from "./types";

export type SearchMatchSource = "body" | "title" | "capability" | "attachment";

export interface PreferredSearchMatch {
  source: SearchMatchSource;
  index?: number;
  label?: string;
}

export interface SearchContext {
  query: string;
  tokens: string[];
  contentId: string;
  preferredMatch?: PreferredSearchMatch;
}

export interface SearchDocument {
  id: string;
  type: ContentType;
  title: string;
  body: string;
  capabilityIds: string[];
  status: ContentStatus;
  confidence: Confidence;
  updated: string;
  capabilityPaths: string[];
  attachmentNames: string[];
  normalizedTitle: string;
  normalizedBody: string;
  normalizedCapability: string;
  normalizedAttachment: string;
}

export interface SearchResult {
  document: SearchDocument;
  score: number;
  matchCount: number;
  snippet: string;
  source: SearchMatchSource;
  sourceLabel?: string;
  preferredMatch: PreferredSearchMatch;
}

export interface LibrarySearchFilters {
  type: ContentType | "all";
  area: string;
  capability: string;
  status: string;
  confidence: string;
}

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

export const EMPTY_LIBRARY_SEARCH_FILTERS: Readonly<LibrarySearchFilters> = Object.freeze({
  type: "all",
  area: "all",
  capability: "all",
  status: "all",
  confidence: "all"
});

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  return [...new Set(normalized.split(/\s+/u).filter(Boolean))];
}

export function markdownToSearchText(markdown: string): string {
  return markdown
    .replace(/!\[\[[^\]]+\]\]/gu, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/gu, "$2")
    .replace(/\[\[([^\]]+)\]\]/gu, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
    .replace(/^\s{0,3}>\s?/gmu, "")
    .replace(/^\s*[-+*]\s+/gmu, "")
    .replace(/(```|~~~)[^\n]*\n?/gu, "")
    .replace(/[*_~`]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function attachmentFileName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

export function buildSearchDocuments(contents: readonly ContentItem[], capabilities: readonly Capability[]): SearchDocument[] {
  return contents.map((item) => {
    const capabilityPaths = item.capabilityIds
      .map((id) => capabilityPath(id, [...capabilities]).map((entry) => entry.name).join(" / "))
      .filter(Boolean);
    const attachmentNames = [...new Set((item.attachments ?? []).flatMap((attachment) => [
      attachment.name,
      attachmentFileName(attachment.path)
    ]).filter(Boolean))];
    const body = markdownToSearchText(item.body);
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      body,
      capabilityIds: [...item.capabilityIds],
      status: item.status,
      confidence: item.confidence,
      updated: item.updated,
      capabilityPaths,
      attachmentNames,
      normalizedTitle: normalize(item.title),
      normalizedBody: normalize(body),
      normalizedCapability: normalize(capabilityPaths.join("\n")),
      normalizedAttachment: normalize(attachmentNames.join("\n"))
    };
  });
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) >= 0) {
    count += 1;
    index += Math.max(needle.length, 1);
  }
  return count;
}

function bestMatchIndex(text: string, tokens: readonly string[], phrase: string): number {
  const normalized = normalize(text);
  const phraseIndex = normalized.indexOf(phrase);
  if (phraseIndex >= 0) return phraseIndex;

  const candidates: number[] = [];
  for (const token of tokens) {
    let index = normalized.indexOf(token);
    while (index >= 0) {
      candidates.push(index);
      index = normalized.indexOf(token, index + Math.max(token.length, 1));
    }
  }
  let bestIndex = candidates[0] ?? -1;
  let bestQuality = -1;
  for (const index of candidates) {
    const windowText = normalized.slice(Math.max(0, index - 90), index + 130);
    const distinctTokens = tokens.filter((token) => windowText.includes(token)).length;
    const occurrences = tokens.reduce((total, token) => total + countOccurrences(windowText, token), 0);
    const quality = distinctTokens * 100 + Math.min(occurrences, 20);
    if (quality > bestQuality || (quality === bestQuality && index < bestIndex)) {
      bestIndex = index;
      bestQuality = quality;
    }
  }
  return bestIndex;
}

export function createBestSnippet(body: string, tokens: readonly string[], phrase = tokens.join(" "), maxLength = 200): string {
  const plain = markdownToSearchText(body);
  if (!plain) return "";
  const matchIndex = bestMatchIndex(plain, tokens, phrase);
  if (matchIndex < 0) {
    const ending = plain.length > maxLength ? "…" : "";
    return `${plain.slice(0, maxLength).trim()}${ending}`;
  }
  const anchorLength = Math.max(phrase.length, tokens[0]?.length ?? 1);
  let start = Math.max(0, matchIndex - Math.floor((maxLength - anchorLength) * 0.45));
  start = Math.min(start, Math.max(0, plain.length - maxLength));
  const end = Math.min(plain.length, start + maxLength);
  return `${start > 0 ? "…" : ""}${plain.slice(start, end).trim()}${end < plain.length ? "…" : ""}`;
}

function matchingValues(values: readonly string[], tokens: readonly string[]): string[] {
  return values.filter((value) => {
    const normalized = normalize(value);
    return tokens.some((token) => normalized.includes(token));
  });
}

function scoreDocument(document: SearchDocument, tokens: readonly string[], phrase: string): number {
  const titleExact = document.normalizedTitle === phrase;
  const titlePhrase = document.normalizedTitle.includes(phrase);
  const titleToken = tokens.some((token) => document.normalizedTitle.includes(token));
  const bodyPhrase = document.normalizedBody.includes(phrase);
  const bodyAllTokens = tokens.every((token) => document.normalizedBody.includes(token));
  const bodyToken = tokens.some((token) => document.normalizedBody.includes(token));
  const capabilityToken = tokens.some((token) => document.normalizedCapability.includes(token));

  let tier = 50_000;
  if (titleExact) tier = 600_000;
  else if (titlePhrase) tier = 500_000;
  else if (titleToken) tier = 400_000;
  else if (bodyPhrase) tier = 300_000;
  else if (bodyAllTokens) tier = 250_000;
  else if (bodyToken) tier = 200_000;
  else if (capabilityToken) tier = 100_000;

  const titleMatches = tokens.reduce((total, token) => total + countOccurrences(document.normalizedTitle, token), 0);
  const bodyMatches = tokens.reduce((total, token) => total + countOccurrences(document.normalizedBody, token), 0);
  const capabilityMatches = tokens.reduce((total, token) => total + countOccurrences(document.normalizedCapability, token), 0);
  const attachmentMatches = tokens.reduce((total, token) => total + countOccurrences(document.normalizedAttachment, token), 0);
  return tier + Math.min(49_999, titleMatches * 1_000 + bodyMatches * 100 + capabilityMatches * 10 + attachmentMatches);
}

export function searchDocuments(documents: readonly SearchDocument[], query: string): SearchResult[] {
  const tokens = tokenizeSearchQuery(query);
  if (!tokens.length) return [];
  const phrase = normalize(query);
  const results: SearchResult[] = [];

  for (const document of documents) {
    if (document.status === "archived") continue;
    const searchable = [
      document.normalizedTitle,
      document.normalizedBody,
      document.normalizedCapability,
      document.normalizedAttachment
    ].join("\n");
    if (!tokens.every((token) => searchable.includes(token))) continue;

    const bodyIndex = bestMatchIndex(document.body, tokens, phrase);
    const titleMatches = tokens.some((token) => document.normalizedTitle.includes(token));
    const capabilityMatches = matchingValues(document.capabilityPaths, tokens);
    const attachmentMatches = matchingValues(document.attachmentNames, tokens);
    let source: SearchMatchSource;
    let snippet: string;
    let sourceLabel: string | undefined;
    let preferredMatch: PreferredSearchMatch;
    if (bodyIndex >= 0) {
      source = "body";
      snippet = createBestSnippet(document.body, tokens, phrase);
      preferredMatch = { source, index: bodyIndex };
    } else if (titleMatches) {
      source = "title";
      snippet = createBestSnippet(document.body, tokens, phrase);
      sourceLabel = "Matched in title";
      preferredMatch = { source };
    } else if (capabilityMatches.length) {
      source = "capability";
      snippet = `Matched in capability: ${capabilityMatches.join(" · ")}`;
      sourceLabel = "Matched in capability";
      preferredMatch = { source, label: capabilityMatches[0] };
    } else {
      source = "attachment";
      snippet = `Attachment: ${attachmentMatches.join(" · ")}`;
      sourceLabel = "Matched in attachment";
      preferredMatch = { source, label: attachmentMatches[0] };
    }

    const matchCount = tokens.reduce((total, token) => total
      + countOccurrences(document.normalizedTitle, token)
      + countOccurrences(document.normalizedBody, token)
      + countOccurrences(document.normalizedCapability, token)
      + countOccurrences(document.normalizedAttachment, token), 0);
    results.push({
      document,
      score: scoreDocument(document, tokens, phrase),
      matchCount,
      snippet,
      source,
      sourceLabel,
      preferredMatch
    });
  }

  return results.sort((left, right) => right.score - left.score
    || right.document.updated.localeCompare(left.document.updated)
    || left.document.id.localeCompare(right.document.id));
}

export function filterSearchResults(
  results: readonly SearchResult[],
  filters: LibrarySearchFilters,
  capabilities: readonly Capability[]
): SearchResult[] {
  let filtered = [...results];
  if (filters.type !== "all") filtered = filtered.filter((result) => result.document.type === filters.type);
  if (filters.area !== "all") {
    const ids = descendantsOf(filters.area, [...capabilities]);
    ids.add(filters.area);
    filtered = filtered.filter((result) => result.document.capabilityIds.some((id) => ids.has(id)));
  }
  if (filters.capability !== "all") filtered = filtered.filter((result) => result.document.capabilityIds.includes(filters.capability));
  if (filters.status !== "all") filtered = filtered.filter((result) => result.document.status === filters.status);
  if (filters.confidence !== "all") filtered = filtered.filter((result) => result.document.confidence === filters.confidence);
  return filtered;
}

export function clearLibrarySearchFilters(): LibrarySearchFilters {
  return { ...EMPTY_LIBRARY_SEARCH_FILTERS };
}

export function hasActiveLibrarySearchFilters(filters: LibrarySearchFilters): boolean {
  return Object.values(filters).some((value) => value !== "all");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function splitHighlightedText(text: string, tokens: readonly string[]): HighlightSegment[] {
  const safeTokens = [...new Set(tokens.map((token) => token.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  if (!text || !safeTokens.length) return text ? [{ text, highlighted: false }] : [];
  const pattern = new RegExp(`(${safeTokens.map(escapeRegExp).join("|")})`, "giu");
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ text: text.slice(lastIndex, index), highlighted: false });
    segments.push({ text: match[0], highlighted: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), highlighted: false });
  return segments;
}

export function createSearchContext(query: string, contentId: string, preferredMatch?: PreferredSearchMatch): SearchContext {
  return {
    query: query.trim(),
    tokens: tokenizeSearchQuery(query),
    contentId,
    preferredMatch: preferredMatch ? { ...preferredMatch } : undefined
  };
}
