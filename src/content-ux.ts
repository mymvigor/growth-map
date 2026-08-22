import { capabilityPath } from "./core";
import type { AttachmentRef, Capability, PendingAttachment } from "./types";

export interface ContentTextBlock {
  id: string;
  kind: "text";
  value: string;
}

export interface ContentAttachmentBlock {
  id: string;
  kind: "attachment";
  attachment?: AttachmentRef;
  pending?: PendingAttachment;
}

export type ContentEditorBlock = ContentTextBlock | ContentAttachmentBlock;

const attachmentEmbedPattern = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export function attachmentEmbed(path: string): string {
  return `![[${path}]]`;
}

export function pendingAttachmentMarker(token: string): string {
  return `<!--GM-ATTACH:${token}-->`;
}

export function parseContentBlocks(body: string, attachments: AttachmentRef[]): ContentEditorBlock[] {
  const byPath = new Map(attachments.map((attachment) => [attachment.path, attachment]));
  const used = new Set<string>();
  const blocks: ContentEditorBlock[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of body.matchAll(attachmentEmbedPattern)) {
    const path = match[1].trim();
    const attachment = byPath.get(path);
    if (!attachment || match.index === undefined) continue;
    if (match.index > cursor) blocks.push({ id: `text-${index++}`, kind: "text", value: body.slice(cursor, match.index) });
    blocks.push({ id: `attachment-${index++}`, kind: "attachment", attachment });
    used.add(path);
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length || blocks.length === 0) blocks.push({ id: `text-${index++}`, kind: "text", value: body.slice(cursor) });
  for (const attachment of attachments) {
    if (used.has(attachment.path)) continue;
    const last = blocks.at(-1);
    if (last?.kind === "text" && last.value && !last.value.endsWith("\n\n")) last.value += last.value.endsWith("\n") ? "\n" : "\n\n";
    blocks.push({ id: `attachment-${index++}`, kind: "attachment", attachment });
    blocks.push({ id: `text-${index++}`, kind: "text", value: "\n\n" });
  }
  return blocks.length ? blocks : [{ id: "text-0", kind: "text", value: "" }];
}

export function serializeContentBlocks(blocks: ContentEditorBlock[]): string {
  return blocks.map((block) => {
    if (block.kind === "text") return block.value;
    if (block.attachment) return attachmentEmbed(block.attachment.path);
    return block.pending ? pendingAttachmentMarker(block.pending.token) : "";
  }).join("").trim();
}

export function initialRelatedCapabilityIds(initialIds: string[], contextCapabilityId?: string): string[] {
  return [...new Set([...initialIds, ...(contextCapabilityId ? [contextCapabilityId] : [])])];
}

export function fullCapabilityPath(capabilityId: string, capabilities: Capability[]): string {
  return capabilityPath(capabilityId, capabilities).map((item) => item.name).join(" / ");
}

export function searchCapabilities(capabilities: Capability[], query: string, excludedIds: Iterable<string> = []): Capability[] {
  const excluded = new Set(excludedIds);
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return capabilities
    .filter((capability) => capability.status === "active" && !excluded.has(capability.id))
    .map((capability) => ({ capability, path: fullCapabilityPath(capability.id, capabilities).toLocaleLowerCase() }))
    .filter(({ capability, path }) => capability.name.toLocaleLowerCase().includes(needle) || path.includes(needle))
    .sort((left, right) => {
      const leftName = left.capability.name.toLocaleLowerCase();
      const rightName = right.capability.name.toLocaleLowerCase();
      return Number(!leftName.startsWith(needle)) - Number(!rightName.startsWith(needle))
        || left.path.length - right.path.length
        || left.path.localeCompare(right.path);
    })
    .map(({ capability }) => capability);
}

export function updateRecentCapabilityIds(current: string[], usedIds: string[], limit = 8): string[] {
  return [...new Set([...usedIds, ...current])].slice(0, limit);
}

export function suggestedCapabilities(capabilities: Capability[], contextCapabilityId: string | undefined, excludedIds: Iterable<string>, limit = 3): Capability[] {
  if (!contextCapabilityId) return [];
  const excluded = new Set(excludedIds);
  const context = capabilities.find((item) => item.id === contextCapabilityId && item.status === "active");
  if (!context) return [];
  const siblings = capabilities.filter((item) => item.status === "active" && item.parentId === context.parentId && item.id !== context.id);
  return [context, ...siblings].filter((item) => !excluded.has(item.id)).slice(0, limit);
}
