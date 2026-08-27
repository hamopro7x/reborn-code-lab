---
name: Design rules
description: Mandatory anti-generic design constraints for all UI work, mirrored in DESIGN_RULES.md at repo root
type: design
---
The canonical file is DESIGN_RULES.md in the repo root. Summary of hard constraints:

- ONE accent colour; neutrals are a single grey family with consistent temperature. Second colour only for destructive/success/warning.
- Banned: blue→purple / indigo→violet gradients anywhere; gradient text; per-feature hues; framework default palettes.
- Shadows only on floating overlays (dropdowns, popovers, modals, toasts), tight and low opacity. Separate blocks with 1px border, background step, or whitespace. One border-radius, one border colour.
- Banned: sparkle/AI shimmer glyphs, emoji as UI, containers behind icons. Lucide icons only, monochrome, currentColor, text-sized.
- Banned words: unleash, supercharge, elevate, transform, revolutionise, empower, seamless, effortless, cutting-edge, game-changing, next-level, unlock, harness, robust, leverage, powerful, delve, paradigm, synergy. Banned: em dash in UI copy.
- Motion: hover changes bg/border only, 120–160ms. No glow, no lift, no scale >1.02, no sliding arrows, no scroll fade-ins, no parallax, no marquees. Honour prefers-reduced-motion.
- Scale: headline 40–56px (28–34 mobile), body 15–16px, buttons 36–44px, section padding ≤96px, content max-width 1100–1280px, icons ≤24px, spacing multiples of 4.
- Layout: no eyebrow badges, no default template section order, not everything centred/carded/rounded.
- Code: semantic HTML, visible focus styles, alt text, 4.5:1 contrast, component reuse, design tokens only, no dead code.
- Run the 14-point pre-ship checklist in DESIGN_RULES.md before declaring any UI work finished.

**Why:** User explicitly pasted these rules as binding constraints for this project and every later change.
**How to apply:** Read DESIGN_RULES.md before any UI/design task; enforce during redesign of admin, employee, and storefront interfaces.
