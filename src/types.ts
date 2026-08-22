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

export interface AttachmentRef {
  path: string;
  name: string;
  mimeType?: string;
  added: string;
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
  attachments?: AttachmentRef[];
}

export interface LoadedContent extends ContentItem {
  file: TFile;
}

export type GrowthEventType =
  | "capability-stage-changed"
  | "content-created"
  | "content-converted"
  | "focus-added"
  | "focus-removed";

export interface GrowthEvent {
  id: string;
  timestamp: string;
  eventType: GrowthEventType;
  capabilityIds: string[];
  contentId?: string;
  fromStage?: number;
  toStage?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export type TimeRange = "30d" | "3m" | "6m" | "1y" | "all";

export interface CapabilityConnection {
  fromId: string;
  toId: string;
  pinned: boolean;
  note?: string;
  created: string;
}

export interface DerivedConnection extends CapabilityConnection {
  strength: number;
  sharedContentIds: string[];
  counts: Partial<Record<ContentType, number>>;
}

export interface TimelineActivity {
  timestamp: string;
  eventType: GrowthEventType | "historical-content";
  capabilityIds: string[];
  contentId?: string;
  fromStage?: number;
  toStage?: number;
  recorded: boolean;
  metadata?: Record<string, string | number | boolean | null>;
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

export type MainPage = "home" | "map" | "timeline" | "library" | "ai" | "archive" | "capability" | "content" | "connection";

