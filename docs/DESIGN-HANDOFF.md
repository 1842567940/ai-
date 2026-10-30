# 4ad68746-78e3-4dfe-9d1c-41a192ce5712 implementation handoff

This archive is the source of truth for turning the design into production code. Start from `ai-novel-editor-home.html`, then preserve the visual system, responsive behavior, and interactions found in the exported files.

## Implementation target
- Build production UI from the exported design, not a loose reinterpretation.
- Preserve typography scale, spacing rhythm, color tokens, border radii, shadows, motion timing, and component states.
- Replace static placeholders only when the target app has real data or functional equivalents.
- Keep generated product UI free of OpenDesign chrome, preview labels, or design-process annotations.
- Treat this handoff as a visual contract: if implementation choices conflict, match the exported pixels and behavior first, then refactor internals.

## Source map
- Primary entry: `ai-novel-editor-home.html`
- HTML screens detected: 12
- Stylesheets detected: 0
- Script/component files detected: 0
- Supporting assets detected: 82

## Responsive contract
Validate the implementation across this 2025–2026 viewport matrix:
- Mobile compact: 360×800
- Mobile standard: 390×844
- Mobile large: 430×932
- Foldable / small tablet: 600×960
- Tablet portrait: 820×1180
- Tablet landscape: 1024×768
- Laptop: 1366×768
- Desktop: 1440×900
- Wide desktop: 1920×1080

For responsive web exports, treat these as a modern breakpoint system for one adaptive web experience, not three fixed screenshots. Do not split responsive web into unrelated native app screens unless the project explicitly includes native targets. Use semantic layout thresholds, fluid `clamp()` type/spacing, and container queries where component width matters more than viewport width. Preserve any CSS media queries, container queries, fluid `clamp()` scales, and layout changes already present in the exported files.

## Design fidelity contract
- Extract reusable tokens before writing components: background, surface, foreground, muted text, border, accent, radius, shadow, spacing, type scale, and motion duration/easing.
- Map product screens, in-app modules/components, optional landing page, and optional OS widget surfaces before coding. Keep these surfaces separate in the target architecture.
- Match layout geometry: max-widths, gutters, grid columns, card proportions, sticky/fixed elements, and viewport-specific navigation.
- Preserve real copy, labels, and data shown in the export. Do not replace specific text with generic marketing filler.
- Preserve interactive affordances: hover, focus, pressed, disabled, loading, validation, copy/share, tab/accordion, modal/sheet, and keyboard states where present.
- Preserve accessibility semantics when converting: headings stay hierarchical, controls remain buttons/links/inputs, focus states stay visible.
- Do not keep prototype-only annotations, frame labels, or OpenDesign chrome in the production UI.

## CJX-ready UX contract
- Use `DESIGN-MANIFEST.json` as the machine-readable map for screens, app modules, OS widgets, landing pages, tokens, interactions, and viewport checks.
- Screen-file-first: when multiple user-facing surfaces exist, implement each HTML screen as its own route/file. Treat `index.html` as a launcher/overview when the manifest marks it that way, not as a combined final UI.
- If `landing.html`, app screens, platform screens, or OS widget files exist, preserve those boundaries in the target app instead of merging them into one page.
- A single self-contained `ai-novel-editor-home.html` is acceptable only when the export truly contains one user-facing screen and its CSS/JS are structured enough to extract tokens, components, states, and behavior.
- If separate `css/` or `js/` files exist, treat them as source of truth for token/component/interactions before porting to React, Vue, SwiftUI, Compose, or another target stack.
- In-app modules/components are product UI blocks inside the app. OS widgets are home-screen/lock-screen/quick-access surfaces outside the app. Do not merge those concepts.

## Color and brand contract
- Use the exported design tokens and product/domain context as the color source of truth.
- Do not introduce warm beige / cream / peach / pink / orange-brown background washes unless they are already explicit brand/reference colors in the export.
- No obvious token stylesheet was detected; sample colors from the entry file and convert them into named tokens before coding.

