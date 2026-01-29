# SuperMandi Landing Page - UI/UX Design

## Design Overview

A modern, clean, and professional landing page that serves as the gateway to all SuperMandi portals.

---

## Color Palette

```
Primary Colors:
┌─────────────────────────────────────────────────────────┐
│  #2563EB  │  #1E40AF  │  #3B82F6  │  #DBEAFE  │  #EFF6FF │
│  Primary  │  Dark     │  Light    │  Pale     │  BG      │
│  Blue     │  Blue     │  Blue     │  Blue     │  Tint    │
└─────────────────────────────────────────────────────────┘

Accent Colors:
┌─────────────────────────────────────────────────────────┐
│  #10B981  │  #F59E0B  │  #8B5CF6  │                     │
│  Success  │  Warning  │  Purple   │                     │
│  Green    │  Orange   │  Accent   │                     │
└─────────────────────────────────────────────────────────┘

Neutral Colors:
┌─────────────────────────────────────────────────────────┐
│  #111827  │  #374151  │  #6B7280  │  #F3F4F6  │  #FFFFFF │
│  Gray 900 │  Gray 700 │  Gray 500 │  Gray 100 │  White   │
│  Headings │  Body     │  Muted    │  BG       │  Cards   │
└─────────────────────────────────────────────────────────┘
```

---

## Typography

```
Font Family: Inter (Google Fonts)
Fallback: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif

Heading 1 (Logo):     48px / Bold (700) / #111827
Heading 2 (Tagline):  24px / Medium (500) / #374151
Body Text:            16px / Regular (400) / #6B7280
Button Text:          16px / Semibold (600) / #FFFFFF
Small Text:           14px / Regular (400) / #6B7280
```

---

## Desktop Layout (1440px)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│                         ┌──────────────────────┐                           │
│                         │    ◆ SUPERMANDI      │                           │
│                         │       (Logo)         │                           │
│                         └──────────────────────┘                           │
│                                                                            │
│                      Powering Retail Technology                            │
│                                                                            │
│               Connect retailers with suppliers seamlessly                  │
│                                                                            │
│    ┌─────────────────────────────────────────────────────────────────┐    │
│    │                                                                 │    │
│    │   ┌─────────────────────┐         ┌─────────────────────┐      │    │
│    │   │                     │         │                     │      │    │
│    │   │    📦               │         │    🏪               │      │    │
│    │   │                     │         │                     │      │    │
│    │   │    SUPPLIER         │         │    RETAILER         │      │    │
│    │   │    PORTAL           │         │    PORTAL           │      │    │
│    │   │                     │         │                     │      │    │
│    │   │  Manage products,   │         │  Manage inventory,  │      │    │
│    │   │  orders & payouts   │         │  sales & reports    │      │    │
│    │   │                     │         │                     │      │    │
│    │   │  ┌───────────────┐  │         │  ┌───────────────┐  │      │    │
│    │   │  │  Login Now →  │  │         │  │  Login Now →  │  │      │    │
│    │   │  └───────────────┘  │         │  └───────────────┘  │      │    │
│    │   │                     │         │                     │      │    │
│    │   └─────────────────────┘         └─────────────────────┘      │    │
│    │                                                                 │    │
│    └─────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│                         ┌───────────────────┐                              │
│                         │   Admin Login →   │                              │
│                         └───────────────────┘                              │
│                                                                            │
│  ──────────────────────────────────────────────────────────────────────── │
│                                                                            │
│    © 2026 SuperMandi Technologies  •  Privacy Policy  •  Terms of Service │
│                                                                            │
│                    contact@supermandi.tech  •  +91 7737914383              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Header / Logo Section

```
┌─────────────────────────────────────────┐
│                                         │
│          ◆ SUPERMANDI                   │
│                                         │
│     Powering Retail Technology          │
│                                         │
│  Connect retailers with suppliers       │
│          seamlessly                     │
│                                         │
└─────────────────────────────────────────┘

Specs:
- Logo: SVG icon + Text
- Logo Color: #2563EB (Primary Blue)
- Main Heading: 48px, Bold, #111827
- Tagline: 24px, Medium, #374151
- Subtext: 16px, Regular, #6B7280
- Spacing: 24px between elements
- Top padding: 80px
```

### 2. Portal Cards

