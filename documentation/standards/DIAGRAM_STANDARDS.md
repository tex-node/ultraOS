---
title: Diagram Standards
status: Draft
version: docs-0.1
last_updated: YYYY-MM-DD
---

# Diagram Standards

Mermaid is the canonical diagram source.

## Supported Diagram Types

- Flowcharts
- ER diagrams
- Sequence diagrams
- State diagrams
- Component diagrams

## Mermaid Source

Store reusable Mermaid source in `documentation/diagrams/` using `.mmd` files.

## Example

```mermaid
flowchart TD
  User["User"] --> Application["Application"]
  Application --> Review["Admin Review"]
  Review --> Approved["Approved"]
  Approved --> Role["Role Granted"]
```

## Conventions

- Use readable node labels.
- Keep diagrams focused on one workflow.
- Use `SeasonClub` for competitive participation and `Club` for brand identity.
- Include diagram version and owner in nearby Markdown when diagrams become operationally important.