## Implementation sequence for AI coding tools
1. Open `ai-novel-editor-home.html` and `DESIGN-MANIFEST.json`; identify every screen file, launcher/overview file, app module, and interaction before coding.
2. If multiple HTML screens exist, map them to separate routes/surfaces first; do not merge `landing.html`, product app screens, platform screens, or OS widgets into one route.
3. Extract a token table from CSS/root styles and inline styles before building framework components.
4. Build product screens and domain-specific in-app modules from largest layout regions down to controls; avoid starting with isolated atoms that lose spatial intent.
5. Port responsive behavior across the modern viewport matrix and test each semantic breakpoint before cleanup.
6. Port interactions and states, then replace static placeholders only with real app data or functional equivalents.
7. Keep optional landing page and OS widget surfaces as separate surfaces if present.
8. Compare final screenshots against the export at 360×800, 390×844, 430×932, 820×1180, 1024×768, 1366×768, 1440×900, and 1920×1080 before declaring done.

## Entry points
- `ai-novel-editor-home.html`
- `qibi-accounts.html`
- `qibi-materials.html`
- `qibi-memoir.html`
- `qibi-mode.html`
- `qibi-settings.html`
- `qibi-stats.html`
- `qibi-studio.html`
- `qibi-tool.html`
- `qibi-tools.html`
- `qibi-transmigration.html`
- `qibi-work.html`

## Styles
- None detected

## Scripts/components
- None detected

## Assets and supporting files
- `启笔-封面-惊鸿照影-1.png`
- `启笔-封面-惊鸿照影.png`
- `启笔-AI-1-1.png`
- `启笔-AI-1.png`
- `水墨少女-夜色.png`
- `新建文本文档.txt`
- `app-icon.png`
- `download.png`
- `drawing-2026-10-17T23-35-32-852Z.png`
- `image-1.png`
- `image-10.png`
- `image-11.png`
- `image-12.png`
- `image-13.png`
- `image-14.png`
- `image-15.png`
- `image-16.png`
- `image-17.png`
- `image-18.png`
- `image-19.png`
- `image-2.png`
- `image-20.png`
- `image-21.png`
- `image-22.png`
- `image-23.png`
- `image-24.png`
- `image-25.png`
- `image-26.png`
- `image-27.png`
- `image-28.png`
- `image-29.png`
- `image-3.png`
- `image-30.png`
- `image-31.png`
- `image-32.png`
- `image-33.png`
- `image-34.png`
- `image-35.png`
- `image-36.png`
- `image-37.png`
- `image-38.png`
- `image-39.png`
- `image-4.png`
- `image-40.png`
- `image-41.png`
- `image-42.png`
- `image-43.png`
- `image-44.png`
- `image-45.png`
- `image-46.png`
- `image-47.png`
- `image-48.png`
- `image-49.png`
- `image-5.png`
- `image-50.png`
- `image-51.png`
- `image-52.png`
- `image-53.png`
- `image-54.png`
- `image-55.png`
- `image-56.png`
- `image-57.png`
- `image-58.png`
- `image-59.png`
- `image-6.png`
- `image-60.png`
- `image-61.png`
- `image-62-1.png`
- `image-62.png`
- `image-63.png`
- `image-64.png`
- `image-65.png`
- `image-66.png`
- `image-67.png`
- `image-68.png`
- `image-69.png`
- `image-7.png`
- `image-70.png`
- `image-71.png`
- `image-8.png`
- `image-9.png`
- `image.png`

## Coding checklist for AI tools
1. Inspect `ai-novel-editor-home.html` and `DESIGN-MANIFEST.json` first and identify reusable components before coding.
2. Implement each user-facing screen file as its own route/surface; keep launcher, landing, app, platform, and OS widget files separate.
3. Extract design tokens into the target stack: colors, type scale, spacing, radius, shadows, and motion.
4. Implement layout with real 2025–2026 responsive breakpoints, fluid type/spacing, and container-query-aware component behavior; test with no horizontal overflow.
5. Preserve interactive controls, hover/focus/pressed states, form behavior, validation, and copy actions where present.
6. Implement domain-specific in-app modules with real states; do not flatten them into generic cards.
7. Keep landing page, product screens, and OS widget/quick-access surfaces separate when present.
8. Confirm the production result visually matches the exported design before refactoring internals.
9. Reject implementation shortcuts that flatten the design into generic cards, generic gradients, placeholder stats, or framework-default typography.
10. If a detail is ambiguous, keep the exported HTML/CSS/JS behavior rather than inventing a new pattern.