```
┌─────────────────────────────────────────┐
│                                         │
│              📦                         │  Icon: 48px
│                                         │
│         SUPPLIER PORTAL                 │  Title: 20px, Semibold
│                                         │
│      Manage products, orders            │  Description: 14px
│          & payouts                      │
│                                         │
│      ┌─────────────────────┐            │
│      │    Login Now →      │            │  Button: 16px, Semibold
│      └─────────────────────┘            │
│                                         │
└─────────────────────────────────────────┘

Card Specs:
- Width: 320px (desktop), 100% (mobile)
- Padding: 40px
- Background: #FFFFFF
- Border: 1px solid #E5E7EB
- Border Radius: 16px
- Box Shadow: 0 4px 6px -1px rgba(0,0,0,0.1)
- Hover: Shadow increases, slight scale (1.02)

Button Specs:
- Width: 100%
- Height: 48px
- Background: #2563EB
- Hover: #1E40AF
- Border Radius: 8px
- Text: White, 16px, Semibold
```

### 3. Supplier Card (Orange Theme)

```css
.supplier-card {
  --accent: #F59E0B;
  --accent-light: #FEF3C7;
  --accent-dark: #D97706;
}
```

```
┌─────────────────────────────────────────┐
│  ┌───────────────────────────────────┐  │
│  │ ░░░░░░░░ Gradient Top ░░░░░░░░░░ │  │  <- Subtle gradient accent
│  └───────────────────────────────────┘  │
│                                         │
│           📦                            │  <- Orange icon
│                                         │
│      SUPPLIER PORTAL                    │
│                                         │
│    Manage your product catalog,         │
│    track orders from retailers,         │
│    and receive payouts                  │
│                                         │
│      ┌─────────────────────┐            │
│      │    Login Now →      │            │  <- Orange button
│      └─────────────────────┘            │
│                                         │
└─────────────────────────────────────────┘
```

### 4. Retailer Card (Green Theme)

```css
.retailer-card {
  --accent: #10B981;
  --accent-light: #D1FAE5;
  --accent-dark: #059669;
}
```

```
┌─────────────────────────────────────────┐
│  ┌───────────────────────────────────┐  │
│  │ ░░░░░░░░ Gradient Top ░░░░░░░░░░ │  │  <- Subtle gradient accent
│  └───────────────────────────────────┘  │
│                                         │
│           🏪                            │  <- Green icon
│                                         │
│      RETAILER PORTAL                    │
│                                         │
│    Manage inventory, track sales,       │
│    view reports, and order from         │
│    suppliers                            │
│                                         │
│      ┌─────────────────────┐            │
│      │    Login Now →      │            │  <- Green button
│      └─────────────────────┘            │
│                                         │
└─────────────────────────────────────────┘
```

### 5. Admin Link (Subtle)

```
                ┌───────────────────────┐
                │   🔐 Admin Login →    │
                └───────────────────────┘

Specs:
- Style: Text link, not prominent button
- Color: #6B7280 (Gray)
- Hover: #2563EB (Blue)
- Font: 14px, Medium
- Icon: Lock icon (small)
- Position: Below main cards, centered
```

### 6. Footer

```
────────────────────────────────────────────────────────────────

   © 2026 SuperMandi Technologies  •  Privacy Policy  •  Terms

                 contact@supermandi.tech  •  +91 7737914383

────────────────────────────────────────────────────────────────

Specs:
- Background: #F9FAFB
- Border Top: 1px solid #E5E7EB
- Padding: 40px
- Text: 14px, #6B7280
- Links: Hover → #2563EB
```

---

## Mobile Layout (375px)

```
┌──────────────────────────────┐
│                              │
│       ◆ SUPERMANDI           │
│                              │
│   Powering Retail Technology │
│                              │
│   Connect retailers with     │
│   suppliers seamlessly       │
│                              │
│  ┌────────────────────────┐  │
│  │                        │  │
│  │         📦             │  │
│  │                        │  │
│  │   SUPPLIER PORTAL      │  │
│  │                        │  │
│  │  Manage products,      │  │
│  │  orders & payouts      │  │
│  │                        │  │
│  │  ┌──────────────────┐  │  │
│  │  │   Login Now →    │  │  │
│  │  └──────────────────┘  │  │
│  │                        │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │                        │  │
│  │         🏪             │  │
│  │                        │  │
│  │   RETAILER PORTAL      │  │
│  │                        │  │
│  │  Manage inventory,     │  │
│  │  sales & reports       │  │
│  │                        │  │
│  │  ┌──────────────────┐  │  │
│  │  │   Login Now →    │  │  │
│  │  └──────────────────┘  │  │
│  │                        │  │
│  └────────────────────────┘  │
│                              │
│      🔐 Admin Login →        │
│                              │
│  ────────────────────────── │
│                              │
│  © 2026 SuperMandi           │
│  Privacy • Terms • Contact   │
│                              │
└──────────────────────────────┘

Mobile Specs:
- Cards: Full width with 16px margin
- Stack vertically
- Logo: 36px
- Padding: 24px
```

---

