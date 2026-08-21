import type { Capability } from "./types";

export function stageProgress(stage: number): number {
  return Math.max(0, Math.min(5, Math.round(stage))) * 20;
}

export function progressFor(capabilityId: string | null, capabilities: Capability[]): number {
  const active = capabilities.filter((capability) => capability.status === "active");
  const byParent = new Map<string | null, Capability[]>();
  for (const capability of active) {
    const siblings = byParent.get(capability.parentId) ?? [];
    siblings.push(capability);
    byParent.set(capability.parentId, siblings);
  }

  const leaves: Capability[] = [];
  const collectLeaves = (id: string | null): void => {
    const children = byParent.get(id) ?? [];
    if (id !== null && children.length === 0) {
      const current = active.find((capability) => capability.id === id);
      if (current) leaves.push(current);
      return;
    }
    for (const child of children) collectLeaves(child.id);
  };

  collectLeaves(capabilityId);
  if (leaves.length === 0 && capabilityId !== null) {
    const capability = active.find((item) => item.id === capabilityId);
    return capability ? stageProgress(capability.stage) : 0;
  }

  const weightTotal = leaves.reduce((sum, leaf) => sum + Math.max(0, leaf.weight), 0);
  if (weightTotal === 0) return 0;
  return Math.round(leaves.reduce((sum, leaf) => sum + stageProgress(leaf.stage) * Math.max(0, leaf.weight), 0) / weightTotal);
}

export function descendantsOf(capabilityId: string, capabilities: Capability[]): Set<string> {
  const result = new Set<string>();
  const visit = (parentId: string): void => {
    for (const child of capabilities.filter((item) => item.parentId === parentId)) {
      if (!result.has(child.id)) {
        result.add(child.id);
        visit(child.id);
      }
    }
  };
  visit(capabilityId);
  return result;
}

export function capabilityPath(capabilityId: string, capabilities: Capability[]): Capability[] {
  const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
  const path: Capability[] = [];
  const visited = new Set<string>();
  let current = byId.get(capabilityId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export function sanitizeFileName(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Untitled").slice(0, 80);
}

export function makeId(prefix: string, random: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let index = 0; index < 8; index += 1) suffix += alphabet[Math.floor(random() * alphabet.length)];
  return `${prefix}-${suffix}`;
}

export function parseSimpleFrontmatter(markdown: string): { data: Record<string, unknown>; body: string } {
  if (!markdown.startsWith("---\n")) return { data: {}, body: markdown };
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: markdown };
  const raw = markdown.slice(4, end);
  const data: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (value === "null") data[key] = null;
    else if (value === "true" || value === "false") data[key] = value === "true";
    else if (/^-?\d+(\.\d+)?$/.test(value)) data[key] = Number(value);
    else {
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    }
  }
  return { data, body: markdown.slice(end + 5).replace(/^\n/, "") };
}

export function relativeTime(iso: string, now = Date.now()): string {
  const delta = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
