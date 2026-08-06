---
name: Tracker Lens provider evidence
description: How ad and analytics endpoint classifications are presented.
---

Tracker Lens uses host-based recognition for common ad and analytics providers, then shows the exact observed endpoint, fields, and cookie values. Unknown destinations are labeled unclassified rather than guessed.

**Why:** A provider name helps users interpret evidence, but host matching alone cannot prove every use or ownership of a destination.

**How to apply:** Keep classifications visibly heuristic, preserve the raw endpoint and cookie evidence, and expand the provider list only with clear host patterns.