## Tablet Layout (768px)

```
┌────────────────────────────────────────────────────┐
│                                                    │
│               ◆ SUPERMANDI                         │
│                                                    │
│          Powering Retail Technology                │
│                                                    │
│   ┌──────────────────┐  ┌──────────────────┐      │
│   │                  │  │                  │      │
│   │      📦         │  │      🏪         │      │
│   │                  │  │                  │      │
│   │  SUPPLIER        │  │  RETAILER        │      │
│   │  PORTAL          │  │  PORTAL          │      │
│   │                  │  │                  │      │
│   │  Manage products │  │  Manage inventory│      │
│   │  & orders        │  │  & sales         │      │
│   │                  │  │                  │      │
│   │ ┌──────────────┐ │  │ ┌──────────────┐ │      │
│   │ │  Login Now → │ │  │ │  Login Now → │ │      │
│   │ └──────────────┘ │  │ └──────────────┘ │      │
│   │                  │  │                  │      │
│   └──────────────────┘  └──────────────────┘      │
│                                                    │
│               🔐 Admin Login →                     │
│                                                    │
│  ──────────────────────────────────────────────── │
│        © 2026 SuperMandi • Privacy • Terms         │
└────────────────────────────────────────────────────┘

Tablet Specs:
- Cards: 2 columns, equal width
- Gap: 24px
- Container: max-width 720px
```

---

## Interactive States

### Button States

```
Normal State:
┌─────────────────────┐
│    Login Now →      │  Background: #2563EB
└─────────────────────┘  Shadow: none

Hover State:
┌─────────────────────┐
│    Login Now →      │  Background: #1E40AF
└─────────────────────┘  Shadow: 0 4px 12px rgba(37,99,235,0.4)
                         Transform: translateY(-2px)

Active/Pressed:
┌─────────────────────┐
│    Login Now →      │  Background: #1E3A8A
└─────────────────────┘  Transform: translateY(0)

Focus State:
┌─────────────────────┐
│    Login Now →      │  Outline: 2px solid #93C5FD
└─────────────────────┘  Outline-offset: 2px
```

### Card Hover Effect

```
Normal:
┌─────────────────────┐
│                     │  Shadow: 0 4px 6px rgba(0,0,0,0.1)
│      Card           │  Transform: none
│                     │
└─────────────────────┘

Hover:
╔═════════════════════╗
║                     ║  Shadow: 0 20px 40px rgba(0,0,0,0.15)
║      Card           ║  Transform: translateY(-4px) scale(1.02)
║                     ║  Border: 1px solid accent color
╚═════════════════════╝
```

---

## Animation Specs

### Page Load Animation

```
1. Logo fades in (0ms - 300ms)
   opacity: 0 → 1
   transform: translateY(-20px) → translateY(0)

2. Tagline fades in (150ms - 450ms)
   opacity: 0 → 1
   transform: translateY(-10px) → translateY(0)

3. Cards slide up (300ms - 600ms)
   opacity: 0 → 1
   transform: translateY(30px) → translateY(0)

4. Footer fades in (500ms - 700ms)
   opacity: 0 → 1
```

### CSS Transitions

```css
.card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.button {
  transition: all 0.2s ease-out;
}

.link {
  transition: color 0.15s ease;
}
```

---

## Background Design Option

### Option A: Clean White
```
Background: #FFFFFF
Simple, professional, fast-loading
```

### Option B: Subtle Gradient
```
Background: linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 50%, #F9FAFB 100%)
Adds depth without distraction
```

### Option C: Abstract Pattern (Recommended)
```
Background: #FFFFFF
+ Subtle dotted grid pattern (opacity: 0.03)
+ Gradient orbs in corners (blur: 200px, opacity: 0.1)
  - Top-left: Blue orb (#3B82F6)
  - Bottom-right: Green orb (#10B981)
```

```
┌────────────────────────────────────────────────────────────┐
│ ○                                                          │
│   ○  (Blue gradient orb, very subtle)                      │
│                                                            │
│                    · · · · · · · · · · ·                   │
│                    · · · · · · · · · · ·                   │
│                    ·  [CONTENT HERE]  · ·                  │
│                    · · · · · · · · · · ·                   │
│                    · · · · · · · · · · ·                   │
│                                                            │
│                                          ○                 │
│                           (Green gradient orb)    ○        │
└────────────────────────────────────────────────────────────┘
```

---

## Icon Options

### Option 1: Emoji Icons
```
Supplier: 📦 (Package)
Retailer: 🏪 (Convenience Store)
Admin: 🔐 (Lock)
```

### Option 2: Lucide/Heroicons (Recommended)
```
Supplier: Package icon (line)
Retailer: Store icon (line)
Admin: Shield-check icon (line)
```

