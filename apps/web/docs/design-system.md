# Understudy Design System

> Enterprise-governance-tier UI. Stripe/Linear/Vercel clean, not marketing glossy. Every interactive element is keyboard-reachable with a visible focus ring; colour contrast targets WCAG AA.

---

## 1. Tokens

Declared in `apps/web/src/theme.css` as HSL triplets on `:root` (dark) and `[data-theme="light"]`. The triplet form composes with Tailwind's alpha modifier: `bg-primary/20`, `border-border/60`, etc.

### Colour

| Token                     | Role                                              |
| ------------------------- | ------------------------------------------------- |
| `--background`            | App canvas                                        |
| `--surface`               | Cards, sidebar, panels                            |
| `--elevated`              | Hovered/active surfaces, inline chips             |
| `--foreground`            | Primary text                                      |
| `--muted` / `--muted-foreground` | Secondary text                             |
| `--faint`                 | Tertiary / eyebrow text, keyboard caps            |
| `--border`                | Hairlines, card borders, tab dividers             |
| `--border-strong`         | Interactive borders (inputs, secondary buttons)   |
| `--ring`                  | Focus ring                                        |
| `--primary`               | Brand indigo (buttons, links, active nav)         |
| `--primary-strong`        | Hovered primary                                   |
| `--primary-soft`          | Primary badge text                                |
| `--accent`                | Cyan — Cosmo / Dream Query moments                |
| `--success`               | Healthy probes, diff-adds, completed stages       |
| `--warning`               | Mocked / degraded probes, diff-removes-but-ok     |
| `--destructive`           | Failed probes, errors, destructive buttons        |
| `--chart-1..5`            | Sponsor-aligned chart palette                     |

### Radius

`--radius-xs 2px` · `--radius-sm 4px` · `--radius 8px` · `--radius-lg 12px` · `--radius-xl 16px`.

### Shadow

`--shadow-xs` through `--shadow-lg`. All drop-shadows use a true dark colour, not black, so they read softly on `--surface` and `--elevated`.

### Motion

| Token               | Value                                  | Use                                 |
| ------------------- | -------------------------------------- | ----------------------------------- |
| `--motion-fast`     | 100ms                                  | Hover colour transitions            |
| `--motion-base`     | 160ms                                  | Tab swap, popover fade              |
| `--motion-slow`     | 240ms                                  | Sheet slide, drawer open            |
| `--motion-ease`     | `cubic-bezier(0.2, 0.8, 0.2, 1)`       | Default easing for everything above |

`prefers-reduced-motion` zeroes all timings and disables animations.

---

## 2. Typography

- `Inter` for chrome (`font-sans`), with `cv11 ss01 ss03` feature settings for governance-grade number legibility.
- `JetBrains Mono` for every piece of receipt content, IDs, hashes, and keyboard caps (`font-mono`).
- Both loaded from Google Fonts via `index.html` with `preconnect`.

### Scale

| Usage               | Size | Line height |
| ------------------- | ---- | ----------- |
| Page title          | 22px | 1.1         |
| Card title          | 15px | 1.2         |
| Body                | 13px | 1.5         |
| Secondary / mono    | 12px | 1.6         |
| Small / chip        | 11px | 1.5         |
| Eyebrow / kbd       | 10px | 1.4         |

---

## 3. Components

All shadcn-compatible primitives land in `apps/web/src/components/ui/*`. Each file is a single primitive; import from its file, not a barrel.

| File                    | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `button.tsx`            | `<Button variant size>` with `asChild` via Radix Slot     |
| `card.tsx`              | `Card` + Header/Title/Description/Content/Footer          |
| `badge.tsx`             | Status/tag chips with semantic variants                   |
| `input.tsx`             | Text input                                                |
| `dialog.tsx`            | Modal — over `@radix-ui/react-dialog`                     |
| `sheet.tsx`             | Side drawer (left/right/top/bottom)                       |
| `tabs.tsx`              | Segmented tabs                                            |
| `tooltip.tsx`           | Hover-delay tooltip                                       |
| `dropdown-menu.tsx`     | Contextual menu with checkbox items & keyboard hints      |
| `skeleton.tsx`          | Loading placeholders with subtle shimmer                  |
| `scroll-area.tsx`       | Styled scroll container                                   |
| `separator.tsx`         | Horizontal / vertical rule                                |
| `command.tsx`           | `cmdk`-based command palette primitives                   |
| `kbd.tsx`               | Monospace keyboard-cap label                              |
| `status-dot.tsx`        | Status puck — live/ok/mock/degraded/down/pending          |
| `theme-toggle.tsx`      | Sun/moon toggle wired into `useTheme`                     |
| `toast.tsx`             | Sonner wrapper — `import { toast } from "@/components/ui/toast"` |

### Brand

- `components/brand/Wordmark.tsx` — `[u_]` monogram + "Understudy" wordmark. `compact` shows only the glyph; `animate` toggles the caret.
- `components/brand/SponsorBadge.tsx` — monospace sponsor text-chips (Gemini, TinyFish, Wundergraph, Chainguard, InsForge, Redis). We ship text rather than raster vendor marks to avoid trademark misuse.

