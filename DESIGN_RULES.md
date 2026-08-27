# DESIGN_RULES.md — قواعد التصميم الإلزامية لهذا المشروع

These rules are constraints, not suggestions. When a rule conflicts with what you were about to generate, the rule wins. The goal is to make a deliberate choice in each place where the default would be decoration.

## 1. Colour
- ONE accent colour. Everything else neutral: a single family of greys, consistent temperature (all warm or all cool, never mixed).
- Second colour only when it carries meaning: destructive, success, warning. Never for variety.
- BANNED: blue→purple and indigo→violet gradients anywhere (backgrounds, buttons, headings, logos, icons, borders, blobs, mesh backgrounds).
- BANNED: gradient text (background-clip: text). Headings are one solid colour.
- BANNED: each feature/category/section getting its own hue. Colour encodes meaning, not decoration.
- Never ship a framework default palette untouched (Tailwind indigo/violet/slate). Define own tokens in src/styles.css.
- Accent usage target: under 10% of visible surface.

## 2. Depth and separation
- BANNED: drop shadows on anything not genuinely floating. Cards, sections, images, inputs, badges, static buttons: NO shadow.
- Shadows only on true overlays: dropdowns, popovers, modals, toasts. Tight, low-opacity (e.g. 0 1px 2px rgba(0,0,0,.06)).
- Separate blocks with: 1px border > background step > whitespace (in that order of preference).
- No stacked shadows.
- ONE border-radius value and ONE border colour, used everywhere.

## 3. Icons and emoji
- BANNED: sparkle icon (✨ ✦ ✧ 🪄) and every "AI shimmer" glyph anywhere.
- BANNED: emoji as UI — none in headings, buttons, lists, badges, nav, empty states.
- BANNED: containers around icons — no tinted square, circle, bordered box, or chip behind an icon. Icon sits directly on background at text size.
- One real icon set (Lucide) at one stroke weight. Monochrome, currentColor, sized to adjacent text.
- If a feature is clear from its label, no icon at all.

## 4. Typography and copy
- BANNED words: unleash, supercharge, elevate, transform, revolutionise, empower, seamless, effortless, effortlessly, cutting-edge, game-changing, next-level, unlock, harness, robust, leverage, powerful, delve, paradigm, synergy.
- BANNED: em dash (—) in UI copy. Write two sentences or use a comma.
- Concrete nouns and real numbers. "Export to CSV in one click" not hype.
- One type family (two max: UI + mono). Scale ~12/14/16/20/24/32/48. No in-between sizes.
- Body left-aligned. Centre only short headings. Never centre a paragraph over three lines. Cap measure ~70 chars.
- Sentence case for headings and buttons.

## 5. Motion
- BANNED: arrow sliding inside button on hover, self-animating arrows, bouncing chevrons, looping idle motion.
- BANNED: hover glow, box-shadow bloom, coloured halo, scale() above 1.02, lift on hover.
- Hover states: background or border colour change only, 120–160ms ease-out.
- Animate opacity and transform only. 120–200ms feedback, up to 300ms entering.
- No scroll-triggered fade-ins on every section. No parallax, typewriter, tickers, logo marquees.
- Honour prefers-reduced-motion.

## 6. Scale and proportion
- Hero headline: 40–56px desktop, 28–34px mobile. Never 72px+.
- Body 15–16px. Secondary 13–14px. Nothing below 12px.
- Buttons 36–44px tall, padding sized to label. Never full-width on desktop.
- Section padding 64–96px desktop, 40–56px mobile.
- Content max-width 1100–1280px. Text columns ~65–70 chars.
- Inline icons 16–20px, standalone 24px. No 48px+ decorative icons.
- No full-viewport-tall sections just for impact.
- Cards sized by content; equal heights only when content is equal.
- Every spacing value a multiple of 4. Shared edges align.

## 7. Layout and structure
- BANNED: eyebrow badge above the hero ("Introducing v2.0", "AI-Powered", "New", "Trusted by...").
- Do not reproduce the default template order (hero → logo strip → 3 features → testimonial → pricing → FAQ → CTA).
- Feature grids need not be 3 equal columns. Let content set the shape.
- Not everything centred, not everything a card, not every corner fully rounded.
- One spacing scale (4px base). Consistent vertical rhythm.

## 8. Placeholder content
- Mockup content is fine and specific: named companies, precise numbers, feature-mentioning testimonials.
- Placeholder copy obeys section 4.
- Write real empty, error, and loading states.

## 9. Code craft
- Semantic HTML: header, nav, main, section, button, a. Clickable div is a bug.
- Visible :focus-visible styles. Keyboard order matches visual order.
- Meaningful alt on images; decorative images alt="".
- Contrast ≥4.5:1 body, ≥3:1 large text.
- Reuse components; extract repeated markup.
- Design tokens/theme values, no one-off arbitrary values.
- No dead code, commented-out blocks, unused imports, or TODOs.

## Pre-ship checklist
1. Any blue→purple / indigo→violet gradient left?
2. Any gradient text?
3. Any shadow on a non-floating element?
4. Any sparkle glyph?
5. Any emoji as interface?
6. Any icon inside a tinted container?
7. Any em dash in copy?
8. Any banned words?
9. Each feature/category its own colour?
10. Any button with a moving arrow?
11. Any glow/lift/scale on hover?
12. Any meaningless badge above the hero?
13. Hero headline above 56px, or section padding over 96px?
14. Any element oversized next to adjacent text?
