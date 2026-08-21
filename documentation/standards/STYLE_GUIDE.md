---
title: Style Guide
status: Draft
version: docs-0.1
last_updated: YYYY-MM-DD
---

# Style Guide

## Naming Conventions

- Use `UltraLeagueOS` for the product name.
- Use canonical terms from [Terminology](TERMINOLOGY.md).
- File names use uppercase snake case for major manuals, for example `ADMINISTRATOR_GUIDE.md`.
- Template file names use lowercase hyphenated names, for example `runbook-template.md`.
- Image files use lowercase hyphenated names with date or version context.

## Headings

- One `#` heading per page.
- Use `##` for main sections and `###` for subsections.
- Avoid skipping heading levels.
- Keep headings short and descriptive.

## Code Blocks

Use fenced code blocks with a language identifier.

```bash
npm run build
```

## Callouts

Use portable blockquote callouts:

> Note: Use this for neutral context.

> Tip: Use this for operational shortcuts.

> Warning: Use this for risk, data loss, security, or live-event impact.

> Important: Use this for required actions.

## Cross References

- Use relative Markdown links.
- Link to the nearest stable page, not a heading that may change.
- Avoid bare URLs except external references.

## Markdown Conventions

- Prefer tables for structured comparisons.
- Prefer numbered lists for procedures.
- Keep paragraphs short.
- Avoid platform-specific extensions unless documented in the page.

## Front Matter

Every publishable page should begin with:

```yaml
---
title: Page Title
status: Draft
version: docs-0.1
last_updated: YYYY-MM-DD
---
```