### Shell

`apps/web/src/layouts/AppShell.tsx` composes the full chrome:

- 240px fixed sidebar with wordmark, Cmd+K quick-jump trigger, 5 primary nav items, docs link, and a theme toggle in the footer.
- Sticky top bar with breadcrumbs + sponsor-service `HealthRail` on the right.
- Max-width content container (1400px) with generous 8-col gutters.
- Global command palette mounted once; Cmd/Ctrl+K opens it from anywhere.

`PageHeader` (exported from the same file) is the page-level title block: eyebrow + title + description + actions.

---

## 4. Theming

`apps/web/src/lib/theme.tsx` exposes a `ThemeProvider` and `useTheme()` hook. The provider:

1. Reads the persisted theme from `localStorage["understudy.theme"]`.
2. Mirrors it onto `<html data-theme="dark|light">` and toggles the legacy `.dark` class for third-party lib compat.
3. Sets `color-scheme` so native form controls match.

FOUC is prevented by an inline `<script>` in `index.html` that applies `data-theme` before React mounts.

---

## 5. Accessibility

- Every interactive primitive exposes a visible focus ring via `focus-visible:ring-2 ring-ring`.
- `prefers-reduced-motion` collapses all motion tokens to 1ms.
- Colour pairs were picked for WCAG AA on both themes: `foreground` on `background` is ≥ 7:1; `muted` on `background` is ≥ 4.5:1.
- The command palette uses `cmdk`, which ships full keyboard navigation and ARIA out of the box.
- Health chips and status dots always pair colour with a textual label — colour alone is never load-bearing.

---

## 6. Motion Philosophy

Snappy, not bouncy. 100ms for anything the cursor drives (hover, press), 160ms for UI transitions the user initiated (tab swap, popover), 240ms for drawer-class movement. No spring physics in the shell — governance buyers trust calm.

---

## 7. Legacy compatibility

Existing pages (`pages/Upload.tsx`, `SynthesisHUD.tsx`, `DreamQuery.tsx`, `SupplyChain.tsx`, `AgentWall.tsx`) still use the pre-rebuild `.chip`, `.card`, `.btn`, `.kbd`, `.receipt-row`, `.diff-plus/.diff-minus`, and `.meter-*` classes. Those are preserved in `styles/index.css` under `@layer components` and re-pointed at the new HSL tokens so they keep rendering correctly while tasks #20 and #21 rebuild onto the `ui/*` primitives. When those rebuilds land, the legacy block can be deleted.

---

## 8. Synthesis-flow patterns (task #20)

The Upload / Synthesis HUD / Dream Query pages share a set of domain-specific composites that live in `apps/web/src/components/synthesis/*`. Each is a thin wrapper over the `ui/*` primitives; none extend the token set.

| Component                     | Built on                           | Purpose                                                                 |
| ----------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `DropZone`                    | `Badge`, `Kbd`                     | Dashed-border drop target, primary-color glow on drag-over              |
| `UploadProgress`              | `Card`, `Button`, `Badge`          | Staged-file preview + progress bar wired to XHR upload                  |
| `GeminiStageCard`             | `Card`, `Badge`, Lucide icons      | 3-stage Gemini HUD card with streaming JSON tool-calls, elapsed, tokens |
| `KeyframeRibbon`              | `Dialog`, `Badge`, `ScrollArea`    | Horizontal 128×72 thumbnail ribbon, dbl-click expands to full frame     |
| `IntentTree`                  | `Badge`, Lucide icons              | Collapsible goal / inputs / invariants / steps tree                     |
| `ScriptPanel`                 | `Button`, `Badge`, `ScrollArea`    | TinyFish script viewer with copy + download + SWE-bench 78% footer      |
| `SdlDiffViewer`               | `Card`, `Badge`, `ScrollArea`      | Side-by-side LCS-based GraphQL SDL diff (additions green, removals red) |
| `TrafficValidatorBanner`      | `Card`, `Badge`, Lucide icons      | Live-traffic validator PASS banner with stat pills; `isFixture` flag    |
| `SupergraphMiniMap`           | `Card`, `Badge`, `Separator`       | Subgraph list with "new" highlight and Cosmo Studio deep-link           |

### Tone choices for these composites

- **Stage streaming state** uses `warning` color with a 4px outer halo — signals "live" without the visual noise of a dedicated color.
- **Stage done state** uses `success/30` border only; filled success is reserved for governance receipts where PASS is non-negotiable.
- **SDL diff rows** pair color with a leading `+` / `−` glyph so colour is never load-bearing.
- **Traffic validator banner** always renders an `(demo fixture)` badge when `isFixture=true` — honesty over glow per devils-advocate review.

### Data-shape discipline

All three pages pull shapes from `apps/web/src/api/types.ts`, which is a hand-maintained mirror of `apps/api/schemas.py`. When a new field appears in the Pydantic schema, add it to `types.ts` first, then widen the composite that consumes it — never inline an unrelated shape in a page file.
