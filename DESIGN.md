# Zenti Content Engine — Design system

## Product character

A focused editorial workspace for planning source-backed educational content. The product should feel calm, precise, and practical—not like a publishing platform or an AI demo. The interface is an independent prototype and must not imply Zenti endorsement.

## Visual language

- Warm off-white page canvas (`#f7f6f3`), white panels, subtle neutral borders, charcoal text, and a restrained violet/indigo accent.
- Strong editorial hierarchy: compact uppercase labels, clear page titles, readable body copy, and monospace only for metadata where useful.
- Generous whitespace, low-contrast shadows, moderate rounded corners, and no intense gradients, decorative emoji, or filler charts.
- Use Lucide icons only when they clarify an action or state.
- Brand text: **Zenti Content Engine**. Keep the **Prototype** label visible.

## Tokens

| Role | Value |
|---|---|
| Canvas | `#f7f6f3` |
| Surface | `#ffffff` |
| Surface subtle | `#f1f0ed` |
| Text | `#222126` |
| Muted text | `#716f79` |
| Border | `#e7e5e1` |
| Accent | `#6255c7` |
| Accent hover | `#4e43a8` |
| Accent subtle | `#efedfb` |
| Success | `#24734d` |
| Warning | `#9a6816` |
| Error | `#b43c3c` |

## Interaction and accessibility

- Keep generation to one primary action. Before generation, do not show navigation, a sidebar, modal, required brief fields, or source-selection controls.
- After generation, use four compact tabs only: Overview, Content, Scenes, and Metrics. Start on Overview and show a compact metrics preview there.
- Let the model choose the topic and prepare the package after the user presses the generation button. Keep all interface and generated content in English; do not show a language control.
- Keep all provider names out of navigation, labels, and instructional UI. The generated prompt text may remain provider-specific until the prompt profile changes.
- Present each tab's content by purpose. Keep source/claim details in a disclosure, but make demo metrics visible in the Overview and Metrics tab with an unmistakable fictional-data label.
- On small screens, keep four tabs compact and horizontally scrollable; stack content and preserve comfortable tap targets.
- Keyboard focus is clearly visible; errors are adjacent to the action and announced accessibly. Buttons communicate disabled, loading, and success states.
- Never make illustrative data look live. Put `Illustrative demo data — fictional values; not actual Zenti results, benchmarks, or forecasts.` next to any sample metrics.
- Login is a simple private gate. Do not display secrets in errors or client code.

## Inspiration boundary

Use the clarity, whitespace, and editorial finish of the supplied duply.ai reference as inspiration only. Do not copy its assets, brand, or proprietary components.
