# Growth Map

Growth Map is a mobile-first personal capability and knowledge system for Obsidian. It turns ordinary Markdown into a visual map of capabilities, focus areas, knowledge, cases, lessons, hypotheses, questions, and growth progress.

It is offline-first, has no account or server, makes no network requests, and does not require AI.

## What v1.1 includes

- Home overview with dynamic root-area progress, Focus, monthly growth, validation and question counts, and recent content
- Collapsible capability tree with breadcrumbs and touch-first actions
- Capability details with weighted leaf progress and related library content
- Add, rename, move, reparent, reorder, weight, split, merge, archive, and restore capabilities
- Up to five Focus capabilities
- Library search and filters for type, area, capability, status, and confidence
- Knowledge, Case, Lesson, Hypothesis, Question, and Inbox objects with stable IDs
- Global Quick Capture with native attachment selection and context-aware capture from capability details
- Inbox conversion with reusable, domain-neutral templates
- Reference protection before capability archival
- Markdown capability checkpoints and restore-last-checkpoint
- Archive-first recovery for capabilities and content
- Disabled, provider-independent AI interface for future versions
- Timeline with recorded Growth Events, created-date context for older content, and range filters
- Explainable capability connections derived from shared content, with optional pins and notes
- Lazy attachment previews in content detail; Library cards load metadata only
- Stable Soft Spectrum colors derived from each root Capability ID
- Native Obsidian styling, light/dark themes, and a 375 px mobile layout

## Install on iPhone with BRAT

After a GitHub release exists:

1. Install and enable **BRAT** in Obsidian Community Plugins.
2. In BRAT, choose **Add Beta plugin**.
3. Paste this repository's GitHub URL.
4. Choose the latest version, then enable **Growth Map** in Community Plugins.
5. Use the ribbon sprout icon or run **Growth Map: Open**.

BRAT-compatible releases contain `main.js`, `manifest.json`, `styles.css`, and `versions.json`.

## First initialization

1. Open **Growth Map** from the ribbon or command palette.
2. Tap **Initialize My Growth**.
3. Growth Map creates its managed folders and initial capability tree.
4. Home opens immediately. Tap any area to explore, or tap `+` to capture.

No demo cases or lessons are created.

## Where data lives

All primary data stays in the Obsidian Vault as Markdown:

```text
00 System/
    README.md
    Knowledge Protocol.md
    Checkpoints/
    Growth Events/
    Connections/
01 Capabilities/
02 Knowledge/
03 Cases/
04 Hypotheses/
05 Lessons/
06 Questions/
07 Inbox/
08 Attachments/
99 Archive/
```

Plugin `data.json` contains only settings. Markdown remains the source of truth. Renaming or moving a concept inside Growth Map does not change its stable ID.

For iPhone storage and migration, place the Vault in iCloud Drive and let Obsidian/iCloud manage syncing. Growth Map does not implement its own cloud storage.

## Updating from 1.0.1

Update through BRAT and reload Obsidian. No migration or re-initialization is required. Existing capability IDs, content IDs, Markdown bodies, progress rules, archives, and checkpoints are left unchanged. The new folders are created lazily when attachments, events, or pinned connections are first used.

## Recovery

Growth Map archives instead of permanently deleting managed data. Before structural changes such as move, reorder, weight, split, merge, archive, or restore, it writes a tree checkpoint to `00 System/Checkpoints/` when the setting is enabled.

Also enable Obsidian's core **File recovery** plugin:

- Snapshot interval: 5 minutes
- Retention: 30 days

Checkpoints protect capability structure; File Recovery protects Markdown content.

## Commands

- Growth Map: Open
- Growth Map: Quick Capture
- Growth Map: New Capability
- Growth Map: Search
- Growth Map: Open Timeline
- Growth Map: Open Archive
- Growth Map: Create Checkpoint
- Growth Map: Restore Last Checkpoint
- Growth Map: Open AI

## Development

Use an independent test Vault. Never develop against your primary Vault.

```bash
pnpm install
pnpm run lint
pnpm test
pnpm run build
```

Copy or link `main.js`, `manifest.json`, and `styles.css` into:

```text
<Test Vault>/.obsidian/plugins/growth-map/
```

Then enable the plugin and use Obsidian's mobile emulation at 375 px to check Home, Map, Library, Capture, Capability Detail, Archive, AI, and Settings.

## Privacy and AI

AI is disabled in V1. `DisabledProvider` implements the provider interface; there are no API keys, network calls, embeddings, vector databases, or background services. Future AI flows must show a preview and require confirmation before adding anything to the library. AI-generated material must start with low confidence and validating status.

## Compatibility

- Obsidian 1.6.0 or newer
- Desktop and mobile (`isDesktopOnly: false`)
- No Node.js, Electron, or filesystem APIs at runtime
- Zero runtime dependencies

## License

MIT

