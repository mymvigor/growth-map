import type { TFile } from "obsidian";

export type CapabilityStatus = "active" | "archived";
export type ContentType = "knowledge" | "case" | "lesson" | "hypothesis" | "question" | "inbox";
export type ContentStatus = "draft" | "validating" | "validated" | "outdated" | "archived";
export type Confidence = "low" | "medium" | "high";
export type SourceType =
  | "personal-observation"
  | "colleague"
  | "professional-source"
  | "primary-source"
  | "ai-generated"
  | "mixed";

export interface Capability {
  id: string;
  name: string;
  parentId: string | null;
  stage: number;
  weight: number;
  order: number;
  status: CapabilityStatus;
  focus: boolean;
  created: string;
  updated: string;
}

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  capabilityIds: string[];
  status: ContentStatus;
  confidence: Confidence;
  sourceType: SourceType;
  created: string;
  updated: string;
  body: string;
  previousStatus?: ContentStatus;
  demo?: boolean;
}

export interface LoadedContent extends ContentItem {
  file: TFile;
}

export interface GrowthMapSettings {
  archiveInsteadOfDelete: boolean;
  checkpointBeforeChanges: boolean;
  aiEnabled: boolean;
  aiProvider: "none";
  debug: boolean;
}

export const DEFAULT_SETTINGS: GrowthMapSettings = {
  archiveInsteadOfDelete: true,
  checkpointBeforeChanges: true,
  aiEnabled: false,
  aiProvider: "none",
  debug: false
};

export const STAGE_LABELS = [
  "Not started",
  "Initial exposure",
  "Can understand and explain",
  "Practiced / has cases",
  "Can apply independently",
  "Stable, reviewable capability"
] as const;

export const CONTENT_LABELS: Record<ContentType, string> = {
  knowledge: "Knowledge",
  case: "Case",
  lesson: "Lesson",
  hypothesis: "Hypothesis",
  question: "Question",
  inbox: "Inbox"
};

export const CONTENT_STATUSES: ContentStatus[] = ["draft", "validating", "validated", "outdated", "archived"];
export const CONFIDENCES: Confidence[] = ["low", "medium", "high"];
export const SOURCE_TYPES: SourceType[] = [
  "personal-observation",
  "colleague",
  "professional-source",
  "primary-source",
  "ai-generated",
  "mixed"
];

export type MainPage = "home" | "map" | "library" | "ai" | "archive" | "capability" | "content";

