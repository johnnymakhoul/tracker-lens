---
name: Tracker Lens tracking profile
description: Product surface boundary for what Tracker Lens should show users.
---

Tracker Lens should present categories of trackable visitor data, not a request-by-request network ledger. The key categories are IP visibility, location, browser/device agent, screen and capability signals, locale, page identity, cookies/identifiers, and page context.

**Why:** The product goal is to answer “what can this site learn about me?” directly; raw requests distract from that question.

**How to apply:** Keep request capture as an internal evidence layer, but keep the visible UI aggregated around tracking categories with clear observed, inferred, and not-observed states.