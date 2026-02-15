# SuperMandi Design Tokens

> Single source of truth for all UI tokens across all platforms.
> Every portal, POS app, and landing page references this spec.

---

## Colors

### Brand

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#2563EB` | Buttons, links, active states |
| PrimaryDark | `#1D4ED8` | Hover states, headings |
| PrimaryLight | `#EFF6FF` | Active backgrounds, soft highlights |
| Accent | `#14B8A6` | Secondary actions, badges |
| AccentDark | `#0D9488` | Accent hover |
| AccentLight | `#F0FDFA` | Accent soft backgrounds |

### Semantic

| Token | Hex | Usage |
|-------|-----|-------|
| Success | `#22C55E` | Verified, active, complete |
| Warning | `#F59E0B` | Pending, attention needed |
| Error | `#EF4444` | Errors, danger, rejected |
| Info | `#0EA5E9` | Informational badges |

### Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#F7F9FC` | Page background |
| Surface | `#FFFFFF` | Cards, modals, panels |
| SurfaceAlt | `#F8FAFC` | Alternating rows, subtle sections |
| Border | `#E2E8F0` | Dividers, card borders |
| BorderDark | `#CBD5E1` | Emphasized borders |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| TextPrimary | `#0F172A` | Headings, primary text |
| TextSecondary | `#64748B` | Descriptions, labels |
| TextInverse | `#FFFFFF` | Text on dark/brand backgrounds |

### Sidebar

| Token | Value | Usage |
|-------|-------|-------|
| SidebarBg | `linear-gradient(180deg, #0F172A, #1E293B)` | Dark sidebar gradient |
| SidebarText | `#FFFFFF` | Nav labels |
| SidebarMuted | `#94A3B8` | Subtitles, secondary info |
| SidebarBorder | `rgba(255,255,255,0.1)` | Section dividers |

---

## Typography

| Token | Value |
|-------|-------|
| FontFamily | `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |
| FontMono | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` |

### Scale

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| H1 | 24px | 700 | Page titles |
| H2 | 18px | 600 | Section headings |
| H3 | 16px | 600 | Card titles |
| Body | 14-15px | 400 | Default text |
| Small | 13px | 400 | Table cells, labels |
| XSmall | 12px | 500 | Badges, timestamps |
| Tiny | 11px | 600 | Footer, meta |

---

## Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| SidebarWidth | `256px` | All portal sidebars |
| CardRadius | `8px` | Cards, panels |
| ButtonRadius | `6px` | Buttons, inputs, selects |
| ModalRadius | `12px` | Modals, dialogs |
| ButtonHeight | `46px` | Primary/secondary buttons |
| InputHeight | `42px` | Text inputs, selects |
| PagePadding | `24px` / `2rem` | Main content area |

---

## Badges

| Variant | Background | Border | Text |
|---------|-----------|--------|------|
| Success | `#DCFCE7` | `#86EFAC` | `#166534` |
| Warning | `#FEF3C7` | `#FCD34D` | `#92400E` |
| Danger | `#FEE2E2` | `#FCA5A5` | `#991B1B` |
| Info | `#DBEAFE` | `#93C5FD` | `#1E40AF` |

---

## Alerts / Banners

| Variant | Background | Border | Text |
|---------|-----------|--------|------|
| Error | `#FEF2F2` | `#FCA5A5` | `#991B1B` |
| Warning | `#FFFBEB` | `#FCD34D` | `#92400E` |
| Success | `#F0FDF4` | `#86EFAC` | `#166534` |
| Info | `#EFF6FF` | `#93C5FD` | `#1E40AF` |

---

## Brand Assets

| Asset | Path | Usage |
|-------|------|-------|
| Full Logo | `shared/brand/logo-full.svg` | Login headers, about pages |
| Shortmark | `shared/brand/logo-shortmark.svg` | Favicons, sidebar headers |
| White Logo | `shared/brand/logo-white.svg` | Dark sidebar headers |
| Favicon | `shared/brand/favicon.svg` | Browser tab icon |

---

## Locale (India)

| Token | Value |
|-------|-------|
| Currency | `INR (Rs.)` |
| CurrencySymbol | `₹` |
| PhonePrefix | `+91` |
| PhonePlaceholder | `+91 98765 43210` |
| PINPlaceholder | `Enter 6-digit PIN` |
| DateFormat | `DD/MM/YYYY` |
| Timezone | `IST (Asia/Kolkata)` |

---

## Footer

```
Left:  © 2026 SuperMandi Tech Pvt Ltd · Made in India
Right: <BuildStamp />
Style: bg #F8FAFC, border-top #E2E8F0, text #94A3B8, 12px
```
