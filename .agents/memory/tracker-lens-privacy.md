---
name: Tracker Lens privacy boundary
description: Product boundary for browser observations and future feature work.
---

Tracker Lens keeps captured request observations in bounded extension session memory and does not send browsing data to a remote service by default.

**Why:** The product's trust promise is to reveal outbound data without becoming another party that collects browsing history.

**How to apply:** Any future sync, analytics, account, or export feature must be explicit, opt-in, and clearly separate from the local capture path.