### Option 3: Custom Illustrated Icons
```
Supplier: Truck + boxes illustration
Retailer: Shop front illustration
Admin: Dashboard illustration
```

---

## Logo Design

### Primary Logo
```
    ◆ SUPERMANDI

◆ = Diamond shape (rotated square)
    Color: #2563EB

Text: "SUPERMANDI"
    Font: Inter Bold
    Letter-spacing: 2px
    Color: #111827
```

### Logo Variations
```
1. Full Logo (Default):     ◆ SUPERMANDI
2. Compact:                 ◆ SM
3. Icon Only:               ◆
4. Stacked:                 ◆
                        SUPERMANDI
```

---

## Accessibility

### Color Contrast
```
- Text on white: #374151 (7.5:1 ratio) ✓
- White on blue button: #FFFFFF on #2563EB (4.6:1 ratio) ✓
- Link text: #2563EB on white (4.5:1 ratio) ✓
```

### Focus States
```
- All interactive elements have visible focus rings
- Focus ring: 2px solid #93C5FD, offset 2px
- Tab order: Logo → Supplier Card → Retailer Card → Admin Link → Footer Links
```

### Screen Reader
```
- Semantic HTML (header, main, footer, nav)
- ARIA labels on buttons
- Alt text on images/icons
- Skip to main content link
```

---

## Final Desktop Mockup

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                            ┃
┃                              ◆ SUPERMANDI                                  ┃
┃                                                                            ┃
┃                       Powering Retail Technology                           ┃
┃                                                                            ┃
┃                 Connect retailers with suppliers seamlessly                ┃
┃                                                                            ┃
┃                                                                            ┃
┃       ┏━━━━━━━━━━━━━━━━━━━━━━━━━┓     ┏━━━━━━━━━━━━━━━━━━━━━━━━━┓         ┃
┃       ┃  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ┃     ┃  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ┃         ┃
┃       ┃                         ┃     ┃                         ┃         ┃
┃       ┃           📦            ┃     ┃           🏪            ┃         ┃
┃       ┃                         ┃     ┃                         ┃         ┃
┃       ┃     SUPPLIER PORTAL     ┃     ┃     RETAILER PORTAL     ┃         ┃
┃       ┃                         ┃     ┃                         ┃         ┃
┃       ┃   Manage your product   ┃     ┃   Manage inventory,     ┃         ┃
┃       ┃   catalog, track orders ┃     ┃   track sales, view     ┃         ┃
┃       ┃   and receive payouts   ┃     ┃   reports & analytics   ┃         ┃
┃       ┃                         ┃     ┃                         ┃         ┃
┃       ┃   ┏━━━━━━━━━━━━━━━━━┓   ┃     ┃   ┏━━━━━━━━━━━━━━━━━┓   ┃         ┃
┃       ┃   ┃   Login Now →   ┃   ┃     ┃   ┃   Login Now →   ┃   ┃         ┃
┃       ┃   ┗━━━━━━━━━━━━━━━━━┛   ┃     ┃   ┗━━━━━━━━━━━━━━━━━┛   ┃         ┃
┃       ┃         (Orange)        ┃     ┃         (Green)         ┃         ┃
┃       ┗━━━━━━━━━━━━━━━━━━━━━━━━━┛     ┗━━━━━━━━━━━━━━━━━━━━━━━━━┛         ┃
┃                                                                            ┃
┃                                                                            ┃
┃                           🔐 Admin Login →                                 ┃
┃                              (subtle gray)                                 ┃
┃                                                                            ┃
┃  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ┃
┃                                                                            ┃
┃     © 2026 SuperMandi Technologies   •   Privacy Policy   •   Terms        ┃
┃                                                                            ┃
┃                  contact@supermandi.tech   •   +91 7737914383               ┃
┃                                                                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## File Structure

```
supermandi-landing/
├── index.html
├── styles/
│   └── main.css
├── assets/
│   ├── logo.svg
│   ├── favicon.ico
│   └── og-image.png (for social sharing)
└── DESIGN.md (this file)
```

---

## SEO & Meta Tags

```html
<title>SuperMandi - Powering Retail Technology</title>
<meta name="description" content="Connect retailers with suppliers seamlessly. Manage inventory, track sales, and grow your business with SuperMandi.">
<meta name="keywords" content="POS, retail, supplier, inventory management, India">
<meta property="og:title" content="SuperMandi - Powering Retail Technology">
<meta property="og:description" content="Connect retailers with suppliers seamlessly.">
<meta property="og:image" content="https://supermandi.tech/assets/og-image.png">
<meta property="og:url" content="https://supermandi.tech">
```
