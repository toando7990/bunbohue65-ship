# Design Brief

## Direction

Bún Bò Huế 65 Ship — Vietnamese restaurant-chain shipping & payment operations tool (UI tiếng Việt).

## Tone

Modern operational tool, not rustic food app — warm vermillion brand accent on a warm neutral base, executed with the discipline of a logistics dashboard; clean, data-dense, mobile-first.

## Differentiation

A shipping app that feels like a confident operations console wearing a Vietnamese food brand — vivid vermillion primary, functional status colors, large touch targets for drivers, dense tables for admins.

## Color Palette

| Token        | OKLCH (light)  | OKLCH (dark)  | Role                              |
| ------------ | -------------- | ------------- | --------------------------------- |
| background   | 0.97 0.012 75  | 0.16 0.015 50 | Warm cream / warm charcoal        |
| foreground   | 0.2 0.02 50    | 0.93 0.012 60 | Deep warm ink / soft warm white   |
| card         | 0.99 0.008 75  | 0.2 0.018 50  | Elevated surface                  |
| primary      | 0.55 0.22 28   | 0.68 0.2 32   | Vivid vermillion — brand CTA      |
| accent       | 0.55 0.22 28   | 0.68 0.2 32   | Same as primary (single accent)   |
| secondary    | 0.94 0.018 75  | 0.24 0.02 50  | Subtle surfaces, secondary btns   |
| muted        | 0.94 0.015 75  | 0.24 0.02 50  | Backgrounds, disabled             |
| success      | 0.55 0.16 150  | 0.65 0.16 150 | Paid status (green)               |
| info         | 0.5 0.16 245   | 0.6 0.16 245  | Shipping status (blue)            |
| warning      | 0.72 0.16 70   | 0.78 0.16 70  | Pending status (amber)            |
| destructive  | 0.5 0.22 25    | 0.6 0.22 25   | Cancelled status (red)            |

## Typography

- Display: Space Grotesk — headings, KPI numbers, brand wordmark
- Body: Plus Jakarta Sans — UI labels, forms, tables (full Vietnamese diacritics)
- Mono: JetBrains Mono — order IDs, QR payload, admin numeric columns
- Scale: hero `text-4xl md:text-5xl font-bold tracking-tight`, h2 `text-2xl md:text-3xl font-semibold`, label `text-xs font-semibold tracking-wider uppercase`, body `text-base`, mono IDs `font-mono text-sm`

## Elevation & Depth

Layered surfaces via `bg-card` on `bg-background`, subtle borders over heavy shadows; `shadow-sm` default, `shadow-elevated` only for popovers/modals/QR card. No glow shadows.

## Structural Zones

| Zone       | Background      | Border           | Notes                                  |
| ---------- | --------------- | ---------------- | -------------------------------------- |
| Header     | `bg-card`       | `border-b`       | Sticky, brand wordmark + nav           |
| Content    | `bg-background` | —                | Alternating `bg-muted/30` per section  |
| Sidebar    | `bg-sidebar`    | `border-r`       | Admin nav (Đặt hàng, Theo dõi, v.v.)   |
| Footer     | `bg-muted/40`   | `border-t`       | Compact, optional on mobile            |
| QR screen  | `bg-background` | —                | Full-bleed, centered QR, no chrome     |

## Spacing & Rhythm

Mobile-first: 16px base padding, 24px section gaps; admin tables compact 12px row padding; QR screen 32px breathing room around code; touch targets min 44px height on driver flows.

## Component Patterns

- Buttons: primary `bg-primary text-primary-foreground rounded-md`, hover darkens 8%; secondary `bg-secondary`; status confirmations use status colors directly
- Cards: `bg-card rounded-lg border border-border shadow-sm`, 16-20px padding
- Badges: pill `rounded-full border px-2.5 py-0.5 text-xs font-semibold` with `badge-success/warning/info/destructive` utilities
- Tables: `bg-card` header row `bg-muted/50`, mono font for ID + amount columns, status badge per row
- Forms: labels `text-sm font-medium`, inputs `bg-input rounded-md`, focus ring `ring-primary`
- QR: centered `bg-card rounded-2xl p-6 shadow-elevated`, code fills 70% viewport on mobile

## Motion

- Entrance: fade + 4px rise, 200ms ease-out, staggered for list items
- Hover: `transition-smooth` (250ms), primary buttons darken, cards lift `shadow-sm → shadow-elevated`
- QR scan success: brief `animate-pulse-soft` on confirmation badge
- Polling status: subtle `animate-pulse` on pending badges only

## Constraints

- All UI labels in Vietnamese (Đặt hàng, Theo dõi đơn, Thanh toán, Quản lý, Menu, Nhà hàng, Báo cáo)
- Mobile-first for DriverPaymentScreen — QR full screen, 44px+ touch targets
- Status colors are functional only (green=paid, blue=shipping, amber=pending, red=cancelled) — never decorative
- No purple gradients, no full-page gradient backgrounds, no glow shadows
- Token-only styling — never raw hex/rgb in components

## Signature Detail

The vermillion primary (`0.55 0.22 28`) — tuned from Vietnamese flag red into an operational CTA color — paired with a warm cream base that signals "food brand" without resorting to rustic brown/amber cliché, letting the four functional status colors carry the workflow meaning.
