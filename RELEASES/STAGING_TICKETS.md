# Staging Tickets — Post-GCP Deploy (13-03-2026)

> **Baseline SHA**: `81c3a2a4` — deployed to GCP staging on 13-03-2026
> **Staging URL**: staging.supermandi.tech
> **Services**: api-gateway, main-backend, retailer-admin, supplier-portal, superadmin, landing
> **Migrations**: 187/187 applied (zero pending)
> **Previous tickets**: See `STAGING_TICKETS_V1.md` (440 tickets, Phases 1-11, archived)
> **Ticket format**: STG-001, STG-002, ... (sequential, never reused)
> **Zero Regression Rule**: Every ticket must leave the system in a deployable state

---

## Ticket Lifecycle

```
OPEN → IN_PROGRESS → DONE → PARKED (on main, tagged)
```

- **OPEN**: Ticket created from operator input, not yet started
- **IN_PROGRESS**: Claude is actively working on it
- **DONE**: Code complete, tests pass, registered in FIX_LEDGER
- **PARKED**: Committed to main with prestage tag, ready for mega-batch deploy

---

## Summary

| # | Title | Priority | Status |
|---|-------|----------|--------|
| STG-001 | Supplier self-registration verify fallback | P1 | PARKED (a4a6c5c0, stg-001-2026-03-14) |
| STG-002 | Release APK cold start blank screen before splash | P2 | PARKED (ce0a91c8, stg-002-2026-03-14) |
| STG-003 | Brand design tokens — unified color palette and spacing | P1 | PARKED (ad959088, stg-003-2026-03-14) |
| STG-004 | Activation screen — branded redesign with trust signals | P1 | PARKED (b0f8de03, stg-004-2026-03-14) |
| STG-005 | Home top bar — declutter status icons and scanner warning | P1 | PARKED (306a9c4b, stg-005-2026-03-14) |
| STG-006 | Sync status panel — collapse when healthy, reduce footprint | P2 | PARKED (da5ecb7f, stg-006-2026-03-14) |
| STG-007 | Tab navigation — full labels, consistent colors, active states | P1 | PARKED (88a2808b, stg-007-2026-03-14) |
| STG-008 | Search/scan area — unified input with clear visual hierarchy | P2 | PARKED (037b4023, stg-008-2026-03-14) |
| STG-009 | Product cards — full names, stock badges, better thumbnails | P1 | PARKED (35f1f9d1, stg-009-2026-03-14) |
| STG-010 | Sync Status modal — brand illustrations, plain-language tabs | P3 | PARKED (1b0f02bb, stg-010-2026-03-14) |
| STG-011 | Typography and spacing system — POS-grade readability | P2 | PARKED (1d664947, stg-011-2026-03-14) |
| STG-012 | Voice FAB — brand-colored, contextual label on first use | P3 | PARKED (7b95512d, stg-012-2026-03-14) |
| STG-013 | FEFO badge — explain or hide jargon for kirana users | P3 | PARKED (9ab15ec1, stg-013-2026-03-14) |
| STG-014 | DEV MODE banner — hide in production builds | P2 | PARKED (152c906f, stg-014-2026-03-14) |
| STG-015 | Inconsistent product card layouts — unify list vs thumbnail styles | P1 | PARKED (c1113955, stg-015-2026-03-14) |
| STG-016 | Cart/checkout indicator — floating total bar when items added | P1 | PARKED (6baf516a, stg-016-2026-03-14) |
| STG-017 | Staff login indicator — show who is logged in on home screen | P2 | PARKED (0ac31608, stg-017-2026-03-14) |
| STG-018 | Product cards — add unit/weight context to prices | P2 | PARKED (51d0243c, stg-018-2026-03-14) |
| STG-019 | Activation screen keyboard and navigation UX fixes | P2 | PARKED (aa9de4b9, stg-019-2026-03-14) |
| STG-020 | Product card whitespace — remove excess empty area in small cards | P2 | PARKED (f3ab1d93, stg-020-2026-03-14) |
| STG-021 | Sync modal — add tab count badges and last-sync timestamp | P3 | PARKED (0d0b7f81, stg-021-2026-03-14) |
| STG-022 | Logo pill badge — enlarge and make recognizable as brand mark | P2 | PARKED (ed3a1a3b, stg-022-2026-03-14) |
| STG-023 | Activation subtitle — simplify two-concept info text | P2 | PARKED (100425f3, stg-023-2026-03-14) |
| STG-024 | Enrollment QR scan — button exists but needs camera integration and UX polish | P2 | PARKED (9140ecc0, stg-024-2026-03-14) |
| STG-025 | Add support phone number on activation and error screens | P2 | PARKED (9140ecc0, stg-025-2026-03-14) |
| STG-026 | Add terms/privacy policy link — Play Store compliance | P1 | PARKED (0409765f, stg-026-2026-03-14) |
| STG-027 | Green grid icon on product card — explain or remove | P3 | PARKED (f3ab1d93, stg-027-2026-03-14) |
| STG-028 | Product list section headers — group by category or recent | P2 | PARKED (77580bb5, stg-028-2026-03-14) |
| STG-029 | SELL tab — add manual "Add Product" button for unlisted items | P2 | PARKED (86a8a8e4, stg-029-2026-03-14) |
| STG-030 | CREDIT tab — explain greyed-out state or enable with guidance | P2 | PARKED (9140ecc0, stg-030-2026-03-14) |
| STG-031 | Quantity selector — quick +/- buttons for bulk product adds | P1 | PARKED (9140ecc0, stg-031-2026-03-14) |
| STG-032 | Discount/MRP indicator on product cards | P2 | PARKED (f3ab1d93, stg-032-2026-03-14) |
| STG-033 | Favorites/frequently sold section on SELL tab | P2 | PARKED (20727937, stg-033-2026-03-14) |
| STG-034 | Recent bills shortcut — quick access to last 5 transactions | P2 | PARKED (5ff05a52, stg-034-2026-03-14) |
| STG-035 | Empty state design for zero-product store | P2 | PARKED (ea00d934, stg-035-2026-03-14) |
| STG-036 | Date/time display in app header | P3 | PARKED (0ac31608, stg-036-2026-03-14) |
| STG-037 | Customer name/phone entry before billing for credit sales | P1 | PARKED (9140ecc0, stg-037-2026-03-14) |
| STG-038 | Enrollment — Device Type chips unexplained jargon | P2 | PARKED (100425f3, stg-038-2026-03-14) |
| STG-039 | Enrollment — Printing Mode "Direct ESC/POS" jargon, needs plain language | P2 | PARKED (100425f3, stg-039-2026-03-14) |
| STG-040 | Enrollment — chip layout breaks on small screens (Retailer Phone wraps) | P2 | PARKED (100425f3, stg-040-2026-03-14) |
| STG-041 | Enrollment — no inline form validation feedback on code input | P2 | PARKED (100425f3, stg-041-2026-03-14) |
| STG-042 | Enrollment — "Counter-1" default label causes duplicates on multi-device | P3 | PARKED (100425f3, stg-042-2026-03-14) |
| STG-043 | Enrollment — floating labels for input fields (placeholder disappears on focus) | P2 | PARKED (100425f3, stg-043-2026-03-14) |
| STG-044 | Enrollment — button hierarchy: "Scan QR" vs "Enroll Device" visual weight | P3 | PARKED (100425f3, stg-044-2026-03-14) |
| STG-045 | Home — "Ready for billing" status text too small for key operational state | P2 | PARKED (100425f3, stg-045-2026-03-14) |
| STG-046 | Product card expand chevron (↓) — no hint of what it expands to | P3 | PARKED (f3ab1d93, stg-046-2026-03-14) |
| STG-047 | Horizontal product row misleading — empty space implies missing products | P2 | PARKED (100425f3, stg-047-2026-03-14) |
| STG-048 | Voice FAB position — overlaps product cards on longer lists | P2 | PARKED (f3ab1d93, stg-048-2026-03-14) |
| STG-049 | Top-right camera icon unlabeled — unknown function to users | P2 | PARKED (100425f3, stg-049-2026-03-14) |
| STG-050 | No pull-to-refresh indicator on product list | P3 | PARKED (ea00d934, stg-050-2026-03-14) |
| STG-051 | Daily session counter — show "Bills today" and "Sales total" on home | P2 | PARKED (f8aaaa3b, stg-051-2026-03-14) |
| STG-052 | Store name truncation on narrow screens | P3 | PARKED (100425f3, stg-052-2026-03-14) |
| STG-053 | Accessibility — WCAG AA contrast audit across all buttons and text | P1 | PARKED (54e93ad3, stg-053-2026-03-14) |
| STG-054 | Hindi/regional language selector — i18n for kirana retailers | P2 | PARKED (0409765f, stg-054-2026-03-14) |
| STG-055 | App version display on enrollment and settings screens | P3 | PARKED (0409765f, stg-055-2026-03-14) |
| STG-056 | Product card tap feedback — haptic vibration and ripple effect | P3 | PARKED (f3ab1d93, stg-056-2026-03-14) |
| STG-057 | Activation text rewrite — remove "superadmin", simplify to 3-step flow | P1 | PARKED (926ac026, stg-057-2026-03-14) |
| STG-058 | Activation info box — replace wall-of-text with collapsible visual steps | P1 | PARKED (f87bfa9f, stg-058-2026-03-14) |
| STG-059 | Support contact — replace email with phone/WhatsApp for kirana users | P1 | PARKED (a4305dfa, stg-059-2026-03-14) |
| STG-060 | Activation — replace raw URL with tappable "Register Here" button | P2 | PARKED (a4305dfa, stg-060-2026-03-14) |
| STG-061 | Activation code input — fix center-aligned placeholder, must be left-aligned | P2 | PARKED (a4305dfa, stg-061-2026-03-14) |
| STG-062 | Activation — "Activate POS" button disabled state until valid code format | P2 | PARKED (9399462b, stg-062-2026-03-14) |
| STG-063 | Activation — add welcome illustration/visual for brand warmth | P2 | PARKED (a4305dfa, stg-063-2026-03-14) |
| STG-064 | Activation — "23106RN0DA" device name should show friendly model name | P2 | PARKED (9399462b, stg-064-2026-03-14) |
| STG-065 | Activation — add step indicator "Step 1 of 2" for onboarding progress | P2 | PARKED (a4305dfa, stg-065-2026-03-14) |
| STG-066 | Enrollment vs Activation — unify two different onboarding screens into one | P1 | PARKED (a4305dfa, stg-066-2026-03-14) |
| STG-067 | Home header icons — add labels or tooltips to Wi-Fi/printer/scanner/camera | P2 | PARKED (a4305dfa, stg-067-2026-03-14) |
| STG-068 | Product cards — add "+" tap affordance button for adding to bill | P1 | PARKED (f3ab1d93, stg-068-2026-03-14) |
| STG-069 | Tab bar — unify 5 different visual treatments into one consistent style | P1 | PARKED (a4ff7de5, stg-069-2026-03-14) |
| STG-070 | Home — dark header band harsh cut to white body, add smooth transition | P3 | PARKED (a4305dfa, stg-070-2026-03-14) |
| STG-071 | Sync row — connect checkmark (left) with "15s ago" (right) visually | P3 | PARKED (a4305dfa, stg-071-2026-03-14) |
| STG-072 | Activation — remove hamburger menu pre-activation (no navigation needed) | P2 | PARKED (90eff076, stg-072-2026-03-14) |
| STG-073 | Activation helper text — "store dashboard" is jargon, simplify | P3 | PARKED (90eff076, stg-073-2026-03-14) |
| STG-074 | Search + barcode inputs — unify border/container styles into one section | P2 | PARKED (90eff076, stg-074-2026-03-14) |
| STG-075 | Product cards — add loading skeleton placeholder during fetch | P2 | PARKED (86a8a8e4, stg-075-2026-03-14) |
| STG-076 | Activation — "on web" rewrite to specific URL or "online" | P2 | PARKED (90eff076, stg-076-2026-03-14) |
| STG-077 | Payment — error message vague, no specific failure reason | P1 | PARKED (9efdb6f0, stg-077-2026-03-14) |
| STG-078 | Payment — "Complete Payment" greyed out with no explanation why | P1 | PARKED (f4f20aaa, stg-078-2026-03-14) |
| STG-079 | Payment — two competing retry mechanisms (error Retry + disabled CTA) | P1 | PARKED (f4f20aaa, stg-079-2026-03-14) |
| STG-080 | Payment — no cash amount received input or change calculation | P1 | PARKED (f4f20aaa, stg-080-2026-03-14) |
| STG-081 | Payment — no cart/order summary visible on payment screen | P1 | PARKED (81f74910, stg-081-2026-03-14) |
| STG-082 | Payment — "Due" method has no customer selection for credit sale | P1 | PARKED (f4f20aaa, stg-082-2026-03-14) |
| STG-083 | Payment — no back button to return to cart | P1 | PARKED (f4f20aaa, stg-083-2026-03-14) |
| STG-084 | Payment — UPI flow incomplete, no QR/app selector after selecting UPI | P1 | PARKED (1fbb26a2, stg-084-2026-03-14) |
| STG-085 | Payment — no split payment support (cash + UPI) | P2 | PARKED (cdfc63a1, stg-085-2026-03-14) |
| STG-086 | Payment — "Cart locked" badge unexplained, no unlock path | P2 | PARKED (f4f20aaa, stg-086-2026-03-14) |
| STG-087 | Payment — ~40% empty space between tabs and amount | P2 | PARKED (f4f20aaa, stg-087-2026-03-14) |
| STG-088 | Payment — no GST/tax breakup on payment screen | P2 | PARKED (f4f20aaa, stg-088-2026-03-14) |
| STG-089 | Payment — "Complete Payment" grey-on-grey text fails WCAG contrast | P2 | PARKED (f4f20aaa, stg-089-2026-03-14) |
| STG-090 | Payment — no loading/processing state during payment attempt | P2 | PARKED (f4f20aaa, stg-090-2026-03-14) |
| STG-091 | Payment — instruction text "Collect cash" doesn't change per payment method | P2 | PARKED (f4f20aaa, stg-091-2026-03-14) |
| STG-092 | Payment — no receipt preview before completing payment | P3 | PARKED (e2d025cc, stg-092-2026-03-14) |
| STG-093 | Payment — Cash icon unclear, doesn't read as "cash" or "banknote" | P3 | PARKED (f4f20aaa, stg-093-2026-03-14) |
| STG-094 | Cart — "Clear" button has no confirmation dialog, deletes all items instantly | P1 | PARKED (72499acd, stg-094-2026-03-14) |
| STG-095 | Cart — delete item (🗑️) has no confirmation or undo | P1 | PARKED (24b7e99d, stg-095-2026-03-14) |
| STG-096 | Cart — quantity [-][+] buttons too small, need larger tap targets | P1 | PARKED (24b7e99d, stg-096-2026-03-14) |
| STG-097 | Cart — quantity number not tappable for direct input (type "10" vs tap + 9x) | P1 | PARKED (24b7e99d, stg-097-2026-03-14) |
| STG-098 | Cart — no "Add more items" / "Continue Shopping" link in cart | P2 | PARKED (22b936e4, stg-098-2026-03-14) |
| STG-099 | Cart — edit icon (✏️) purpose unclear, no tooltip or label | P2 | PARKED (24b7e99d, stg-099-2026-03-14) |
| STG-100 | Cart — unit price vs line total not labeled (ambiguous with qty > 1) | P2 | PARKED (24b7e99d, stg-100-2026-03-14) |
| STG-101 | Cart — no GST/tax line between Subtotal and Total | P2 | PARKED (86a8a8e4, stg-101-2026-03-14) |
| STG-102 | Cart — discount has no max limit / manager approval for large discounts | P1 | PARKED (963fac79, stg-102-2026-03-14) |
| STG-103 | Cart — no customer name/phone field for credit/due sales | P2 | PARKED (20727937, stg-103-2026-03-14) |
| STG-104 | Cart — no "Hold/Park Bill" feature for interrupted transactions | P2 | PARKED (9140ecc0, stg-104-2026-03-14) |
| STG-105 | Cart — no item count header ("1 item in cart") | P3 | PARKED (ea00d934, stg-105-2026-03-14) |
| STG-106 | Cart — Discount %/Flat toggle styling inconsistent | P3 | PARKED (ea00d934, stg-106-2026-03-14) |
| STG-107 | Cart — no product thumbnail/image in cart items | P3 | PARKED (86a8a8e4, stg-107-2026-03-14) |
| STG-108 | Cart — ~50% empty space with few items, no guidance to add more | P3 | PARKED (86a8a8e4, stg-108-2026-03-14) |
| STG-109 | Cart — Checkout button should show item count "Checkout (1 item) ₹145" | P3 | PARKED (ea00d934, stg-109-2026-03-14) |
| STG-110 | Cart — no per-item discount, only cart-level | P3 | PARKED (20727937, stg-110-2026-03-14) |
| STG-111 | Cart — no "You save ₹X" line when discount applied | P3 | PARKED (86a8a8e4, stg-111-2026-03-14) |
| STG-112 | Cart — no notes/memo field for special instructions | P3 | PARKED (20727937, stg-112-2026-03-14) |
| STG-113 | Payment — no bill/invoice number visible for tracking and disputes | P1 | PARKED (f4f20aaa, stg-113-2026-03-14) |
| STG-114 | Payment — no cancel/void transaction button | P1 | PARKED (e2d025cc, stg-114-2026-03-14) |
| STG-115 | Payment — missing payment methods: Card, Wallet (Paytm/GPay balance) | P2 | PARKED (e2d025cc, stg-115-2026-03-14) |
| STG-116 | Payment — Indian lakh number formatting (₹1,45,000 not ₹145,000) | P2 | PARKED (cf379529, stg-116-2026-03-14) |
| STG-117 | Payment — ".00" always shown on round amounts, add smart formatting | P3 | PARKED (2086418c, stg-117-2026-03-14) |
| STG-118 | Payment — "Retry" button is red (destructive color) for a positive action | P2 | PARKED (f4f20aaa, stg-118-2026-03-14) |
| STG-119 | Payment — error banner has no dismiss X, persists indefinitely | P2 | PARKED (f4f20aaa, stg-119-2026-03-14) |
| STG-120 | Payment — no staff name/ID for shift reconciliation and audit | P2 | PARKED (f4f20aaa, stg-120-2026-03-14) |
| STG-121 | Payment — "Due" icon is calendar, should represent credit/udhar | P3 | PARKED (f4f20aaa, stg-121-2026-03-14) |
| STG-122 | Payment — no confirmation dialog for large amounts (₹5,000+) | P1 | PARKED (e2d025cc, stg-122-2026-03-14) |
| STG-123 | Payment — amount positioned in dead center of empty space, move to top | P2 | PARKED (f4f20aaa, stg-123-2026-03-14) |
| STG-124 | Payment — no sound/vibration feedback on payment success or failure | P2 | PARKED (e2d025cc, stg-124-2026-03-14) |
| STG-125 | Payment — no partial payment tracking (₹100 now + ₹45 due later) | P2 | PARKED (e2d025cc, stg-125-2026-03-14) |
| STG-126 | Cart — [-] at qty=1 behavior undefined: remove item? block? go to 0? | P1 | PARKED (24b7e99d, stg-126-2026-03-14) |
| STG-127 | Cart — no stock validation when qty exceeds available stock | P1 | PARKED (24b7e99d, stg-127-2026-03-14) |
| STG-128 | Cart — no batch/expiry info for perishable items in cart | P2 | PARKED (20727937, stg-128-2026-03-14) |
| STG-129 | Cart — long product name truncation/overflow not handled | P2 | PARKED (24b7e99d, stg-129-2026-03-14) |
| STG-130 | Cart — discount input has no live preview ("10% = ₹14.50 off") | P2 | PARKED (ea00d934, stg-130-2026-03-14) |
| STG-131 | Cart — empty space should show "frequently bought together" suggestions | P2 | PARKED (20727937, stg-131-2026-03-14) |
| STG-132 | Cart — Subtotal = Total is redundant, show Subtotal only when different | P3 | PARKED (ea00d934, stg-132-2026-03-14) |
| STG-133 | Cart — bottom sheet height fixed at ~90%, should be dynamic to content | P3 | PARKED (4d1b1f89, stg-133-2026-03-14) |
| STG-134 | Cart — no swipe-to-delete gesture on cart items | P3 | PARKED (20727937, stg-134-2026-03-14) |
| STG-135 | Cart — keyboard may cover Checkout button when discount input focused | P2 | PARKED (20727937, stg-135-2026-03-14) |
| STG-136 | Cart — no "Share cart via WhatsApp" for phone order confirmation | P3 | PARKED (9140ecc0, stg-136-2026-03-14) |
| STG-137 | Cart — "In stock" has no low-stock warning styling (amber/red for <5 units) | P2 | PARKED (24b7e99d, stg-137-2026-03-14) |
| STG-138 | Cart — no weight/unit display separate from product name | P2 | PARKED (86a8a8e4, stg-138-2026-03-14) |
| STG-139 | Cart — no return/exchange line item for customer returns | P2 | PARKED (9140ecc0, stg-139-2026-03-14) |
| STG-140 | Cart — Discount section always visible, should collapse when unused | P3 | PARKED (ea00d934, stg-140-2026-03-14) |
| STG-141 | Cart — Checkout button price doesn't animate on total change | P3 | PARKED (86a8a8e4, stg-141-2026-03-14) |
| STG-142 | BUG: "[menu.viewDetails]" raw i18n key leaked in Today's Sales card | P0 | PARKED |
| STG-143 | BUG: "[menu.printerReady]" and "[menu.testPrint]" raw i18n keys leaked | P0 | PARKED |
| STG-144 | SECURITY: Developer/QA section + BUILD INFO visible to all users | P0 | PARKED |
| STG-145 | SECURITY: BUILD INFO leaks token, API URL, StoreId UUID to end users | P0 | PARKED |
| STG-146 | Menu — Device UUID shown instead of device label ("Counter-1") | P1 | PARKED (6e426447, stg-146-2026-03-14) |
| STG-147 | Menu — store name lowercase in System Status vs title case in header | P2 | PARKED (42fb9e8a, stg-147-2026-03-14) |
| STG-148 | Menu — System Status card should be collapsible, rarely needed | P2 | PARKED (3fe97144, stg-148-2026-03-14) |
| STG-149 | Menu — Today's Sales percentages (551%) have no baseline context | P2 | PARKED (d56a1448, stg-149-2026-03-14) |
| STG-150 | Menu — "Payment Modes" section incomplete, label with no data | P2 | PARKED (5cb45d62, stg-150-2026-03-14) |
| STG-151 | Menu — metric labels below numbers, should be above (read order) | P2 | PARKED (5cb45d62, stg-151-2026-03-14) |
| STG-152 | Menu — Today's Sales should be on HOME screen, not buried in Menu | P1 | PARKED (5cb45d62, stg-152-2026-03-14) |
| STG-153 | Menu — Reprint/Download/Share buttons have no context (what?) | P2 | PARKED (0305262b, stg-153-2026-03-14) |
| STG-154 | Menu — "BNPL Dues" jargon, kirana retailer won't understand BNPL | P2 | PARKED (0409765f, stg-154-2026-03-14) |
| STG-155 | Menu — "Stock Inward" warehouse jargon, rename to "Add New Stock" | P2 | PARKED (0409765f, stg-155-2026-03-14) |
| STG-156 | Menu — Opening Stock "?" icon should be inventory icon | P2 | PARKED (91ef2211, stg-156-2026-03-14) |
| STG-157 | Menu — "Customers" and "Customer Management" are duplicate entries | P1 | PARKED (42fb9e8a, stg-157-2026-03-14) |
| STG-158 | Menu — "Overdue Dues" redundant wording, use "Overdue Payments" | P3 | PARKED (0409765f, stg-158-2026-03-14) |
| STG-159 | Menu — 20+ items need 8 screens of scrolling, needs restructure | P1 | PARKED (42fb9e8a, stg-159-2026-03-14) |
| STG-160 | Menu — icon colors inconsistent (blue, teal, green, red, grey, orange) | P2 | PARKED (026fde2c, stg-160-2026-03-14) |
| STG-161 | Menu — no notification badges on items (overdue count, pending) | P2 | PARKED (42fb9e8a, stg-161-2026-03-14) |
| STG-162 | Menu — logo + pill + "Menu" title redundant heading, wastes 60px | P3 | PARKED (42fb9e8a, stg-162-2026-03-14) |
| STG-163 | Menu — card spacing too large (~96px each), needs tighter layout | P3 | PARKED (42fb9e8a, stg-163-2026-03-14) |
| STG-164 | Settings — "kbcretailer (MANAGER)" shows username not display name | P1 | PARKED (42fb9e8a, stg-164-2026-03-14) |
| STG-165 | Settings — Hindi toggle "हि" non-standard abbreviation | P2 | PARKED (42fb9e8a, stg-165-2026-03-14) |
| STG-166 | Settings — "Re-enroll to a different store" enrollment jargon | P3 | PARKED (a6d72ccf, stg-166-2026-03-14) |
| STG-167 | Settings — no About section with app version + terms + privacy links | P2 | PARKED (42fb9e8a, stg-167-2026-03-14) |
| STG-168 | Settings — no logout/sign-out option visible for staff | P1 | PARKED (42fb9e8a, stg-168-2026-03-14) |
| STG-169 | Menu — no search/filter across 20+ menu items | P2 | PARKED (42fb9e8a, stg-169-2026-03-14) |
| STG-170 | Menu — "Barcode Sheets" subtitle "tiered" jargon | P3 | PARKED (a6d72ccf, stg-170-2026-03-14) |
| STG-171 | Menu — Today's Sales metrics all same size, no visual hierarchy | P2 | PARKED (42fb9e8a, stg-171-2026-03-14) |
| STG-172 | Menu — hardcoded English strings not using i18n (Return/Refund, Opening Stock, etc.) | P1 | PARKED (0409765f, stg-172-2026-03-14) |
| STG-173 | Menu — "View Details" uses t() defaultValue fallback, raw key leaks if i18n fails | P1 | PARKED (0409765f, stg-173-2026-03-14) |
| STG-174 | Menu — "Printer Ready"/"Test" use t() second-arg fallback, not standard defaultValue | P1 | PARKED (0409765f, stg-174-2026-03-14) |
| STG-175 | Menu — no Pressable ripple/feedback effect on menu items (no android_ripple) | P2 | PARKED (98f6e981, stg-175-2026-03-14) |
| STG-176 | Menu — header paddingVertical:8 too tight, brand pill cramped | P2 | PARKED (98f6e981, stg-176-2026-03-14) |
| STG-177 | Menu — status panel "Sync" label hardcoded English (not i18n) | P2 | PARKED (0409765f, stg-177-2026-03-14) |
| STG-178 | Menu — Build Info visible on release with EXPO_PUBLIC_ENABLE_QA_MENU=true | P1 | PARKED |
| STG-179 | Menu — release build stamp shows raw SHA and timestamp, not user-friendly version | P2 | PARKED (98f6e981, stg-179-2026-03-14) |
| STG-180 | Menu — Switch Staff alert uses English string literals, not i18n | P2 | PARKED (0409765f, stg-180-2026-03-14) |
| STG-181 | Menu — billActions (Reprint/Download/Share) all navigate to same SalesHistory | P1 | PARKED (f779300e, stg-181-2026-03-14) |
| STG-182 | Menu — no haptic feedback on menu item press | P3 | PARKED (b672d402, stg-182-2026-03-14) |
| STG-183 | Menu — section header margin 24px top but 4px bottom, visually unbalanced | P3 | PARKED (f779300e, stg-183-2026-03-14) |
| STG-184 | Menu — WhatsApp Support fallback uses "Support Unavailable" English literal | P2 | PARKED (0409765f, stg-184-2026-03-14) |
| STG-185 | Menu — WhatsApp pre-filled message in English only, no i18n | P2 | PARKED (0409765f, stg-185-2026-03-14) |
| STG-186 | Menu — trend badge at 9px font too small to read on budget Android | P2 | PARKED (01b051f2, stg-186-2026-03-14) |
| STG-187 | Menu — trend percentage shows "551%" with no cap or "99%+" formatting | P2 | PARKED (01b051f2, stg-187-2026-03-14) |
| STG-188 | Menu — Payment Modes breakdown shows "Cash: ₹..." raw label, not i18n | P2 | PARKED (0409765f, stg-188-2026-03-14) |
| STG-189 | Menu — Help & Support shows "&amp;" HTML entity instead of "&" | P0 | PARKED |
| STG-190 | Menu — no skeleton/shimmer loading state for System Status and Today's Sales | P2 | PARKED (01b051f2, stg-190-2026-03-14) |
| STG-191 | Menu — status panel statusBadge uses transparent bg (surfaceAlt), no outline | P3 | PARKED (01b051f2, stg-191-2026-03-14) |
| STG-192 | Menu — menuIcon 36x36 too small for touch targets on budget Android | P2 | PARKED (01b051f2, stg-192-2026-03-14) |
| STG-193 | Menu — "Z-Report and cash reconciliation" subtitle jargon for kirana users | P2 | PARKED (0409765f, stg-193-2026-03-14) |
| STG-194 | Menu — "Start, end, and view shift history" assumes shift concept familiarity | P3 | PARKED (0409765f, stg-194-2026-03-14) |
| STG-195 | Menu — "AI & Intelligence" section title too technical, rename to "Smart Insights" | P2 | PARKED (0409765f, stg-195-2026-03-14) |
| STG-196 | Menu — "Alerts, forecasts, slow movers, expiry tracking" subtitle info-dense | P3 | PARKED (0409765f, stg-196-2026-03-14) |
| STG-197 | Menu — "Browse and apply for credit offers" subtitle implies retailer is borrowing | P3 | PARKED (0409765f, stg-197-2026-03-14) |
| STG-198 | Menu — content padding 16px identical to item padding, creates visual merge | P3 | PARKED (42fb9e8a, stg-198-2026-03-14) |
| STG-199 | Menu — ScrollView has no scrollbar indicator styling | P3 | PARKED (42fb9e8a, stg-199-2026-03-14) |
| STG-200 | Enroll — "hello@supermandi.tech" email in error hints, kirana users won't email | P1 | PARKED (9399462b, stg-200-2026-03-14) |
| STG-201 | Enroll — "Superadmin" used in error messages (deviceInactive, storeInactive) | P1 | PARKED (9399462b, stg-201-2026-03-14) |
| STG-202 | Enroll — STORE_INACTIVE hint says "Contact hello@supermandi.tech for help" | P1 | PARKED (9399462b, stg-202-2026-03-14) |
| STG-203 | Enroll — "RETAILER_PHONE" hardcoded as deviceType, OEM_HANDHELD never sent | P2 | PARKED (e3acd876, stg-203-2026-03-14) |
| STG-204 | Enroll — defaultLabel uses Device.modelName raw (e.g. "23106RN0DA") | P2 | PARKED (88824ac1, stg-204-2026-03-14) |
| STG-205 | Enroll — deep link re-enrollment alert uses English literals, no i18n | P2 | PARKED (963cb252, stg-205-2026-03-14) |
| STG-206 | Enroll — missing code alert says "superadmin account activation" | P1 | PARKED (34a98968, stg-206-2026-03-14) |
| STG-207 | Enroll — error codes DEVICE_FINGERPRINT_INVALID says "Reinstall the app" | P2 | PARKED (1d2b4288, stg-207-2026-03-14) |
| STG-208 | Enroll — ENROLLMENT_RATE_LIMITED says "wait 15 minutes" but no countdown | P3 | PARKED (b7aa415c, stg-208-2026-03-14) |
| STG-209 | Payment — uses TouchableOpacity instead of Pressable (inconsistent with rest) | P3 | PARKED (1ed068a2, stg-209-2026-03-14) |
| STG-210 | Payment — "Low Stock Warning" and "Partial Sale" alerts in English, no i18n | P2 | PARKED (e2d025cc, stg-210-2026-03-14) |
| STG-211 | Payment — "UPI Error: UPI ID not configured or QR failed" too vague | P2 | PARKED (f4f20aaa, stg-211-2026-03-14) |
| STG-212 | Payment — "POS Inactive" and "Store Missing" alerts reference "Superadmin" | P1 | PARKED (f4f20aaa, stg-212-2026-03-14) |
| STG-213 | Payment — "Payment in Progress" back-block alert is bare, no spinner | P2 | PARKED (e2d025cc, stg-213-2026-03-14) |
| STG-214 | Payment — QR expiry countdown exists but no visual regenerate button | P2 | PARKED (cf8e15a0, stg-214-2026-03-14) |
| STG-215 | Payment — stale price warning threshold 4 hours is hardcoded, not configurable | P3 | PARKED (cf8e15a0, stg-215-2026-03-14) |
| STG-216 | Payment — "Price Freshness Warning" title confusing for kirana user | P2 | PARKED (f4f20aaa, stg-216-2026-03-14) |
| STG-217 | Payment — sale creation error shows generic "Unable to start payment" | P2 | PARKED (e2d025cc, stg-217-2026-03-14) |
| STG-218 | Payment — "Previous UPI Payment Pending" alert shows raw paymentId hash | P2 | PARKED (cf8e15a0, stg-218-2026-03-14) |
| STG-219 | Payment — "UPI Offline" / "UPI Missing" / "UPI Timeout" all different alert styles | P3 | PARKED (cf8e15a0, stg-219-2026-03-14) |
| STG-220 | SellScan — CART_SHEET_COLLAPSED_RATIO 0.55 covers 55% screen, too much | P2 | PARKED (ea00d934, stg-220-2026-03-14) |
| STG-221 | SellScan — SMALL_SCREEN_WIDTH=400 threshold may not cover all budget phones | P3 | PARKED (54e93ad3, stg-221-2026-03-14) |
| STG-222 | SellScan — product tile formatPrice shows ".00" on round amounts (₹28.00) | P2 | PARKED (7b95512d, stg-222-2026-03-14) |
| STG-223 | SellScan — no empty state illustration when search returns zero products | P2 | PARKED (ea00d934, stg-223-2026-03-14) |
| STG-224 | SellScan — category rail DEMO_CATEGORIES may show dummy data in production | P1 | PARKED |
| STG-225 | SellScan — NUM_COLUMNS=2 hardcoded, no responsive columns for tablets | P3 | PARKED (ea00d934, stg-225-2026-03-14) |
| STG-226 | SellTile — "—" dash for null price, should show "Price not set" | P2 | PARKED (f3ab1d93, stg-226-2026-03-14) |
| STG-227 | SellTile — expiry days calculation doesn't account for timezone (IST) | P2 | PARKED (f3ab1d93, stg-227-2026-03-14) |
| STG-228 | SellTile — no MRP strikethrough visual when sell price < MRP | P2 | PARKED (35f1f9d1, stg-228-2026-03-14) |
| STG-229 | SellTile — LOOSE mode "per KG" label not translated | P2 | PARKED (0212b500, stg-229-2026-03-14) |
| STG-230 | SellTile — brand name not displayed if available | P3 | PARKED (f3ab1d93, stg-230-2026-03-14) |
| STG-231 | Colors — "accent" and "secondary" are identical (#14B8A6), redundant token | P2 | PARKED (c437f8ec, stg-231-2026-03-14) |
| STG-232 | Colors — no dedicated "disabled" color token for greyed-out buttons | P2 | PARKED (5e2d96c1, stg-232-2026-03-14) |
| STG-233 | Colors — dark mode "ink" is #F8FAFC but light mode "ink" is #0B1220, never used | P3 | PARKED (b1e8d28e, stg-233-2026-03-14) |
| STG-234 | i18n — status.storeInactive says "Add UPI ID in Superadmin to start billing" | P1 | PARKED (053ab1a8, stg-234-2026-03-14) |
| STG-235 | i18n — status.deviceInactive says "Contact Superadmin to enable it" | P1 | PARKED (053ab1a8, stg-235-2026-03-14) |
| STG-236 | i18n — errors.deviceAlreadyEnrolled says "Ask Superadmin to reset the token" | P1 | PARKED (053ab1a8, stg-236-2026-03-14) |
| STG-237 | i18n — errors.sessionExpired says "Please login again" but POS has no login | P2 | PARKED (053ab1a8, stg-237-2026-03-14) |
| STG-238 | i18n — sell.digitiseMode says "Digitise mode on" — jargon for kirana user | P2 | PARKED (053ab1a8, stg-238-2026-03-14) |
| STG-239 | i18n — purchase.moq "MOQ" acronym not spelled out for kirana users | P2 | PARKED (053ab1a8, stg-239-2026-03-14) |
| STG-240 | i18n — tabs use ALL CAPS ("SELL", "PURCHASE", "REORDER") — shouty | P2 | PARKED (053ab1a8, stg-240-2026-03-14) |
| STG-241 | i18n — reorder.dismissSuggestedFrom template too complex for Hindi translation | P3 | PARKED (053ab1a8, stg-241-2026-03-14) |
| STG-242 | i18n — credit section uses financial jargon (EMI, KYC, PAN, Aadhaar) without explanation | P2 | PARKED (053ab1a8, stg-242-2026-03-14) |
| STG-243 | i18n — bnpl.upiInstructions sentence too long (2 clauses + technical term UTR) | P2 | PARKED (053ab1a8, stg-243-2026-03-14) |
| STG-244 | i18n — grn.title "Goods Receipt Note" — warehouse jargon | P2 | PARKED (053ab1a8, stg-244-2026-03-14) |
| STG-245 | Tab nav — "REORDER • ON" / "REORDER • OFF" unusual tab label convention | P2 | PARKED (0ca6a62d, stg-245-2026-03-14) |
| STG-246 | Tab nav — 5 tabs but CREDIT tab is greyed/disabled, confusing affordance | P2 | PARKED (f032299c, stg-246-2026-03-14) |
| STG-247 | Menu — "Customers & Credit" section has 4 items (Khata, Customers, Customer Management, Overdue) — 3 overlap | P1 | PARKED (42fb9e8a, stg-247-2026-03-14) |
| STG-248 | Menu — menuItem marginTop:16 creates 16px gap, but first item after sectionHeader has 16+4=20px gap inconsistency | P3 | PARKED (42fb9e8a, stg-248-2026-03-14) |
| STG-249 | Menu — printerStatusRow sits between Bills and Barcode with no card container | P2 | PARKED (42fb9e8a, stg-249-2026-03-14) |
| STG-250 | Menu — "Switch Store" in Settings section but it's a destructive action, needs separation | P2 | PARKED (42fb9e8a, stg-250-2026-03-14) |
| STG-251 | Menu — no confirmation count on "Daily Closing" (e.g., "2 shifts open") | P2 | PARKED (42fb9e8a, stg-251-2026-03-14) |
| STG-252 | Menu — "Chat" subtitle says "Message suppliers and support" but no unread count | P2 | PARKED (42fb9e8a, stg-252-2026-03-14) |
| STG-253 | Enroll — TEST_STORE_CONFIG imported but may auto-fill in production builds | P1 | PARKED |
| STG-254 | Payment — formatMoney not using Indian lakh system (1,45,000 vs 145,000) | P2 | PARKED (e2d025cc, stg-254-2026-03-14) |
| STG-255 | Menu — summaryCard and statusPanel have same border/radius but different marginTop | P3 | PARKED (42fb9e8a, stg-255-2026-03-14) |
| STG-256 | Menu — no swipe gesture to dismiss/collapse System Status panel | P3 | PARKED (42fb9e8a, stg-256-2026-03-14) |
| STG-257 | PaymentSetupScreen — hardcoded English strings not using i18n | P1 | PARKED (f45982d2, stg-257-2026-03-14) |
| STG-258 | SalesHistoryScreen — hardcoded English strings not using i18n | P1 | PARKED (f45982d2, stg-258-2026-03-14) |
| STG-259 | BillDetailScreen — hardcoded English strings not using i18n | P1 | PARKED (f45982d2, stg-259-2026-03-14) |
| STG-260 | SalesStatementScreen — hardcoded English strings not using i18n | P1 | PARKED (f45982d2, stg-260-2026-03-14) |
| STG-261 | DailyReportScreen — hardcoded English strings not using i18n | P1 | PARKED (49e7b53d, stg-261-2026-03-14) |
| STG-262 | DailyClosingScreen — hardcoded English strings not using i18n | P1 | PARKED (49e7b53d, stg-262-2026-03-14) |
| STG-263 | InwardScreen — hardcoded English strings not using i18n | P1 | PARKED (49e7b53d, stg-263-2026-03-14) |
| STG-264 | GRNScreen — hardcoded English strings not using i18n | P1 | PARKED (49e7b53d, stg-264-2026-03-14) |
| STG-265 | OpeningStockScreen — hardcoded English strings not using i18n | P1 | PARKED (68826349, stg-265-2026-03-14) |
| STG-266 | PurchaseScreen — hardcoded English strings not using i18n | P1 | PARKED (68826349, stg-266-2026-03-14) |
| STG-267 | BarcodeSheetScreen — hardcoded English strings not using i18n | P1 | PARKED (68826349, stg-267-2026-03-14) |
| STG-268 | BnplDuesScreen — hardcoded English strings not using i18n | P1 | PARKED (68826349, stg-268-2026-03-14) |
| STG-269 | KhataScreen — hardcoded English strings not using i18n | P1 | PARKED (201f4bd2, stg-269-2026-03-14) |
| STG-270 | CustomerListScreen — hardcoded English strings not using i18n | P1 | PARKED (201f4bd2, stg-270-2026-03-14) |
| STG-271 | OverdueDuesScreen — hardcoded English strings not using i18n | P1 | PARKED (201f4bd2, stg-271-2026-03-14) |
| STG-272 | ShiftScreen — hardcoded English strings not using i18n | P1 | PARKED (201f4bd2, stg-272-2026-03-14) |
| STG-273 | OrderDetailScreen — hardcoded English strings not using i18n | P1 | PARKED (b959b2b2, stg-273-2026-03-14) |
| STG-274 | ReturnScreen — hardcoded English strings not using i18n | P1 | PARKED (b959b2b2, stg-274-2026-03-14) |
| STG-275 | BuyScreen — hardcoded English strings not using i18n | P1 | PARKED (b959b2b2, stg-275-2026-03-14) |
| STG-276 | CreditScreen — hardcoded English strings not using i18n | P1 | PARKED (b959b2b2, stg-276-2026-03-14) |
| STG-277 | ReorderScreen + ReorderPoliciesScreen — hardcoded English not using i18n | P2 | PARKED (b959b2b2, stg-277-2026-03-14) |
| STG-278 | BulkPurchaseCreditScreen — no i18n setup, all strings hardcoded | P1 | PARKED (b959b2b2, stg-278-2026-03-14) |
| STG-279 | ErrorBoundary — hardcoded English error text | P1 | PARKED (stg-279-2026-03-14) |
| STG-280 | PaymentSetup — "UPI ID (VPA)" jargon, simplify for kirana users | P2 | PARKED (b4d91e26, stg-280-2026-03-14) |
| STG-281 | DailyClosing — "Variance" accounting jargon confusing for retailers | P2 | PARKED (ca5cdfaa, stg-281-2026-03-14) |
| STG-282 | SalesStatement — "Inventory Cost Statement" title misleading | P2 | PARKED (87265195, stg-282-2026-03-14) |
| STG-283 | BnplDues — BNPL/UTR/UPI jargon unexplained | P1 | PARKED (99c07c9f, stg-283-2026-03-14) |
| STG-284 | Credit — PAN/Aadhaar/KYC jargon needs help text | P2 | PARKED (87265195, stg-284-2026-03-14) |
| STG-285 | GRN — "GRN" jargon, needs subtitle explaining purpose | P2 | PARKED (87265195, stg-285-2026-03-14) |
| STG-286 | OpeningStock — "Opening Stock" needs contextual explanation | P2 | PARKED (87265195, stg-286-2026-03-14) |
| STG-287 | Buy — "BNPL" badge jargon unexplained | P2 | PARKED (132eb8ff, stg-287-2026-03-14) |
| STG-288 | Shift — "Variance" terminology same as DailyClosing | P2 | PARKED (417ac3a1, stg-288-2026-03-14) |
| STG-289 | Return — "Khata Credit" and "UPI (Manual)" need clarification | P2 | PARKED (87265195, stg-289-2026-03-14) |
| STG-290 | AIInsights — "Slow", "Forecast", "Expiry" tab labels unclear | P2 | PARKED (fbb998a8, stg-290-2026-03-14) |
| STG-291 | Components — hardcoded English in SellTile, CartItem, SupplierRow | P1 | PARKED (stg-291-2026-03-14) |
| STG-292 | LimitedModeBanner — "Place Orders (BUY)" jargon | P2 | PARKED (7b95512d, stg-292-2026-03-14) |
| STG-293 | Font sizes below 12px across Purchase/Stock screens | P2 | PARKED (c1fcf613, stg-293-2026-03-14) |
| STG-294 | Font sizes below 12px across Sales/Closing screens | P2 | PARKED (7f8d7355, stg-294-2026-03-14) |
| STG-295 | Font sizes below 12px across Credit/Customer/Orders screens | P2 | PARKED (c13cb749, stg-295-2026-03-14) |
| STG-296 | Font sizes below 12px in Chat/ForceUpdate/TabBadge | P2 | PARKED (f9a90762, stg-296-2026-03-14) |
| STG-297 | SplitPaymentModal — font 10px + missing accessibility labels | P2 | PARKED (cafe6184, stg-297-2026-03-14) |
| STG-298 | Missing accessibility labels on icon-only buttons across screens | P1 | PARKED (3cc0e075, stg-298-2026-03-14) |
| STG-299 | Missing accessibility labels on form inputs across screens | P2 | PARKED (cba67a62, stg-299-2026-03-14) |
| STG-300 | GRN — checkboxes missing accessibilityState | P2 | PARKED (09c6a351, stg-300-2026-03-14) |
| STG-301 | OrderDetail — status badge relies only on color (colorblind) | P1 | PARKED (417ac3a1, stg-301-2026-03-14) |
| STG-302 | Help — email-first contact, should be WhatsApp-first | P1 | PARKED (417ac3a1, stg-302-2026-03-14) |
| STG-303 | BnplDues — "contacted via email" should include WhatsApp | P2 | PARKED (87265195, stg-303-2026-03-14) |
| STG-304 | CustomerList + CustomerMgmt — email field inappropriate for kirana | P2 | PARKED (417ac3a1, stg-304-2026-03-14) |
| STG-305 | DeviceBlocked — "SuperAdmin"/"administrator" jargon | P1 | PARKED (c5a4600b, stg-305-2026-03-14) |
| STG-306 | DailyReport — vague empty state messaging | P2 | PARKED (9cea4407, stg-306-2026-03-14) |
| STG-307 | BillDetail — print/share buttons show "..." instead of spinner | P2 | PARKED (417ac3a1, stg-307-2026-03-14) |
| STG-308 | Inward — raw product ID shown when barcode is null | P2 | PARKED (fbb998a8, stg-308-2026-03-14) |
| STG-309 | Return — raw refundId displayed to users | P2 | PARKED (fbb998a8, stg-309-2026-03-14) |
| STG-310 | Splash — "Continue without session" jargon | P2 | PARKED (cf702fec, stg-310-2026-03-14) |
| STG-311 | AIInsights — "not yet available" error too vague | P2 | PARKED (9cea4407, stg-311-2026-03-14) |
| STG-312 | DailyReport + DailyClosing — missing offline/sync indication | P2 | PARKED (fbb998a8, stg-312-2026-03-14) |
| STG-313 | Network error messages across screens — no recovery guidance | P2 | PARKED (9cea4407, stg-313-2026-03-14) |
| STG-314 | PaymentSetup — no success confirmation after saving | P2 | PARKED (e2d025cc, stg-314-2026-03-14) |
| STG-315 | Reorder — missing confirmation before dismissing suggestion | P1 | PARKED (ceae6fb3, stg-315-2026-03-14) |
| STG-316 | SplitPaymentModal — TouchableOpacity should be Pressable | P3 | PARKED (417ac3a1, stg-316-2026-03-14) |
| STG-317 | Inconsistent disabled button opacity across all screens | P2 | PARKED (54e93ad3, stg-317-2026-03-14) |
| STG-318 | Khata — Add Credit red color semantics wrong | P2 | PARKED (87265195, stg-318-2026-03-14) |
| STG-319 | Inconsistent modal button styling across components | P3 | PARKED (fbb998a8, stg-319-2026-03-14) |
| STG-320 | OverdueDues — "Due Soon" uses info color instead of warning | P2 | PARKED (87265195, stg-320-2026-03-14) |
| STG-321 | Chat — "No messages yet. Say hello!" vague empty state | P2 | PARKED (417ac3a1, stg-321-2026-03-14) |
| STG-322 | Chat — 24-hour time format without AM/PM | P2 | PARKED (417ac3a1, stg-322-2026-03-14) |
| STG-323 | ForceUpdate — "iOS update coming soon" vague | P2 | PARKED (417ac3a1, stg-323-2026-03-14) |
| STG-324 | Enroll — activation code placeholder lacks help text | P1 | PARKED (417ac3a1, stg-324-2026-03-14) |
| STG-325 | Enroll — "Activate POS" vs "Activate Your POS" inconsistency | P3 | PARKED (9cea4407, stg-325-2026-03-14) |
| STG-326 | Enroll — required field indicators inconsistent | P2 | PARKED (6e1f8959, stg-326-2026-03-14) |
| STG-327 | StaffLogin — button doesn't change text during cooldown | P2 | PARKED (9a9777d4, stg-327-2026-03-14) |
| STG-328 | ForceUpdate — "unknown" version display lacks explanation | P2 | PARKED (417ac3a1, stg-328-2026-03-14) |
| STG-329 | ProductDetailModal — "No suppliers available" lacks guidance | P1 | PARKED (87265195, stg-329-2026-03-14) |
| STG-330 | DismissReasonModal — predefined reasons store English to backend | P2 | PARKED (54e93ad3, stg-330-2026-03-14) |
| STG-331 | SELL — Remove separate manual barcode field, unify into main search bar | P1 | PARKED (d5f0a2cc, stg-331-2026-03-14) |
| STG-332 | SELL — Search bar placeholder doesn't indicate barcode input support | P2 | PARKED (ea00d934, stg-332-2026-03-14) |
| STG-333 | SELL — 300ms debounce delays barcode resolution unnecessarily | P2 | PARKED (ea00d934, stg-333-2026-03-14) |
| STG-334 | SELL — Barcode heuristic too broad, matches phone numbers | P1 | PARKED (ea00d934, stg-334-2026-03-14) |
| STG-335 | SELL — Duplicate scan 2000ms window too strict for same-item multiples | P2 | PARKED (ea00d934, stg-335-2026-03-14) |
| STG-336 | SELL — Scan storm detection with no user feedback | P2 | PARKED (ea00d934, stg-336-2026-03-14) |
| STG-337 | SELL — Intermediate barcode prefixes trigger search results flicker | P2 | PARKED (ea00d934, stg-337-2026-03-14) |
| STG-338 | SELL — Unknown barcode modal lacks clear field guidance | P2 | PARKED (9cea4407, stg-338-2026-03-14) |
| STG-339 | SELL — LOOSE_BULK variant picker gated, may never trigger | P2 | PARKED (4d1b1f89, stg-339-2026-03-14) |
| STG-340 | SELL — Price error silently blocks checkout with no feedback | P1 | PARKED (417ac3a1, stg-340-2026-03-14) |
| STG-341 | SELL — DEMO_CATEGORIES hardcoded, no dynamic loading | P2 | PARKED (4d1b1f89, stg-341-2026-03-14) |
| STG-342 | SELL — Category selection does NOT filter displayed products | P1 | PARKED (132eb8ff, stg-342-2026-03-14) |
| STG-343 | PURCHASE — BuyScreen search bar missing barcode lookup | P1 | PARKED (4778f65a, stg-343-2026-03-14) |
| STG-344 | PURCHASE — Search debounce 400ms creates perceived slowness | P2 | PARKED (fbb998a8, stg-344-2026-03-14) |
| STG-345 | PURCHASE — No search autocomplete/suggestions before results | P3 | PARKED (fbb998a8, stg-345-2026-03-14) |
| STG-346 | PURCHASE — Stock filter applied client-side, pagination issues | P2 | PARKED (fbb998a8, stg-346-2026-03-14) |
| STG-347 | PURCHASE — Quick purchase mode adds items with empty metadata | P1 | PARKED (fbb998a8, stg-347-2026-03-14) |
| STG-348 | PURCHASE — No barcode lookup loading state | P2 | PARKED (6fade9fb, stg-348-2026-03-14) |
| STG-349 | SELL — Search results missing brand, image, pack size | P2 | PARKED (67a33ee6, stg-349-2026-03-14) |
| STG-350 | SELL — Autocomplete dropdown shows only name+barcode | P2 | PARKED (6fade9fb, stg-350-2026-03-14) |
| STG-351 | PURCHASE — Supplier name not visible in grid card | P2 | PARKED (4d755133, stg-351-2026-03-14) |
| STG-352 | PURCHASE — MOV not shown anywhere before checkout | P1 | PARKED (6fade9fb, stg-352-2026-03-14) |
| STG-353 | PURCHASE — MOQ shown only when >1 in small 11px font | P2 | PARKED (ceae6fb3, stg-353-2026-03-14) |
| STG-354 | PURCHASE — "Cost" price label ambiguous | P2 | PARKED (6fade9fb, stg-354-2026-03-14) |
| STG-355 | PURCHASE — No variant/pack size when metadata missing | P2 | PARKED (6fade9fb, stg-355-2026-03-14) |
| STG-356 | SELL — SellTile brand truncates on narrow screens | P2 | PARKED (4d1b1f89, stg-356-2026-03-14) |
| STG-357 | SELL — Expiry badge overlaps stock on small screens | P2 | PARKED (4d1b1f89, stg-357-2026-03-14) |
| STG-358 | PURCHASE — No supplier comparison table in ProductDetailModal | P2 | PARKED (4d755133, stg-358-2026-03-14) |
| STG-359 | PURCHASE — No expiry date/batch info for incoming products | P2 | PARKED (ceae6fb3, stg-359-2026-03-14) |
| STG-360 | VOICE — No confirmation before auto-executing voice commands | P1 | PARKED (2d8f4b85, stg-360-2026-03-14) |
| STG-361 | VOICE — Product search stub not implemented, lookups fail | P0 | PARKED (6a9c4494, stg-361-2026-03-14) |
| STG-362 | VOICE — Locale toggle not wired to backend STT | P1 | PARKED (f86c50cf, stg-362-2026-03-14) |
| STG-363 | VOICE — NEEDS_CLARIFICATION flag never shown as picker | P2 | PARKED (f86c50cf, stg-363-2026-03-14) |
| STG-364 | VOICE — No visual confidence score or match feedback | P2 | PARKED (f86c50cf, stg-364-2026-03-14) |
| STG-365 | VOICE — No mic permission guidance when denied | P2 | PARKED (f86c50cf, stg-365-2026-03-14) |
| STG-366 | VOICE — No timeout on slow API, app hangs indefinitely | P1 | PARKED (f86c50cf, stg-366-2026-03-14) |
| STG-367 | VOICE — Prompt injection vulnerability (regex-only mitigation) | P0 | PARKED (4602b3f4, stg-367-2026-03-14) |
| STG-368 | SELL — No immediate visual feedback on product tile tap | P2 | PARKED (6fade9fb, stg-368-2026-03-14) |
| STG-369 | SELL — VariantPickerModal lacks images, stock, price context | P2 | PARKED (4d1b1f89, stg-369-2026-03-14) |
| STG-370 | SELL — Cart add persistence not awaited, silent data loss | P1 | PARKED (4d1b1f89, stg-370-2026-03-14) |
| STG-371 | HID — Scanner timing parameters hardcoded | P2 | PARKED (ea00d934, stg-371-2026-03-14) |
| STG-372 | HID — Buffer not reset on SellScanScreen mount/unmount | P1 | PARKED (ea00d934, stg-372-2026-03-14) |
| STG-373 | SELL — Cart sheet covers 55-75% of screen on small devices | P2 | PARKED (b2bacbc9, stg-373-2026-03-14) |
| STG-374 | SELL — No cart item limit, performance degrades at 100+ items | P2 | PARKED (f86c50cf, stg-374-2026-03-14) |
| STG-375 | SELL — Cart item removal undo has no countdown indicator | P3 | PARKED (f99dc3c6, stg-375-2026-03-14) |
| STG-376 | SELL — No cart hold/park feature for multi-customer scenarios | P3 | PARKED (b2bacbc9, stg-376-2026-03-14) |
| STG-377 | PAYMENT — Payment method tabs not locked during transaction | P1 | PARKED (f4f20aaa, stg-377-2026-03-14) |
| STG-378 | PAYMENT — UPI QR expiry countdown reaches 0:00 but QR stays | P2 | PARKED (f99dc3c6, stg-378-2026-03-14) |
| STG-379 | PAYMENT — No offline payment fallback messaging | P1 | PARKED (f4f20aaa, stg-379-2026-03-14) |
| STG-380 | PAYMENT — Cart lock on failure doesn't explain timeout | P2 | PARKED (e2d025cc, stg-380-2026-03-14) |
| STG-381 | PAYMENT — PENDING_UPI_KEY defined but unused for crash recovery | P1 | PARKED (f99dc3c6, stg-381-2026-03-14) |
| STG-382 | PAYMENT — Split payment manual UTR shown too late | P2 | PARKED (e2d025cc, stg-382-2026-03-14) |
| STG-383 | PAYMENT — No refund/void mechanism post-payment from POS | P1 | PARKED (e2d025cc, stg-383-2026-03-14) |
| STG-384 | PAYMENT — Item vs cart discount not distinguished on receipt | P2 | PARKED (e2d025cc, stg-384-2026-03-14) |
| STG-385 | STOCK — No standalone stock adjustment modal from SELL screen | P2 | PARKED (f99dc3c6, stg-385-2026-03-14) |
| STG-386 | STOCK — Stock limit notification doesn't explain cap reason | P2 | PARKED (87265195, stg-386-2026-03-14) |
| STG-387 | SYNC — No push-based stock sync, only 5-minute polling | P2 | PARKED (fc93e3b3, stg-387-2026-03-14) |
| STG-388 | SYNC — Stock sync conflicts silently resolved as server wins | P2 | PARKED (b2bacbc9, stg-388-2026-03-14) |
| STG-389 | OFFLINE — 24h queue expiry with no warning before loss | P1 | PARKED (b2bacbc9, stg-389-2026-03-14) |
| STG-390 | OFFLINE — Price cache not refreshed from portal on reconnect | P2 | PARKED (f99dc3c6, stg-390-2026-03-14) |
| STG-391 | OFFLINE — No post-checkout sync confirmation | P2 | PARKED (f99dc3c6, stg-391-2026-03-14) |
| STG-392 | OFFLINE — No recovery when offline SQLite database corrupted | P1 | PARKED (b2bacbc9, stg-392-2026-03-14) |
| STG-393 | DEVICE — No device type detection (POS vs phone vs tablet) | P2 | PARKED (b2bacbc9, stg-393-2026-03-14) |
| STG-394 | DEVICE — Touch targets too small on compact small phones | P2 | PARKED (b2bacbc9, stg-394-2026-03-14) |
| STG-395 | LAYOUT — NUM_COLUMNS=2 hardcoded, no responsive columns | P2 | PARKED (b2bacbc9, stg-395-2026-03-14) |
| STG-396 | LAYOUT — Cart sheet snap points not optimized for tablets | P2 | PARKED (703eec27, stg-396-2026-03-14) |
| STG-397 | LAYOUT — No safe area handling for notched phones | P2 | PARKED (703eec27, stg-397-2026-03-14) |
| STG-398 | LAYOUT — Modal dialogs stretch full-width on tablets | P2 | PARKED (b2bacbc9, stg-398-2026-03-14) |
| STG-399 | SELL — Price edit in cart not persisted separately | P2 | PARKED (86a8a8e4, stg-399-2026-03-14) |
| STG-400 | SELL — No quantity input validation for large numbers | P2 | PARKED (4d1b1f89, stg-400-2026-03-14) |
| STG-401 | PAYMENT — Cart-to-payment data consistency not validated | P1 | PARKED (f4f20aaa, stg-401-2026-03-14) |
| STG-402 | SELL — Search history unbounded, no expiration | P3 | PARKED (703eec27, stg-402-2026-03-14) |
| STG-403 | SELL — Cart bar flash animation invisible on slow devices | P3 | PARKED (b2bacbc9, stg-403-2026-03-14) |
| STG-404 | PAYMENT — No UPI polling status visible during QR wait | P2 | PARKED (f4f20aaa, stg-404-2026-03-14) |
| STG-405 | PAYMENT — Discount application has no undo | P2 | PARKED (e2d025cc, stg-405-2026-03-14) |
| STG-406 | PAYMENT — Offline receipts may not get OFF- prefix consistently | P2 | PARKED (e2d025cc, stg-406-2026-03-14) |
| STG-407 | PURCHASE — BNPL badge shown without terms explanation | P2 | PARKED (703eec27, stg-407-2026-03-14) |
| STG-408 | PURCHASE — Cart badge confusing with multi-supplier items | P2 | PARKED (703eec27, stg-408-2026-03-14) |
| STG-409 | VOICE — No recording duration countdown visible | P2 | PARKED (f86c50cf, stg-409-2026-03-14) |
| STG-410 | VOICE — Rate limit 429 errors show no retry-after guidance | P2 | PARKED (f86c50cf, stg-410-2026-03-14) |
| STG-411 | VOICE — Zero E2E test coverage for voice flow | P1 | PARKED (30291b7d, stg-411-2026-03-14) |
| STG-412 | REORDER — No manual quick-reorder from purchase history | P1 | PARKED (aad1cb4a, stg-412-2026-03-14) |
| STG-413 | REORDER — Quantity edits in EditReorderModal not persisted to DB | P1 | PARKED (aad1cb4a, stg-413-2026-03-14) |
| STG-414 | REORDER — No reorder history/audit trail visible on POS | P2 | PARKED (aad1cb4a, stg-414-2026-03-14) |
| STG-415 | REORDER — Pending reorders are snapshots, no staleness detection | P2 | PARKED (aad1cb4a, stg-415-2026-03-14) |
| STG-416 | REORDER — Expired reorders silently disappear, no re-trigger | P2 | PARKED (efecd9a4, stg-416-2026-03-14) |
| STG-417 | REORDER — No expiry cleanup job marks pending reorders as expired | P1 | PARKED (9116d241, stg-417-2026-03-14) |
| STG-418 | REORDER — No scheduler generates reorder suggestions (CRITICAL) | P0 | PARKED (42fe8f83, stg-418-2026-03-14) |
| STG-419 | REORDER — Auto-approve threshold setting has no effect | P2 | PARKED (9116d241, stg-419-2026-03-14) |
| STG-420 | REORDER — No quantity optimization algorithm (EOQ/MOQ) | P2 | PARKED (9116d241, stg-420-2026-03-14) |
| STG-421 | REORDER — Approved reorders create draft POs but no submission | P1 | PARKED (aad1cb4a, stg-421-2026-03-14) |
| STG-422 | REORDER — GRN auto-close doesn't mark reorders as fulfilled | P2 | PARKED (aad1cb4a, stg-422-2026-03-14) |
| STG-423 | REORDER — No dynamic supplier mapping algorithm | P0 | PARKED (9116d241, stg-423-2026-03-14) |
| STG-424 | REORDER — Supplier picker doesn't show pack variants | P2 | PARKED (aad1cb4a, stg-424-2026-03-14) |
| STG-425 | REORDER — Supplier picker loses original supplier if not in catalog | P2 | PARKED (796f6544, stg-425-2026-03-14) |
| STG-426 | REORDER — Payment terms not returned by backend, dead code | P1 | PARKED (9116d241, stg-426-2026-03-14) |
| STG-427 | REORDER — Approval response missing supplier names | P2 | PARKED (aad1cb4a, stg-427-2026-03-14) |
| STG-428 | REORDER — Partial approval failure is silent (transaction rollback) | P1 | PARKED (9116d241, stg-428-2026-03-14) |
| STG-429 | REORDER — Empty state misleading when auto-reorder is off | P2 | PARKED (aad1cb4a, stg-429-2026-03-14) |
| STG-430 | REORDER — Selection bar disappears causing layout shift | P3 | PARKED (aad1cb4a, stg-430-2026-03-14) |
| STG-431 | REORDER — EditReorderModal original quantity reference too subtle | P3 | PARKED (aad1cb4a, stg-431-2026-03-14) |
| STG-432 | REORDER — Supplier load error hidden until save attempt | P2 | PARKED (cddb0a0a, stg-432-2026-03-14) |
| STG-433 | REORDER — maxReorderQty not visible in policy list | P3 | PARKED (aad1cb4a, stg-433-2026-03-14) |
| STG-434 | REORDER — Threshold visual guide proportions misleading | P3 | PARKED (91929249, stg-434-2026-03-14) |
| STG-435 | REORDER — Catalog supplier data not cached, re-fetched on modal open | P3 | PARKED (7a50a51a, stg-435-2026-03-14) |
| STG-436 | REORDER — minStock/minThreshold naming inconsistency | P2 | PARKED (aad1cb4a, stg-436-2026-03-14) |
| STG-437 | REORDER — Stock status threshold mismatch frontend vs backend | P2 | PARKED (7f43284a, stg-437-2026-03-14) |
| STG-438 | REORDER — Policy validation frontend-only, no server-side bounds | P2 | PARKED (9116d241, stg-438-2026-03-14) |
| STG-439 | REORDER — No auto-reorder cron visibility or manual trigger on POS | P2 | PARKED (aad1cb4a, stg-439-2026-03-14) |
| STG-440 | REORDER — No bulk policy management | P2 | PARKED (aad1cb4a, stg-440-2026-03-14) |
| STG-441 | REORDER — Filter labels in ReorderPoliciesScreen hardcoded English | P2 | PARKED (aad1cb4a, stg-441-2026-03-14) |
| STG-442 | REORDER — Dismiss reason codes sent as translated strings to backend | P2 | PARKED (7f43284a, stg-442-2026-03-14) |
| STG-443 | REORDER — Dismissal reason max length not validated on backend | P3 | PARKED (9116d241, stg-443-2026-03-14) |
| STG-444 | REORDER — Missing accessibility labels on interactive elements | P2 | PARKED (aad1cb4a, stg-444-2026-03-14) |
| STG-445 | REORDER — formatMoney null safety risk on price display | P2 | PARKED (aad1cb4a, stg-445-2026-03-14) |
| STG-446 | REORDER — No unit tests for reorder helper functions | P2 | PARKED (7f43284a, stg-446-2026-03-14) |
| STG-447 | REORDER — Idempotency framework created but unused | P3 | PARKED (aad1cb4a, stg-447-2026-03-14) |
| STG-448 | CREDIT — Feature gate hardcoded false in PaymentOptionsSheet | P0 | PARKED (56a997b4, stg-448-2026-03-14) |
| STG-449 | CREDIT — Credit scoring algorithm simplified mock, not production | P1 | PARKED (7f43284a, stg-449-2026-03-14) |
| STG-450 | CREDIT — Credit score tiers hardcoded in source code | P2 | PARKED (7f43284a, stg-450-2026-03-14) |
| STG-451 | CREDIT — No credit disbursement endpoint after admin approval | P0 | PARKED (7f43284a, stg-451-2026-03-14) |
| STG-452 | CREDIT — KYC validation is format-only, no real verification | P1 | PARKED (7f43284a, stg-452-2026-03-14) |
| STG-453 | CREDIT — No KYC document upload endpoint | P2 | PARKED (7f43284a, stg-453-2026-03-14) |
| STG-454 | CREDIT — Credit offers have no expiry cleanup job | P2 | PARKED (7f43284a, stg-454-2026-03-14) |
| STG-455 | CREDIT — No external credit providers integrated | P1 | PARKED (8a70911f, stg-455-2026-03-14) |
| STG-456 | CREDIT — Provider failure silently hides offers | P2 | PARKED (7f43284a, stg-456-2026-03-14) |
| STG-457 | CREDIT — No consent management before credit scoring (DPDP) | P0 | PARKED (b6774002, stg-457-2026-03-14) |
| STG-458 | CREDIT — No re-eligibility check at application time | P2 | PARKED (7f43284a, stg-458-2026-03-14) |
| STG-459 | CREDIT — No application status timeline or tracking UI | P2 | PARKED (7f43284a, stg-459-2026-03-14) |
| STG-460 | CREDIT — PaymentOptionsSheet credit option shows no cost details | P2 | PARKED (7f43284a, stg-460-2026-03-14) |
| STG-461 | CREDIT — CreditScreen 55KB needs component extraction | P2 | PARKED (7f43284a, stg-461-2026-03-14) |
| STG-462 | BNPL — Interest calculation doesn't prorate by tenure days | P1 | PARKED (7f43284a, stg-462-2026-03-14) |
| STG-463 | BNPL — No overdue visual hierarchy in BnplDuesScreen | P2 | PARKED (fcbe5163, stg-463-2026-03-14) |
| STG-464 | BNPL — Dispute has no audit trail or status history | P2 | PARKED (7f43284a, stg-464-2026-03-14) |
| STG-465 | BNPL — No drawdown limit per supplier | P2 | PARKED (a9a3af36, stg-465-2026-03-14) |
| STG-466 | BNPL — Payment status polling race condition | P2 | PARKED (56a997b4, stg-466-2026-03-14) |
| STG-467 | BNPL — Overdue maturation job functions exist but no scheduler | P1 | PARKED (56a997b4, stg-467-2026-03-14) |
| STG-468 | BNPL — Max days hardcoded to 7, not configurable per store type | P2 | PARKED (56a997b4, stg-468-2026-03-14) |
| STG-469 | KHATA — Phone number validation too weak | P2 | PARKED (87265195, stg-469-2026-03-14) |
| STG-470 | KHATA — Transaction type semantics unclear (DEBIT vs PAYMENT) | P2 | PARKED (87265195, stg-470-2026-03-14) |
| STG-471 | KHATA — No entry correction or void mechanism | P2 | PARKED (87265195, stg-471-2026-03-14) |
| STG-472 | KHATA — No bulk actions (settle, export, multi-payment) | P2 | PARKED (56a997b4, stg-472-2026-03-14) |
| STG-473 | KHATA — Customer phone numbers stored without consent (DPDP) | P1 | PARKED (e7150c87, stg-473-2026-03-14) |
| STG-474 | CREDIT — PAN number stored in plaintext (DPDP violation) | P0 | PARKED (723de909, stg-474-2026-03-14) |
| STG-475 | CREDIT — No rate limiting on credit offer generation | P2 | PARKED (56a997b4, stg-475-2026-03-14) |
| STG-476 | CREDIT — Missing composite index on bnpl_drawdowns | P2 | PARKED (56a997b4, stg-476-2026-03-14) |
| STG-477 | CREDIT — Hardcoded ₹ currency symbol in multiple screens | P3 | PARKED (56a997b4, stg-477-2026-03-14) |
| STG-478 | CREDIT — BnplDuesScreen 55KB needs component extraction | P3 | PARKED (892e8dc1, stg-478-2026-03-14) |
| STG-479 | REORDER/CREDIT — No E2E test for full lifecycle | P1 | PARKED (006c7259, stg-479-2026-03-14) |
| STG-480 | BNPL — No early repayment incentive or standing instructions | P3 | PARKED (56a997b4, stg-480-2026-03-14) |
| STG-481 | GUARD: i18n validation script — en/hi key parity check | P0 | PARKED (stg-481-2026-03-14) |
| STG-482 | GUARD: i18n key naming convention document | P0 | PARKED (stg-482-2026-03-14) |
| STG-483 | GUARD: Refactor SellTile.formatPrice() → use formatMoney() | P0 | PARKED (3c602bfc, stg-483-2026-03-14) |
| STG-484 | GUARD: Refactor CartItem + SupplierRow → useThemeColors() hook | P1 | PARKED (7b95512d, stg-484-2026-03-14) |
| STG-485 | GUARD: consent_records table + consent API (DPDP) | P0 | PARKED (7b2e08ab, stg-485-2026-03-14) |
| STG-486 | GUARD: Encryption key management infra (GCP Secret Manager) | P0 | PARKED (4c2faa79, stg-486-2026-03-14) |
| STG-487 | GUARD: Backend staff role + max discount API | P0 | PARKED (c9568cf6, stg-487-2026-03-14) |
| STG-488 | GUARD: Backend manager PIN verification endpoint | P0 | PARKED (c9568cf6, stg-488-2026-03-14) |
| STG-489 | GUARD: Backend void/refund sale endpoint | P0 | PARKED (e2d025cc, stg-489-2026-03-14) |
| STG-490 | GUARD: Backend credit disbursement endpoint | P0 | PARKED (273668a0, stg-490-2026-03-14) |
| STG-491 | GUARD: Backend reorder PO submission endpoint | P0 | PARKED (49e810ac, stg-491-2026-03-14) |
| STG-492 | GUARD: Fix PENDING_UPI_KEY write-before-checkout (double-charge) | P0 | PARKED (30956d33, stg-492-2026-03-14) |

**Total**: 551 tickets | 494 PARKED | 0 DONE | 0 IN_PROGRESS | 57 OPEN

---

## Implementation Layers — File-Type Grouped, Dependency-Ordered

> **Purpose**: Tickets grouped by edit file type and ordered in layers so each layer can be completed end-to-end without regressing previous layers. Within each layer, tickets are grouped by primary file to minimize merge conflicts.
>
> **Rule**: Complete a layer fully before starting the next. Within a layer, file-groups are independent and can be parallelized.
>
> **Regression guard**: Each layer ends with a gate — typecheck + tests + build must pass before advancing.

---

### Loophole Guard Protocol (LGP)

> **Added 2026-03-14** after code-level audit of all 480 tickets. Each loophole identified below is a MANDATORY guard — Claude MUST NOT skip these during implementation. Loopholes are numbered LH-001+ and referenced in their respective layers.

#### LGP Rules:
1. **GUARD tickets (STG-481–492) are P0 prerequisites** — they MUST be completed before the layer that depends on them
2. **Merge order constraints** are MANDATORY — tickets marked "AFTER X" cannot start until X is PARKED
3. **Cross-file audit requirements** mean Claude must search beyond the declared scope to verify no other files have the same vulnerability
4. **Missing backend infrastructure** means a frontend ticket is BLOCKED until the backend ticket is done — no dead-code buttons

#### Loophole Registry:

| LH# | Layer | Risk | Guard Ticket | Description |
|-----|-------|------|-------------|-------------|
| LH-001 | L0 | CRITICAL | — | `showQaMenu` NOT bounded by `__DEV__` — if `EXPO_PUBLIC_ENABLE_QA_MENU=true` leaks to prod, QA menu shows |
| LH-002 | L0 | HIGH | STG-486 | PAN encryption needs key management infra BEFORE STG-474 can encrypt |
| LH-003 | L0 | HIGH | STG-485 | No `consent_records` table — STG-457 and STG-473 both need it FIRST |
| LH-004 | L0 | HIGH | — | Voice `startStockMonitor()` may not be called from service entrypoint — verify in STG-418 |
| LH-005 | L0 | MEDIUM | — | STG-224: `DEMO_CATEGORIES` is intentional fallback — guard must add "Categories unavailable" UX, not just `__DEV__` |
| LH-006 | L0 | MEDIUM | — | No release build verification test — `__DEV__` strip not verified in CI |
| LH-007 | L1 | CRITICAL | — | STG-232 (disabled tokens) MUST precede STG-003 (palette audit) — or combine |
| LH-008 | L1 | HIGH | STG-483 | SellTile.formatPrice() duplicates formatMoney() — STG-116 won't affect SellTile |
| LH-009 | L1 | HIGH | — | 50 files call formatMoney() — 4 have null-unsafe calls — audit BEFORE STG-116 |
| LH-010 | L2 | HIGH | STG-481 | No i18n validation script — no build-time en/hi key parity check |
| LH-011 | L2 | MEDIUM | STG-482 | i18n key naming convention undefined — component keys need namespace rules |
| LH-012 | L2 | MEDIUM | — | STG-292 only covers 2 of 7 hardcoded strings in LimitedModeBanner |
| LH-013 | L4 | HIGH | STG-484 | CartItem + SupplierRow use static `theme` (not `useThemeColors()`) — dark mode broken |
| LH-014 | L4 | MEDIUM | — | SupplierRow:120 `stockColor + "20"` opacity hack breaks if color format changes |
| LH-015 | L7 | CRITICAL | STG-487 + STG-488 | STG-102 (discount limits) has NO backend: no staff role API, no max discount setting, no manager PIN endpoint |
| LH-016 | L7 | CRITICAL | — | STG-094/095/126 (three removal paths) must be implemented in sequence: STG-094 → STG-126 → STG-095 |
| LH-017 | L8 | CRITICAL | STG-492 | PENDING_UPI_KEY defined but NEVER written before checkout — double-charge risk on crash |
| LH-018 | L8 | CRITICAL | STG-489 | STG-383 (refund/void) has NO backend endpoint — button would be dead code |
| LH-019 | L8 | HIGH | — | STG-377: `renderModeTab` callers NEVER pass `disabled` during `submitting` state |
| LH-020 | L8 | HIGH | — | STG-080/087/123 mutually dependent — merge order: STG-087 → STG-080 → STG-123 |
| LH-021 | L8 | MEDIUM | — | STG-085 (split) vs STG-125 (partial) are different features — clarify DUE overlap |
| LH-022 | L14 | CRITICAL | STG-491 | STG-421: Draft POs created but NO submission endpoint — POs never reach suppliers |
| LH-023 | L14 | CRITICAL | — | STG-413: EditReorderModal calls non-existent PATCH API — edits silently lost |
| LH-024 | L14 | HIGH | — | STG-423: Supplier mapping ignores MOQ, only sorts by price |
| LH-025 | L15 | CRITICAL | STG-490 | STG-451: No credit disbursement endpoint — approved applications stuck forever |
| LH-026 | L15 | CRITICAL | — | STG-462: Interest formula is flat (`principal * rate / 100`), not prorated by tenure |
| LH-027 | L15 | CRITICAL | — | STG-448: Feature gate hardcoded `false` in BOTH frontend AND backend — no single source |
| LH-028 | L15 | HIGH | — | STG-467: Overdue maturation functions exist but no scheduler calls them |
| LH-029 | L15 | HIGH | — | Missing tables: `credit_disbursements`, `kyc_document_storage`, `overdue_notifications`, `consent_records` |

---

### LAYER 0 — Security & P0 Critical Bugs (17 tickets)
> **Why first**: These are data leaks, security violations, and broken core features. Ship-blocking regardless of UI polish.
> **Gate**: `pnpm -r typecheck` + `pnpm test` + zero security violations
> **Loophole guards**: LH-001 through LH-006

#### 0A: GUARD Prerequisites (do FIRST within L0)
| # | File(s) | What | Guards |
|---|---------|------|--------|
| STG-486 | `backend/src/utils/encryption.ts` (NEW) + GCP Secret Manager | Create encryption key management utility: `encrypt(plaintext)`, `decrypt(ciphertext)`, key rotation support. Use `@google-cloud/secret-manager` for key storage. | LH-002 — blocks STG-474 |
| STG-485 | Migration + `backend/src/routes/v1/consent.ts` (NEW) | Create `platform.consent_records` table: `(id, store_id, customer_phone, consent_type, given_at, revoked_at)`. Create `POST /api/v1/consent/record` + `GET /api/v1/consent/check` endpoints. | LH-003 — blocks STG-457, STG-473 |

#### 0B: Security — Data Exposure & Auth (POS app)
| # | File(s) | What | Guards |
|---|---------|------|--------|
| STG-144 | `MenuScreen.tsx:1083-1130` | Wrap BOTH `showQaMenu` section AND BUILD INFO in `if (__DEV__)`. **LH-001**: Must guard `showQaMenu` condition itself, not just BUILD_INFO. Fix: `{__DEV__ && showQaMenu && (...)}` | LH-001 |
| STG-145 | `MenuScreen.tsx:1103-1130` | Remove token, API URL, StoreId UUID from visible UI. **ALSO**: grep for `API_BASE_URL` in error messages, crash reports, analytics across ALL files | LH-006 |
| STG-178 | `MenuScreen.tsx:1083-1101` + `UiShowcaseScreen.tsx:30-34` | Double-gate: `__DEV__ && showQaMenu`. Remove `EXPO_PUBLIC_ENABLE_QA_MENU` from production capability — `isQaMenuEnabled()` must return `false` unless `__DEV__` | LH-001 |
| STG-253 | `EnrollDeviceScreen.tsx:40` | Already guarded ✓. Verify: `EXPO_PUBLIC_TEST_PHONE` not set in `app.json` production profile | — |
| STG-224 | `SellScanScreen.tsx:61` + `CategoryRail.tsx:67,255` | **LH-005**: Don't just `__DEV__`-guard. Change fallback to `"Categories unavailable"` empty state in production. `DEMO_CATEGORIES` stays for dev only | LH-005 |

#### 0C: Security — Backend & Compliance (DPDP)
| # | File(s) | What | Depends On |
|---|---------|------|-----------|
| STG-474 | `backend/src/routes/v1/pos/credit.ts:550` + migration | Encrypt PAN using `encrypt()` from STG-486. Add migration to encrypt existing plaintext PANs. **ALSO**: encrypt `aadhaar_last4`. Add PAN hash column for search. | **STG-486** |
| STG-457 | `CreditScreen.tsx` + `backend/src/routes/v1/pos/credit.ts` | Add consent checkbox UI before credit scoring. Call `POST /consent/record` from STG-485. Block scoring if no consent. Store `consent_id` on credit application. | **STG-485** |
| STG-473 | `KhataScreen.tsx:778-787` + backend | Add consent checkbox before phone collection. Call `POST /consent/record`. Encrypt phone in `khata_entries` using STG-486. | **STG-485, STG-486** |
| STG-367 | `backend/services/voice-service/src/services/intentParser.ts` + `routes/voice.ts` | Fix prompt injection: (1) sanitize `productName` — strip SQL keywords, (2) add rate limiter to `/interpret`, (3) redact PII from transcript stored in memory, (4) add input length limit | — |

#### 0D: P0 Bugs — Broken Features
| # | File(s) | What |
|---|---------|------|
| STG-142 | `MenuScreen.tsx:605` + `en.json` + `hi.json` | Fix leaked i18n key. **ALSO**: verify all `t('menu.*')` calls have matching keys in BOTH en.json and hi.json |
| STG-143 | `MenuScreen.tsx:656-658` + `en.json` + `hi.json` | Fix leaked i18n keys. Change from positional fallback to `defaultValue` format |
| STG-189 | `MenuScreen.tsx:1066` | Fix `&amp;` → `&`. **ALSO**: grep ALL .tsx files for `&amp;`, `&lt;`, `&gt;`, `&quot;` HTML entities in React Native Text |
| STG-361 | `backend/services/voice-service/` | Implement real product search: query `catalog.store_products` by name/barcode, scope to `store_id` from JWT, return top 10, fuzzy match |
| STG-418 | `backend/services/reorder-service/` | **LH-004**: Verify `startStockMonitor()` is called in service entrypoint (`index.ts`). If not, add call. Add startup log. Add health check endpoint to confirm cron is running |
| STG-492 | `src/screens/PaymentScreen.tsx:826` | **LH-017**: Write `PENDING_UPI_KEY` to AsyncStorage BEFORE calling `completeCheckout()`. On mount, check for stale pending — recover or warn. Prevents double-charge on crash. |

**Layer 0 total**: 17 tickets (14 original + 3 GUARD)

---

### LAYER 1 — Foundation: Theme, Utilities, i18n Keys (14 tickets)
> **Why second**: Every UI ticket depends on design tokens, money formatting, and i18n keys being correct. Fix the foundation before touching screens.
> **Gate**: `pnpm -r typecheck` + theme tokens importable + `formatMoney()` passes unit tests
> **Loophole guards**: LH-007 through LH-009

#### 1A: Design Tokens (`src/theme/`) — STRICT ORDER
| # | File(s) | What | Guards |
|---|---------|------|--------|
| STG-232 | `colors.ts` | **DO FIRST** — Add `disabled`, `disabledText`, `disabledBg` tokens to BOTH light AND dark palettes | LH-007 |
| STG-231 | `colors.ts:7-12` | **AFTER STG-232** — Deduplicate accent/secondary. Pick ONE name, alias the other, deprecate | LH-007 |
| STG-003 | `colors.ts` + `spacing.ts` + `typography.ts` + `index.ts` | **AFTER STG-232+231** — Unified palette. **RULE**: No null-coalescing fallback hex colors (`?? "#EFF6FF"`) — use explicit secondary token. Remove all `?? "#hex"` patterns in theme consumers | LH-007 |
| STG-233 | `colors.ts:61,124` | Remove/assign purpose to unused `ink` token | — |
| STG-011 | `typography.ts:1-77` | Audit font sizes for POS-grade readability | — |

#### 1B: Utility Functions (`src/utils/`) — AUDIT FIRST
| # | File(s) | What | Guards |
|---|---------|------|--------|
| STG-483 | `SellTile.tsx:55-59` + `money.ts` | **DO FIRST** — Refactor `SellTile.formatPrice()` to call `formatMoney()`. Delete duplicate local formatter. Ensure `/rateUnit` suffix still works via wrapper. | LH-008 |
| STG-116 | `money.ts:31-71` | **AFTER STG-483** — Implement Indian lakh formatting. **LH-009**: Before modifying, grep all 50 callers for null-unsafe usage. Add `formatMoney(null) → "—"` test. Add `formatMoney(undefined) → "—"` test. | LH-009 |
| STG-117 | `money.ts` | **AFTER STG-116** — Smart formatting: drop `.00` on round amounts | — |

#### 1C: i18n Locale Keys — Existing Key Fixes (`src/i18n/locales/`)
| # | File(s) | What |
|---|---------|------|
| STG-234 | `en.json:382` + `hi.json` | Rewrite `status.storeInactive` (remove "Superadmin") |
| STG-235 | `en.json:383` + `hi.json` | Rewrite `status.deviceInactive` (remove "Superadmin") |
| STG-236 | `en.json:393` + `hi.json` | Rewrite `errors.deviceAlreadyEnrolled` (remove "Superadmin") |
| STG-237 | `en.json:406` | Change "Please login again" → "re-enter staff PIN" |
| STG-238 | `en.json:146` + `hi.json` | Rewrite "Digitise mode on" to plain language |

**Layer 1 total**: 14 tickets (12 original + STG-483 from GUARD + STG-232 reordered)

---

### LAYER 2 — i18n Hardcoded String Replacement (30 tickets)
> **Why here**: i18n is a mechanical, low-risk change per screen. Doing all i18n before UI redesign avoids merge conflicts — redesign tickets would otherwise invalidate i18n line numbers.
> **Gate**: `pnpm -r typecheck` + all screens render without leaked `[keys]` + Hindi toggle works + `npm run i18n:validate` passes
> **Loophole guards**: LH-010, LH-011, LH-012

#### 2-PREREQ: GUARD Prerequisites (do FIRST within L2)
| # | File(s) | What | Guards |
|---|---------|------|--------|
| STG-481 | `scripts/i18n-validate.js` (NEW) + `package.json` | Create i18n key parity validator: reads en.json + hi.json, reports keys missing in either file. Add `"i18n:validate": "node scripts/i18n-validate.js"` to package.json. Exit 1 if mismatch. Run in pre-commit hook. | LH-010 |
| STG-482 | `src/i18n/NAMING.md` (NEW) | Define i18n key naming convention: `common.*` = truly generic ("Loading", "Error", "Retry"), `{screen}.*` = screen-specific ("dailyReport.title"), `components.*` = shared component strings. **RULE**: Every STG-257–279 ticket MUST follow this convention. | LH-011 |

#### 2A: Screens with zero t() — Full i18n setup needed
| # | Primary File | Strings |
|---|-------------|---------|
| STG-257 | `PaymentSetupScreen.tsx` (395 lines) | ~18 strings |
| STG-259 | `BillDetailScreen.tsx` (432 lines) | ~15 strings |
| STG-260 | `SalesStatementScreen.tsx` (423 lines) | ~12 strings |
| STG-261 | `DailyReportScreen.tsx` (809 lines) | ~25 strings |
| STG-264 | `GRNScreen.tsx` (1000 lines) | ~18 strings |
| STG-265 | `OpeningStockScreen.tsx` (738 lines) | ~16 strings |
| STG-269 | `KhataScreen.tsx` (941 lines) | ~22 strings |
| STG-271 | `OverdueDuesScreen.tsx` (573 lines) | ~18 strings |
| STG-272 | `ShiftScreen.tsx` (903 lines) | ~40 strings |
| STG-274 | `ReturnScreen.tsx` (914 lines) | ~32 strings |
| STG-278 | `BulkPurchaseCreditScreen.tsx` (231 lines) | ~15 strings |
| STG-279 | `ErrorBoundary.tsx` (74 lines) | ~4 strings |

#### 2B: Screens with partial t() — Extend coverage
| # | Primary File | Strings |
|---|-------------|---------|
| STG-258 | `SalesHistoryScreen.tsx` (310 lines) | ~5 remaining |
| STG-262 | `DailyClosingScreen.tsx` (750 lines) | ~12 remaining |
| STG-263 | `InwardScreen.tsx` (1146 lines) | ~20 remaining |
| STG-266 | `PurchaseScreen.tsx` (1700+ lines) | ~40 remaining |
| STG-267 | `BarcodeSheetScreen.tsx` (1500+ lines) | ~35 remaining |
| STG-268 | `BnplDuesScreen.tsx` (1439 lines) | ~25 remaining |
| STG-270 | `CustomerListScreen.tsx` (904 lines) | ~35 remaining |
| STG-273 | `OrderDetailScreen.tsx` (952 lines) | ~22 remaining |
| STG-277 | `ReorderScreen.tsx` + `ReorderPoliciesScreen.tsx` | ~20 combined |

#### 2C: Screens with heavy t() — Close gaps
| # | Primary File | Strings |
|---|-------------|---------|
| STG-275 | `BuyScreen.tsx` (996 lines) | ~12 remaining |
| STG-276 | `CreditScreen.tsx` (1498 lines) | ~15 remaining |

#### 2D: i18n for shared locale keys
| # | File(s) | What |
|---|---------|------|
| STG-239 | `en.json` + `hi.json` | Replace "MOQ" with "Min. Order" |
| STG-240 | `en.json:93-100` + `hi.json` | Tab labels: ALL CAPS → title case |
| STG-241 | `en.json:251` + `hi.json` | Simplify `dismissSuggestedFrom` template for Hindi |
| STG-242 | `en.json:484-536` | Add explanations for KYC, UTR, EMI jargon |
| STG-243 | `en.json:461` + `hi.json` | Break UPI instructions into steps |
| STG-244 | `en.json:292` + `hi.json` | "Goods Receipt Note" → "Stock Received" |

#### 2E: Component-level i18n
| # | File(s) | What |
|---|---------|------|
| STG-291 | `SellTile.tsx` + `CartItem.tsx` + `SupplierRow.tsx` | i18n "PACKAGED", "MOQ:", "Add"/"Add More" |

**Layer 2 total**: 28 tickets

---

### LAYER 3 — i18n for MenuScreen + Locale Completion (19 tickets)
> **Why separate**: MenuScreen has 54 tickets total. Doing its i18n first (before layout restructure) avoids conflict. Also complete Hindi translations.
> **Gate**: MenuScreen renders cleanly in both EN and HI + no leaked keys

#### 3A: MenuScreen i18n strings
| # | File(s) | What |
|---|---------|------|
| STG-172 | `MenuScreen.tsx` + `en.json` + `hi.json` | Replace 36 hardcoded English strings with t() |
| STG-173 | `MenuScreen.tsx:605` + `en.json` | Fix defaultValue fallback for viewDetails |
| STG-174 | `MenuScreen.tsx:243,656-658` + `en.json` | Fix positional fallback for printer keys |
| STG-177 | `MenuScreen.tsx:479` + `en.json` + `hi.json` | i18n "Sync" label |
| STG-180 | `MenuScreen.tsx:282-293` + `en.json` + `hi.json` | i18n Switch Staff alert |
| STG-184 | `MenuScreen.tsx:877,888` + `en.json` + `hi.json` | i18n WhatsApp support alerts |
| STG-185 | `MenuScreen.tsx:882-884` + `en.json` + `hi.json` | i18n WhatsApp pre-filled message |
| STG-188 | `MenuScreen.tsx:593-601` + `en.json` + `hi.json` | i18n Payment Modes labels |

#### 3B: MenuScreen jargon renames (i18n keys + screen labels)
| # | File(s) | What |
|---|---------|------|
| STG-154 | `MenuScreen.tsx:848-849` + `en.json` + `hi.json` | "BNPL Dues" → "Credit Purchases" |
| STG-155 | `MenuScreen.tsx:769-770` + `en.json` + `hi.json` | "Stock Inward" → "Add New Stock" |
| STG-158 | `MenuScreen.tsx:820-821` + `en.json` + `hi.json` | "Overdue Dues" → "Overdue Payments" |
| STG-193 | `MenuScreen.tsx:962` + `en.json` + `hi.json` | Replace "Z-Report" jargon |
| STG-194 | `MenuScreen.tsx:972` + `en.json` + `hi.json` | Simplify shift subtitle |
| STG-195 | `MenuScreen.tsx:828` + `en.json` + `hi.json` | "AI & Intelligence" → "Smart Insights" |
| STG-196 | `MenuScreen.tsx:837` | Simplify AI Insights subtitle |
| STG-197 | `MenuScreen.tsx:849` | Reword credit offers subtitle |

#### 3C: Hindi locale completion
| # | File(s) | What |
|---|---------|------|
| STG-054 | `hi.json` (full file) | Complete Hindi translations for all screens |
| STG-055 | `en.json` + `hi.json` | Add app version display string |
| STG-026 | `en.json` + `hi.json` | Add terms/privacy policy link strings |

**Layer 3 total**: 19 tickets

---

### LAYER 4 — Shared Components (19 tickets)
> **Why here**: SellTile, VoiceButton, SyncStatusWidget etc. are used by multiple screens. Fix them before redesigning screens that embed them.
> **Gate**: `pnpm -r typecheck` + component render tests pass
> **Loophole guards**: LH-013, LH-014

#### 4-PREREQ: GUARD Prerequisites (do FIRST within L4)
| # | File(s) | What | Guards |
|---|---------|------|--------|
| STG-484 | `CartItem.tsx` + `SupplierRow.tsx` | Refactor both components from static `import { theme }` to `useThemeColors()` hook. Also fix SupplierRow:120 `stockColor + "20"` opacity hack → use proper `{ backgroundColor: stockColor, opacity: 0.12 }`. | LH-013, LH-014 |

#### 4A: SellTile.tsx — Product Card Component (14 tickets)
> **Note**: STG-483 (formatPrice refactor) was done in Layer 1. SellTile now uses `formatMoney()`.
> **Merge order**: STG-009 (redesign) FIRST → then STG-068 (add "+" button) → then all others (independent)

| # | What | Order |
|---|------|-------|
| STG-009 | Redesign: full names, stock badges, thumbnails. **Verify**: SellTileProduct props include `brand` and `mrp` from API. If optional, handle gracefully. | **1st** |
| STG-228 | Add MRP strikethrough (`textDecorationLine: "line-through"`) when sell price < MRP | AFTER STG-009 |
| STG-032 | Add discount/MRP indicator. Show: ~~₹160~~ ₹145 | AFTER STG-228 |
| STG-068 | Add "+" tap affordance button for adding to bill | AFTER STG-009 |
| STG-013 | FEFO → "Expiring Soon" | independent |
| STG-018 | Add unit/weight context to prices | independent |
| STG-020 | Remove excess whitespace | independent |
| STG-027 | Explain or remove green grid icon | independent |
| STG-046 | Add expand chevron hint text | independent |
| STG-056 | Add haptic vibration + ripple on tap | independent |
| STG-222 | Smart formatting: drop ".00" (uses STG-117 from L1) | independent |
| STG-226 | "—" for null price → "Price not set" | independent |
| STG-227 | Fix IST timezone in expiry calculation | independent |
| STG-230 | Display brand name if available | AFTER STG-009 |

#### 4B: Other Shared Components
| # | File(s) | What | Guards |
|---|---------|------|--------|
| STG-012 | `VoiceButton.tsx` | Brand-color FAB, contextual label | — |
| STG-048 | `VoiceButton.tsx` | Fix FAB overlap with product cards | — |
| STG-292 | `LimitedModeBanner.tsx` | **LH-012**: Cover ALL 7 strings (BLOCKED_ACTIONS + ALLOWED_ACTIONS), not just 2. Move all to i18n. | LH-012 |
| STG-279 | `ErrorBoundary.tsx` | i18n error text (also in Layer 2 — do here if not done) | — |

**Layer 4 total**: 19 tickets (18 original + STG-484 GUARD)

---

### LAYER 5 — Screen Redesigns: Enrollment & Onboarding (22 tickets)
> **Why now**: EnrollDeviceScreen is the first screen users see. Fix it completely before moving to home/sell screens.
> **Gate**: Enrollment flow works end-to-end on device + no "Superadmin" text visible

#### 5A: EnrollDeviceScreen.tsx — Critical text fixes
| # | What |
|---|------|
| STG-057 | Rewrite all "superadmin" text to plain language |
| STG-200 | Replace email with WhatsApp link |
| STG-201 | Replace "Superadmin" in i18n status messages |
| STG-202 | Add tappable WhatsApp button in STORE_INACTIVE |
| STG-206 | Remove "superadmin account activation" text |
| STG-059 | Replace email with phone/WhatsApp for kirana |

#### 5B: EnrollDeviceScreen.tsx — UX improvements
| # | What |
|---|------|
| STG-004 | Branded redesign with trust signals |
| STG-019 | Keyboard UX: left-align, auto-focus |
| STG-023 | Simplify subtitle info text |
| STG-041 | Inline form validation |
| STG-042 | Fix "Counter-1" default label |
| STG-043 | Floating labels for input fields |
| STG-058 | Collapsible visual 3-step flow |
| STG-060 | Raw URL → tappable "Register Here" button |
| STG-061 | Fix center-aligned placeholder |
| STG-062 | Disabled state until valid code format |
| STG-063 | Welcome illustration |
| STG-064 | Friendly device model names |
| STG-065 | Step indicator "Step 1 of 2" |
| STG-072 | Remove hamburger menu pre-activation |
| STG-324 | Help text below activation code |
| STG-325 | Standardize to "Activate POS" |

#### 5C: Other Onboarding Screens
| # | File(s) | What |
|---|---------|------|
| STG-002 | `SplashScreen.tsx` + `app.json` + `styles.xml` | Fix cold-start blank screen |
| STG-310 | `SplashScreen.tsx` | "Continue without session" → "Continue Offline" |
| STG-305 | `DeviceBlockedScreen.tsx` | Replace "SuperAdmin"/"administrator" |
| STG-327 | `StaffLoginScreen.tsx` | Button countdown text |

**Layer 5 total**: 26 tickets (expanded from 22 with 5C)

---

### LAYER 6 — Screen Redesigns: Home, Header, Tabs (19 tickets)
> **Why now**: The home screen frame (header + tabs + sync) sets the visual language for all inner screens.
> **Gate**: Home screen renders cleanly, all tabs navigate, sync states correct

#### 6A: PosStatusBar.tsx — Header Icons
| # | What |
|---|------|
| STG-005 | Declutter status icons, reduce count |
| STG-017 | Add staff name/role display |
| STG-022 | Enlarge logo pill badge |
| STG-036 | Add date/time display |
| STG-045 | Increase "Ready for billing" text size |
| STG-049 | Add label/tooltip to camera icon |
| STG-052 | Handle store name truncation |
| STG-067 | Add labels to Wi-Fi/printer/scanner/camera |

#### 6B: PosRootLayout.tsx — Tab Bar
| # | What |
|---|------|
| STG-007 | Full labels, consistent colors, active states |
| STG-014 | Hide DEV MODE banner in production |
| STG-069 | Unify 5 tab visual treatments |
| STG-070 | Smooth gradient header-to-body transition |
| STG-245 | "REORDER • ON/OFF" → stable label + badge |
| STG-246 | Hide disabled CREDIT tab or "Coming Soon" |

#### 6C: SyncStatusWidget.tsx
| # | What |
|---|------|
| STG-006 | Collapse when healthy, reduce footprint |
| STG-010 | Brand illustrations, plain-language tabs |
| STG-021 | Tab count badges, last-sync timestamp |
| STG-071 | Connect checkmark with "15s ago" visually |

#### 6D: Home Dashboard
| # | What |
|---|------|
| STG-051 | Add "Bills today" + "Sales total" on home |
| STG-152 | Move Today's Sales summary to home screen |

**Layer 6 total**: 19 tickets (with 6D)

---

### LAYER 7 — Screen Redesigns: SELL Flow (59 tickets)
> **Why now**: The SELL tab is the primary revenue flow. Depends on SellTile (Layer 4) and theme (Layer 1).
> **Gate**: Full sell flow works: search → add to cart → discount → checkout
> **Loophole guards**: LH-015, LH-016

#### 7-PREREQ: Mandatory Prerequisites
| # | What | Guards |
|---|------|--------|
| STG-487 | GUARD: Backend staff role + max discount API | LH-015 |
| STG-488 | GUARD: Backend manager PIN verification endpoint | LH-015 |

> **RULE**: STG-487 + STG-488 MUST be merged BEFORE STG-102 (7D). Without these endpoints, the discount limit feature is dead code.

#### 7A: SellScanScreen — Search & Product Grid
| # | What |
|---|------|
| STG-008 | Unify search input with visual hierarchy |
| STG-015 | Unify list vs thumbnail card layouts |
| STG-028 | Add section headers for product grouping |
| STG-029 | Add manual "Add Product" button |
| STG-033 | Favorites/frequently sold section |
| STG-035 | Empty state for zero-product store |
| STG-047 | Fix empty space in horizontal row |
| STG-050 | Pull-to-refresh indicator |
| STG-074 | Unify search + barcode input styles |
| STG-075 | Loading skeleton placeholder |
| STG-220 | Reduce CART_SHEET_COLLAPSED_RATIO |
| STG-223 | Empty state for zero search results |
| STG-225 | Dynamic NUM_COLUMNS from screen width |

#### 7B: SellScanScreen — Scan & Barcode Logic (STRICT ORDER)
> **Merge order** (LH-016 related): STG-331 → STG-332 → STG-333..342 (331 removes the barcode field, 332 updates placeholder, rest build on unified input)

| # | What | Merge Order |
|---|------|-------------|
| STG-331 | Remove separate barcode field, unify into search | 1st |
| STG-332 | Search placeholder indicates barcode support | 2nd |
| STG-333 | 300ms debounce too slow for barcode | 3+ |
| STG-334 | Barcode heuristic too broad (matches phones) | 3+ |
| STG-335 | Duplicate scan 2000ms window too strict | 3+ |
| STG-336 | Scan storm detection — add user feedback | 3+ |
| STG-337 | Intermediate prefixes cause search flicker | 3+ |
| STG-338 | Unknown barcode modal lacks guidance | 3+ |
| STG-339 | LOOSE_BULK variant picker gated | 3+ |
| STG-340 | Price error silently blocks checkout | 3+ |
| STG-341 | DEMO_CATEGORIES — no dynamic loading | 3+ |
| STG-342 | Category selection doesn't filter products | 3+ |

#### 7C: SellScanScreen — Cart Bottom Sheet (UX) (STRICT ORDER)
> **Merge order** (LH-016): STG-094 → STG-126 → STG-095 (clear button first, then define [-] at qty=1, then trash icon — three removal paths must not conflict)

| # | What | Merge Order |
|---|------|-------------|
| STG-094 | Clear button confirmation dialog | 1st |
| STG-126 | Define [-] at qty=1 behavior | 2nd |
| STG-095 | Trash icon confirmation/undo | 3rd |
| STG-096 | Stepper button tap targets → 48px | any |
| STG-097 | Tappable quantity for direct input | any |
| STG-099 | Clarify edit icon purpose | any |
| STG-100 | Label unit price vs line total | any |
| STG-105 | Item count header | any |
| STG-106 | Discount %/Flat toggle styling | any |
| STG-109 | Item count on Checkout button | any |
| STG-129 | Long product name truncation | any |
| STG-132 | Hide Subtotal when equals Total | any |
| STG-133 | Dynamic sheet height | any |
| STG-135 | KeyboardAvoidingView for discount | any |
| STG-137 | Stock level styling (green/amber/red) | any |
| STG-140 | Collapse discount section by default | any |

#### 7D: SellScanScreen — Cart Business Logic (PREREQUISITES REQUIRED)
> **LH-015**: STG-102 REQUIRES STG-487 (staff role API) + STG-488 (manager PIN endpoint) from 7-PREREQ

| # | What | Depends-On |
|---|------|------------|
| STG-102 | Max discount limit + manager approval | STG-487, STG-488 |
| STG-127 | Stock validation cap on qty | — |
| STG-130 | Live discount preview | STG-102 |
| STG-370 | Cart add persistence not awaited | — |
| STG-399 | Price edit in cart not persisted separately | — |
| STG-400 | Quantity input validation for large numbers | — |

#### 7E: SellScanScreen — Cart Enhancements (Lower Priority)
| # | What |
|---|------|
| STG-098 | "Add more items" link |
| STG-101 | GST/tax line |
| STG-103 | Customer name/phone field |
| STG-107 | Product thumbnail in cart items |
| STG-108 | Fill empty space with guidance |
| STG-110 | Per-item discount |
| STG-111 | "You save ₹X" line |
| STG-112 | Notes/memo field |
| STG-128 | Batch/expiry info in cart |
| STG-131 | "Frequently bought together" suggestions |
| STG-134 | Swipe-to-delete gesture |
| STG-138 | Separate unit/weight from name |
| STG-141 | Price animation on Checkout |

#### 7F: Sell — Search Results & Tiles
| # | What |
|---|------|
| STG-349 | Search results: use SellTile (brand, image, pack) |
| STG-350 | Autocomplete: add price + stock to suggestions |
| STG-356 | SellTile brand truncation fix |
| STG-357 | Expiry badge overlap on small screens |
| STG-368 | Product tile tap feedback |
| STG-369 | VariantPickerModal: add images, stock, price |

#### 7G: Sell — HID Scanner
| # | What |
|---|------|
| STG-371 | Scanner timing parameters hardcoded |
| STG-372 | Buffer not reset on mount/unmount |

**Layer 7 total**: 59 tickets + 2 GUARD prereqs (STG-487, STG-488)

---

### LAYER 8 — Screen Redesigns: Payment Flow (45 tickets)
> **Why after SELL**: Payment screen receives cart data from SELL flow. Test end-to-end.
> **Gate**: Cash payment works, UPI QR works, receipt generated, all amounts in lakh format
> **Loophole guards**: LH-017, LH-018, LH-019, LH-020, LH-021

#### 8-PREREQ: Mandatory Prerequisites
| # | What | Guards |
|---|------|--------|
| STG-489 | GUARD: Backend void/refund sale endpoint | LH-018 |

> **RULE**: STG-489 MUST be merged BEFORE STG-383 (8D). STG-492 (PENDING_UPI_KEY write-before-checkout) is in Layer 0 — must already be done before Layer 8 starts.

#### 8A: PaymentScreen — Critical Fixes (STRICT ORDER)
> **Merge order** (LH-020): STG-087 → STG-080 → STG-123 (layout restructure first, then cash input in new layout, then move amount — mutually dependent on screen positioning)
> **LH-019**: STG-377 must also patch `renderModeTab` callers to pass `disabled={submitting}` — the prop exists but is never passed during `submitting` state

| # | What | Merge Order | Guards |
|---|------|-------------|--------|
| STG-087 | Fill empty space with order summary | 1st | LH-020 |
| STG-080 | Cash amount input + change calculation | 2nd | LH-020 |
| STG-123 | Move amount to top | 3rd | LH-020 |
| STG-077 | Show specific failure reason | any | — |
| STG-078 | Explain greyed-out "Complete Payment" | any | — |
| STG-079 | Resolve competing retry mechanisms | any | — |
| STG-083 | Back button to return to cart | any | — |
| STG-090 | Spinner + processing state + double-tap prevention | any | — |
| STG-113 | Show bill/invoice number | any | — |
| STG-212 | Replace "Superadmin" references | any | — |
| STG-377 | Lock payment method tabs during transaction | any | LH-019 |
| STG-379 | Offline payment fallback messaging | any | — |
| STG-381 | PENDING_UPI_KEY for crash recovery | any | Depends: STG-492 (L0) |
| STG-401 | Cart-to-payment data consistency validation | any | — |

#### 8B: PaymentScreen — UPI & QR (STRICT ORDER)
> **Merge order**: STG-084 → STG-214 → STG-378 (complete UPI flow first, then regenerate QR, then fix expiry countdown — each builds on the previous)

| # | What | Merge Order |
|---|------|-------------|
| STG-084 | Complete UPI flow: QR, verification, polling | 1st |
| STG-214 | "Regenerate QR" button on expiry | 2nd |
| STG-378 | QR expiry countdown reaches 0:00 but stays | 3rd |
| STG-211 | Separate UPI ID vs QR errors | any |
| STG-218 | Remove raw paymentId hash | any |
| STG-219 | Standardize UPI alert styles | any |
| STG-404 | UPI polling status visible during wait | any |

#### 8C: PaymentScreen — UI Polish
| # | What |
|---|------|
| STG-081 | Cart/order summary visible |
| STG-082 | Customer selection for credit/due |
| STG-086 | Remove/redesign "Cart locked" badge |
| STG-088 | GST/tax breakup display |
| STG-089 | Fix disabled button WCAG contrast |
| STG-091 | Dynamic instruction text per method |
| STG-093 | Replace cash icon with banknote/₹ |
| STG-118 | Retry button red → blue |
| STG-119 | Error dismiss X + auto-dismiss |
| STG-120 | Staff name/ID for audit |
| STG-121 | "Due" icon: calendar → credit |
| STG-209 | TouchableOpacity → Pressable |
| STG-210 | i18n all alert strings |
| STG-213 | Spinner overlay for "Payment in Progress" |
| STG-216 | Rewrite "Price Freshness Warning" |
| STG-217 | Show specific error type |
| STG-380 | Cart lock timeout explanation |

#### 8D: PaymentScreen — Feature Additions (PREREQUISITES REQUIRED)
> **LH-018**: STG-383 REQUIRES STG-489 (backend void/refund endpoint) from 8-PREREQ
> **LH-021**: STG-085 (split payment) and STG-125 (partial payment) are DIFFERENT features — STG-085 = one bill paid by two methods simultaneously, STG-125 = customer pays part now and rest is DUE. Clarify DUE overlap with credit system (Layer 15).

| # | What | Depends-On |
|---|------|------------|
| STG-085 | Split payment support (cash + UPI) | — |
| STG-092 | Receipt preview before completing | — |
| STG-114 | Cancel/Void transaction button | — |
| STG-115 | Card, Wallet payment method tabs | — |
| STG-122 | Confirmation dialog for ₹5,000+ | — |
| STG-124 | Sound/vibration feedback | — |
| STG-125 | Partial payment tracking | — (NOTE: LH-021 — distinct from STG-085) |
| STG-382 | Split payment UTR shown too late | STG-085 |
| STG-383 | Post-payment refund/void mechanism | STG-489 (LH-018) |
| STG-384 | Item vs cart discount on receipt | — |
| STG-405 | Discount undo | — |
| STG-406 | Offline receipt OFF- prefix consistency | — |

#### 8E: PaymentSetupScreen
| # | What |
|---|------|
| STG-280 | "UPI ID (VPA)" → plain language |
| STG-314 | Success toast after save |
| STG-254 | Indian lakh formatting everywhere |

**Layer 8 total**: 45 tickets + 1 GUARD prereq (STG-489)

---

### LAYER 9 — Screen Redesigns: MenuScreen (38 tickets)
> **Why here**: MenuScreen is navigation hub. i18n done in Layer 3. Now do layout, UX, features.
> **Gate**: All menu items navigate correctly, system status collapsible, no jargon visible

#### 9A: MenuScreen — Layout & Structure
| # | What |
|---|------|
| STG-159 | Restructure: collapsible sections, search, usage ordering |
| STG-148 | Make System Status collapsible |
| STG-157 | Merge "Customers" + "Customer Management" |
| STG-247 | Consolidate customer section to 2 items max |
| STG-162 | Remove redundant logo pill + "Menu" title |
| STG-169 | Add search bar at top |
| STG-256 | Swipe/tap to collapse System Status |
| STG-250 | Move Switch Store to "Danger Zone" |

#### 9B: MenuScreen — Data Display
| # | What |
|---|------|
| STG-146 | Device label instead of UUID |
| STG-147 | toTitleCase() store name |
| STG-149 | Comparison period label, hide % at 0 base |
| STG-150 | Fix empty Payment Modes section |
| STG-151 | Labels above metric values |
| STG-164 | display_name instead of username |
| STG-171 | Visual hierarchy: hero metric bigger |
| STG-179 | App version instead of raw SHA |
| STG-181 | Pass action param to SalesHistory navigation |
| STG-187 | Cap trend at 999%+ |

#### 9C: MenuScreen — Styling & UX
| # | What |
|---|------|
| STG-160 | Standardize icon colors |
| STG-163 | Reduce card spacing |
| STG-175 | Add android_ripple to Pressables |
| STG-176 | Increase header paddingVertical |
| STG-182 | Haptic feedback on press |
| STG-183 | Fix sectionHeader margin asymmetry |
| STG-186 | trendText fontSize 9 → 11+ |
| STG-190 | Skeleton/shimmer loading state |
| STG-191 | Border on statusBadge |
| STG-192 | menuIcon 36 → 40px |
| STG-198 | Content padding for visual distinction |
| STG-199 | Scroll indicator |
| STG-248 | Fix marginTop inconsistency |
| STG-249 | Wrap printerStatusRow in card |
| STG-255 | Differentiate summaryCard vs statusPanel |

#### 9D: MenuScreen — Feature Additions
| # | What |
|---|------|
| STG-153 | Subtitles for Reprint/Download/Share |
| STG-156 | Replace "?" icon with inventory icon |
| STG-161 | Notification count badges |
| STG-165 | Hindi toggle "हि" → "हिंदी" |
| STG-166 | Replace "Re-enroll" jargon |
| STG-167 | About section: version + terms + privacy |
| STG-168 | Logout/End Session option |
| STG-170 | Replace "tiered" jargon |
| STG-251 | Pending badge on Daily Closing |
| STG-252 | Unread count badge on Chat |

**Layer 9 total**: 38 tickets

---

### LAYER 10 — Screen Redesigns: Secondary Screens (32 tickets)
> **Why now**: These screens are accessed from Menu. Depends on theme (L1), i18n (L2), menu navigation (L9).
> **Gate**: Each screen renders correctly in both EN/HI, no jargon, all actions work

#### 10A: Sales & Reporting Screens
| # | File(s) | What |
|---|---------|------|
| STG-282 | `SalesStatementScreen.tsx` | "Inventory Cost Statement" → "Stock Value Report" |
| STG-306 | `DailyReportScreen.tsx` | Actionable empty state |
| STG-307 | `BillDetailScreen.tsx` | Spinner on print/share buttons |
| STG-312 | `DailyReportScreen.tsx` + `DailyClosingScreen.tsx` | Offline/sync banner |
| STG-281 | `DailyClosingScreen.tsx` | "Variance" → "Difference" |

#### 10B: Stock & Inventory Screens
| # | File(s) | What |
|---|---------|------|
| STG-285 | `GRNScreen.tsx` | Subtitle below "Receive Goods" |
| STG-286 | `OpeningStockScreen.tsx` | Subtitle below "Opening Stock" |
| STG-308 | `InwardScreen.tsx` | Raw product ID → product name |
| STG-385 | `SellScanScreen.tsx` | Standalone stock adjustment modal |
| STG-386 | `SellScanScreen.tsx` | Stock limit notification explanation |

#### 10C: Customer & Khata Screens
| # | File(s) | What |
|---|---------|------|
| STG-304 | `CustomerListScreen.tsx` + `CustomerManagementScreen.tsx` | Email → WhatsApp primary |
| STG-318 | `KhataScreen.tsx` | "Add Credit" red → blue |
| STG-320 | `OverdueDuesScreen.tsx` | "Due Soon" info → warning color |
| STG-469 | `KhataScreen.tsx` + backend | Phone number validation |
| STG-470 | `KhataScreen.tsx` + backend | Clarify DEBIT vs PAYMENT |
| STG-471 | `KhataScreen.tsx` + backend | Entry correction/void mechanism |

#### 10D: Order & Return Screens
| # | File(s) | What |
|---|---------|------|
| STG-289 | `ReturnScreen.tsx` | "UPI (Manual)" → "UPI Transfer" |
| STG-301 | `OrderDetailScreen.tsx` | Color+text for status (colorblind) |
| STG-309 | `ReturnScreen.tsx` | Raw refundId → "Return #[ref]" |

#### 10E: Shift & Daily Closing
| # | File(s) | What |
|---|---------|------|
| STG-288 | `ShiftScreen.tsx` | "Variance" → "Cash Difference" |

#### 10F: Chat, Help, Misc Screens
| # | File(s) | What |
|---|---------|------|
| STG-290 | `AIInsightsScreen.tsx` | Tab labels: Slow → Slow Moving, etc. |
| STG-302 | `HelpScreen.tsx` | Email-first → WhatsApp-first |
| STG-303 | `BnplDuesScreen.tsx` | Add WhatsApp to "contacted via email" |
| STG-311 | `AIInsightsScreen.tsx` | "Not yet available" → actionable text |
| STG-321 | `ChatListScreen.tsx` | "No messages yet" → actionable empty |
| STG-322 | `ChatListScreen.tsx` | 24h → AM/PM time format |
| STG-323 | `ForceUpdateScreen.tsx` | "iOS update coming soon" fix |
| STG-328 | `ForceUpdateScreen.tsx` | "unknown" version → "check failed" |
| STG-329 | `ProductDetailModal.tsx` | "No suppliers" → actionable guidance |

#### 10G: Jargon & Help Text
| # | File(s) | What |
|---|---------|------|
| STG-283 | `BnplDuesScreen.tsx` | Inline help for BNPL/UTR/UPI |
| STG-284 | `CreditScreen.tsx` | Help text for PAN/KYC/Aadhaar/EMI |
| STG-287 | `BuyScreen.tsx` | "BNPL" badge → "Pay Later" + tooltip |

**Layer 10 total**: 32 tickets

---

### LAYER 11 — Cross-Cutting Audits: Font Size, Accessibility, Consistency (19 tickets)
> **Why last for UI**: These sweep across ALL screens. Must run after screen redesigns to avoid double-work.
> **Gate**: No fontSize < 12px body text + all interactive elements have accessibilityLabel + WCAG AA contrast

#### 11A: Font Size Audit (minimum 12px body text)
| # | Screens Affected |
|---|-----------------|
| STG-293 | PurchaseScreen, InwardScreen, OpeningStockScreen, GRNScreen, StockStatementScreen |
| PARKED (c1fcf613, stg-293-2026-03-14) | SalesHistoryScreen, DailyClosingScreen, DailyReportScreen, BillDetailScreen, SalesStatementScreen |
| STG-295 | CreditScreen, CustomerListScreen, CustomerManagementScreen, OrderDetailScreen, BnplDuesScreen, OverdueDuesScreen, KhataScreen |
| PARKED (c13cb749, stg-295-2026-03-14) | ChatListScreen, ForceUpdateScreen, TabBadge.tsx |
| STG-297 | SplitPaymentModal: fontSize 10→12 + accessibilityLabel |

#### 11B: Accessibility Labels
| PARKED (cafe6184, stg-297-2026-03-14) | Scope |
|---|-------|
| STG-053 | WCAG AA contrast audit across all buttons and text |
| STG-298 | Icon-only buttons: PaymentScreen, MenuScreen, SellScanScreen, BuyScreen |
| PARKED (3cc0e075, stg-298-2026-03-14) | TextInput labels: PaymentSetupScreen, KhataScreen, ShiftScreen, CustomerListScreen, OpeningStockScreen |
| STG-300 | GRN checkboxes: add accessibilityState + accessibilityRole |

#### 11C: Consistency Fixes
| PARKED (09c6a351, stg-300-2026-03-14) | Scope |
|---|-------|
| STG-209 | PaymentScreen: TouchableOpacity → Pressable |
| STG-316 | SplitPaymentModal: TouchableOpacity → Pressable |
| STG-317 | Standardize disabled button opacity across app |
| STG-319 | Modal button styling: EditReorderModal, EditPolicyModal, DismissReasonModal |
| STG-313 | Network error messages + recovery guidance across screens |

#### 11D: Remaining UX Micro-Fixes
| # | What |
|---|------|
| STG-215 | PaymentScreen: configurable PRICE_FRESHNESS_THRESHOLD_MS |
| STG-221 | SellScanScreen: validate SMALL_SCREEN_WIDTH=400 |
| STG-229 | SellTile: i18n "per KG" label |
| STG-330 | DismissReasonModal: English display → i18n codes |

**Layer 11 total**: 19 tickets

---

### LAYER 12 — PURCHASE Flow (17 tickets)
> **Why here**: PURCHASE (BUY) flow is the second revenue stream. Depends on theme, shared components.
> **Gate**: Full buy flow: search → select supplier → add to cart → checkout

| # | File(s) | What |
|---|---------|------|
| STG-343 | `BuyScreen.tsx` | Search bar: add barcode lookup |
| STG-344 | `BuyScreen.tsx` | Debounce 400ms → 200ms |
| STG-345 | `BuyScreen.tsx` | Search autocomplete/suggestions |
| STG-346 | `BuyScreen.tsx` | Stock filter pagination fix |
| STG-347 | `PurchaseScreen.tsx` | Quick purchase: empty metadata fix |
| STG-348 | `BuyScreen.tsx` | Barcode lookup loading state |
| STG-351 | `BuyScreen.tsx` | Supplier name visible in grid card |
| STG-352 | `PurchaseScreen.tsx` | MOV shown before checkout |
| STG-353 | `PurchaseScreen.tsx` | MOQ font 11px → 12px+ |
| STG-354 | `PurchaseScreen.tsx` | "Cost" label → "Purchase Price" |
| STG-355 | `PurchaseScreen.tsx` | Variant/pack size fallback |
| STG-358 | `ProductDetailModal.tsx` | Supplier comparison table |
| STG-359 | `PurchaseScreen.tsx` | Expiry/batch info for incoming |
| STG-407 | `PurchaseScreen.tsx` | BNPL badge with terms |
| STG-408 | `PurchaseScreen.tsx` | Cart badge multi-supplier clarification |
| STG-315 | `ReorderScreen.tsx` | Confirmation before dismissing suggestion |
| STG-442 | `DismissReasonModal.tsx` | Reason codes as i18n not translated strings |

**Layer 12 total**: 17 tickets

---

### LAYER 13 — VOICE Flow (10 tickets)
> **Why here**: Voice is an overlay on SELL. Needs SELL flow working first.
> **Gate**: Voice command → product found → added to cart

| # | File(s) | What |
|---|---------|------|
| STG-360 | `VoiceScreen/` | Confirmation before auto-executing commands |
| STG-362 | `VoiceScreen/` | Locale toggle wired to backend STT |
| STG-363 | `VoiceScreen/` | NEEDS_CLARIFICATION → picker UI |
| STG-364 | `VoiceScreen/` | Visual confidence score / match feedback |
| STG-365 | `VoiceScreen/` | Mic permission guidance when denied |
| STG-366 | `VoiceScreen/` | API timeout handling |
| STG-409 | `VoiceScreen/` | Recording duration countdown |
| STG-410 | `VoiceScreen/` | Rate limit 429 → retry-after guidance |
| STG-411 | E2E tests | Voice flow E2E test coverage |
| STG-374 | `SellScanScreen.tsx` | Cart item limit for performance |

**Layer 13 total**: 10 tickets

---

### LAYER 14 — REORDER System (28 tickets)
> **Why here**: Backend-heavy. Depends on PURCHASE flow (Layer 12) for PO submission.
> **Gate**: Reorder suggestion generated → approved → PO created → GRN received → reorder fulfilled
> **Loophole guards**: LH-022, LH-023, LH-024

#### 14-PREREQ: Mandatory Prerequisites
| # | What | Guards |
|---|------|--------|
| STG-491 | GUARD: Backend reorder PO submission endpoint | LH-022 |

> **RULE**: STG-491 MUST be merged BEFORE STG-421 (14A). Without the PO submission endpoint, approved reorders create draft POs that never reach suppliers — silent data loss.

#### 14A: Backend — Core Reorder Pipeline (STRICT ORDER)
> **LH-022**: STG-421 REQUIRES STG-491 — the PO submission endpoint must exist before the approved→PO flow is wired
> **LH-023**: STG-413 (EditReorderModal qty edits) calls a non-existent PATCH API — implement the backend PATCH endpoint WITHIN STG-413 or as a sub-task, or edits are silently lost
> **LH-024**: STG-423 (supplier mapping) currently ignores MOQ — only sorts by price. Implementation MUST include MOQ filtering before price sort, or suppliers with unmet MOQ will receive impossible orders

| # | What | Depends-On | Guards |
|---|------|------------|--------|
| STG-491 | GUARD: Backend reorder PO submission endpoint | — | LH-022 |
| STG-423 | Dynamic supplier mapping algorithm | — | LH-024 (must include MOQ) |
| STG-420 | Quantity optimization (EOQ/MOQ) | — | — |
| STG-421 | Approved reorders → PO submission | STG-491 | LH-022 |
| STG-417 | Expiry cleanup job for pending reorders | — | — |
| STG-419 | Auto-approve threshold logic | — | — |
| STG-422 | GRN auto-close marks reorders fulfilled | STG-421 | — |
| STG-426 | Payment terms from backend (remove dead code) | — | — |
| STG-428 | Partial approval failure feedback | — | — |
| STG-438 | Policy validation server-side | — | — |
| STG-443 | Dismissal reason max length validation | — | — |

#### 14B: Frontend — Reorder UX
> **LH-023**: STG-413 MUST implement or depend on a backend PATCH endpoint for quantity edits — without it, `EditReorderModal` saves locally but edits are silently lost on refresh

| # | What | Depends-On | Guards |
|---|------|------------|--------|
| STG-413 | Quantity edits persisted to DB | — | LH-023 (needs PATCH API) |
| STG-412 | Manual quick-reorder from history | — | — |
| STG-414 | Reorder history/audit trail on POS | — | — |
| STG-415 | Staleness detection for pending reorders | — | — |
| STG-416 | Expired reorder re-trigger option | — | — |
| STG-424 | Supplier picker pack variants | — | — |
| STG-425 | Supplier picker original supplier fallback | — | — |
| STG-427 | Approval response includes supplier names | — | — |
| STG-429 | Empty state when auto-reorder off | — | — |
| STG-430 | Selection bar layout shift fix | — | — |
| STG-431 | EditReorderModal original qty reference | STG-413 | — |
| STG-432 | Supplier load error shown early | — | — |
| STG-433 | maxReorderQty in policy list | — | — |
| STG-434 | Threshold visual guide fix | — | — |
| STG-436 | minStock/minThreshold naming fix | — | — |
| STG-437 | Stock threshold frontend/backend alignment | — | — |
| STG-439 | Cron visibility / manual trigger | — | — |
| STG-440 | Bulk policy management | — | — |

#### 14C: Reorder — Polish
| # | What |
|---|------|
| STG-435 | Cache catalog supplier data |
| STG-441 | Filter labels in ReorderPoliciesScreen i18n |
| STG-444 | Accessibility labels on reorder elements |
| STG-445 | formatMoney null safety |
| STG-446 | Unit tests for reorder helpers |
| STG-447 | Enable idempotency framework |

**Layer 14 total**: 28 tickets + 1 GUARD prereq (STG-491)

---

### LAYER 15 — CREDIT & BNPL System (24 tickets)
> **Why last feature layer**: Credit is gated (`false`). Heavy backend + compliance. Can be deferred post-go-live.
> **Gate**: Credit gate → `true`, scoring → offer → KYC → approval → disbursement → repayment
> **Loophole guards**: LH-025, LH-026, LH-027, LH-028, LH-029

#### 15-PREREQ: Mandatory Prerequisites
| # | What | Guards |
|---|------|--------|
| STG-490 | GUARD: Backend credit disbursement endpoint | LH-025 |

> **RULE**: STG-490 MUST be merged BEFORE STG-451 (15A). Without the disbursement endpoint, approved credit applications are stuck forever — no funds reach the retailer.
> **LH-029**: Missing tables `credit_disbursements`, `kyc_document_storage`, `overdue_notifications`, `consent_records`. These MUST be created as migrations BEFORE any 15A ticket that writes to them. STG-485 (consent_records, Layer 0) handles one; the rest need migrations within this layer.

#### 15A: Backend — Credit Infrastructure (STRICT ORDER)
> **LH-027**: STG-448 — feature gate is hardcoded `false` in BOTH frontend (`CreditScreen.tsx`) AND backend (`credit.routes.ts`). Implementation MUST use a SINGLE source of truth: backend config endpoint that frontend reads. Do NOT just flip both to `true`.
> **LH-025**: STG-451 REQUIRES STG-490 — the disbursement endpoint skeleton must exist before wiring the approval→disbursement flow
> **LH-029**: Create migrations for `credit_disbursements`, `kyc_document_storage`, `overdue_notifications` BEFORE tickets that reference them

| # | What | Depends-On | Guards |
|---|------|------------|--------|
| STG-490 | GUARD: Backend credit disbursement endpoint | — | LH-025 |
| STG-448 | Remove feature gate hardcoded `false` | — | LH-027 (single source!) |
| STG-449 | Production-grade credit scoring algorithm | STG-448 | — |
| STG-450 | Credit score tiers → config/DB | STG-449 | — |
| STG-451 | Credit disbursement endpoint | STG-490 | LH-025 |
| STG-452 | Real KYC verification (not format-only) | — | LH-029 (needs kyc_document_storage table) |
| STG-453 | KYC document upload endpoint | STG-452 | LH-029 |
| STG-454 | Credit offer expiry cleanup job | STG-448 | — |
| STG-455 | External credit provider integration | STG-451 | — |
| STG-456 | Provider failure → surface error, not hide | STG-455 | — |
| STG-458 | Re-eligibility check at application time | STG-449 | — |
| STG-475 | Rate limiting on credit offer generation | STG-448 | — |
| STG-476 | Composite index on bnpl_drawdowns | — | — |

#### 15B: Backend — BNPL (CRITICAL GUARDS)
> **LH-026**: STG-462 — interest formula is flat (`principal * rate / 100`), NOT prorated by tenure days. Implementation MUST use `principal * rate / 100 * (days / 365)` or equivalent daily proration. The current flat formula overcharges short tenures and undercharges long ones.
> **LH-028**: STG-467 — overdue maturation functions exist in code but NO scheduler calls them. Implementation MUST wire the maturation check to a cron job or Cloud Scheduler, not just define the function.

| # | What | Depends-On | Guards |
|---|------|------------|--------|
| STG-462 | Interest proration by tenure days | — | LH-026 (MUST be daily proration!) |
| STG-465 | Per-supplier drawdown limit | — | — |
| STG-466 | Payment status polling race condition | — | — |
| STG-467 | Overdue maturation scheduler | — | LH-028 (must wire to cron!) |
| STG-468 | Max days configurable per store type | — | — |

#### 15C: Frontend — Credit & BNPL UX
| # | What |
|---|------|
| STG-459 | Application status timeline UI |
| STG-460 | PaymentOptionsSheet cost details |
| STG-461 | CreditScreen component extraction |
| STG-463 | Overdue visual hierarchy in BnplDuesScreen |
| STG-464 | Dispute audit trail / status history |
| STG-472 | Khata bulk actions |
| STG-478 | BnplDuesScreen component extraction |

#### 15D: Credit — Low Priority
| # | What |
|---|------|
| STG-477 | Hardcoded ₹ → locale-aware currency |
| STG-480 | Early repayment incentive / standing instructions |

**Layer 15 total**: 24 tickets + 1 GUARD prereq (STG-490)

---

### LAYER 16 — Sync, Offline, Device & Layout (17 tickets)
> **Why here**: Infrastructure-level improvements. Test after all features stable.
> **Gate**: Offline checkout → queue → sync on reconnect → no data loss

| # | Category | What |
|---|----------|------|
| STG-387 | SYNC | Push-based stock sync (replace 5min polling) |
| STG-388 | SYNC | Stock sync conflict → user choice (not silent server-wins) |
| STG-389 | OFFLINE | 24h queue expiry warning before loss |
| STG-390 | OFFLINE | Price cache refresh on reconnect |
| STG-391 | OFFLINE | Post-checkout sync confirmation |
| STG-392 | OFFLINE | SQLite corruption recovery |
| STG-393 | DEVICE | Device type detection (POS/phone/tablet) |
| STG-394 | DEVICE | Touch target min size on small phones |
| STG-395 | LAYOUT | Responsive NUM_COLUMNS for tablets |
| STG-396 | LAYOUT | Cart sheet snap points for tablets |
| STG-397 | LAYOUT | Safe area handling for notched phones |
| STG-398 | LAYOUT | Modal max-width on tablets |
| STG-373 | SELL | Cart sheet covers 55-75% on small devices |
| STG-375 | SELL | Cart item removal undo countdown |
| STG-376 | SELL | Cart hold/park for multi-customer |
| STG-402 | SELL | Search history expiration |
| STG-403 | SELL | Cart bar animation on slow devices |

**Layer 16 total**: 17 tickets

---

### LAYER 17 — Nice-to-Have & P3 Polish (14 tickets)
> **Do last**: These are delightful but non-blocking.

| # | What |
|---|------|
| STG-034 | Recent bills shortcut (last 5) |
| STG-037 | Customer name/phone before billing |
| STG-030 | CREDIT tab: explain greyed-out state |
| STG-104 | Hold/Park Bill feature |
| STG-136 | Share cart via WhatsApp |
| STG-139 | Return/exchange negative line items |
| STG-016 | Floating total bar when items added |
| STG-031 | Quick +/- buttons for bulk adds |
| STG-024 | QR scan button camera integration |
| STG-025 | Support phone on activation + error |
| STG-039 | Printing mode: removed — ticket invalid |
| STG-040 | Chip layout: removed — ticket invalid |
| STG-038 | Device type: covered by STG-203 |
| STG-066 | Unify enrollment: single screen (already is) |

**Layer 17 total**: 14 tickets

---

### LAYER 18 — E2E Tests & Regression Guards (3 tickets)
> **Final layer**: Write tests that validate the full system after all features.

| # | What |
|---|------|
| STG-411 | Voice flow E2E tests |
| STG-479 | Reorder + Credit full lifecycle E2E |
| STG-446 | Unit tests for reorder helper functions |

**Layer 18 total**: 3 tickets

---

### Layer Summary

| Layer | Theme | Tickets | GUARD Prereqs | Cumulative |
|-------|-------|---------|---------------|------------|
| L0 | Security & P0 bugs | 17 | 3 (STG-485, 486, 492) | 17 |
| L1 | Foundation: theme, utils, i18n keys | 14 | 1 (STG-483) | 31 |
| L2 | i18n: hardcoded string replacement | 30 | 2 (STG-481, 482) | 61 |
| L3 | i18n: MenuScreen + Hindi completion | 19 | — | 80 |
| L4 | Shared components (SellTile, etc.) | 19 | 1 (STG-484) | 99 |
| L5 | Enrollment & onboarding screens | 26 | — | 125 |
| L6 | Home, header, tabs | 19 | — | 144 |
| L7 | SELL flow (search, cart, scan) | 61 | 2 (STG-487, 488) | 205 |
| L8 | Payment flow | 46 | 1 (STG-489) | 251 |
| L9 | MenuScreen redesign | 38 | — | 289 |
| L10 | Secondary screens | 32 | — | 321 |
| L11 | Cross-cutting audits | 19 | — | 340 |
| L12 | PURCHASE flow | 17 | — | 357 |
| L13 | VOICE flow | 10 | — | 367 |
| L14 | REORDER system | 29 | 1 (STG-491) | 396 |
| L15 | CREDIT & BNPL system | 25 | 1 (STG-490) | 421 |
| L16 | Sync, offline, device, layout | 17 | — | 438 |
| L17 | Nice-to-have & P3 polish | 14 | — | 452 |
| L18 | E2E tests & guards | 3 | — | 455 |

> **Note**: 492 total tickets. 455 unique layer assignments. Difference: 37 tickets appear in multiple layers (implement once, skip in later layer). STG-001 (DONE) excluded from counts. STG-038/039/040/066 marked as invalid/covered in L17. 12 GUARD tickets (STG-481–492) are counted in their respective layer prereq sections.

---

## Execution Scope Index

> **Purpose**: Maps every ticket to exact source files, line numbers, and actions so Claude can execute any ticket without ambiguity.
> **Legend**: `→` = primary file to modify | `+` = secondary/supporting file | `?` = investigate first | `NEW` = create new file/component
> **Line numbers**: Based on SHA `81c3a2a4` — verify before editing as lines may shift after earlier tickets.

### Screen: EnrollDeviceScreen (`src/screens/EnrollDeviceScreen.tsx`)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-002 | → `src/screens/SplashScreen.tsx:31,249-276` | Fix cold-start blank screen; ensure SplashScreen shows brand mark immediately; tune SPLASH_DURATION_MS |
| | + `app.json:17,25-28` | Verify splash icon/bg config |
| | + `android/app/src/main/res/values/styles.xml:14-16` | Verify Theme.App.SplashScreen drawable |
| STG-004 | → `EnrollDeviceScreen.tsx:441-617` | Redesign activation screen: add trust signals, brand illustration, step indicator |
| STG-019 | → `EnrollDeviceScreen.tsx:479-515` | Fix keyboard UX: left-align placeholder, auto-focus, keyboard dismiss on submit |
| STG-023 | → `EnrollDeviceScreen.tsx:441-460` | Simplify subtitle info text above activation code input |
| STG-024 | → `EnrollDeviceScreen.tsx:517-549` | Polish QR scan button + camera integration UX |
| STG-025 | → `EnrollDeviceScreen.tsx:554-558` | Add support phone/WhatsApp on error screens |
| | + `src/i18n/locales/en.json`, `hi.json` | Add support contact i18n keys |
| STG-038 | → `EnrollDeviceScreen.tsx:196` | Replace hardcoded "RETAILER_PHONE" with auto-detect or selector |
| STG-039 | → `EnrollDeviceScreen.tsx` | Find printing mode selector, replace "Direct ESC/POS" with plain language |
| STG-040 | → `EnrollDeviceScreen.tsx` | Fix chip layout wrapping on small screens (<360dp) |
| STG-041 | → `EnrollDeviceScreen.tsx:479-491` | Add inline validation (format check, error styling on invalid input) |
| STG-042 | → `EnrollDeviceScreen.tsx:187,496-515` | Fix "Counter-1" default label — use auto-incrementing "Counter-N" or friendly model name |
| STG-043 | → `EnrollDeviceScreen.tsx:479-515` | Convert placeholder to floating label that persists on focus |
| STG-044 | → `EnrollDeviceScreen.tsx:517-549` | Adjust visual weight: "Scan QR" secondary, "Activate POS" primary |
| STG-057 | → `EnrollDeviceScreen.tsx:85,97,112-118,256` | Rewrite all "superadmin" text to plain language |
| | + `src/i18n/locales/en.json:382-383,393,406` | Update status.storeInactive, deviceInactive, errors.* keys |
| STG-058 | → `EnrollDeviceScreen.tsx:441-460` | Replace wall-of-text with collapsible visual 3-step flow |
| STG-059 | → `EnrollDeviceScreen.tsx:85` | Replace "hello@supermandi.tech" with WhatsApp/phone |
| STG-060 | → `EnrollDeviceScreen.tsx` | Replace raw URL text with tappable "Register Here" button |
| STG-061 | → `EnrollDeviceScreen.tsx:479-491` | Fix center-aligned placeholder to left-aligned |
| STG-062 | → `EnrollDeviceScreen.tsx:517-549` | Add disabled state to Activate button until code format valid (SM-XXXXXX) |
| STG-063 | → `EnrollDeviceScreen.tsx:441-460` | Add welcome illustration above activation input |
| STG-064 | → `EnrollDeviceScreen.tsx:187` | Map Device.modelName internal codes to friendly names (e.g., "23106RN0DA" → "Redmi Note 13 Pro") |
| STG-065 | → `EnrollDeviceScreen.tsx:441-460` | Add step indicator "Step 1 of 2" |
| STG-066 | → `EnrollDeviceScreen.tsx` + `ActivationScreen.tsx` (?) | Unify enrollment and activation into single onboarding flow |
| STG-072 | → `EnrollDeviceScreen.tsx` | Remove hamburger menu when not yet activated (no navigation needed) |
| STG-073 | → `EnrollDeviceScreen.tsx:256` | Replace "store dashboard" jargon with plain language |
| STG-076 | → `EnrollDeviceScreen.tsx` | Replace "on web" with specific URL or "online" |
| STG-200 | → `EnrollDeviceScreen.tsx:85` | Replace email with WhatsApp link |
| STG-201 | → `src/i18n/locales/en.json:382-383` + `hi.json` | Replace "Superadmin" in status messages |
| STG-202 | → `EnrollDeviceScreen.tsx:85` | Add tappable WhatsApp button in STORE_INACTIVE error |
| STG-203 | → `EnrollDeviceScreen.tsx:196` | Auto-detect device type or add selector |
| STG-204 | → `EnrollDeviceScreen.tsx:187` | Map raw model codes to friendly names |
| STG-205 | → `EnrollDeviceScreen.tsx:229-235` | i18n for re-enrollment alert |
| STG-206 | → `EnrollDeviceScreen.tsx:256` | Remove "superadmin account activation" text |
| STG-207 | → `EnrollDeviceScreen.tsx:112-118` | Replace "Reinstall the app" with support contact path |
| STG-208 | → `EnrollDeviceScreen.tsx:97` | Add countdown timer for rate limit cooldown |
| STG-253 | → `EnrollDeviceScreen.tsx:40` | Verify TEST_STORE_CONFIG only behind `__DEV__` |

### Screen: PosRootLayout — Header & Tabs (`src/screens/PosRootLayout.tsx`)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-005 | → `src/components/PosStatusBar.tsx:137-151,208-246` | Declutter status icons, reduce icon count, add labels |
| | + `PosRootLayout.tsx:1200-1214` | Adjust header area layout |
| STG-007 | → `PosRootLayout.tsx:1230-1376` | Unify tab bar: add full labels, consistent colors, active states |
| | + `src/i18n/locales/en.json:93-100` | Tab label text (currently ALL CAPS) |
| STG-014 | → `PosRootLayout.tsx` | Hide DEV MODE banner in production (`__DEV__` guard) |
| STG-017 | → `src/components/PosStatusBar.tsx:127-129` | Add staff name/role display in header |
| STG-022 | → `src/components/PosStatusBar.tsx` | Enlarge logo pill badge |
| STG-036 | → `src/components/PosStatusBar.tsx` | Add date/time display |
| STG-045 | → `src/components/PosStatusBar.tsx:380` | Increase "Ready for billing" text size |
| STG-049 | → `src/components/PosStatusBar.tsx:137-151` | Add label/tooltip to camera icon |
| STG-052 | → `src/components/PosStatusBar.tsx:127-129` | Handle store name truncation on narrow screens |
| STG-067 | → `src/components/PosStatusBar.tsx:137-151` | Add labels/tooltips to Wi-Fi/printer/scanner/camera icons |
| STG-069 | → `PosRootLayout.tsx:1230-1376` | Unify 5 tab visual treatments into one consistent style |
| STG-070 | → `PosRootLayout.tsx:1200-1230` | Smooth gradient transition from dark header to white body |
| STG-071 | → `src/components/ui/SyncStatusWidget.tsx:328-359` | Connect checkmark with "15s ago" visually |
| STG-240 | → `src/i18n/locales/en.json:93-100` + `hi.json` | Change tab labels from ALL CAPS to title case |
| STG-245 | → `src/i18n/locales/en.json:98-99` + `PosRootLayout.tsx:1322-1349` | Replace "REORDER • ON/OFF" with stable label + state badge |
| STG-246 | → `PosRootLayout.tsx:1351-1372` + `src/screens/CreditScreen.tsx` | Hide disabled CREDIT tab or show "Coming Soon" |

### Screen: SyncStatus (`src/components/ui/SyncStatusWidget.tsx`)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-006 | → `SyncStatusWidget.tsx:328-359` | Collapse when healthy; reduce footprint |
| STG-010 | → `SyncStatusWidget.tsx` + `src/components/ui/SyncConflictPanel.tsx` | Add brand illustrations, plain-language tabs |
| STG-021 | → `SyncStatusWidget.tsx:172-175,195` | Add tab count badges and last-sync timestamp |

### Screen: SellScanScreen — Search, Products, Cart (`src/screens/SellScanScreen.tsx`)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-008 | → `SellScanScreen.tsx:2724-2763` | Unify search input with clear visual hierarchy |
| STG-009 | → `src/components/sell/SellTile.tsx` (full file) | Redesign product cards: full names, stock badges, thumbnails |
| STG-015 | → `SellTile.tsx` + `SellScanScreen.tsx:3303-3340` | Unify list vs thumbnail card layouts |
| STG-016 | → `SellScanScreen.tsx:3344-3389` | Add floating total bar when cart has items |
| STG-018 | → `SellTile.tsx:73` | Add unit/weight context to prices (i18n "per" prefix) |
| STG-020 | → `SellTile.tsx` styles | Remove excess whitespace in small product cards |
| STG-027 | → `SellTile.tsx` | Explain or remove green grid icon |
| STG-028 | → `SellScanScreen.tsx:3265-3302` | Add section headers for product grouping |
| STG-029 | → `SellScanScreen.tsx` | Add manual "Add Product" button for unlisted items |
| STG-031 | → `SellScanScreen.tsx:696-718` | Add quick +/- buttons for bulk product adds |
| STG-033 | → `SellScanScreen.tsx:3303-3340` | Add favorites/frequently sold section |
| STG-035 | → `SellScanScreen.tsx` | Add empty state illustration when zero products |
| STG-046 | → `SellTile.tsx` | Add expand chevron hint text |
| STG-047 | → `SellScanScreen.tsx:3303-3340` | Fix empty space in horizontal product row |
| STG-050 | → `SellScanScreen.tsx:3303-3340` | Add pull-to-refresh indicator on product FlatList |
| STG-056 | → `SellTile.tsx` | Add haptic vibration and ripple on tap |
| STG-068 | → `SellTile.tsx` | Add "+" tap affordance button for adding to bill |
| STG-074 | → `SellScanScreen.tsx:2724-2841` | Unify search + barcode input border/container styles |
| STG-075 | → `SellScanScreen.tsx:3303-3340` | Add loading skeleton placeholder during product fetch |
| STG-220 | → `SellScanScreen.tsx:291` | Reduce CART_SHEET_COLLAPSED_RATIO from 0.55 to 0.40-0.45 |
| STG-221 | → `SellScanScreen.tsx:296` | Validate SMALL_SCREEN_WIDTH=400 threshold on target devices |
| STG-222 | → `SellTile.tsx:55-59` | Smart formatting: drop ".00" on round amounts |
| STG-223 | → `SellScanScreen.tsx` | Add empty state illustration for zero search results |
| STG-224 | → `SellScanScreen.tsx:61` + `src/components/sell/CategoryRail.tsx` | Guard DEMO_CATEGORIES behind `__DEV__` |
| STG-225 | → `SellScanScreen.tsx:283` | Calculate NUM_COLUMNS dynamically from screen width |
| STG-226 | → `SellTile.tsx:56` | Replace "—" dash for null price with "Price not set" label |
| STG-227 | → `SellTile.tsx:86-95` | Fix IST timezone in expiry calculation |
| STG-228 | → `SellTile.tsx` | Add MRP strikethrough when sell price < MRP |
| STG-229 | → `SellTile.tsx:73` + `en.json` + `hi.json` | i18n for "per KG" label |
| STG-230 | → `SellTile.tsx:33` | Display brand name if available |

### Screen: SellScanScreen — Cart Bottom Sheet (`src/screens/SellScanScreen.tsx`)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-094 | → `SellScanScreen.tsx:3435-3468` | Add confirmation dialog to Clear button |
| | + `src/stores/cartStore.ts:617-640` | clearCart function |
| STG-095 | → `SellScanScreen.tsx:660` | Add confirmation/undo to trash icon delete |
| | + `cartStore.ts:391-426` | removeItem function |
| STG-096 | → `SellScanScreen.tsx:690-718` | Increase stepper button tap targets to 48px min |
| STG-097 | → `SellScanScreen.tsx:706` | Make quantity number tappable for direct input |
| STG-098 | → `SellScanScreen.tsx:3473-3494` | Add "Add more items" link below cart items |
| STG-099 | → `SellScanScreen.tsx:630-632` | Clarify edit icon (✏️) purpose with label |
| STG-100 | → `SellScanScreen.tsx:668-728` | Label unit price vs line total clearly |
| STG-101 | → `SellScanScreen.tsx:3563-3577` | Add GST/tax line between Subtotal and Total |
| STG-102 | → `SellScanScreen.tsx:3497-3560` + `cartStore.ts:677-689` | Add max discount limit + manager approval |
| STG-103 | → `SellScanScreen.tsx:3413-3470` | Add optional customer name/phone field at top of cart |
| STG-104 | → `SellScanScreen.tsx:3413-3590` | Add Hold/Park Bill feature |
| | + `cartStore.ts` | Add held bills storage |
| STG-105 | → `SellScanScreen.tsx:3413-3435` | Add item count to "Sell Cart" header |
| STG-106 | → `SellScanScreen.tsx:3505-3548` | Fix discount %/Flat toggle styling (segmented control) |
| STG-107 | → `SellScanScreen.tsx:630-660` | Add product thumbnail to cart items |
| STG-108 | → `SellScanScreen.tsx:3473-3497` | Fill empty space with guidance or suggestions |
| STG-109 | → `SellScanScreen.tsx:3580-3590` | Add item count to Checkout button text |
| STG-110 | → `SellScanScreen.tsx:630-660` + `cartStore.ts` | Add per-item discount via edit icon |
| STG-111 | → `SellScanScreen.tsx:3563-3577` | Add "You save ₹X" line when discount applied |
| STG-112 | → `SellScanScreen.tsx:3560-3563` | Add notes/memo field (collapsible) |
| STG-126 | → `SellScanScreen.tsx:696-705` | Define [-] at qty=1 behavior (disable or remove with confirm) |
| | + `cartStore.ts:428-488` | updateQuantity min-qty logic |
| STG-127 | → `SellScanScreen.tsx:709-718` + `cartStore.ts:428-488` | Add stock validation cap on qty |
| STG-128 | → `SellScanScreen.tsx:630-632` | Add batch/expiry info below product name |
| STG-129 | → `SellScanScreen.tsx:630` | Handle long product name with numberOfLines={2} + ellipsis |
| STG-130 | → `SellScanScreen.tsx:3549-3560` | Add live discount preview below input |
| STG-131 | → `SellScanScreen.tsx:3473-3497` | Add "frequently bought together" suggestions |
| STG-132 | → `SellScanScreen.tsx:3563-3577` | Hide Subtotal when equals Total |
| STG-133 | → `SellScanScreen.tsx:3413` (BottomSheet snap points) | Dynamic sheet height based on content |
| STG-134 | → `SellScanScreen.tsx:630-660` | Add swipe-to-delete on cart items |
| STG-135 | → `SellScanScreen.tsx:3497-3590` | Add KeyboardAvoidingView for discount input |
| STG-136 | → `SellScanScreen.tsx:3413-3435` | Add "Share cart via WhatsApp" button in header |
| STG-137 | → `SellScanScreen.tsx:630-660` | Conditional stock styling (green/amber/red by level) |
| STG-138 | → `SellScanScreen.tsx:630-632` | Separate unit/weight display from product name |
| STG-139 | → `SellScanScreen.tsx:3413-3590` | Add return/exchange negative line items |
| STG-140 | → `SellScanScreen.tsx:3497-3503` | Collapse discount section by default |
| STG-141 | → `SellScanScreen.tsx:3580-3590` | Add price animation on Checkout button total change |

### Screen: PaymentScreen (`src/screens/PaymentScreen.tsx`)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-077 | → `PaymentScreen.tsx:505` | Show specific failure reason instead of generic error |
| STG-078 | → `PaymentScreen.tsx` (CTA button) | Explain why "Complete Payment" is greyed out |
| STG-079 | → `PaymentScreen.tsx` (error + CTA) | Resolve competing retry mechanisms |
| STG-080 | → `PaymentScreen.tsx` (cash tab) | Add cash amount input + change calculation |
| STG-081 | → `PaymentScreen.tsx` (layout) | Add cart/order summary visible on payment screen |
| STG-082 | → `PaymentScreen.tsx` (due tab) | Add customer selection for credit/due sales |
| STG-083 | → `PaymentScreen.tsx` (header) | Add back button to return to cart |
| STG-084 | → `PaymentScreen.tsx:618,650-671` | Complete UPI flow: QR display, verification, polling |
| STG-085 | → `PaymentScreen.tsx` | Add multi-tender/split payment support |
| STG-086 | → `PaymentScreen.tsx` (header) | Remove/redesign "Cart locked" badge |
| STG-087 | → `PaymentScreen.tsx` (layout) | Fill empty space with order summary + cash input |
| STG-088 | → `PaymentScreen.tsx` | Add GST/tax breakup display |
| STG-089 | → `PaymentScreen.tsx` (CTA styles) | Fix disabled button WCAG contrast |
| | + `src/theme/colors.ts` | Add `disabled`, `disabledText` tokens (STG-232) |
| STG-090 | → `PaymentScreen.tsx` (submit handler) | Add spinner + processing state + double-tap prevention |
| STG-091 | → `PaymentScreen.tsx` | Dynamic instruction text per payment method |
| STG-092 | → `PaymentScreen.tsx` | Add receipt preview before completing payment |
| STG-093 | → `PaymentScreen.tsx` (tab icons) | Replace cash icon with recognizable banknote/₹ icon |
| STG-113 | → `PaymentScreen.tsx` (header) | Show bill/invoice number |
| STG-114 | → `PaymentScreen.tsx` | Add Cancel/Void transaction button + confirmation |
| STG-115 | → `PaymentScreen.tsx` (tabs) | Add Card, Wallet payment method tabs |
| STG-116 | → `src/utils/money.ts:31-71` | Implement Indian lakh formatting in formatMoney() |
| STG-117 | → `SellTile.tsx:55-59` + `src/utils/money.ts` | Smart formatting: drop ".00" on round amounts |
| STG-118 | → `PaymentScreen.tsx` (error banner) | Change Retry button from red to blue |
| STG-119 | → `PaymentScreen.tsx` (error banner) | Add dismiss X + auto-dismiss timer |
| STG-120 | → `PaymentScreen.tsx` (header) | Show staff name/ID for audit |
| STG-121 | → `PaymentScreen.tsx` (tab icons) | Replace calendar icon for "Due" with credit/udhar icon |
| STG-122 | → `PaymentScreen.tsx` (submit handler) | Add confirmation dialog for amounts > ₹5,000 |
| STG-123 | → `PaymentScreen.tsx` (layout) | Move amount to top, not dead center |
| STG-124 | → `PaymentScreen.tsx` (success/failure) | Add sound + haptic feedback |
| STG-125 | → `PaymentScreen.tsx` | Add partial payment tracking (cash + due remainder) |
| STG-209 | → `PaymentScreen.tsx:14` | Replace TouchableOpacity with Pressable |
| STG-210 | → `PaymentScreen.tsx:404-424,758-779` + `en.json` + `hi.json` | i18n all alert strings |
| STG-211 | → `PaymentScreen.tsx:618` | Separate "UPI ID not configured" vs "QR failed" errors |
| STG-212 | → `PaymentScreen.tsx:493,500` | Replace "Superadmin" references in error alerts |
| STG-213 | → `PaymentScreen.tsx:706` | Replace bare Alert with spinner overlay for "Payment in Progress" |
| STG-214 | → `PaymentScreen.tsx:650-671` | Add "Regenerate QR" button when QR expires |
| STG-215 | → `PaymentScreen.tsx:6` | Make PRICE_FRESHNESS_THRESHOLD_MS configurable |
| STG-216 | → `PaymentScreen.tsx:789` | Rewrite "Price Freshness Warning" to plain language |
| STG-217 | → `PaymentScreen.tsx:505` | Show specific error type instead of generic message |
| STG-218 | → `PaymentScreen.tsx:257` | Remove raw paymentId hash from user-facing alert |
| STG-219 | → `PaymentScreen.tsx` | Standardize all UPI alert styles |
| STG-254 | → `src/utils/money.ts:31-71` | Ensure Indian lakh formatting in all formatMoney calls |

### Screen: MenuScreen (`src/screens/MenuScreen.tsx`)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-142 | → `MenuScreen.tsx:605` + `en.json` (add `menu.viewDetails`) + `hi.json` | Fix leaked i18n key |
| STG-143 | → `MenuScreen.tsx:656-658` + `en.json` (add `menu.printerReady`, `menu.testPrint`) + `hi.json` | Fix leaked i18n keys |
| STG-144 | → `MenuScreen.tsx:1083-1130` | Wrap Developer/QA + BUILD INFO in `if (__DEV__)` |
| STG-145 | → `MenuScreen.tsx:1103-1130` | Remove token, API URL, StoreId UUID from visible UI |
| STG-146 | → `MenuScreen.tsx:63-129` (opStatus) | Show device label instead of UUID |
| STG-147 | → `MenuScreen.tsx:63-129` | Apply toTitleCase() to store name in System Status |
| STG-148 | → `MenuScreen.tsx:426-518` | Make System Status collapsible; auto-expand on issues |
| STG-149 | → `MenuScreen.tsx:250-272` | Add comparison period label; hide % when base is 0 |
| STG-150 | → `MenuScreen.tsx:593-601` | Fix empty Payment Modes section; hide if no data |
| STG-151 | → `MenuScreen.tsx:542-600` | Move labels above metric values (label-first pattern) |
| STG-152 | → `PosRootLayout.tsx:1200-1214` | Move Today's Sales summary to home screen |
| | + `MenuScreen.tsx:542-600` | Keep detailed version in Menu |
| STG-153 | → `MenuScreen.tsx:621-634` | Add subtitles/context to Reprint/Download/Share buttons |
| STG-154 | → `MenuScreen.tsx:848-849` + `en.json` + `hi.json` | Rename "BNPL Dues" to "Credit Purchases" |
| STG-155 | → `MenuScreen.tsx:769-770` + `en.json` + `hi.json` | Rename "Stock Inward" to "Add New Stock" |
| STG-156 | → `MenuScreen.tsx` (Opening Stock icon) | Replace "?" icon with inventory icon |
| STG-157 | → `MenuScreen.tsx:785-821` | Merge "Customers" + "Customer Management" into one card |
| STG-158 | → `MenuScreen.tsx:820-821` + `en.json` + `hi.json` | Rename "Overdue Dues" to "Overdue Payments" |
| STG-159 | → `MenuScreen.tsx:390-1138` | Restructure: collapsible sections, search, usage ordering |
| STG-160 | → `MenuScreen.tsx` (all menuIcon colors) | Standardize to 2-3 color palette |
| STG-161 | → `MenuScreen.tsx` (badge rendering) | Add notification count badges to menu items |
| STG-162 | → `MenuScreen.tsx:1153` (header) | Remove redundant logo pill + "Menu" title |
| STG-163 | → `MenuScreen.tsx:1294-1302` (styles) | Reduce card spacing: 12px padding, 8px gap |
| STG-164 | → `MenuScreen.tsx:282-293` (Switch Staff) | Show display_name instead of username |
| STG-165 | → `MenuScreen.tsx` (language toggle) + `en.json` | Fix Hindi toggle "हि" → "हिंदी" |
| STG-166 | → `MenuScreen.tsx:1072-1081` | Replace "Re-enroll" jargon in subtitle |
| STG-167 | → `MenuScreen.tsx:1133-1137` | Add About section: version + terms + privacy links |
| STG-168 | → `MenuScreen.tsx` (Settings section) | Add Logout/End Session option |
| STG-169 | → `MenuScreen.tsx:391` | Add search bar at top of menu |
| STG-170 | → `MenuScreen.tsx` (Barcode Sheets subtitle) | Replace "tiered" with plain language |
| STG-171 | → `MenuScreen.tsx:542-600` (styles) | Add visual hierarchy: hero metric bigger |
| STG-172 | → `MenuScreen.tsx:642-1067` + `en.json` + `hi.json` | Replace 36 hardcoded English strings with t() calls |
| STG-173 | → `MenuScreen.tsx:605` + `en.json` (add key) | Fix defaultValue fallback for viewDetails |
| STG-174 | → `MenuScreen.tsx:243,656-658` + `en.json` | Fix positional fallback for printer keys |
| STG-175 | → `MenuScreen.tsx:610+` (all Pressable) | Add `android_ripple` prop to all menu Pressables |
| STG-176 | → `MenuScreen.tsx:1153` | Increase paddingVertical from 8 to 16 |
| STG-177 | → `MenuScreen.tsx:479` + `en.json` + `hi.json` | i18n "Sync" label + syncComplete/syncFailed keys |
| STG-178 | → `MenuScreen.tsx:1083-1101` + `UiShowcaseScreen.tsx:30-34` | Double-gate QA menu: `showQaMenu && (__DEV__ \|\| isStaging)` |
| STG-179 | → `MenuScreen.tsx:1133-1137` | Show app version instead of raw SHA |
| STG-180 | → `MenuScreen.tsx:282-293` + `en.json` + `hi.json` | i18n Switch Staff alert |
| STG-181 | → `MenuScreen.tsx:621-634` | Pass action param to SalesHistory navigation |
| STG-182 | → `MenuScreen.tsx` (menu item press handlers) | Add haptic feedback on menu item press |
| STG-183 | → `MenuScreen.tsx:1354-1358` | Fix sectionHeader margin asymmetry (24/4 → 28/8) |
| STG-184 | → `MenuScreen.tsx:877,888` + `en.json` + `hi.json` | i18n WhatsApp support alerts |
| STG-185 | → `MenuScreen.tsx:882-884` + `en.json` + `hi.json` | i18n WhatsApp pre-filled message |
| STG-186 | → `MenuScreen.tsx:1588` | Increase trendText fontSize from 9 to 11+ |
| STG-187 | → `MenuScreen.tsx:251-268` | Cap trend percentage at 999%+ or show absolute |
| STG-188 | → `MenuScreen.tsx:593-601` + `en.json` + `hi.json` | i18n Payment Modes labels |
| STG-189 | → `MenuScreen.tsx:1066` | Fix `&amp;` → `&` in "Help & Support" |
| STG-190 | → `MenuScreen.tsx:542-543` | Add skeleton/shimmer loading state |
| STG-191 | → `MenuScreen.tsx:1253-1258` | Add border to default statusBadge |
| STG-192 | → `MenuScreen.tsx:1294-1302` | Increase menuIcon from 36×36 to 40×40 |
| STG-193 | → `MenuScreen.tsx:962` + `en.json` + `hi.json` | Replace "Z-Report" jargon in subtitle |
| STG-194 | → `MenuScreen.tsx:972` + `en.json` + `hi.json` | Simplify shift management subtitle |
| STG-195 | → `MenuScreen.tsx:828` + `en.json` + `hi.json` | Rename "AI & Intelligence" to "Smart Insights" |
| STG-196 | → `MenuScreen.tsx:837` | Simplify AI Insights subtitle |
| STG-197 | → `MenuScreen.tsx:849` | Reword "Browse and apply for credit offers" |
| STG-198 | → `MenuScreen.tsx:1149` | Adjust content padding for visual distinction |
| STG-199 | → `MenuScreen.tsx:391` | Enable scroll indicator on ScrollView |
| STG-247 | → `MenuScreen.tsx:775-824` | Consolidate customer section to 2 items max |
| STG-248 | → `MenuScreen.tsx` styles | Fix marginTop inconsistency after sectionHeader |
| STG-249 | → `MenuScreen.tsx:648-659` | Wrap printerStatusRow in card container |
| STG-250 | → `MenuScreen.tsx:1072-1081` | Move Switch Store to "Danger Zone" section |
| STG-251 | → `MenuScreen.tsx:956-965` | Add pending badge to Daily Closing |
| STG-252 | → `MenuScreen.tsx:859-868` | Add unread count badge to Chat |
| STG-255 | → `MenuScreen.tsx:1221-1228,1471-1478` | Differentiate summaryCard vs statusPanel visually |
| STG-256 | → `MenuScreen.tsx:426-518` | Add swipe/tap to collapse System Status |

### Theme & Design System (`src/theme/`)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-003 | → `src/theme/colors.ts` (full file) | Audit & unify brand palette, add missing tokens |
| | + `src/theme/spacing.ts` (1-9) | Verify/extend spacing scale |
| | + `src/theme/typography.ts` (1-77) | Verify/extend type scale for POS readability |
| | + `src/theme/index.ts` | Ensure all tokens exported |
| STG-011 | → `src/theme/typography.ts:1-77` | Audit font sizes for POS-grade readability |
| STG-053 | → `src/theme/colors.ts` + all screens | WCAG AA contrast audit across buttons and text |
| STG-231 | → `src/theme/colors.ts:7-12` | Deduplicate accent/secondary (identical #14B8A6) |
| STG-232 | → `src/theme/colors.ts` | Add `disabled`, `disabledText`, `disabledBg` tokens |
| STG-233 | → `src/theme/colors.ts:61,124` | Remove or assign purpose to unused `ink` token |

### i18n Locale Files (`src/i18n/locales/`)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-026 | → NEW file or `en.json`/`hi.json` | Add terms/privacy policy link strings |
| STG-054 | → `src/i18n/locales/hi.json` (full file) | Complete Hindi translations for all screens |
| STG-055 | → `en.json` + `hi.json` | Add app version display string |
| STG-234 | → `en.json:382` + `hi.json` | Rewrite status.storeInactive (remove "Superadmin") |
| STG-235 | → `en.json:383` + `hi.json` | Rewrite status.deviceInactive (remove "Superadmin") |
| STG-236 | → `en.json:393` + `hi.json` | Rewrite errors.deviceAlreadyEnrolled (remove "Superadmin", "token") |
| STG-237 | → `en.json:406` | Change "Please login again" to "re-enter staff PIN" |
| STG-238 | → `en.json:146` + `hi.json` | Rewrite "Digitise mode on" to plain language |
| STG-239 | → `en.json:116` + `hi.json` | Replace "MOQ" with "Min. Order" |
| STG-241 | → `en.json:251` + `hi.json` | Simplify dismissSuggestedFrom template for Hindi |
| STG-242 | → `en.json:484-536` | Add explanations for KYC, UTR, EMI jargon |
| STG-243 | → `en.json:461` + `hi.json` | Break UPI instructions into numbered steps |
| STG-244 | → `en.json:292` + `hi.json` | Change "Goods Receipt Note" to "Stock Received" |

### Voice & Misc Components

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-012 | → `src/components/voice/VoiceButton.tsx:53-54,127-179` | Brand-color FAB, contextual label on first use |
| STG-013 | → `SellTile.tsx` (FEFO badge) | Explain FEFO or rename to "Expiring Soon" |
| STG-030 | → `src/screens/CreditScreen.tsx` | Explain greyed-out state or enable with guidance |
| STG-034 | → `MenuScreen.tsx` or `PosRootLayout.tsx` | Add recent bills shortcut (quick access last 5) |
| STG-037 | → `SellScanScreen.tsx` or `PaymentScreen.tsx` | Add customer name/phone entry for credit sales |
| STG-048 | → `src/components/voice/VoiceButton.tsx:204-215` | Fix FAB position overlap with product cards |
| STG-051 | → `PosRootLayout.tsx` or `PosStatusBar.tsx` | Add "Bills today" and "Sales total" on home |

### Utility & Cross-Cutting

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-116 | → `src/utils/money.ts:31-71` | Implement Indian lakh formatting |
| STG-117 | → `src/utils/money.ts` + `SellTile.tsx:55-59` | Smart .00 formatting |
| STG-032 | → `SellTile.tsx` | Add discount/MRP indicator on product cards |

### Screen i18n — Hardcoded English Replacement (STG-257–STG-279)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-257 | → `src/screens/PaymentSetupScreen.tsx` (395 lines, ~18 strings, zero t()) | Replace all hardcoded English: L73,75,80,86 (validation), L105,128 (alerts), L265-267 (title/subtitle), L285-334 (form labels), L371,384,388 (buttons). Add `useTranslation()`, create `en.json` keys under `paymentSetup.*`, add Hindi translations |
| STG-258 | → `src/screens/SalesHistoryScreen.tsx` (310 lines, ~5 strings, partial t()) | Replace remaining hardcoded: L245 ("OFFLINE" badge), L260 ("Bills" header). Verify t() fallbacks are proper `defaultValue` format |
| STG-259 | → `src/screens/BillDetailScreen.tsx` (432 lines, ~15 strings, zero t()) | Replace all hardcoded English: L49,57 (error messages), L78-80,91-92,101 (alert texts), L106-110 (printer errors), L130-132 (WhatsApp errors), L319-328 (summary labels), L368-383 (totals labels), L397,412,420 (status text). Add `useTranslation()`, create `billDetail.*` i18n keys |
| STG-260 | → `src/screens/SalesStatementScreen.tsx` (423 lines, ~12 strings, zero t()) | Replace all hardcoded: L45,48 ("Today"/"Yesterday"), L282-290 (stat labels), L355 ("Inventory Cost Statement" title), L365-375 (summary labels), L389 ("Retry"), L395-402 (empty state). Add `useTranslation()`, create `salesStatement.*` keys |
| STG-261 | → `src/screens/DailyReportScreen.tsx` (809 lines, ~25 strings, zero t()) | Replace all hardcoded: L82-114 (print template), L164-203 (HTML report), L301-330 (print/share errors), L549-728 (all UI labels). Add `useTranslation()`, create `dailyReport.*` keys |
| STG-262 | → `src/screens/DailyClosingScreen.tsx` (750 lines, ~12 strings, partial t()) | Replace remaining hardcoded: L138,144 (validation alerts), L184-185 ("MATCH"/"MISMATCH"), L229-238 ("Summary"/"History" tabs). Verify existing t() calls use `defaultValue` |
| STG-263 | → `src/screens/InwardScreen.tsx` (1146 lines, ~20 strings, partial t()) | Replace hardcoded: L64,74,83,86 (supplier labels), L177,187,228,238,250 (error messages), L481-482 (stock check alert), L561-701 (screen labels/buttons). Extend existing t() coverage |
| STG-264 | → `src/screens/GRNScreen.tsx` (1000 lines, ~18 strings, zero t()) | Replace all hardcoded: L106,177 (error messages), L315-377 (alert messages), L457-514 (screen titles/labels), L539-659 (UI text). Add `useTranslation()`, create `grn.*` keys |
| STG-265 | → `src/screens/OpeningStockScreen.tsx` (738 lines, ~16 strings, zero t()) | Replace all hardcoded: L136,179-180,187-188 (errors), L245-256 (confirmation alerts), L551-553 (success), L576-728 (labels). Add `useTranslation()`, create `openingStock.*` keys |
| STG-266 | → `src/screens/PurchaseScreen.tsx` (1700+ lines, ~40 strings, partial t()) | Replace hardcoded: L29-38 (ROTATING_HINTS array), remaining alert messages, button labels. Extend existing t() coverage to all user-facing strings |
| STG-267 | → `src/screens/BarcodeSheetScreen.tsx` (1500+ lines, ~35 strings, partial t()) | Replace all hardcoded English labels, alerts, and button text. Extend existing partial t() coverage to full file |
| STG-268 | → `src/screens/BnplDuesScreen.tsx` (1439 lines, ~25 strings, partial t()) | Replace remaining hardcoded English: alert messages, modal labels, payment status text. Extend existing partial t() coverage |
| STG-269 | → `src/screens/KhataScreen.tsx` (941 lines, ~22 strings, zero t()) | Replace all hardcoded: L112 ("Error"), L138-217 (alert messages), L551-752 (all screen labels including "Khata (Credit Book)", "Add Credit", "Record Payment", form labels). Add `useTranslation()`, create `khata.*` keys |
| STG-270 | → `src/screens/CustomerListScreen.tsx` (904 lines, ~35 strings, partial t()) | Replace hardcoded: L154,158 ("Required"), L171,175 ("Success"/"Error"), L209,229,232,236,250,253 (stat labels), L638-639 (empty state), L707 (WhatsApp), L730-747 (detail labels), L768-895 (form labels/buttons). Extend partial t() to full coverage |
| STG-271 | → `src/screens/OverdueDuesScreen.tsx` (573 lines, ~18 strings, zero t()) | Replace all hardcoded: L65-67 ("Critical"/"Overdue"/"Due Soon"), L104,154,158 (alerts), L321-324 (WhatsApp message), L360,373 (modal titles), L499-552 (screen title, loading, empty states). Add `useTranslation()`, create `overdueDues.*` keys |
| STG-272 | → `src/screens/ShiftScreen.tsx` (903 lines, ~40 strings, zero t()) | Replace all hardcoded: L44 (AM/PM), L145-197 (validation/confirmation alerts), L557 (status labels), L612-862 (entire UI: tab labels, shift details, form fields, buttons). Add `useTranslation()`, create `shift.*` keys |
| STG-273 | → `src/screens/OrderDetailScreen.tsx` (952 lines, ~22 strings, partial t()) | Replace hardcoded: L96 (error), L147-165 (cancel alerts), L228 (WhatsApp), L249-281 (titles/loading), L357-517 (labels, info rows, buttons). Extend partial t() to full coverage |
| STG-274 | → `src/screens/ReturnScreen.tsx` (914 lines, ~32 strings, zero t()) | Replace all hardcoded: L153-158 (lookup errors), L619-905 (entire UI: titles, form labels, placeholders, section headers, buttons, success messages). Add `useTranslation()`, create `return.*` keys |
| STG-275 | → `src/screens/BuyScreen.tsx` (996 lines, ~12 strings, heavy t()) | Replace remaining hardcoded: L415 ("No more products"), L622-623 (offline messages), L631 ("Refresh"), L675 ("Loading catalog..."). Already uses t() extensively — close the gaps |
| STG-276 | → `src/screens/CreditScreen.tsx` (1498 lines, ~15 strings, extensive t()) | Replace remaining hardcoded strings in modal UIs and error handlers. Already uses t() extensively — audit and close remaining gaps |
| STG-277 | → `src/screens/ReorderScreen.tsx` (563 lines, ~12 strings, partial t()) + `src/screens/ReorderPoliciesScreen.tsx` (592 lines, ~8 strings, zero t()) | ReorderScreen: L441-443 (empty state), L455,476,482,492,537 (labels). ReorderPoliciesScreen: L343-360 (empty states), L380-397 (headers, search). Add t() to both |
| STG-278 | → `src/screens/BulkPurchaseCreditScreen.tsx` (231 lines, ~15 strings, zero t()) | Replace all hardcoded: L106 ("Apply for Credit"), L115-118 (success/error alerts), L142-177 (offer details: amount, rate, tenure, EMI labels), L182,193,200-223 (title, info banner, empty state). Add `useTranslation()`, create `bulkCredit.*` keys |
| STG-279 | → `src/components/ErrorBoundary.tsx` (74 lines, ~4 strings, zero t()) | Replace L40 ("Something went wrong"), L42 (description), L45 ("Try Again"). Add i18n import, create `error.boundary.*` keys |

### Screen-Level Jargon & UX Fixes (STG-280–STG-330)

| Ticket | Lines | Action |
|--------|-------|--------|
| STG-280 | → `src/screens/PaymentSetupScreen.tsx:285` | Replace "UPI ID (VPA) *" label with "UPI ID *" + help text below: "Your Virtual Payment Address (e.g., shop@upi)" |
| STG-281 | → `src/screens/DailyClosingScreen.tsx:414` | Replace "Variance:" with "Difference:" or "Cash Difference:" — plain language for kirana users |
| STG-282 | → `src/screens/SalesStatementScreen.tsx:355` | Replace "Inventory Cost Statement" title with "Stock Value Report" or "Daily Stock & Sales" |
| STG-283 | → `src/screens/BnplDuesScreen.tsx` (1439 lines) | Add inline help tooltips for: "BNPL" → "Buy Now Pay Later", "UTR" → "Transaction Reference Number", "UPI" → "Unified Payment Interface". Key locations: payment modal, dispute modal, dues list |
| STG-284 | → `src/screens/CreditScreen.tsx` (1498 lines) | Add help text below PAN input: "Permanent Account Number (tax ID)". Below KYC section: "Know Your Customer — identity verification". Add tooltips for Aadhaar, EMI acronyms |
| STG-285 | → `src/screens/GRNScreen.tsx:457` | Add subtitle below "Receive Goods" header: "Check and confirm items received from supplier" |
| STG-286 | → `src/screens/OpeningStockScreen.tsx:541` | Add subtitle below "Opening Stock" header: "Enter starting quantities for your shop inventory" |
| STG-287 | → `src/screens/BuyScreen.tsx:525` | Replace bare "BNPL" badge with "Pay Later" badge + tooltip: "Buy Now Pay Later — pay supplier after delivery" |
| STG-288 | → `src/screens/ShiftScreen.tsx:794` | Replace "Variance:" with "Cash Difference:" (same as STG-281 for consistency) |
| STG-289 | → `src/screens/ReturnScreen.tsx:66-67` | Replace "UPI (Manual)" with "UPI Transfer" and "Khata Credit" with "Store Credit (Khata)" |
| STG-290 | → `src/screens/AIInsightsScreen.tsx:101-105` | Replace tab labels: "Slow" → "Slow Moving", "Forecast" → "Sales Forecast", "Expiry" → "Expiring Soon", "Prices" → "Price Changes" |
| STG-291 | → `src/components/sell/SellTile.tsx:220` + `src/components/buy/CartItem.tsx:84` + `src/components/buy/SupplierRow.tsx:202` | SellTile: i18n "PACKAGED" badge. CartItem: i18n "MOQ:" label. SupplierRow: i18n "Add"/"Add More" buttons |
| STG-292 | → `src/components/LimitedModeBanner.tsx:115` | Replace "Place Orders (BUY)" with plain language: "Order stock from suppliers" |
| STG-293 | → `src/screens/PurchaseScreen.tsx` + `InwardScreen.tsx` + `OpeningStockScreen.tsx` + `GRNScreen.tsx` + `StockStatementScreen.tsx` | Audit all `fontSize` < 12. Set minimum 12px for body text, 11px only for secondary captions. Fix per-file |
| STG-294 | → `src/screens/SalesHistoryScreen.tsx` + `DailyClosingScreen.tsx` + `DailyReportScreen.tsx` + `BillDetailScreen.tsx` + `SalesStatementScreen.tsx` | Same audit: all `fontSize` < 12 → minimum 12px body, 11px caption only |
| STG-295 | → `src/screens/CreditScreen.tsx` + `CustomerListScreen.tsx` + `CustomerManagementScreen.tsx` + `OrderDetailScreen.tsx` + `BnplDuesScreen.tsx` + `OverdueDuesScreen.tsx` + `KhataScreen.tsx` | Same audit: all `fontSize` < 12 → minimum 12px |
| STG-296 | → `src/screens/ChatListScreen.tsx` + `src/screens/ForceUpdateScreen.tsx` + `src/components/TabBadge.tsx` | Same audit: all `fontSize` < 12 → minimum 12px (TabBadge may keep 10px for badge count) |
| STG-297 | → `src/components/sell/SplitPaymentModal.tsx:908` | Increase fontSize from 10 to 12. Add `accessibilityLabel` to all interactive elements in the modal |
| STG-298 | → `src/screens/PaymentScreen.tsx` + `MenuScreen.tsx` + `SellScanScreen.tsx` + `BuyScreen.tsx` | Find all `<Pressable>` or `<TouchableOpacity>` with icon-only children (no text, no accessibilityLabel). Add `accessibilityLabel` describing the action |
| STG-299 | → All screens with `<TextInput>` | Find all `<TextInput>` without `accessibilityLabel`. Add labels describing the field purpose. Priority files: PaymentSetupScreen, KhataScreen, ShiftScreen, CustomerListScreen, OpeningStockScreen |
| STG-300 | → `src/screens/GRNScreen.tsx` | Find checkbox/toggle elements, add `accessibilityState={{ checked: value }}` and `accessibilityRole="checkbox"` |
| STG-301 | → `src/screens/OrderDetailScreen.tsx:357` | Add text label or icon alongside color for status badge (e.g., "Delivered ✓" not just green dot). Ensures colorblind accessibility |
| STG-302 | → `src/screens/HelpScreen.tsx` | Replace email-first contact with WhatsApp button as primary CTA. Keep email as secondary "or email us" link |
| STG-303 | → `src/screens/BnplDuesScreen.tsx` | Find "contacted via email" text, add "or WhatsApp" option alongside. Add tappable WhatsApp link |
| STG-304 | → `src/screens/CustomerListScreen.tsx:793` + `src/screens/CustomerManagementScreen.tsx` | Change "Email (Optional)" field to "WhatsApp Number (Optional)" or make email truly secondary with WhatsApp as primary |
| STG-305 | → `src/screens/DeviceBlockedScreen.tsx` | Replace "SuperAdmin"/"administrator" with "your store manager" or "SuperMandi support". Add WhatsApp support link |
| STG-306 | → `src/screens/DailyReportScreen.tsx:613-615` | Replace "No report data for this date" + "Try selecting a date..." with actionable: "No sales recorded on [date]. Reports appear after your first sale." |
| STG-307 | → `src/screens/BillDetailScreen.tsx:91-110` | Replace "..." loading indicator on print/share buttons with ActivityIndicator spinner + disabled state during operation |
| STG-308 | → `src/screens/InwardScreen.tsx` | Find where raw product ID (UUID) is displayed when barcode is null. Replace with product name or "No barcode" label |
| STG-309 | → `src/screens/ReturnScreen.tsx` | Find where raw refundId is displayed to user. Replace with "Return #[short-ref]" format or hide the ID entirely |
| STG-310 | → `src/screens/SplashScreen.tsx` | Find "Continue without session" text. Replace with "Continue Offline" or "Skip for now" |
| STG-311 | → `src/screens/AIInsightsScreen.tsx` | Find "not yet available" error text. Replace with "Smart Insights are being set up for your store. Check back after a few days of sales." |
| STG-312 | → `src/screens/DailyReportScreen.tsx` + `src/screens/DailyClosingScreen.tsx` | Add offline/sync banner at top of both screens when device is offline. Use existing OfflineBanner component or SyncStatusWidget |
| STG-313 | → All screens with API error handling | Standardize network error messages to include recovery guidance: "No internet connection. Check your Wi-Fi and try again." with Retry button. Priority: PaymentScreen, BuyScreen, CreditScreen, ReorderScreen |
| STG-314 | → `src/screens/PaymentSetupScreen.tsx:371` | After successful save, show success toast/banner: "Payment settings saved!" before navigating away. Currently navigates silently |
| STG-315 | → `src/screens/ReorderScreen.tsx` | Find dismiss handler for reorder suggestions. Add confirmation Alert before dismissing: "Dismiss this reorder suggestion? You can add a reason." |
| STG-316 | → `src/components/sell/SplitPaymentModal.tsx` | Replace all `TouchableOpacity` with `Pressable` for consistency with rest of app |
| STG-317 | → All screens | Audit disabled button `opacity` values. Standardize to `opacity: 0.5` across app. Create `styles.buttonDisabled` in theme. Files with inconsistent values: PaymentScreen, SellScanScreen, BuyScreen, ShiftScreen |
| STG-318 | → `src/screens/KhataScreen.tsx` | Find "Add Credit" button — red color is destructive semantic (implies danger). Change to blue/primary (credit = giving, not destructive) |
| STG-319 | → `src/components/reorder/EditReorderModal.tsx` + `EditPolicyModal.tsx` + `DismissReasonModal.tsx` | Standardize modal buttons: primary action = filled blue, secondary = outlined grey, destructive = red outline. Audit all three modals for consistency |
| STG-320 | → `src/screens/OverdueDuesScreen.tsx:67` | Change "Due Soon" badge from info color (blue) to warning color (amber/orange) — imminent payment is a warning, not info |
| STG-321 | → `src/screens/ChatListScreen.tsx` | Find "No messages yet. Say hello!" empty state. Replace with: "No conversations yet. Start a chat with your supplier to discuss orders." |
| STG-322 | → `src/screens/ChatListScreen.tsx` | Find time formatting code. Add AM/PM to timestamps (use `format(date, 'h:mm a')` instead of 24h format) |
| STG-323 | → `src/screens/ForceUpdateScreen.tsx` | Find "iOS update coming soon" text. Replace with "iPhone version coming soon" or hide iOS section entirely on Android |
| STG-324 | → `src/screens/EnrollDeviceScreen.tsx:479-491` | Add help text below activation code input: "Enter the 6-digit code from your SuperMandi dashboard" |
| STG-325 | → `src/screens/EnrollDeviceScreen.tsx` | Standardize to "Activate POS" everywhere (not "Activate Your POS") |
| STG-326 | → `src/screens/EnrollDeviceScreen.tsx` | Add red asterisk (*) to all required fields consistently. Currently some fields have it, others don't |
| STG-327 | → `src/screens/StaffLoginScreen.tsx` | Find login button cooldown logic. Change button text during cooldown from static "Login" to "Wait (Xs)" with countdown |
| STG-328 | → `src/screens/ForceUpdateScreen.tsx` | Find "unknown" version display. Replace with "Version check failed" + retry option, or hide version when unavailable |
| STG-329 | → `src/components/buy/ProductDetailModal.tsx` | Find "No suppliers available" text. Replace with: "No suppliers carry this product yet. Contact SuperMandi support to add suppliers." + WhatsApp link |
| STG-330 | → `src/components/reorder/DismissReasonModal.tsx:39-46` | Change predefined reasons from English display strings to i18n codes. Backend should receive codes (e.g., "OVERSTOCKED", "SEASONAL", "WRONG_ITEM") not translated text. Create enum mapping |

---

## Tickets

### STG-001 — Supplier self-registration verify fallback

- **Status**: DONE (uncommitted)
- **Priority**: P1
- **Source**: Operator testing — supplier KYC submit returns 404 for self-registered suppliers
- **Scope**: `backend/src/routes/v1/admin/suppliers.ts` (L227-301)
- **Fix**: Fallback to `auth.applications` table when `supplier.supplier_requests` has no row. Correct column aliases, VARCHAR(15) GSTIN truncation, conditional table update (applications vs requests).
- **Migration**: None
- **Test**: TODO — `backend/src/__tests__/admin/suppliers.verify.test.ts`
- **FIX_LEDGER**: Registered, checksum `a6ced8442dd626e9`
- **Tag**: Pending commit
- **Note**: Originally tracked as STG-038 in pre-deploy era, renumbered to STG-001 for post-deploy sequence

---

### STG-002 — Release APK cold start blank screen before splash

- **Status**: PARKED — verified in reiteration, tag `stg-001-2026-03-14`
- **Priority**: P2
- **Source**: Operator observation — release APK shows 2-5 second blank/default image screen before splash screen appears on cold start
- **Scope**: Android native splash config (`android/`, `app.json` splash settings, `expo-splash-screen`)
- **Problem**: On cold start, there is a 2-5 second gap showing a blank/default Android screen before the configured splash screen renders. This creates a jarring UX — users see an empty white/default screen before the branded splash.
- **Expected**: Splash screen should appear immediately on app launch with zero blank gap.
- **Fix approach**: Configure Android `windowBackground` theme to match splash, or use `expo-splash-screen` `preventAutoHideAsync` with a matching native splash drawable so the native activity window shows the branded splash instantly.
- **Migration**: None
- **Test**: Visual verification on release APK cold start
- **FIX_LEDGER**: Pending implementation
- **Tag**: Pending

---

### STG-003 — Brand design tokens — unified color palette and spacing

- **Status**: PARKED — verified in reiteration, tag `stg-003-2026-03-14`
- **Priority**: P1 (foundation — all other UI tickets depend on this)
- **Source**: Operator review — colors are inconsistent across app (blue SELL, green REORDER, teal mic, grey tabs, orange DEV banner)
- **Scope**: New `src/theme/` or `src/constants/theme.ts` — design tokens consumed by all screens
- **Problem**: No centralized color/spacing system. Each screen picks its own shades of blue, green, grey. The result feels like 5 different apps stitched together. No POS-grade visual identity.
- **Expected**:
  - Primary: SuperMandi blue (`#2563EB` from adaptive-icon) — CTAs, active tabs, headers
  - Secondary: A complementary accent for success states (green) and alerts (amber/red)
  - Neutral scale: background, card, border, text (4-5 shades)
  - Spacing scale: 4px base unit (4, 8, 12, 16, 24, 32, 48)
  - Border radius: consistent (8px cards, 12px buttons, 24px pills)
  - Shadow: one elevation level for cards, one for modals
  - Typography: 3 weights max (regular, semibold, bold), 5 sizes (caption, body, subtitle, title, header)
- **Fix approach**: Create `theme.ts` with named tokens. Refactor existing hardcoded colors/sizes to use tokens. This is the first ticket to implement — all STG-004 through STG-014 consume it.
- **Migration**: None
- **Test**: Visual diff — before/after screenshots on Redmi
- **FIX_LEDGER**: Pending implementation
- **Tag**: Pending

---

### STG-004 — Activation screen — branded redesign with trust signals

- **Status**: PARKED — verified in reiteration, tag `stg-004-2026-03-14`
- **Priority**: P1
- **Source**: Operator review — activation screen is plain white, no brand feel, raw device model name
- **Scope**: `app/screens/ActivateScreen.tsx` (or equivalent activation component)
- **Problem**:
  1. Plain white background — no brand presence beyond tiny logo pill
  2. "Activate Your POS" heading is generic — no warmth for a first-time kirana retailer
  3. Device Name shows raw model `23106RN0DA` — meaningless, intimidating
  4. Info box at bottom is wordy — retailer won't read it
  5. No progress indicator — retailer doesn't know what happens after activation
- **Expected**:
  1. Branded background — subtle gradient or pattern using primary blue
  2. Welcome heading: "Welcome to SuperMandi" or "Set up your POS" — warm, Hindi-English friendly
  3. Auto-populate device name with friendly label (e.g., "Redmi Note 12") not model number
  4. Condensed info section — one-liner with link, not a paragraph
  5. Step indicator (Step 1 of 2) to show progress
  6. SuperMandi logo prominent at top (not just a pill badge)
- **Migration**: None
- **Test**: Visual verification on Redmi, Expo Go
- **Depends on**: STG-003 (theme tokens)

---

### STG-005 — Home top bar — declutter status icons and scanner warning

- **Status**: PARKED — verified in reiteration, tag `stg-005-2026-03-14`
- **Priority**: P1
- **Source**: Operator review — top bar has 4 status icons all crossed out, "Scanner not ready" in red is alarming
- **Scope**: Home screen top status bar component
- **Problem**:
  1. Four icons (Wi-Fi, 2x printer, scanner) are all shown even when not applicable — crossed-out icons look like errors
  2. "Scanner not ready" in red next to store ID — feels like something is broken when it's just "no hardware scanner paired"
  3. Store ID `SU260308-001` takes prominent space — retailers don't use this daily
  4. Overall impression: "everything is broken" when actually the POS is working fine
- **Expected**:
  1. Show only relevant status icons — hide printer icons if no printer configured
  2. Scanner status: show neutral "Tap to pair scanner" instead of red "Scanner not ready"
  3. Move store ID into a settings/info screen — don't show on main screen (or show smaller, below store name)
  4. When all is good, top bar should feel calm — green dot or nothing, not 4 grey X icons
  5. Connection status: single dot indicator (green = online, amber = syncing, red = offline)
- **Migration**: None
- **Test**: Visual verification, check all states (online, offline, scanner paired, no scanner)
- **Depends on**: STG-003 (theme tokens)

---

### STG-006 — Sync status panel — collapse when healthy, reduce footprint

- **Status**: PARKED — verified in reiteration, tag `stg-006-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — sync panel takes ~25% of screen when status is "connected, all synced"
- **Scope**: Home screen sync status section
- **Problem**:
  1. When everything is fine (connected, empty outbox, synced), the panel still shows 5 lines of info + 2 buttons
  2. This pushes product cards below the fold — the actual selling area is squeezed
  3. "Sync Now" button shown when outbox is empty — no action needed, button is misleading
  4. "View Details" opens a modal that says "All synced!" — unnecessary step
- **Expected**:
  1. **Healthy state (collapsed)**: Single line — green dot + "Connected" + "15s ago" — tappable to expand
  2. **Problem state (expanded)**: Show full panel only when there are pending items, failed syncs, or drift
  3. "Sync Now" only appears when there are pending items
  4. Save ~100px of vertical space in the happy path so products are more visible
- **Migration**: None
- **Test**: Verify collapsed/expanded states, offline behavior
- **Depends on**: STG-003 (theme tokens)

---

### STG-007 — Tab navigation — full labels, consistent colors, active states

- **Status**: PARKED — verified in reiteration, tag `stg-007-2026-03-14`
- **Priority**: P1
- **Source**: Operator review — tab labels truncated ("PURCH...", "REORDE..."), color inconsistency
- **Scope**: Home screen tab bar (MENU, SELL, PURCHASE, REORDER, CREDIT)
- **Problem**:
  1. Labels truncated on small screens — "PURCH..." and "REORDE..." lose meaning
  2. Color inconsistency — SELL is blue, REORDER is green with a dot, others are grey
  3. All caps makes labels harder to scan at a glance
  4. No icons — text-only tabs are harder to distinguish quickly
  5. "MENU" as a tab is confusing — it's a hamburger concept but styled as a tab
- **Expected**:
  1. Full labels visible — use shorter names if needed: "Sell", "Buy", "Reorder", "Credit"
  2. Consistent active/inactive colors — active tab uses primary blue, inactive is neutral grey
  3. Title case (not ALL CAPS) for readability
  4. Add small icons above or beside labels (cart for Sell, box for Buy, refresh for Reorder, rupee for Credit)
  5. "MENU" → hamburger icon or move to header, not in the tab bar
  6. Notification dot on Reorder should use accent color, not a separate green
- **Migration**: None
- **Test**: Visual on Redmi, verify all tabs navigate correctly, check 5-inch and 6-inch screens
- **Depends on**: STG-003 (theme tokens)

---

### STG-008 — Search/scan area — unified input with clear visual hierarchy

- **Status**: PARKED — verified in reiteration, tag `stg-008-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — three competing input areas (search bar, scan button, barcode field)
- **Scope**: Home screen SELL tab search/scan section
- **Problem**:
  1. Three input areas stacked: "Search product" + "Scan product here" button + "Enter barcode manually"
  2. Retailer doesn't know which to use first — cognitive overload
  3. "Scan product here" is a button next to search — confusing whether it's a search action or separate flow
  4. "Enter barcode manually" duplicates what typing in search could do
- **Expected**:
  1. **Single unified search bar**: "Search or scan barcode" — handles text search AND barcode input
  2. Camera/scan icon integrated INTO the search bar (right side) — tap to open scanner
  3. Remove separate "Enter barcode manually" field — the search bar accepts barcodes
  4. Search bar should be the most prominent element on the SELL tab — it's the #1 action
  5. Auto-detect if input is a barcode (all digits, 8-13 chars) vs product name search
- **Migration**: None
- **Test**: Search by name, search by barcode, scan via camera — all from one input
- **Depends on**: STG-003 (theme tokens)

---

### STG-009 — Product cards — full names, stock badges, better thumbnails

- **Status**: PARKED — verified in reiteration, tag `stg-009-2026-03-14`
- **Priority**: P1
- **Source**: Operator review — product names truncated, placeholder icons, no stock info visible
- **Scope**: Product card component used in SELL tab product listing
- **Problem**:
  1. Product names truncated to "To or...", "Ta ta..." — useless for identifying products
  2. Thumbnail is a generic box/package icon — no visual distinction between products
  3. Price shown but no stock quantity — retailer can't see if they have 2 or 200 units
  4. Barcode number shown (8901725183745) — not useful for visual scanning
  5. Cards are small and cramped — hard to tap accurately on a busy counter
- **Expected**:
  1. Full product name (2 lines max, then ellipsis) — "Toor Dal 1kg" not "To or..."
  2. Product category color-coded left border or chip (Grocery, Dairy, etc.)
  3. Stock count badge — "12 in stock" or "Low: 3" with amber warning
  4. Price prominent, barcode hidden (show on tap/expand)
  5. Larger tap target — min 56px height per Material guidelines
  6. If product image exists (from catalog), show it; else show category-specific placeholder (not generic box)
- **Migration**: None
- **Test**: Verify with long product names, zero stock, low stock, with/without images
- **Depends on**: STG-003 (theme tokens)

---

### STG-010 — Sync Status modal — brand illustrations, plain-language tabs

- **Status**: PARKED — verified in reiteration, tag `stg-010-2026-03-14`
- **Priority**: P3
- **Source**: Operator review — "Drifts" tab is technical jargon, empty state could be more branded
- **Scope**: Sync Status modal/sheet component
- **Problem**:
  1. "Drifts" tab label — kirana retailer won't understand what a "drift" is
  2. Empty state is functional but plain — just text and a checkmark
  3. "Sync All" button shown even when nothing to sync
- **Expected**:
  1. Rename tabs: "Pending" → "Queued", "Failed" → "Failed", "Drifts" → "Mismatches" or "Issues"
  2. Branded empty state — SuperMandi illustration or icon with "You're all caught up!"
  3. Hide "Sync All" button when nothing to sync — or grey it out with "Nothing to sync"
- **Migration**: None
- **Test**: Visual verification with 0, 1, many pending items
- **Depends on**: STG-003 (theme tokens)

---

### STG-011 — Typography and spacing system — POS-grade readability

- **Status**: PARKED — verified in reiteration, tag `stg-011-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — inconsistent font sizes, tight spacing, hard to read at arm's length on counter
- **Scope**: Global typography styles across all POS screens
- **Problem**:
  1. POS app is used at arm's length on a counter — text needs to be larger than a chat app
  2. Prices, quantities, and product names should be scannable in 1 second
  3. Currently: small text, tight line heights, inconsistent sizes across screens
  4. No visual hierarchy — headings and body text are similar weight
- **Expected**:
  1. Base font size: 16px (body), not 14px — POS counter readability
  2. Prices: 20-24px bold — the most important number on every card
  3. Product names: 16px semibold — clearly readable
  4. Secondary info (barcode, timestamps): 12px light grey — de-emphasized
  5. Consistent line-height: 1.4x for body, 1.2x for headings
  6. Minimum touch target: 48px (Android Material guideline)
  7. Card padding: 16px internal, 8px gap between cards
- **Migration**: None
- **Test**: Readability test — can you read product name and price from 60cm away?
- **Depends on**: STG-003 (theme tokens)

---

### STG-012 — Voice FAB — brand-colored, contextual label on first use

- **Status**: PARKED — verified in reiteration, tag `stg-012-2026-03-14`
- **Priority**: P3
- **Source**: Operator review — teal mic button doesn't match brand, no onboarding hint
- **Scope**: Floating Action Button (voice input) on SELL tab
- **Problem**:
  1. Teal color doesn't match the blue brand palette — looks like it belongs to a different app
  2. First-time users won't know what the mic button does
  3. No tooltip or label — just an icon
- **Expected**:
  1. Use primary blue (or a designated accent from STG-003 tokens)
  2. First-use: show extended FAB with label "Voice Search" that collapses to icon after 3 uses
  3. Subtle pulse animation on first visit to draw attention
  4. Consistent shadow/elevation with other card elements
- **Migration**: None
- **Test**: First launch — label visible. After 3 uses — icon only. Color matches brand.
- **Depends on**: STG-003 (theme tokens)

---

### STG-013 — FEFO badge — explain or hide jargon for kirana users

- **Status**: PARKED — verified in reiteration, tag `stg-013-2026-03-14`
- **Priority**: P3
- **Source**: Operator review — "FEFO" badge on SELL tab is warehouse jargon
- **Scope**: FEFO indicator on product listing
- **Problem**:
  1. "FEFO" (First Expired, First Out) is supply chain jargon — kirana retailers won't know what it means
  2. Badge appears without context or explanation
  3. If it's informational, it should explain itself; if it's a toggle, it should look like one
- **Expected**:
  1. Option A: Rename to "Expiry First" or "Sell oldest first" — plain Hindi-English
  2. Option B: Show as a toggle with tooltip — "Products sorted by expiry date (oldest first)"
  3. Option C: Move to settings if it's a global preference, not a per-session toggle
  4. If shown, use a neutral info chip style (not a standalone badge)
- **Migration**: None
- **Test**: Verify label is understandable to non-technical user
- **Depends on**: STG-003 (theme tokens)

---

### STG-014 — DEV MODE banner — hide in production builds

- **Status**: PARKED — verified in reiteration, tag `stg-014-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — orange dashed "DEV MODE" banner visible at bottom of activation screen
- **Scope**: DEV MODE indicator component (likely in root layout or activation screen)
- **Problem**:
  1. DEV MODE banner visible on screen — should only appear in `__DEV__` or development builds
  2. Orange dashed border style is visually jarring
  3. On release APK / production, this must be completely hidden
- **Expected**:
  1. Wrap DEV MODE banner in `if (__DEV__)` check — hidden in release builds
  2. In dev builds, make it less intrusive — small pill at top-right, not a full-width banner
  3. Verify it's gone in release APK
- **Migration**: None
- **Test**: Build release APK → verify no DEV MODE banner. Run in Expo Go → verify banner shows (dev only).
- **Depends on**: None (independent fix)

---

### STG-015 — Inconsistent product card layouts — unify list vs thumbnail styles

- **Status**: PARKED — verified in reiteration, tag `stg-015-2026-03-14`
- **Priority**: P1
- **Source**: Operator review — two completely different product card designs on the same screen
- **Scope**: SELL tab product listing components
- **Problem**:
  1. "Toor Dal (Arhar) 1kg" uses a wide list-style card with green grid icon, full name, and expandable chevron (↓)
  2. "Vim..." and "Tata..." use small square thumbnail cards in a horizontal scroll row with box icons
  3. These are both products in the same store but look like they belong to different apps
  4. The list-style card is more informative (full name, price visible) but takes more space
  5. The thumbnail cards show truncated names and barcodes — less useful
- **Expected**:
  1. **One unified card design** for all products — either list-style or grid, not both
  2. Recommended: compact list cards (product name + price + stock badge) for SELL tab — easier to scan and tap
  3. Grid/thumbnail layout only for category browsing or catalog view (separate screen)
  4. Consistent icon/thumbnail treatment across all cards
  5. The "expand chevron" on the first card — if it expands to show variants/batches, make that pattern consistent
- **Migration**: None
- **Test**: Verify all products render in same card style, check with 1, 5, 20+ products
- **Depends on**: STG-003 (theme tokens), STG-009 (product card redesign)

---

### STG-016 — Cart/checkout indicator — floating total bar when items added

- **Status**: PARKED — verified in reiteration, tag `stg-016-2026-03-14`
- **Priority**: P1
- **Source**: Operator review — no visible cart total, item count, or checkout CTA on SELL screen
- **Scope**: SELL tab — new floating cart bar component
- **Problem**:
  1. When a retailer taps a product to add it to the bill, there is no visible indicator of what's been added
  2. No item count badge, no running total, no "Proceed to checkout" button
  3. Retailer has no idea how much the current bill is without navigating away
  4. This is the #1 POS action — every kirana billing app (Khatabook, Vyapar, MyStore) shows a floating cart bar
- **Expected**:
  1. **Floating bottom bar** appears when cart has 1+ items: "[3 items] ₹435.00 → View Cart"
  2. Slides up with animation when first item added, persists until checkout or cart cleared
  3. Shows: item count, total amount, "View Cart" or "Checkout" CTA
  4. Tapping it opens the cart/checkout screen
  5. Positioned above the Android nav bar, below the product list
  6. Uses primary blue background with white text for high visibility
- **Migration**: None
- **Test**: Add 1 item → bar appears. Add more → count/total updates. Clear cart → bar disappears.
- **Depends on**: STG-003 (theme tokens)

---

### STG-017 — Staff login indicator — show who is logged in on home screen

- **Status**: PARKED — verified in reiteration, tag `stg-017-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — no indication of which staff member is using the POS
- **Scope**: Home screen header area
- **Problem**:
  1. Multi-staff stores have managers and cashiers — need to know who made each sale
  2. Currently no staff name or avatar visible on the home screen
  3. If a staff member forgets to switch accounts, sales get attributed to the wrong person
  4. Shift accountability requires visible identity
- **Expected**:
  1. Show staff name/role in the header area: "Raju (Manager)" — small, unobtrusive
  2. Tappable to switch staff or log out
  3. Use first-letter avatar circle if no photo (e.g., "R" for Raju)
  4. Position: top-right corner or below store name
- **Migration**: None
- **Test**: Verify staff name shows after login, updates on staff switch
- **Depends on**: STG-005 (top bar redesign)

---

### STG-018 — Product cards — add unit/weight context to prices

- **Status**: PARKED — verified in reiteration, tag `stg-018-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — prices shown without quantity/unit context
- **Scope**: Product card component
- **Problem**:
  1. "₹30.00" for Vim — is that per piece? Per bar? Per box of 10?
  2. "₹145.00" for Toor Dal — per kg? Per 500g? Per packet?
  3. Kirana retailers deal in mixed units (pieces, kg, liters, packets) — price without unit is ambiguous
  4. During fast billing, ambiguity leads to wrong pricing
- **Expected**:
  1. Show unit after price: "₹145.00/kg" or "₹30.00/pc"
  2. Pull unit from product variant data (already in DB — `unit_type` field)
  3. If no unit set, show just the price (don't break existing behavior)
  4. For multi-pack products, show per-unit and per-pack: "₹30.00/pc (Box of 10: ₹280)"
- **Migration**: None
- **Test**: Products with kg, pc, ltr, pack units — verify correct display
- **Depends on**: STG-009 (product card redesign)

---

### STG-019 — Activation screen keyboard and navigation UX fixes

- **Status**: PARKED — verified in reiteration, tag `stg-019-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — hamburger menu on activation screen, no keyboard optimization
- **Scope**: Activation screen component
- **Problem**:
  1. Hamburger menu (≡) shown on activation screen — nothing to navigate to before enrollment, confuses first-time users
  2. No back button — user can't escape the screen
  3. Activation code input should trigger uppercase alphanumeric keyboard (SM-XXXXXX format)
  4. No auto-formatting of code — user has to type "SM-" prefix manually
  5. "Activate POS" button has no visible loading/spinner state during API call
- **Expected**:
  1. Remove hamburger menu from activation screen — no sidebar needed here
  2. Auto-prefix "SM-" in the input — user only types 6 characters
  3. Set `autoCapitalize="characters"` and `keyboardType` to limit input
  4. Show spinner on button during enrollment API call
  5. If there's a "Scan QR" option, show it as an alternative to manual entry
- **Migration**: None
- **Test**: Type code → verify uppercase, auto-prefix, loading state, error state
- **Depends on**: STG-004 (activation redesign)

---

### STG-020 — Product card whitespace — remove excess empty area in small cards

- **Status**: PARKED — verified in reiteration, tag `stg-020-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — small product thumbnail cards have massive empty space below content
- **Scope**: Small product card/grid component in SELL tab
- **Problem**:
  1. The square thumbnail cards ("Vim...", "Tata...") have ~60% empty whitespace below the barcode number
  2. Card height appears fixed regardless of content — wasting vertical screen real estate
  3. On a 6-inch screen this means only 2 products visible at a time
- **Expected**:
  1. Card height should auto-size to content (or use a compact fixed height)
  2. Remove or hide barcode from card face — show on tap/expand instead
  3. Reclaimed space = more products visible without scrolling
  4. If cards are in horizontal scroll, consider 2-row grid instead for more visibility
- **Migration**: None
- **Test**: Verify cards are compact, check with varying product name lengths
- **Depends on**: STG-015 (unified card layout)

---

### STG-021 — Sync modal — add tab count badges and last-sync timestamp

- **Status**: PARKED — verified in reiteration, tag `stg-021-2026-03-14`
- **Priority**: P3
- **Source**: Operator review — sync modal tabs don't show item counts, no timestamp
- **Scope**: Sync Status modal component
- **Problem**:
  1. "Failed" and "Drifts" tabs show no count — user must tap each tab to check
  2. No last-sync timestamp visible in the modal (only on home screen)
  3. Full-screen modal feels heavy for a status check — could be a bottom sheet
- **Expected**:
  1. Tab labels with counts: "Pending (0)", "Failed (2)", "Issues (0)"
  2. Show last successful sync timestamp at top of modal: "Last synced: 15s ago"
  3. Consider converting to bottom sheet (50-70% height) instead of full-screen modal
  4. Red badge on "Failed" tab if count > 0 to draw attention
- **Migration**: None
- **Test**: Verify counts update in real-time, check with 0 and 5+ items in each tab
- **Depends on**: STG-010 (sync modal redesign)

---

### STG-022 — Logo pill badge — enlarge and make recognizable as brand mark

- **Status**: PARKED — verified in reiteration, tag `stg-022-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — SuperMandi logo pill badge on activation screen is too small to identify as a brand logo
- **Scope**: Activation screen header, shared logo component
- **Problem**:
  1. The green pill badge with "SuperMandi" is tiny (~24px tall) — looks like a chip, not a logo
  2. The icon inside is unrecognizable at that size — could be anything
  3. First impression for a new retailer: no brand presence, no trust signal
  4. Logo should be the hero element on the activation screen
- **Expected**:
  1. Logo: 64-80px height on activation, 32-40px on home header — instantly recognizable
  2. Use the full SuperMandi wordmark (text + icon) on activation, icon-only on home
  3. Consistent logo usage across all screens — same asset, same sizing rules
  4. Logo should be SVG or high-res PNG to avoid blur on high-DPI screens
- **Migration**: None
- **Test**: Visual verification — logo identifiable at arm's length on Redmi
- **Depends on**: STG-003 (theme tokens), STG-004 (activation redesign)

---

### STG-023 — Activation subtitle — simplify two-concept info text

- **Status**: PARKED — verified in reiteration, tag `stg-023-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — activation screen subtitle mixes device enrollment and store linking concepts
- **Scope**: Activation screen text/copy
- **Problem**:
  1. The subtitle text tries to explain both "what an activation code is" and "how to get one" in one paragraph
  2. Kirana retailers scanning a code don't need a textbook — they need action steps
  3. The info box at the bottom repeats similar information in different words
- **Expected**:
  1. Single clear instruction: "Enter the activation code from your SuperMandi welcome kit"
  2. Below input: small link "Don't have a code? Call support" (links to STG-025)
  3. Remove the info box paragraph — replace with 2-3 bullet icons if needed (step 1: enter code, step 2: start billing)
  4. Use simple Hindi-English friendly language
- **Migration**: None
- **Test**: Show screen to a non-technical person — can they understand what to do in 3 seconds?
- **Depends on**: STG-004 (activation redesign)

---

### STG-024 — Enrollment QR scan — button exists but needs camera integration and UX polish

- **Status**: PARKED — verified in reiteration, tag `stg-024-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — "Scan QR" button exists on enrollment screen but needs camera integration verification and UX polish
- **Scope**: Enrollment screen — QR scan button and camera flow
- **Problem**:
  1. "Scan QR" outlined button exists but unclear if camera integration actually works
  2. Button style is outlined (secondary) but should arguably be more prominent — QR scan is faster than manual entry
  3. No visual indicator of what the QR code looks like — field staff need to know what to scan
  4. Camera permission flow — no graceful error if camera denied
  5. After successful scan, does it auto-fill the Enrollment Code field and auto-submit?
- **Expected**:
  1. Verify camera opens on "Scan QR" tap — if broken, implement camera integration
  2. On successful scan: auto-fill enrollment code + flash green confirmation + auto-submit
  3. Camera permission prompt: explain clearly ("Allow camera to scan your activation QR code")
  4. If camera denied: show toast "Camera needed to scan QR — enter code manually" and highlight the text field
  5. QR generation in superadmin: backend enrollment response should include QR data for printing
  6. Consider swapping button hierarchy: "Scan QR" as primary (filled), "Enter Manually" as secondary
- **Migration**: None
- **Test**: Tap Scan QR → camera opens → scan code → auto-fills → submits. Camera denied → graceful fallback.
- **Depends on**: STG-004 (activation redesign)

---

### STG-025 — Add support phone number on activation and error screens

- **Status**: PARKED — verified in reiteration, tag `stg-025-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — kirana retailers prefer calling over reading help text
- **Scope**: Activation screen, error screens, settings
- **Problem**:
  1. No phone number or WhatsApp link visible anywhere in the app
  2. Kirana owners are non-digital-native — when stuck, they want to call someone
  3. Activation is the highest-friction screen — most likely place to need help
  4. Error screens ("Network error", "Invalid code") have no escape hatch
- **Expected**:
  1. Activation screen: "Need help? Call 1800-XXX-XXXX" or WhatsApp link below the input
  2. Error screens: include support contact alongside retry button
  3. Settings/About: full support contact section
  4. Use `Linking.openURL('tel:...')` or `Linking.openURL('https://wa.me/...')` for tap-to-call/chat
  5. Support number should be configurable via backend config (not hardcoded)
- **Migration**: None (support number is config, not schema)
- **Test**: Tap phone number → dialer opens. Tap WhatsApp → chat opens.
- **Depends on**: None (can implement independently)

---

### STG-026 — Add terms/privacy policy link — Play Store compliance

- **Status**: PARKED — verified in reiteration, tag `stg-026-2026-03-14`
- **Priority**: P1 (Play Store requirement)
- **Source**: Operator review — no terms of service or privacy policy link visible in app
- **Scope**: Activation screen footer, settings/about screen
- **Problem**:
  1. Google Play Store requires apps to link to a privacy policy
  2. No terms/privacy link on activation screen, settings, or anywhere in the app
  3. This is a hard blocker for Play Store publishing
  4. Indian data protection regulations (DPDPA 2023) require explicit consent for data collection
- **Expected**:
  1. Activation screen footer: "By activating, you agree to our [Terms] and [Privacy Policy]"
  2. Links open in-app browser (WebView) or external browser
  3. Settings → About: full links to Terms, Privacy Policy, and Contact
  4. URLs should be configurable via app config (point to supermandi.tech/privacy, supermandi.tech/terms)
  5. Privacy policy page needs to exist on the landing site (separate ticket if needed)
- **Migration**: None
- **Test**: Tap Terms → page opens. Tap Privacy → page opens. Links work offline (cached or graceful error).
- **Depends on**: None (independent, high priority)

---

### STG-027 — Green grid icon on product card — explain or remove

- **Status**: PARKED — verified in reiteration, tag `stg-027-2026-03-14`
- **Priority**: P3
- **Source**: Operator review — green grid/4-square icon on the Toor Dal product card has no tooltip or explanation
- **Scope**: Product card component — icon rendering
- **Problem**:
  1. Green 4-square grid icon appears on the left side of the Toor Dal card
  2. No label, tooltip, or context — user doesn't know what it means
  3. Could mean: category, variant, multi-pack, or nothing — unclear
  4. Inconsistent — not all product cards show this icon
- **Expected**:
  1. If it indicates category: use a category-specific icon (leaf for grocery, bottle for drinks) with label
  2. If it indicates variants: show "3 variants" text chip instead of cryptic icon
  3. If it's a placeholder: replace with product image or category-colored left border
  4. Whatever it means, it must be self-explanatory or removed
- **Migration**: None
- **Test**: Verify meaning of icon in code, replace with clear alternative
- **Depends on**: STG-009 (product card redesign)

---

### STG-028 — Product list section headers — group by category or recent

- **Status**: PARKED — verified in reiteration, tag `stg-028-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — products displayed as a flat unsorted list with no grouping
- **Scope**: SELL tab product listing
- **Problem**:
  1. All products appear in a flat list — no visual separation between categories
  2. A kirana store might have 500+ products — flat list is unnavigable
  3. No "Recently sold" or "Popular" section to surface frequently billed items
  4. Retailers waste time scrolling to find products they sell every day
- **Expected**:
  1. Section headers grouping products: "Grocery", "Cleaning", "Dairy", etc.
  2. Top section: "Frequently Sold" — last 10 products billed (auto-populated from sales data)
  3. Sticky section headers during scroll (SectionList in React Native)
  4. Collapse/expand sections to reduce scroll length
  5. Category filter chips at the top for quick jump: [All] [Grocery] [Dairy] [Cleaning]
- **Migration**: None
- **Test**: Verify sections render, sticky headers work, filter chips filter correctly
- **Depends on**: STG-003 (theme tokens)

---

### STG-029 — SELL tab — add manual "Add Product" button for unlisted items

- **Status**: PARKED — verified in reiteration, tag `stg-029-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — no way to add a product that isn't in the catalog
- **Scope**: SELL tab — add CTA for quick product creation
- **Problem**:
  1. If a product isn't in the catalog, the retailer has no way to bill it from the SELL tab
  2. Kirana stores frequently get new products from suppliers — not all are pre-cataloged
  3. Retailer either has to skip the product (revenue loss) or go to a completely different flow to add it
  4. Competitor apps (Vyapar, Khatabook) allow "Add custom item" during billing
- **Expected**:
  1. "Add Product" button at the bottom of the product list or as a FAB alongside voice button
  2. Opens a quick-add modal: Product name, price, quantity, unit — minimal fields
  3. Creates a local product entry (syncs to catalog later)
  4. Added product immediately appears in the current bill
  5. Mark quick-added products for catalog review later (admin portal)
- **Migration**: None (uses existing product creation API)
- **Test**: Add custom product → appears in bill → syncs after billing complete
- **Depends on**: None (independent feature)

---

### STG-030 — CREDIT tab — explain greyed-out state or enable with guidance

- **Status**: PARKED — verified in reiteration, tag `stg-030-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — CREDIT tab appears greyed/inactive with no explanation
- **Scope**: CREDIT tab component, tab navigation
- **Problem**:
  1. CREDIT tab in the tab bar appears greyed out or inactive — no visual explanation why
  2. User taps it and either nothing happens or gets an empty screen
  3. No tooltip, banner, or setup guidance — feels like a bug, not a feature gate
  4. Credit/udhar is essential for kirana stores — this tab will be used daily once enabled
- **Expected**:
  1. If disabled: show a clear "Coming soon" or "Set up credit" screen inside the tab
  2. Include a brief explanation: "Track customer credit (udhar) — coming soon" or "Enable in Settings"
  3. If feature-flagged: show setup steps (e.g., "Add customers first to start tracking credit")
  4. Tab icon should not look disabled if tappable — use neutral state, not greyed-out
  5. If enabled but empty: show empty state with illustration + "No credit accounts yet"
- **Migration**: None
- **Test**: Tap CREDIT tab → see informative screen, not blank. Check feature-flag on/off states.
- **Depends on**: STG-003 (theme tokens)

---

### STG-031 — Quantity selector — quick +/- buttons for bulk product adds

- **Status**: PARKED — verified in reiteration, tag `stg-031-2026-03-14`
- **Priority**: P1
- **Source**: Operator review — no visible quantity selector when adding products to bill
- **Scope**: Product card interaction, cart add flow
- **Problem**:
  1. Tapping a product presumably adds 1 unit — but there's no visible quantity selector
  2. Kirana billing often involves bulk: "5 packets of salt", "2kg toor dal"
  3. No +/- buttons, no quantity input field, no stepper control
  4. Retailer would have to tap the same product 5 times for 5 units — slow and error-prone
- **Expected**:
  1. On first tap: add 1 unit and show quantity stepper overlay on the card (+/- buttons)
  2. Stepper: [-] [qty] [+] — tap + to increment, - to decrement, long-press for fast repeat
  3. Direct quantity input: tap the number to type exact quantity (e.g., "10")
  4. For weighted items (kg, ltr): show decimal input (e.g., "2.5 kg")
  5. Stepper should remain visible on the card as long as qty > 0
  6. Swipe left to remove or set to 0
- **Migration**: None
- **Test**: Add 1 unit → stepper shows. Tap + 4 times → qty = 5. Tap number → type 10 → qty = 10.
- **Depends on**: STG-009 (product card redesign)

---

### STG-032 — Discount/MRP indicator on product cards

- **Status**: PARKED — verified in reiteration, tag `stg-032-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — no MRP/selling price differentiation visible on product cards
- **Scope**: Product card component — pricing display
- **Problem**:
  1. Only one price shown per product — unclear if it's MRP, selling price, or wholesale
  2. Indian retail requires MRP to be printed/displayed — it's a legal requirement
  3. If selling below MRP (discount), no strikethrough or savings indicator
  4. Retailers need to see their margin at a glance
- **Expected**:
  1. Show MRP (strikethrough) + selling price when different: "~~₹160~~ ₹145"
  2. If same (no discount): show just the price without strikethrough
  3. Optional: show savings percentage or rupee discount as a green chip "Save ₹15"
  4. Pull MRP from product data (already in DB — `mrp` field)
  5. Margin indicator for owner/manager role: small "Margin: ₹20" text (hidden for cashiers)
- **Migration**: None
- **Test**: Products with MRP ≠ selling price show strikethrough. Same price = no strikethrough.
- **Depends on**: STG-009 (product card redesign)

---

### STG-033 — Favorites/frequently sold section on SELL tab

- **Status**: PARKED — verified in reiteration, tag `stg-033-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — no quick-access section for frequently sold items
- **Scope**: SELL tab — new section above product list
- **Problem**:
  1. A typical kirana store sells the same 20-30 products every day — milk, bread, dal, soap
  2. Currently these are buried in the full product list — retailer has to search/scroll every time
  3. No "pin to top" or "favorites" feature to speed up repeat billing
  4. This is the #1 efficiency feature for POS apps — speeds up checkout significantly
- **Expected**:
  1. "Quick Add" or "Frequently Sold" horizontal strip at top of SELL tab
  2. Auto-populated from last 7 days of sales data (top 10-15 products by frequency)
  3. Compact circular or pill cards: product name + tap to add
  4. Manual pin: long-press any product → "Add to Quick Sell" option
  5. Editable: settings to manage pinned/quick-sell products
  6. First visit (no sales data): show store's full catalog in category order instead
- **Migration**: None (reads from existing sales data)
- **Test**: Sell 5 products → next session shows them in "Frequently Sold". Pin a product → appears in strip.
- **Depends on**: STG-003 (theme tokens), STG-028 (section headers)

---

### STG-034 — Recent bills shortcut — quick access to last 5 transactions

- **Status**: PARKED — verified in reiteration, tag `stg-034-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — no way to quickly view recent bills from the SELL screen
- **Scope**: Home screen — recent bills widget or shortcut
- **Problem**:
  1. A kirana retailer needs to reprint, void, or review the last bill frequently
  2. "Customer just left and came back — what was the total?" — common scenario
  3. No recent transactions visible on the home screen — must navigate to a separate history screen
  4. Speed matters during billing — every extra tap costs time during rush hours
- **Expected**:
  1. Recent bills strip or icon on SELL tab: last 3-5 bills as compact cards
  2. Show: bill number, time, total amount, items count
  3. Tap to expand: full bill details with reprint option
  4. Or: floating "Last Bill: ₹435 (3 items) — 2 min ago" pill above the cart bar
  5. Long-press: quick actions (reprint, void, add item to current bill)
- **Migration**: None (reads from existing order data)
- **Test**: Complete a bill → recent bill shows on SELL tab. Tap → see details.
- **Depends on**: None (independent feature)

---

### STG-035 — Empty state design for zero-product store

- **Status**: PARKED — verified in reiteration, tag `stg-035-2026-03-14`
- **Priority**: P2
- **Source**: Operator review — no designed empty state when store has zero products
- **Scope**: SELL tab, product listing empty state
- **Problem**:
  1. A freshly activated store has zero products — what does the SELL tab show?
  2. Likely: blank white screen or "No products found" text — feels broken
  3. Retailer doesn't know what to do next — add products? Wait for sync? Call support?
  4. Empty states are a critical onboarding moment — must guide the user to the next action
- **Expected**:
  1. Branded illustration: cart/store shelves with "Let's stock your store!" message
  2. Clear CTA: "Add your first product" button → opens product creation flow
  3. Secondary: "Import from catalog" if store catalog sync is available
  4. Tertiary: "Products syncing..." with progress bar if sync is in progress
  5. Support link: "Need help? Call support" (connects to STG-025)
  6. Never show a completely blank screen — always show guidance
- **Migration**: None
- **Test**: New store with 0 products → see empty state. Add 1 product → empty state disappears.
- **Depends on**: STG-003 (theme tokens)

---

### STG-036 — Date/time display in app header

- **Status**: PARKED — verified in reiteration, tag `stg-036-2026-03-14`
- **Priority**: P3
- **Source**: Operator review — no date or time visible in the POS app header
- **Scope**: Home screen header area
- **Problem**:
  1. POS apps typically show current date/time — helps with shift tracking and receipt context
  2. Kirana retailers use the POS as their primary work screen — no clock visible means checking phone
  3. Date context: "Is today's stock updated?" — date visibility helps
  4. Receipts generated from POS should match visible date/time
- **Expected**:
  1. Show current date + time in header: "13 Mar 2026 • 2:45 PM"
  2. Small text, right-aligned in header area — unobtrusive
  3. Live clock (updates every minute, not every second — battery efficient)
  4. Format: Indian date format (DD MMM YYYY), 12-hour time with AM/PM
  5. Position: below store name or alongside status icons
- **Migration**: None
- **Test**: Verify clock updates, correct IST timezone, no battery drain from frequent re-renders
- **Depends on**: STG-005 (header redesign)

---

### STG-037 — Customer name/phone entry before billing for credit sales

- **Status**: PARKED — verified in reiteration, tag `stg-037-2026-03-14`
- **Priority**: P1
- **Source**: Operator review — no customer identification step before starting a credit (udhar) bill
- **Scope**: Billing/checkout flow, customer selection component
- **Problem**:
  1. Credit sales (udhar) are the backbone of kirana commerce — most regular customers buy on credit
  2. Currently no way to attach a customer to a bill before checkout
  3. Without customer identity, credit tracking is impossible — who owes what?
  4. Retailers track udhar in physical notebooks — SuperMandi should replace this workflow
  5. Even cash sales benefit from customer linking (loyalty, purchase history)
- **Expected**:
  1. Optional "Select Customer" input at top of cart/checkout — search by name or phone
  2. Quick-add: if customer not found, "Add new customer" with name + phone (minimal fields)
  3. For credit sale: customer selection becomes mandatory (can't create udhar without identity)
  4. Recent customers list: last 5-10 customers for quick selection
  5. Customer phone → auto-lookup → show name, outstanding balance, last purchase
  6. After linking: bill shows "Customer: Raju (₹450 due)" as header
- **Migration**: May need `customers` table if not existing (check schema first)
- **Test**: Select customer → bill linked. Credit sale without customer → blocked with message.
- **Depends on**: STG-030 (CREDIT tab), STG-016 (cart/checkout)

---

### STG-038 — Enrollment — Device type hardcoded as "RETAILER_PHONE", no auto-detection

- **Status**: PARKED — verified in reiteration, tag `stg-038-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — `EnrollDeviceScreen.tsx:196` hardcodes `deviceType: "RETAILER_PHONE"`
- **Scope**: `src/screens/EnrollDeviceScreen.tsx:196`
- **Problem**:
  1. Line 196 sends `deviceType: "RETAILER_PHONE"` for ALL enrollments — no UI selector exists (original ticket assumed chip buttons existed; they don't)
  2. Backend supports 3 types: RETAILER_PHONE, OEM_HANDHELD, SUPERMANDI_PHONE — but only RETAILER_PHONE is ever sent
  3. OEM handheld devices (e.g., Sunmi, PAX) have different hardware capabilities (built-in scanner, thermal printer) that backend uses for feature gating
  4. No auto-detection logic to identify device type from hardware signatures
- **Expected**:
  1. Add auto-detection: check `Device.brand` / `Device.modelName` against known OEM POS brands (Sunmi, PAX, Elo, Newland) → set OEM_HANDHELD
  2. Fallback to RETAILER_PHONE for unrecognized devices
  3. No user-facing selector needed — auto-detect is sufficient for MVP
  4. Log detected device type to enrollment metadata for support debugging
- **Migration**: None
- **Test**: Enroll on Redmi → sends RETAILER_PHONE. Mock Device.brand="Sunmi" → sends OEM_HANDHELD.
- **Depends on**: None

---

### STG-039 — Enrollment — Move printer setup to post-activation settings (not enrollment)

- **Status**: PARKED — verified in reiteration, tag `stg-039-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — `EnrollDeviceScreen.tsx` has NO printing mode selector UI; printer config only in `PrinterSettingsScreen.tsx`
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`, `src/screens/PrinterSettingsScreen.tsx`
- **Problem**:
  1. Original ticket assumed a printing mode selector exists on enrollment screen — it does NOT
  2. Printing mode is configured ONLY in PrinterSettingsScreen (post-enrollment)
  3. However, EnrollDeviceScreen error message at line 123 references `PRINTING_MODE_INVALID` — backend validates a field the frontend never sends
  4. New users have no guidance about printer setup during or after enrollment
- **Expected**:
  1. After successful enrollment, show a "Set up your printer?" prompt with "Set Up Now" (→ PrinterSettingsScreen) and "Skip" options
  2. Remove `PRINTING_MODE_INVALID` error handling from EnrollDeviceScreen (dead code — backend never receives this field from POS)
  3. Add "Printer not set up" nudge on MenuScreen if no printer configured after first 3 bills
- **Migration**: None
- **Test**: Enroll device → "Set up printer?" prompt appears. Skip → lands on home. "Set Up Now" → opens PrinterSettingsScreen.
- **Depends on**: STG-004 (enrollment redesign)

---

### STG-040 — Enrollment — Header layout uses flexDirection:"row" with no small-screen breakpoint

- **Status**: PARKED — verified in reiteration, tag `stg-040-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — `EnrollDeviceScreen.tsx` header layouts at lines 636, 712, 783, 793, 847 use `flexDirection:"row"` with no responsive breakpoint
- **Scope**: `src/screens/EnrollDeviceScreen.tsx:636,712,783,793,847`
- **Problem**:
  1. Original ticket assumed device type chip selectors exist — they don't (see STG-038)
  2. However, the enrollment screen DOES have multiple `flexDirection:"row"` header layouts that can break on screens < 360dp
  3. The activation code input + button row (lines 479-549) may overlap on narrow screens
  4. Device label input + model name display may truncate on small screens
- **Expected**:
  1. Add `flexWrap: 'wrap'` to row layouts at lines 636, 712, 783, 793, 847
  2. Test activation code input area on 320dp width — ensure input field and button don't overlap
  3. Use `useWindowDimensions()` to detect narrow screens and switch to stacked (column) layout if width < 360
- **Migration**: None
- **Test**: Test on 320dp, 360dp, and 400dp widths — all form elements visible and usable.
- **Depends on**: STG-004 (enrollment redesign)

---

### STG-041 — Enrollment — no inline form validation feedback on code input

- **Status**: PARKED — verified in reiteration, tag `stg-041-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — enrollment code field shows "SM-XXXXXX" placeholder but no validation feedback
- **Scope**: Enrollment screen — Enrollment Code input field
- **Problem**:
  1. No real-time validation as user types — no green checkmark for valid format, no red border for invalid
  2. User types "SM-7V7CM9" — no indication if the format is correct before pressing "Enroll Device"
  3. Invalid code errors only appear after submit — wasted round trip
  4. No character count indicator — user doesn't know when they've typed enough
  5. "SM-" prefix not auto-filled — user may type "7V7CM9" without prefix and get an error
- **Expected**:
  1. Auto-fill "SM-" prefix — input starts with "SM-" and cursor positioned after it (non-editable prefix)
  2. Real-time format validation: green border when 6 alphanumeric chars after "SM-", red if wrong format
  3. Character count: show "6/6" or progress dots under the field
  4. On valid format: green checkmark icon inside the input field (right side)
  5. On invalid submit: inline error message below field "Code not found — check your activation kit"
  6. Auto-uppercase input (activation codes are uppercase)
- **Migration**: None
- **Test**: Type valid code → green border + checkmark. Type 3 chars → no validation yet. Type invalid → red border on submit.
- **Depends on**: STG-019 (keyboard fixes), STG-004 (enrollment redesign)

---

### STG-042 — Enrollment — Default label uses raw Device.modelName (e.g., "23106RN0DA")

- **Status**: PARKED — verified in reiteration, tag `stg-042-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — `EnrollDeviceScreen.tsx:187` sets `defaultLabel` from `Device.modelName || Device.deviceName || ""`
- **Scope**: `src/screens/EnrollDeviceScreen.tsx:187,499-512`
- **Problem**:
  1. Line 187: `defaultLabel` set from `Device.modelName` which returns raw hardware codes like "23106RN0DA" (Redmi Note 13 Pro)
  2. User CAN edit in TextInput (lines 499-512) with placeholder "e.g., Counter-1, Billing-Main" but most won't
  3. No auto-increment logic — all devices from same model get same default label
  4. Original ticket assumed "Counter-1" was hardcoded — it's actually the raw model code, which is worse
- **Expected**:
  1. Map common `Device.modelName` codes to friendly names (e.g., "23106RN0DA" → "Redmi Note 13 Pro") using a lookup table of top 20 Indian market devices
  2. If model unrecognized, fall back to `Device.deviceName` or "My POS"
  3. For multi-device stores: append auto-increment suffix "My POS 1", "My POS 2" based on enrolled device count (requires API call to check existing devices)
  4. Show hint: "Name this device (e.g., Front Counter, Warehouse)"
- **Migration**: None
- **Test**: Enroll on Redmi → default label shows "Redmi Note 13 Pro" not "23106RN0DA". Unknown device → shows "My POS".
- **Depends on**: None (independent)

---

### STG-043 — Enrollment — floating labels for input fields (placeholder disappears on focus)

- **Status**: PARKED — verified in reiteration, tag `stg-043-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — input fields use placeholder text only, which disappears when field is focused
- **Scope**: Enrollment screen — all input fields
- **Problem**:
  1. "SM-XXXXXX" placeholder disappears when user taps into the Enrollment Code field
  2. User forgets what the field is for — no persistent label visible during typing
  3. "Counter-1" in Device Label is both a default value and implied placeholder — confusing dual role
  4. After typing, user can't verify which field is which without clearing and re-reading placeholder
  5. Material Design and Apple HIG both recommend persistent floating labels for form fields
- **Expected**:
  1. Implement floating label pattern: label starts as placeholder, animates above the field on focus
  2. "Enrollment Code" floats above when user starts typing "SM-7V7CM9" — both label and input visible
  3. "Device Label" floats above when user edits — they can see both "Device Label" and their typed value
  4. Use React Native Paper `TextInput` or custom animated floating label component
  5. Label color: neutral grey when unfocused, primary blue when focused
- **Migration**: None
- **Test**: Tap field → label animates up. Type text → label stays visible. Blur → label stays up if field has value.
- **Depends on**: STG-003 (theme tokens), STG-004 (enrollment redesign)

---

### STG-044 — Enrollment — button hierarchy: "Scan QR" vs "Enroll Device" visual weight

- **Status**: PARKED — verified in reiteration, tag `stg-044-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot review — "Scan QR" (outlined) and "Enroll Device" (filled blue) are same width, competing visually
- **Scope**: Enrollment screen — CTA button pair
- **Problem**:
  1. Both buttons are full-width — equal visual weight despite different importance levels
  2. "Enroll Device" is the primary CTA (filled blue, correct) but "Scan QR" (outlined) is equally prominent due to same size
  3. User must decide between two full-width actions — cognitive overhead
  4. For field-deployed QR enrollment, "Scan QR" should arguably be the primary action (faster flow)
  5. Stacked full-width buttons: 2 buttons × ~56px = 112px of vertical space for CTAs alone
- **Expected**:
  1. Option A: "Scan QR" as inline link/text button above the "Enroll Device" CTA — not a full-width button
  2. Option B: Side-by-side buttons — "Scan QR" (50% width, outlined) + "Enroll Device" (50%, filled)
  3. Option C: Make "Scan QR" the primary (filled) and "Enter code manually" the secondary — if QR is the expected flow
  4. Add "OR" divider between the two options to clarify they're alternatives
  5. Consider: most kirana activations are field-deployed (staff present) → QR is primary; self-install → manual is primary
- **Migration**: None
- **Test**: Verify primary CTA is visually dominant, secondary is clearly alternative
- **Depends on**: STG-024 (QR scan polish), STG-004 (enrollment redesign)

---

### STG-045 — Home — "Ready for billing" status text too small for key operational state

- **Status**: PARKED — verified in reiteration, tag `stg-045-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — "Ready for billing" in green text is tiny (~12px) next to the store ID
- **Scope**: Home screen — store info line below store name
- **Problem**:
  1. "Ready for billing" is THE most important operational state — tells retailer the system is good to go
  2. Currently rendered in small green text (~12px) next to "ID SU260308-001" — easy to miss
  3. When NOT ready (e.g., "Syncing...", "Offline"), this status becomes critical — must be immediately visible
  4. Competes visually with the store ID which is equally small and equally prominent
  5. A kirana retailer glancing at the screen during a rush should see "READY" in 0.5 seconds
- **Expected**:
  1. "Ready for billing" as a prominent status chip: green background, white text, 14-16px bold
  2. Negative states more prominent: "Offline" = red chip, "Syncing" = amber chip with spinner
  3. Move store ID to settings/info screen — it's reference info, not operational
  4. Position status chip directly below store name or in the header alongside sync indicator
  5. Consider: large status dot (green/amber/red) + text as the primary header element
- **Migration**: None
- **Test**: Verify "Ready for billing" is readable at arm's length. Switch to offline → verify red state is prominent.
- **Depends on**: STG-005 (header redesign), STG-003 (theme tokens)

---

### STG-046 — Product card expand chevron (↓) — no hint of what it expands to

- **Status**: PARKED — verified in reiteration, tag `stg-046-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot review — Toor Dal card has a down-arrow (↓) chevron below the green grid icon
- **Scope**: Product card component — expand/collapse affordance
- **Problem**:
  1. Down chevron (↓) below the green grid icon on the Toor Dal card — unclear what it does
  2. Does it expand to show: variants? Batch details? Stock info? Description? Expiry dates?
  3. No label, tooltip, or visual hint — user must tap to discover (low discoverability)
  4. The chevron is positioned below the icon, not aligned with the card content — feels disconnected
  5. Small cards (Vim, Tata) don't have this chevron — inconsistent across card types
- **Expected**:
  1. Add micro-label: "Details ↓" or "3 batches ↓" to explain what expands
  2. Or: show key expanded info directly (stock count, expiry) without needing expand — reduce clicks
  3. If expanding shows variants: show variant count on the card "3 variants" → tap to see them
  4. Consistent behavior: ALL product cards should have expand or NONE should — not just some
  5. Expanded state: use smooth animation, show a card with variant rows inside
- **Migration**: None
- **Test**: Tap chevron → verify what expands. Verify all cards have consistent expand behavior.
- **Depends on**: STG-009 (product card redesign), STG-015 (unified card layout)

---

### STG-047 — Horizontal product row misleading — empty space implies missing products

- **Status**: PARKED — verified in reiteration, tag `stg-047-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — two small product cards (Vim, Tata) in a horizontal scroll row with empty space to the right
- **Scope**: SELL tab — product listing layout
- **Problem**:
  1. Two small cards sit in what appears to be a horizontal scroll container
  2. Empty space to the right of the second card implies there are more products off-screen
  3. User swipes right expecting more products — finds nothing
  4. This horizontal row occupies ~40% of the visible screen but shows only 2 items
  5. The list card (Toor Dal) above and thumbnail cards below use completely different layouts — disorienting
- **Expected**:
  1. If only 2-3 products: use a full-width vertical list, not a horizontal scroll
  2. Horizontal scroll only makes sense with 5+ items where you need to save vertical space
  3. Fill empty space: if using horizontal scroll, show "Add product +" as the last card placeholder
  4. Or: switch to a 2-column grid for all products — more consistent, shows more items
  5. Show total product count: "3 products" header above the list to set expectations
- **Migration**: None
- **Test**: 2 products → vertical list, no empty scroll space. 10 products → horizontal scroll with scroll indicator.
- **Depends on**: STG-015 (unified card layout)

---

### STG-048 — Voice FAB position — overlaps product cards on longer lists

- **Status**: PARKED — verified in reiteration, tag `stg-048-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — teal mic FAB in bottom-right positioned where product cards would be on longer lists
- **Scope**: SELL tab — Voice FAB positioning
- **Problem**:
  1. Mic FAB sits at bottom-right over the product area
  2. With 2 products it's fine — but with 10+ products, the FAB will cover the last product card
  3. User can't tap the product underneath the FAB — must scroll past it
  4. FAB has no "dodge" behavior — product list doesn't add bottom padding to account for FAB height
  5. On smaller screens the FAB takes proportionally more space
- **Expected**:
  1. Add `paddingBottom: 80` to the product list FlatList to prevent FAB overlap
  2. Or: position FAB above the cart bar (STG-016) — both float but don't overlap content
  3. FAB should "hide" or shrink when user is actively scrolling the product list (scroll-aware FAB)
  4. On long-press: FAB becomes draggable so user can reposition it
  5. Keep FAB above Android nav bar — currently looks properly positioned
- **Migration**: None
- **Test**: Add 20 products → verify last product is tappable, not hidden by FAB. Scroll → verify FAB behavior.
- **Depends on**: STG-012 (FAB redesign), STG-016 (cart bar)

---

### STG-049 — Top-right camera icon is a hardware status indicator, not a button — confusing affordance

- **Status**: PARKED — verified in reiteration, tag `stg-049-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — `PosStatusBar.tsx:150-151` renders camera icon as status indicator (available/unavailable), not an action button
- **Scope**: `src/components/PosStatusBar.tsx:150-151,343-362`
- **Problem**:
  1. Line 150: shows "camera" or "camera-off" MaterialCommunityIcon as a **status indicator** (not a button)
  2. Line 151: label is "Camera available" / "Camera not available" — shown in a popover on tap (lines 343-362)
  3. Users see a camera icon and expect tapping it opens a camera/scanner — but it only shows status text
  4. The icon looks like a button (same size/style as other header icons) creating a false affordance
  5. Camera availability status is not useful to end users — it's a developer diagnostic
- **Expected**:
  1. **Option A**: Make it functional — tapping camera icon opens barcode scanner (replaces the camera status indicator with an action)
  2. **Option B**: Remove from header entirely — camera status is not user-relevant (move to Settings > Device Info)
  3. **Option C**: If keeping as status, reduce icon size and grey it out so it doesn't look interactive
  4. Decide: is camera icon needed for barcode scanning shortcut (useful) or just diagnostics (remove)?
- **Migration**: None
- **Test**: Chosen option renders correctly. If Option A: tap → opens camera. If B: icon removed. If C: icon is clearly non-interactive.
- **Depends on**: STG-005 (header redesign)

---

### STG-050 — No pull-to-refresh indicator on product list

- **Status**: PARKED — verified in reiteration, tag `stg-050-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot review — no visual indicator that pulling down refreshes the product list
- **Scope**: SELL tab — product list scroll behavior
- **Problem**:
  1. Standard mobile UX: pull down to refresh a list. Users expect this everywhere.
  2. If new products were added via catalog sync, user needs to refresh to see them
  3. No visual indicator (spinner, arrow) that pull-to-refresh is available or active
  4. If pull-to-refresh IS implemented, no branded loading indicator (just default spinner)
  5. Without this, only way to refresh is: leave tab and come back, or restart app
- **Expected**:
  1. Implement `RefreshControl` on the product FlatList/SectionList
  2. Branded pull indicator: SuperMandi logo animation or branded spinner
  3. On refresh: re-fetch products from local DB + trigger background sync if online
  4. Show last-refresh timestamp: "Products updated 30s ago" at the top of the list
  5. If already synced (no changes), show brief toast "Already up to date"
- **Migration**: None
- **Test**: Pull down → spinner appears → products refresh. Already up to date → shows toast.
- **Depends on**: STG-003 (theme tokens)

---

### STG-051 — Daily session counter — show "Bills today" and "Sales total" on home

- **Status**: PARKED — verified in reiteration, tag `stg-051-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — no daily business metrics visible on the home screen
- **Scope**: Home screen — new daily summary widget
- **Problem**:
  1. A POS home screen should immediately tell the retailer: "How's business today?"
  2. No visible: bills count, total sales amount, items sold, or last bill time
  3. Retailer has to navigate to a separate reports screen to see basic daily metrics
  4. During busy hours, quick metrics help staff track performance without leaving the SELL screen
  5. Every competitor POS app (Vyapar, Khatabook, PetPooja) shows daily totals on the home screen
- **Expected**:
  1. Compact daily summary bar below the header (or inside the collapsed sync panel area):
     - "Today: 12 bills | ₹4,520 | Last: 3m ago"
  2. Tappable: opens daily report details
  3. Updates in real-time as bills are created
  4. Reset at midnight (or store opening time if configured)
  5. Manager view: show comparison "Yesterday: 15 bills | ₹5,200" (subtle, below today's count)
  6. Zero state: "No bills yet today — let's start selling!"
- **Migration**: None (reads from existing order data)
- **Test**: Create 3 bills → counter shows 3, total correct. Next day → resets to 0.
- **Depends on**: STG-006 (sync panel collapse — reclaim space for this widget)

---

### STG-052 — Store name truncation uses clip mode, no long-press to see full name

- **Status**: PARKED — verified in reiteration, tag `stg-052-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — `PosStatusBar.tsx:444-448` uses `numberOfLines={2}` + `ellipsizeMode="clip"`
- **Scope**: `src/components/PosStatusBar.tsx:444-448`
- **Problem**:
  1. Line 444-448: Store name uses `formatStoreName(storeName)` with `numberOfLines={2}` and `ellipsizeMode="clip"`
  2. `clip` abruptly cuts text mid-character — should use `tail` for clean "..." truncation
  3. Store ID label (line 129) shows either storeCode (human-readable) or last 8 chars of UUID — inconsistent
  4. No way for user to see full store name if truncated
  5. Real store names like "Ramesh Kumar General Store & Provisioning" (42 chars) will definitely clip on 5-inch screens
- **Expected**:
  1. Change `ellipsizeMode="clip"` to `ellipsizeMode="tail"` at line 448
  2. Add long-press handler on store name → shows full name in a tooltip or bottom sheet
  3. Store ID: always show storeCode (human-readable "SU260305-003" format), never raw UUID
  4. Consider auto-scaling font size for long names: 16px default, 14px if >30 chars, 12px min
- **Migration**: None
- **Test**: Set 50-char store name → clean "..." truncation, not abrupt clip. Long-press → full name shown.
- **Depends on**: STG-005 (header redesign)

---

### STG-053 — Accessibility — WCAG AA contrast audit across all buttons and text

- **Status**: PARKED — verified in reiteration, tag `stg-053-2026-03-14`
- **Priority**: P1 (legal/compliance — accessibility guidelines)
- **Source**: Screenshot review — "Scan product here" white-on-green button may fail WCAG AA 4.5:1 contrast
- **Scope**: All screens — color contrast audit
- **Problem**:
  1. Green "Scan product here" button (#22C55E or similar) with white text — contrast ratio likely ~3:1 (fails AA minimum 4.5:1)
  2. Light grey placeholder text in input fields — may fail AA for large text (3:1 minimum)
  3. "CREDIT" tab in grey on white — may be below readable contrast for inactive state
  4. Blue-on-white tab labels — check all active/inactive states
  5. Android accessibility scanner would flag these issues — potential Play Store review concern
  6. Indian government accessibility guidelines (GIGW) recommend WCAG 2.0 AA compliance
- **Expected**:
  1. Audit all text/background color pairs across all screens using a contrast checker
  2. All body text: minimum 4.5:1 contrast ratio (WCAG AA)
  3. All large text (18px+): minimum 3:1 contrast ratio
  4. All interactive elements (buttons, links): minimum 4.5:1
  5. Fix the green "Scan" button: darken to #16A34A or use dark text on light green background
  6. Fix inactive tab text: ensure grey is dark enough (min #6B7280 on white)
  7. Test with Android Accessibility Scanner and TalkBack screen reader
- **Migration**: None
- **Test**: Run accessibility scanner on every screen. All contrast ratios pass WCAG AA.
- **Depends on**: STG-003 (theme tokens — define accessible color palette)

---

### STG-054 — Hindi translation completion — i18n infrastructure exists but coverage is partial

- **Status**: PARKED — verified in reiteration, tag `stg-054-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — i18n setup at `src/i18n/index.ts:18` supports `['en', 'hi']`. Language toggle on `MenuScreen.tsx:983-1004` as "EN" | "हि" chips. But many screens have zero t() usage.
- **Scope**: `src/i18n/locales/hi.json` (primary), all screens listed in STG-257–STG-279
- **Problem**:
  1. i18n infrastructure (i18next + react-i18next) is ALREADY set up — `src/i18n/index.ts` configures en/hi
  2. Language toggle EXISTS on MenuScreen (lines 983-1004) — "EN" | "हि" chip pair
  3. `en.json` and `hi.json` locale files exist but coverage is partial
  4. 13 screens have ZERO t() usage (see STG-257-279 audit): PaymentSetup, BillDetail, SalesStatement, DailyReport, GRN, OpeningStock, KhataScreen, OverdueDues, ShiftScreen, ReturnScreen, BulkPurchaseCredit, ErrorBoundary, and partial gaps in 10+ other screens
  5. Hindi translations in `hi.json` are incomplete — many keys only have English fallbacks
  6. Toggle label "हि" is non-standard abbreviation — should be "हिंदी"
- **Expected**:
  1. **Phase 1** (this ticket): Complete `hi.json` translations for all EXISTING i18n keys. Fix toggle label to "हिंदी"
  2. **Phase 2** (STG-257–STG-279): Extract hardcoded English strings to t() calls in each screen (separate tickets per screen)
  3. Persist language choice in AsyncStorage (verify this already works via i18next-async-storage-backend)
  4. Ensure language selector visible on EnrollDeviceScreen for first-time users (currently only in MenuScreen)
- **Migration**: None (frontend-only)
- **Test**: Switch to Hindi → all existing t() keys render in Devanagari. Toggle shows "हिंदी". Switch back → English. Language persists across app restart.
- **Depends on**: None (infrastructure already exists)

---

### STG-055 — App version display on enrollment and settings screens

- **Status**: PARKED — verified in reiteration, tag `stg-055-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot review — no app version number visible anywhere in the app
- **Scope**: Enrollment screen footer, Settings/About screen
- **Problem**:
  1. When a retailer calls support: "What version are you on?" — they can't answer
  2. No version number on enrollment screen — critical for debugging first-time issues
  3. No Settings/About screen with version, build number, or device info
  4. Support staff can't triage issues without knowing the app version
  5. Version mismatch between installed and required (minAppVersion) — no easy way to compare
- **Expected**:
  1. Enrollment screen: small "v1.0.1" at bottom-center of screen (above Android nav)
  2. Settings/About: full version info — App Version, Build Number, Device Model, OS Version, Store ID
  3. Tappable version → copy to clipboard (support can ask user to paste it)
  4. Format: "SuperMandi POS v1.0.1 (build 42)" — human-readable
  5. Pull version from `app.json` or `expo-constants` (already available in Expo)
- **Migration**: None
- **Test**: Verify version matches `app.json`. Tap → copies to clipboard. Build number increments on new build.
- **Depends on**: None (independent)

---

### STG-056 — Product card tap feedback — haptic vibration and ripple effect

- **Status**: PARKED — verified in reiteration, tag `stg-056-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot review — product cards have no visible tap feedback (no ripple, no scale, no haptic)
- **Scope**: All tappable product cards on SELL tab
- **Problem**:
  1. Android Material Design requires touch ripple feedback on all interactive surfaces
  2. Product cards are the primary billing interaction — user taps 50-200 times per session
  3. Without feedback: user doesn't know if tap registered → taps again → double-adds products
  4. No haptic vibration on add-to-cart — missed micro-interaction that confirms the action
  5. POS hardware (OEM handhelds) often has poor touch sensitivity — feedback is critical
- **Expected**:
  1. Android ripple effect on all product cards using `TouchableNativeFeedback` or `Pressable` with `android_ripple`
  2. Light haptic vibration (10ms) on product add — `Haptics.impactAsync(ImpactFeedbackStyle.Light)`
  3. Subtle scale animation on press: `transform: [{ scale: 0.97 }]` — visual confirmation
  4. Card background briefly highlights on add (flash green or primary color for 200ms)
  5. Audio click optional — some POS apps use a subtle "beep" on scan/add
  6. For quantity changes (+/-), lighter haptic than initial add
- **Migration**: None
- **Test**: Tap product → see ripple + feel haptic + card flashes. Rapid taps → each one registered with feedback.
- **Depends on**: STG-009 (product card redesign)

---

### STG-057 — Activation text rewrite — remove "superadmin", simplify to 3-step flow

- **Status**: PARKED — verified in reiteration, tag `stg-057-2026-03-14`
- **Priority**: P1 (user-facing copy is the first impression for every new retailer)
- **Source**: Operator flagged — subtitle "Use your activation code after retailer registration on web and superadmin account activation" is vague, uses internal jargon
- **Scope**: Activation screen — subtitle text + info box text
- **Problem**:
  1. **"superadmin" appears TWICE** — in subtitle ("superadmin account activation") and info box ("wait for superadmin account activation"). This is internal company terminology. A kirana retailer opening the app for the first time has ZERO context for what a "superadmin" is.
  2. **Subtitle is a backwards run-on sentence** — crams 3 concepts into 1 line: (a) use activation code, (b) after registering on web, (c) after superadmin activates. Order is confusing.
  3. **"account activation" is circular** — using the word "activation" to explain how to get an "activation code" creates a loop.
  4. **Tone is corporate/technical** — should be warm, welcoming, Hindi-English friendly for a first-time kirana store setup.
  5. **No user action is clear** — subtitle describes prerequisites, not what to DO right now.
- **Expected**:
  1. **Replace subtitle** with action-first copy:
     - "Enter the activation code from your welcome kit" (simple, direct)
     - OR "Enter the code you received after registration" (if no physical kit)
  2. **Remove ALL instances of "superadmin"** — replace with:
     - "After registration, your account will be reviewed and approved (usually within 24 hours)"
     - OR "After registration, you'll receive an activation code via SMS"
  3. **Remove "on web"** — replace with specific: "at supermandi.tech" or just "online"
  4. **Break into numbered steps** (in info box, not subtitle):
     - Step 1: Register at supermandi.tech
     - Step 2: Your account gets verified
     - Step 3: Enter code here
  5. **Tone**: Warm, first-person: "Welcome! Let's set up your POS."
- **Migration**: None
- **Test**: Show the screen to a non-technical person. Can they understand what to do in 3 seconds?
- **Depends on**: STG-004 (activation redesign)

---

### STG-058 — Activation info box — replace wall-of-text with collapsible visual steps

- **Status**: PARKED — verified in reiteration, tag `stg-058-2026-03-14`
- **Priority**: P1
- **Source**: Operator review — info box at bottom of activation screen is a paragraph of text that won't be read
- **Scope**: Activation screen — info/help section at bottom
- **Problem**:
  1. Info box contains 4 lines of text in a bordered container — too much to read during setup
  2. Content overlaps with the subtitle — both explain the same registration flow
  3. "Register your retailer account at supermandi.tech/retailer/register" — raw URL, not tappable as a button
  4. "After registration, wait for superadmin account activation. Then enter your activation code here." — repeats subtitle
  5. "Need help? hello@supermandi.tech" — email for kirana retailers who don't use email
  6. The box visually competes with the form above — two equally prominent sections fight for attention
- **Expected**:
  1. **Replace with collapsible section**: "Don't have a code? ▼" — tap to expand
  2. **Expanded content as visual steps** (not prose):
     - 📝 Step 1: Register online → [Register] button
     - ✅ Step 2: Account verified (1-2 days)
     - 📱 Step 3: Enter code here
  3. **Collapsed by default** — retailers WITH codes shouldn't see registration instructions
  4. **"Need help?" section**: Phone icon + number + WhatsApp icon + link (not email)
  5. **Position**: Below the "Activate POS" button, visually subordinate to the main form
- **Migration**: None
- **Test**: Verify collapsed by default. Expand → see steps. Tap Register → opens browser. Tap phone → opens dialer.
- **Depends on**: STG-057 (text rewrite), STG-059 (support contact)

---

### STG-059 — Support contact — replace email with phone/WhatsApp for kirana users

- **Status**: PARKED — verified in reiteration, tag `stg-059-2026-03-14`
- **Priority**: P1 (kirana retailers need to call when stuck — email is useless)
- **Source**: Operator review — "Need help? hello@supermandi.tech" uses email, kirana retailers don't email
- **Scope**: Activation screen, error screens, settings — support contact everywhere
- **Problem**:
  1. "hello@supermandi.tech" is the ONLY support contact visible in the app
  2. Kirana store owners/staff are overwhelmingly non-email users — they call or WhatsApp
  3. When stuck on activation (the highest-friction screen), the user needs immediate voice help
  4. Email response time is hours/days — a retailer at the counter can't wait
  5. Even tech-savvy retailers prefer WhatsApp over email for quick support
- **Expected**:
  1. **Replace email with phone**: "Need help? Call 1800-XXX-XXXX" (toll-free for trust)
  2. **Add WhatsApp**: "💬 WhatsApp us" → opens `https://wa.me/91XXXXXXXXXX`
  3. **Tap-to-action**: Phone number opens dialer (`Linking.openURL('tel:+91...')`), WhatsApp link opens WhatsApp
  4. **Keep email as tertiary**: Small "or email hello@supermandi.tech" below phone/WhatsApp
  5. **Support hours**: "Available Mon-Sat, 9 AM - 7 PM" — set expectations
  6. **Configurable via backend**: Support number/WhatsApp stored in platform config, not hardcoded
  7. **Show on ALL error screens** too — not just activation
- **Migration**: May need `platform.config` entry for support contacts
- **Test**: Tap phone → dialer opens. Tap WhatsApp → chat opens. Number renders correctly.
- **Depends on**: STG-025 (support phone on error screens)

---

### STG-060 — Activation — replace raw URL with tappable "Register Here" button

- **Status**: PARKED — verified in reiteration, tag `stg-060-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — raw URL "supermandi.tech/retailer/register" displayed as text
- **Scope**: Activation screen — registration link
- **Problem**:
  1. "supermandi.tech/retailer/register" displayed as blue text link — looks like a URL to type, not a button
  2. Kirana retailers don't type URLs into browsers — they tap buttons
  3. The URL is long and wraps mid-line — ugly and hard to read
  4. Even if it IS tappable (as a link), it doesn't look like a tap target
  5. Mixed with surrounding prose text — easy to miss
- **Expected**:
  1. Replace with a clear button: [📝 Register Your Store] — opens in-app browser or external browser
  2. Button style: outlined or secondary, clearly tappable (min 48px height)
  3. URL hidden behind the button — user doesn't need to see "supermandi.tech/retailer/register"
  4. Position: inside the help section (STG-058) as part of Step 1
  5. After opening: deep-link back to the app after registration completes (if possible)
- **Migration**: None
- **Test**: Tap button → browser opens registration page. Button visually identifiable as tappable.
- **Depends on**: STG-058 (info box redesign)

---

### STG-061 — Activation code input — fix center-aligned placeholder, must be left-aligned

- **Status**: PARKED — verified in reiteration, tag `stg-061-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — "SM-XXXXXX" placeholder text is center-aligned inside the input field
- **Scope**: Activation screen — Activation Code input field
- **Problem**:
  1. Placeholder "SM-XXXXXX" is CENTER-ALIGNED — violates every text input UX guideline (Material, Apple HIG)
  2. When user starts typing, text is left-aligned — visual jump from center to left
  3. Centered placeholder looks like a title or heading, not an input hint
  4. Inconsistent with "Device Name" field below which uses left-aligned text
  5. On focus, the cursor appears at the right edge (visible in screenshot) — confusing
- **Expected**:
  1. Left-align the placeholder: `textAlign: 'left'` in styles
  2. Consistent with all other input fields in the app
  3. Placeholder text: "SM-XXXXXX" left-aligned with appropriate left padding
  4. Consider: persistent "SM-" prefix (non-editable) + 6-char input area
  5. Match style exactly with Device Name field below
- **Migration**: None
- **Test**: Open activation screen → placeholder is left-aligned. Tap → cursor starts at left after "SM-" prefix.
- **Depends on**: STG-041 (inline validation), STG-043 (floating labels)

---

### STG-062 — Activation — "Activate POS" button disabled state until valid code format

- **Status**: PARKED — verified in reiteration, tag `stg-062-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — "Activate POS" button appears always active regardless of input state
- **Scope**: Activation screen — CTA button state management
- **Problem**:
  1. "Activate POS" button is full blue (active) even when Activation Code field is empty
  2. User can tap submit with empty code → gets an error after a round-trip → wasted time
  3. No visual signal that the code needs to be filled in before submitting
  4. On slow network, submitting an empty/invalid code wastes 3-5 seconds before error
  5. Button should guide the user: "fill the field first, then I become active"
- **Expected**:
  1. **Disabled state**: Button grey/light blue when code is empty or format invalid
  2. **Active state**: Button turns primary blue when code matches SM-XXXXXX format (2 letters + dash + 6 alphanumeric)
  3. **Loading state**: On tap → button shows spinner + "Activating..." text, becomes non-tappable
  4. **Error state**: On failure → button returns to active, error message appears below code field
  5. **Success state**: Button shows checkmark + "Activated!" for 1 second before navigating to home
  6. Device Name field validation: also required (asterisk shown) — disable button if empty
- **Migration**: None
- **Test**: Empty form → button disabled. Enter valid code → button activates. Tap → loading. Invalid → error below field.
- **Depends on**: STG-041 (inline validation)

---

### STG-063 — Activation — add welcome illustration/visual for brand warmth

- **Status**: PARKED — verified in reiteration, tag `stg-063-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — activation screen is just text + inputs on grey-white, no visual warmth
- **Scope**: Activation screen — hero section above form
- **Problem**:
  1. A kirana retailer opens the app for the FIRST time — their first impression is a grey form
  2. No illustration, no imagery, no visual warmth — looks like a government portal, not a modern POS
  3. The "SuperMandi" green pill is tiny and doesn't establish brand presence
  4. Competitor apps (Khatabook, Vyapar, PetPooja) have colorful onboarding with illustrations
  5. First impressions determine if the retailer trusts the app enough to enter their activation code
- **Expected**:
  1. **Hero illustration** above the title: stylized kirana store shelf, POS counter, or shopping bag — branded in SuperMandi blue/green
  2. Size: ~120-150px tall, centered, doesn't push form below the fold
  3. Style: flat illustration or Lottie animation (not a photo — keeps APK small)
  4. **SuperMandi logo** prominent: 48px height, above or beside the title
  5. **Subtle background**: light blue gradient or pattern behind the hero area, transitioning to white form area
  6. Alternative: use the existing splash screen brand assets to maintain consistency
  7. The illustration should communicate "welcome to your digital store" in one glance
- **Migration**: None (need designer assets or use free illustration library like unDraw)
- **Test**: Visual verification — screen feels warm and branded. Illustration loads instantly (no flicker).
- **Depends on**: STG-003 (theme tokens), STG-022 (logo redesign)

---

### STG-064 — Activation — "23106RN0DA" device name should show friendly model name

- **Status**: PARKED — verified in reiteration, tag `stg-064-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — Device Name auto-fills with raw model string "23106RN0DA" which looks like an error code
- **Scope**: Activation screen — Device Name auto-population logic
- **Problem**:
  1. "23106RN0DA" is the raw `Build.MODEL` or internal device codename — meaningless to a user
  2. To a kirana retailer, this looks like an error code or something broken — intimidating
  3. The field is editable but retailers typically leave defaults unchanged
  4. Helper text says "A name to identify this device in your store dashboard" — doesn't help because the auto-filled value is nonsensical
  5. This is the Redmi Note 12 Pro — "Redmi Note 12 Pro" would be much more friendly
- **Expected**:
  1. Use `DeviceInfo.getDeviceName()` or `Device.modelName` from `expo-device` — returns "Redmi Note 12 Pro" not "23106RN0DA"
  2. Fallback chain: friendly model name → brand + model → raw codename (last resort)
  3. Prepend store context: "Front Counter" or "Counter-1" as default, with device model in parentheses
  4. Example: "Counter-1 (Redmi Note 12 Pro)" — friendly + identifiable
  5. Helper text: "Give this device a name (e.g., Front Counter)" — actionable, not descriptive
- **Migration**: None
- **Test**: Redmi Note 12 → shows "Redmi Note 12 Pro" not "23106RN0DA". Unknown device → shows brand at minimum.
- **Depends on**: STG-042 (label auto-increment)

---

### STG-065 — Activation — add step indicator "Step 1 of 2" for onboarding progress

- **Status**: PARKED — verified in reiteration, tag `stg-065-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — no progress indicator on activation, user doesn't know what comes next
- **Scope**: Activation screen — progress/step indicator
- **Problem**:
  1. Retailer enters code and taps "Activate POS" — then what? Login? Billing? Tutorial?
  2. No visual indicator of how many steps are in the onboarding process
  3. Uncertainty increases cognitive load — "how long is this going to take?"
  4. No mental model of the journey: activation → staff login → start billing
  5. Without progress indication, users are more likely to abandon setup
- **Expected**:
  1. **Step indicator at top**: "Step 1 of 2" or progress dots (● ○) below the header
  2. Step 1: Enter activation code → Step 2: Staff login → Done: Start billing
  3. Visual: progress bar (filled 50%) or numbered circles (1 filled, 2 empty)
  4. Position: below the "Activate Your POS" title, above the form
  5. After activation success: animate to "Step 2 of 2" → show staff login screen
  6. Keep it simple: 2-3 steps max, not 5+ wizard steps
- **Migration**: None
- **Test**: Activation screen → shows Step 1. After activation → shows Step 2. After login → indicator disappears.
- **Depends on**: STG-004 (activation redesign)

---

### STG-066 — Enrollment — Standardize terminology ("Enroll" vs "Activate" used interchangeably)

- **Status**: PARKED — verified in reiteration, tag `stg-066-2026-03-14`
- **Priority**: P1 (terminology confusion — same screen uses both "enroll" and "activate")
- **Source**: Code audit — `EnrollDeviceScreen.tsx` is the ONLY onboarding screen (no separate ActivationScreen exists). File header (lines 1-9) says "POS Activation Screen". But code uses both "Enroll" and "Activate" inconsistently.
- **Scope**: `src/screens/EnrollDeviceScreen.tsx` (single file, 850+ lines)
- **Problem**:
  1. Original ticket assumed TWO separate screens exist — they DO NOT. There is ONE file: `EnrollDeviceScreen.tsx`
  2. File is named "Enroll" but header comment says "Activation Screen"
  3. CTA button says "Activate POS" but route name is "EnrollDevice"
  4. Error messages mix: "enrollment code" vs "activation code" — `ENROLL_ERROR_MESSAGES` at lines 85-118
  5. Navigation routes (lines 50-54) route to `PaymentSetup` or `SellScan` post-enrollment
  6. This inconsistency confuses support staff and documentation
- **Expected**:
  1. Pick ONE term: **"Activate"** (warmer, user-friendly) — not "Enroll" (technical)
  2. Rename file: `EnrollDeviceScreen.tsx` → `ActivateDeviceScreen.tsx`
  3. Update all references: route name, error messages, i18n keys, navigation params
  4. Update `ENROLL_ERROR_MESSAGES` constant name → `ACTIVATION_ERROR_MESSAGES`
  5. CTA remains "Activate POS" (already correct)
  6. Update i18n keys: `enroll.*` → `activate.*` in en.json and hi.json
- **Migration**: None (code rename only, no backend changes)
- **Test**: All user-facing text says "Activate" not "Enroll". Route still works. No broken navigation.
- **Depends on**: STG-004 (activation redesign)

---

### STG-067 — Home header icons — add labels or tooltips to Wi-Fi/printer/scanner/camera

- **Status**: PARKED — verified in reiteration, tag `stg-067-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot deep review — 4 icons in header bar (Wi-Fi, printer, scanner, camera) have zero labels
- **Scope**: Home screen — top icon bar
- **Problem**:
  1. Four icons in a row: Wi-Fi waves, printer with X, barcode with X, viewfinder/camera
  2. ZERO labels — user must guess what each icon means
  3. Two icons have "X" overlay (printer, scanner) — are they errors? Disconnected? Not configured?
  4. Wi-Fi icon is standard but the others are ambiguous — is the right icon a camera or a QR scanner?
  5. A kirana retailer who doesn't use tech daily won't recognize a barcode scanner icon
  6. Different from STG-005 which covers decluttering — this is about LABELING what remains
- **Expected**:
  1. **Long-press tooltip** on each icon: "Wi-Fi: Connected", "Printer: Not connected", "Scanner: Not paired", "Camera: Barcode scan"
  2. **First-use overlay**: on first app launch, brief labels appear below each icon for 3 seconds
  3. **Status text under icon bar**: single line "Wi-Fi ✓ | Printer ✗ | Scanner ✗" — more readable than icons alone
  4. **Tap action**: tap any icon → opens relevant settings (Wi-Fi settings, printer pairing, scanner pairing)
  5. **Color coding**: green icon = connected, grey = not configured, red = error/disconnected
  6. Alternative: show only connected peripherals as green icons, hide unconfigured ones (per STG-005)
- **Migration**: None
- **Test**: Long-press each icon → tooltip appears. Tap printer icon → opens printer settings.
- **Depends on**: STG-005 (header declutter)

---

### STG-068 — Product cards — add "+" tap affordance button for adding to bill

- **Status**: PARKED — verified in reiteration, tag `stg-068-2026-03-14`
- **Priority**: P1 (without visible "add" button, billing workflow is undiscoverable)
- **Source**: Screenshot deep review — product cards have NO visible add/plus button
- **Scope**: All product card variants (list card + thumbnail card) on SELL tab
- **Problem**:
  1. Product cards show name + price but NO "Add" or "+" button
  2. User must discover by tapping the entire card that it adds to bill — zero discoverability
  3. First-time user stares at products and doesn't know the next action
  4. Even experienced POS users expect a "+" button — it's universal across retail POS UIs
  5. Without visible affordance, the #1 workflow (search → add to bill) is broken on first use
  6. The Toor Dal card has an expand chevron (↓) — is THAT the add button? Confusing.
- **Expected**:
  1. **"+" button** on every product card — right side, circular, primary blue, always visible
  2. On tap: adds 1 unit to cart + brief haptic + card flashes confirmation
  3. After first add: "+" becomes a quantity stepper [- 1 +] (ties into STG-031)
  4. Button size: 40-48px diameter — easy to tap on a busy counter
  5. Position: right edge of list card, bottom-right of thumbnail card
  6. Icon: "+" icon with no label needed — universally understood
  7. For the Toor Dal list card: "+" on the right, expand (↓) stays on left — separate actions
- **Migration**: None
- **Test**: See "+" on every card. Tap → item added, cart count updates. Tap again → quantity stepper shows.
- **Depends on**: STG-009 (card redesign), STG-031 (quantity selector), STG-016 (cart bar)

---

### STG-069 — Tab bar — unify 5 different visual treatments into one consistent style

- **Status**: PARKED — verified in reiteration, tag `stg-069-2026-03-14`
- **Priority**: P1 (tab bar is the primary navigation — visual chaos hurts usability)
- **Source**: Screenshot deep review — each of the 5 tabs has a completely different visual treatment
- **Scope**: Home screen tab bar (MENU, SELL, PURCHASE, REORDER, CREDIT)
- **Problem**:
  1. **MENU**: rounded pill with hamburger icon (≡) + text, grey background
  2. **SELL**: rounded pill, filled BLUE background, white text (active)
  3. **PURCH...**: rounded pill, OUTLINED (no fill), dark text, truncated
  4. **REORDE...**: rounded pill, filled GREEN background, white text + blue notification dot
  5. **CREDIT**: rounded pill, flat GREY text, no background, lightest treatment
  6. FIVE different visual treatments for 5 tabs in the same bar — looks like 5 different apps
  7. Colors: blue (SELL), green (REORDER), grey (MENU, CREDIT) — no unified palette
  8. The active tab (SELL) is blue but REORDER is always green — is REORDER also active? Confusing.
  9. Different from STG-007 which covers labels/truncation — this covers VISUAL CONSISTENCY
- **Expected**:
  1. **One treatment for active**: filled pill in primary blue, white text
  2. **One treatment for inactive**: no fill, grey text, same pill shape
  3. **Remove green from REORDER**: use blue when active, grey when inactive — same as all tabs
  4. **Notification dot**: consistent accent color (red or brand secondary) on any tab with alerts
  5. **MENU**: either make it look like other tabs (no special icon treatment) or move to header as hamburger
  6. **All pills same size**: equal width or auto-size but same padding/radius
  7. Reference: Material Design tab bar guidelines — consistent treatment, only color/fill distinguishes active
- **Migration**: None
- **Test**: All tabs look consistent. Active = blue fill. Inactive = grey. Switch tabs → style updates correctly.
- **Depends on**: STG-003 (theme tokens), STG-007 (tab labels)

---

### STG-070 — Home — dark header band harsh cut to white body, add smooth transition

- **Status**: PARKED — verified in reiteration, tag `stg-070-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot deep review — abrupt visual break between grey header area and white content body
- **Scope**: Home screen — header-to-body transition
- **Problem**:
  1. Header area (icons + store name + sync row) has a slightly grey/tinted background
  2. Below the tab bar, content area is pure white — abrupt 1px line transition
  3. No gradient, no shadow, no visual softening between the two zones
  4. Creates a feeling of two separate screens stacked on top of each other
  5. Professional POS apps use subtle shadows or gradients to create depth
- **Expected**:
  1. Add subtle shadow below the tab bar — `elevation: 2` or `shadowOffset: { height: 2 }` with low opacity
  2. Or: very subtle gradient from light grey (#F8F9FA) to white over 8px
  3. Keep it minimal — this is a polish item, not a redesign
  4. Consistent across all tabs (SELL, PURCHASE, REORDER, CREDIT)
- **Migration**: None
- **Test**: Visual verification — smooth transition from header to content. No harsh line visible.
- **Depends on**: STG-003 (theme tokens)

---

### STG-071 — Sync row — connect checkmark (left) with "15s ago" (right) visually

- **Status**: PARKED — verified in reiteration, tag `stg-071-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot deep review — green checkmark is far-left, "15s ago ▼" is far-right, full screen width apart
- **Scope**: Home screen — sync status row between store name and tabs
- **Problem**:
  1. Green checkmark (✓) at far-left and "15s ago ▼" at far-right — they're semantically related but visually disconnected
  2. User doesn't connect "the green check means synced 15 seconds ago"
  3. The space between them (~280px on a 360dp screen) is empty — wasted and creates disconnect
  4. The chevron (▼) next to "15s ago" suggests a dropdown — but what does expanding show?
  5. The entire row is a narrow 24px band — too small for its importance
- **Expected**:
  1. **Group together**: "✓ Connected • 15s ago" as a single left-aligned chip or row element
  2. Or: "✓ Synced 15s ago" as one tappable pill — opens sync details
  3. Remove redundant chevron if the sync panel (STG-006) handles the expanded view
  4. Position: left-aligned below store name, compact single element
  5. States: "✓ Connected • 15s ago" (green), "⟳ Syncing..." (amber), "✗ Offline" (red)
- **Migration**: None
- **Test**: Verify grouped display, all 3 states render correctly, tap opens sync details
- **Depends on**: STG-006 (sync panel)

---

### STG-072 — Activation — remove hamburger menu pre-activation (no navigation needed)

- **Status**: PARKED — verified in reiteration, tag `stg-072-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — hamburger menu (≡) visible on activation screen where no navigation exists
- **Scope**: Activation screen — navigation header
- **Problem**:
  1. Blue rounded hamburger icon (≡) at top-left of activation screen
  2. Before device is activated, there is NOTHING to navigate to — no settings, no history, no profile
  3. Tapping it either: opens an empty drawer, or shows irrelevant options
  4. First-time user might tap it thinking it's part of the activation flow — gets confused
  5. Creates false expectation that there's a menu/navigation available
- **Expected**:
  1. **Remove hamburger menu from pre-activation screens** entirely
  2. If a back button is needed: show ← back arrow (not hamburger) to return to... nothing? (app should close)
  3. Post-activation: hamburger menu is appropriate (settings, about, logout, switch staff)
  4. Pre-activation: the ONLY interactive elements should be: code input, device name, Activate button, help section
  5. Cleaner screen = less confusion = faster activation
- **Migration**: None
- **Test**: Activation screen → no hamburger menu. After activation → hamburger appears on home screen.
- **Depends on**: STG-004 (activation redesign)

---

### STG-073 — Activation helper text — "store dashboard" is jargon, simplify

- **Status**: PARKED — verified in reiteration, tag `stg-073-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot review — helper text "A name to identify this device in your store dashboard" uses "dashboard" jargon
- **Scope**: Activation screen — Device Name field helper text
- **Problem**:
  1. "store dashboard" — a kirana retailer doesn't know what a dashboard is
  2. The helper text explains WHY the field exists but not WHAT to enter
  3. Should guide the user with an example, not explain the backend purpose
  4. "A name to identify this device" — identify to whom? For what purpose?
- **Expected**:
  1. Replace with: "Give this device a name (e.g., Front Counter, My Phone)"
  2. Or simply: "e.g., Front Counter, Billing Phone"
  3. Action-oriented, example-driven — not explanation-driven
  4. Remove reference to "dashboard" — the user doesn't need to know about backend systems
- **Migration**: None
- **Test**: Helper text is understandable to a non-technical user. Contains practical examples.
- **Depends on**: STG-064 (device name auto-populate)

---

### STG-074 — Search + barcode inputs — unify border/container styles into one section

- **Status**: PARKED — verified in reiteration, tag `stg-074-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot deep review — search field and barcode field have different container styles
- **Scope**: SELL tab — search area styling
- **Problem**:
  1. "Search product" + "Scan product here" are in a rounded container with thin grey border
  2. "Enter barcode manually" is in a SEPARATE container below with different border radius and padding
  3. They serve the same purpose (find a product) but look like separate sections
  4. The visual separation suggests they're unrelated — user doesn't connect them
  5. Two containers = two tap decisions = cognitive overhead during fast billing
- **Expected**:
  1. **Single container** wrapping all search/scan inputs — one border, one shadow
  2. Or per STG-008: merge into one input that handles text search + barcode + scan
  3. If keeping separate: same border style, radius, and padding — visually grouped
  4. Add visual connector: shared background, no gap, or a subtle divider line
  5. The container should feel like ONE tool: "This is where I find products"
- **Migration**: None
- **Test**: Search area looks like one unified section, not two disconnected boxes
- **Depends on**: STG-008 (unified search input)

---

### STG-075 — Product cards — add loading skeleton placeholder during fetch

- **Status**: PARKED — verified in reiteration, tag `stg-075-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot deep review — no loading state visible for product list
- **Scope**: SELL tab — product listing loading state
- **Problem**:
  1. When products are loading from local DB or syncing, what does the screen show?
  2. Likely: blank white space or a generic spinner — feels broken during first load
  3. Skeleton screens (shimmer placeholders) are industry standard for list loading
  4. First app launch: products sync for the first time — could take 5-30 seconds
  5. Without skeletons, user thinks the app is empty/broken during initial sync
- **Expected**:
  1. **Skeleton cards** matching the product card layout — grey shimmer rectangles for name, price, image
  2. Show 3-5 skeleton cards while loading — indicates "content is coming"
  3. Animate: shimmer left-to-right gradient effect (react-native-skeleton-placeholder)
  4. Transition: skeleton → real cards with subtle fade-in
  5. For initial sync: show skeleton + "Loading your products..." text + progress indicator
  6. Offline with cached data: show cached products immediately, no skeleton
- **Migration**: None
- **Test**: Clear local DB → open SELL tab → see skeleton cards. Products load → skeletons replaced smoothly.
- **Depends on**: STG-003 (theme tokens)

---

### STG-076 — Activation — "on web" rewrite to specific URL or "online"

- **Status**: PARKED — verified in reiteration, tag `stg-076-2026-03-14`
- **Priority**: P2
- **Source**: Operator flagged — "on web" in activation subtitle is vague
- **Scope**: Activation screen — subtitle text
- **Problem**:
  1. "retailer registration on web" — "on web" means nothing specific
  2. Which web? Browser? Laptop? Mobile browser? The supermandi website?
  3. Kirana retailers may not distinguish between "web" and "app" — both are on their phone
  4. The info box DOES mention "supermandi.tech/retailer/register" but the subtitle says "on web"
  5. Inconsistent: subtitle says "web", info box says the actual URL
- **Expected**:
  1. Replace "on web" with either:
     - "at supermandi.tech" (specific)
     - "online" (simple, understood by everyone)
     - Remove entirely: "Use your activation code after registration" (shorter, clearer)
  2. Or restructure entirely per STG-057: "Enter the code you received after registration"
  3. The URL should appear ONCE in the help section, not referenced vaguely in the subtitle
- **Migration**: None
- **Test**: No occurrence of "on web" remains. Subtitle mentions specific URL or omits it.
- **Depends on**: STG-057 (text rewrite — this ticket may be absorbed into STG-057)

---

### STG-077 — Payment — error message vague, no specific failure reason

- **Status**: PARKED — verified in reiteration, tag `stg-077-2026-03-14`
- **Priority**: P1
- **Source**: Screenshot — "Unable to start payment. Please try again." gives no reason
- **Scope**: Payment screen — error handling
- **Problem**:
  1. "Unable to start payment. Please try again." — WHY did it fail?
  2. Was it: network timeout? Server 500? Invalid cart? Inventory changed? Stock depleted?
  3. Generic error messages cause confusion — retailer doesn't know if they should retry or fix something
  4. No error code for support calls — "it says unable to start payment" is useless for debugging
  5. The error persists on screen even as other UI elements remain interactive — is the error stale?
- **Expected**:
  1. **Specific error messages**: "No internet connection — check Wi-Fi" / "Server is busy — try in 30s" / "Item out of stock — return to cart"
  2. **Error code**: "Error P-001" — support can look up the specific failure
  3. **Actionable guidance**: "Check your internet connection and tap Retry" not just "try again"
  4. **Auto-clear**: Error banner disappears after successful retry, not stuck permanently
  5. **Offline handling**: If offline, show "You're offline. Payment will complete when connected" (for cash sales, complete offline)
  6. **Toast vs persistent banner**: Transient errors = toast (auto-dismiss). Blocking errors = persistent banner with Retry.
- **Migration**: None
- **Test**: Disconnect network → attempt payment → specific offline error. Reconnect → retry → success → error clears.
- **Depends on**: None

---

### STG-078 — Payment — "Complete Payment" greyed out with no explanation why

- **Status**: PARKED — verified in reiteration, tag `stg-078-2026-03-14`
- **Priority**: P1
- **Source**: Screenshot — "Complete Payment" button is dark grey (disabled) with no visible reason
- **Scope**: Payment screen — CTA button states
- **Problem**:
  1. "Complete Payment" button is greyed out — user can see it but can't tap it
  2. NO explanation of WHY it's disabled — is it because of the error? Loading? Missing info?
  3. Grey text on slightly lighter grey background — almost unreadable (WCAG failure)
  4. The error banner above has its own "Retry" button — so TWO actions compete but one is disabled
  5. User doesn't know: "Do I tap Retry or wait for Complete Payment to become active?"
- **Expected**:
  1. **Disabled reason**: Small text below button "Fix the error above to continue" or "Retrying..."
  2. **Visual hierarchy**: When disabled, show clear disabled style (light grey bg, 50% opacity text)
  3. **When active**: Bright blue (matching Checkout button from cart), white text, full opacity
  4. **Loading state**: If payment is processing, show spinner + "Processing..." text in the button
  5. **After error**: Button should either (a) become the retry action, or (b) stay disabled with clear reason
  6. **Remove ambiguity**: ONE clear action path — either Retry in error banner OR the main CTA, not both
- **Migration**: None
- **Test**: Error state → button shows "Fix error to continue". No error → button is bright blue + active.
- **Depends on**: STG-077 (error handling), STG-079 (retry consolidation)

---

### STG-079 — Payment — two competing retry mechanisms (error Retry + disabled CTA)

- **Status**: PARKED — verified in reiteration, tag `stg-079-2026-03-14`
- **Priority**: P1
- **Source**: Screenshot — "Retry" red button in error banner AND "Complete Payment" (greyed) both visible
- **Scope**: Payment screen — action consolidation
- **Problem**:
  1. Error banner has a red "Retry" button — tapping it presumably retries the payment
  2. "Complete Payment" main CTA is greyed out — but if it became active again, it does the same thing
  3. Two buttons for the same action = confused user, especially during a rush at the counter
  4. "Retry" is red (danger color) but it's a positive action (try again) — color mismatch
  5. The main CTA should be THE action — the error banner should inform, not add another button
- **Expected**:
  1. **ONE action path**: Error banner shows the message only (no Retry button)
  2. **Main CTA handles retry**: "Complete Payment" stays active (blue) even after error — tapping it retries
  3. **Or**: Error banner has "Retry" which IS the main CTA repositioned — not a second button
  4. **Button text changes**: After error → "Retry Payment ₹145.00" (clear, actionable, shows amount)
  5. **Error banner**: Informational only — red/amber background, icon, message text, dismiss X
  6. **Success flow**: On success → button shows "✓ Paid!" for 1 second → navigates to receipt
- **Migration**: None
- **Test**: Error → one clear retry action. No duplicate buttons. Success → navigates cleanly.
- **Depends on**: STG-077 (error messages)

---

### STG-080 — Payment — no cash amount received input or change calculation

- **Status**: PARKED — verified in reiteration, tag `stg-080-2026-03-14`
- **Priority**: P1 (cash is the #1 payment method in kirana stores — this is a core POS function)
- **Source**: Screenshot — Cash selected, ₹145.00 due, but no way to enter amount received or calculate change
- **Scope**: Payment screen — Cash payment flow
- **Problem**:
  1. Customer hands over ₹200 — cashier has NO field to enter "200"
  2. Without "Amount Received" input, there's NO way to calculate change
  3. Every kirana POS app (Vyapar, PetPooja, POSist) has: Amount Due → Amount Received → Change
  4. Mental math is error-prone during rush hours — cashier gives wrong change
  5. No denomination breakdown — ₹500 note for ₹145 bill is common
  6. "Collect cash from customer" is the instruction but the WORKFLOW stops there — no next step
- **Expected**:
  1. **Amount Received input**: Large numeric keypad input below the amount: "Amount Received: ₹___"
  2. **Auto-calculate change**: "Change: ₹55.00" appears instantly as amount is entered
  3. **Quick denomination buttons**: [₹100] [₹200] [₹500] [₹2000] — one-tap entry for common notes
  4. **Exact amount button**: "Exact ₹145.00" shortcut — no change needed
  5. **Change display**: Large, prominent "Change: ₹55.00" — cashier can read at a glance
  6. **"Complete Payment" activates** only after amount received ≥ amount due
  7. **Insufficient amount warning**: "₹100 received — ₹45.00 still due" in amber
  8. Fill the empty 40% of screen (STG-087) with this keypad + change display
- **Migration**: None
- **Test**: Enter ₹200 → "Change: ₹55.00". Enter ₹100 → "₹45 still due". Exact amount → "No change needed".
- **Depends on**: STG-087 (empty space utilization)

---

### STG-081 — Payment — no cart/order summary visible on payment screen

- **Status**: PARKED — verified in reiteration, tag `stg-081-2026-03-14`
- **Priority**: P1
- **Source**: Screenshot — payment screen shows ₹145.00 total but ZERO product details
- **Scope**: Payment screen — order summary section
- **Problem**:
  1. User sees "₹145.00" but cannot verify WHAT they're paying for
  2. No product names, no quantities, no item count visible
  3. If cashier accidentally added wrong product or wrong quantity, they can't catch it here
  4. "Cart locked" implies they can't go back — so this is their last chance to verify
  5. Customer asks "What's on my bill?" — cashier can't answer from this screen
  6. Receipts can't be previewed — errors only caught after payment is done
- **Expected**:
  1. **Collapsible order summary** at the top of payment screen (below payment tabs):
     - "1 item • Toor Dal (Arhar) 1kg × 1 = ₹145.00"
     - Collapsed: shows item count + total. Expanded: full item list.
  2. **Item list**: Product name, qty, unit price, line total — compact format
  3. **Subtotal → Tax → Discount → Total** breakdown below item list
  4. Fills the empty space between payment tabs and the amount
  5. **"Edit Cart" link**: If user spots an error, quick link to return to cart (related to STG-083)
- **Migration**: None
- **Test**: Payment screen shows item details. 5 items → collapsible list. Tap expand → see all items.
- **Depends on**: STG-083 (back to cart)

---

### STG-082 — Payment — "Due" method has no customer selection for credit sale

- **Status**: PARKED — verified in reiteration, tag `stg-082-2026-03-14`
- **Priority**: P1 (credit/udhar is THE core kirana workflow — can't record credit without knowing WHO)
- **Source**: Screenshot — "Due" tab has calendar icon, but no customer selection when credit sale chosen
- **Scope**: Payment screen — Due/credit payment flow
- **Problem**:
  1. "Due" payment = credit sale (udhar) — customer takes goods, pays later
  2. But there is NO customer selection on the payment screen — credit to WHO?
  3. Without customer linkage, the credit is untrackable — defeats the entire purpose
  4. Kirana stores lose money to untracked udhar — this is a critical business function
  5. After selecting "Due", the screen still shows "Collect cash from customer" (wrong instruction)
  6. No outstanding balance display — "This customer already owes ₹1,200"
- **Expected**:
  1. **When "Due" selected**: Show customer search/select input immediately
  2. **Customer search**: By name or phone — recent customers listed for quick pick
  3. **Outstanding balance**: After selecting customer, show "Current due: ₹1,200 + This bill: ₹145 = New total: ₹1,345"
  4. **Due date** (optional): "Pay by" date picker or "7 days" / "15 days" / "30 days" quick picks
  5. **Instruction text changes**: "Record as due for [Customer Name]" instead of "Collect cash"
  6. **Mandatory customer for Due**: Cannot complete a Due payment without selecting a customer
  7. **Partial payment**: "₹100 cash now + ₹45 due" — split between cash and credit
- **Migration**: May need customer table relation (check STG-037)
- **Test**: Select Due → customer search appears. No customer → cannot complete. Select customer → shows balance.
- **Depends on**: STG-037 (customer entry), STG-030 (CREDIT tab)

---

### STG-083 — Payment — no back button to return to cart

- **Status**: PARKED — verified in reiteration, tag `stg-083-2026-03-14`
- **Priority**: P1
- **Source**: Screenshot — payment screen has no ← back arrow or close button
- **Scope**: Payment screen — navigation
- **Problem**:
  1. User is on payment screen but realizes they need to add/remove an item
  2. NO back button, NO close/X, NO swipe-to-dismiss visible
  3. "Cart locked" badge suggests the cart is frozen — but what if the cashier needs to modify?
  4. Only escape: Android back button (hardware/gesture) — not discoverable
  5. Getting stuck on the payment screen is a blocking UX failure during live billing
- **Expected**:
  1. **← back arrow** at top-left (matching Sell Cart screen which has one)
  2. On tap: "Return to cart? Payment will be cancelled." confirmation
  3. **"Cart locked" → explain**: "Cart is locked during payment. Tap ← to return to cart and make changes."
  4. **Swipe down** (if it's a bottom sheet like the cart): dismiss to return to cart
  5. Android back button should work + be confirmed: "Cancel payment?" dialog
- **Migration**: None
- **Test**: Tap ← → confirmation → returns to cart with items intact. Android back → same flow.
- **Depends on**: None

---

### STG-084 — Payment — UPI flow incomplete, no QR/app selector after selecting UPI

- **Status**: PARKED — verified in reiteration, tag `stg-084-2026-03-14`
- **Priority**: P1 (UPI is India's #1 digital payment — incomplete flow blocks digital payments)
- **Source**: Screenshot — UPI tab visible but flow after selection is unclear
- **Scope**: Payment screen — UPI payment flow
- **Problem**:
  1. UPI tab shows a QR icon — but when selected, what happens?
  2. No QR code generation visible for customer to scan
  3. No UPI ID input field ("yourname@upi")
  4. No app selector (GPay, PhonePe, Paytm) — deep link to payment app
  5. No UPI payment verification — how does the POS know the customer paid?
  6. India has 10B+ monthly UPI transactions — this MUST work for a POS app
- **Expected**:
  1. **UPI selected → two options**:
     - "Show QR" — generates UPI QR code for customer to scan (using store's VPA)
     - "Enter UPI ID" — input for customer's UPI ID to request payment
  2. **QR code display**: Large QR + "₹145.00" + "Scan to pay" — customer scans with their app
  3. **Verification**: Auto-verify via UPI callback/webhook, or manual "Payment Received" confirmation button
  4. **Polling**: Show "Waiting for payment..." with countdown timer while listening for payment confirmation
  5. **Fallback**: "Payment not received? Ask customer to show payment screenshot" → manual confirm
  6. **Store VPA setup**: First time UPI → guide to set up store UPI VPA in settings
- **Migration**: Backend UPI integration (Razorpay/Cashfree/direct UPI) — significant
- **Test**: Select UPI → QR displays → customer scans → payment verified → receipt generated.
- **Depends on**: Backend payment gateway integration

---

### STG-085 — Payment — no split payment support (cash + UPI)

- **Status**: PARKED — verified in reiteration, tag `stg-085-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — only one payment method can be selected at a time (tabs are exclusive)
- **Scope**: Payment screen — split/multi-tender payment
- **Problem**:
  1. Tabs (UPI / Cash / Due) are mutually exclusive — only one can be active
  2. Common scenario: customer pays ₹100 cash + ₹45 UPI = ₹145 total
  3. Also common: ₹100 cash + ₹45 due (partial credit)
  4. Without split payment, cashier must choose one method — loses flexibility
  5. This is a standard POS feature — every restaurant/retail POS supports it
- **Expected**:
  1. **Multi-tender mode**: "Add payment" button to add second payment method
  2. **Flow**: Cash ₹100 → "₹45 remaining" → Add UPI ₹45 → "₹0 remaining" → Complete
  3. **Visual**: Show each tender as a row: "Cash: ₹100 ✓ | UPI: ₹45 pending"
  4. **Balance tracking**: "Remaining: ₹45.00" updates as tenders are added
  5. **Receipt**: Shows all tenders — "Cash: ₹100, UPI: ₹45"
- **Migration**: Backend order model may need multi-tender support
- **Test**: Add ₹100 cash → shows ₹45 remaining → add UPI ₹45 → complete. Receipt shows both.
- **Depends on**: STG-080 (cash amount input), STG-084 (UPI flow)

---

### STG-086 — Payment — "Cart locked" badge unexplained, no unlock path

- **Status**: PARKED — verified in reiteration, tag `stg-086-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — orange "Cart locked" pill badge at top-right of payment screen
- **Scope**: Payment screen — cart lock indicator
- **Problem**:
  1. "Cart locked" in orange — alarming color, no explanation
  2. Does "locked" mean: can't modify? Payment in progress? Stock reserved?
  3. No way to "unlock" — no tap action, no tooltip
  4. If user needs to modify the cart, "locked" feels like they're stuck
  5. Orange color implies warning — is something wrong? Or is this expected?
- **Expected**:
  1. **Don't show "Cart locked"** — it's unnecessary UX noise for the user
  2. Instead: the back button (STG-083) handles the "I need to modify" flow
  3. If must show: use neutral color (grey) and add tooltip: "Cart is saved while you complete payment"
  4. Or: show "1 item" badge instead of "Cart locked" — informational, not alarming
  5. Lock/unlock should be invisible to the user — it's an internal state
- **Migration**: None
- **Test**: Payment screen → no alarming "locked" badge. Back button returns to editable cart.
- **Depends on**: STG-083 (back button)

---

### STG-087 — Payment — ~40% empty space caused by centered flex layout with no content fill

- **Status**: PARKED — verified in reiteration, tag `stg-087-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — `PaymentScreen.tsx:1108-1113` uses `cashStage` style with `flex:1, alignItems:"center", justifyContent:"center"` causing amount to float in center of empty space
- **Scope**: `src/screens/PaymentScreen.tsx:1108-1113,1223-1230`
- **Problem**:
  1. Lines 1108-1113: `cashStage` style uses `flex:1` + center alignment — amount floats in vertical center
  2. Lines 1223-1230: Amount display (label + formatted value) is the ONLY content in this flex area
  3. Between payment method tabs (top) and CTA button (bottom), ~40% is empty white space
  4. This space should contain order summary (STG-081) and cash input (STG-080)
- **Expected**:
  1. Change `justifyContent:"center"` to `justifyContent:"flex-start"` — move amount to top
  2. Below amount: add order summary (item list, subtotal, discount, tax, total) — see STG-081
  3. Below summary: add cash input with change calculation — see STG-080
  4. Layout order: Tabs → Amount → Summary → Cash Input → CTA — no empty space
  5. Add `paddingTop: 16` to separate from tabs
- **Migration**: None
- **Test**: Payment screen has no large empty spaces. Amount at top, summary below, CTA at bottom.
- **Depends on**: STG-080 (cash input), STG-081 (order summary)

---

### STG-088 — Payment — no GST/tax breakup on payment screen

- **Status**: PARKED — verified in reiteration, tag `stg-088-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — payment screen shows flat ₹145.00, no tax/GST breakdown
- **Scope**: Payment screen — tax display
- **Problem**:
  1. Indian GST law requires tax amount to be shown on invoices/receipts
  2. Payment screen shows total only — no "Subtotal: ₹123 + GST 18%: ₹22 = ₹145"
  3. Customer may ask "What's the GST?" — cashier can't answer
  4. For B2B sales, GST breakup is mandatory on invoices
  5. Different products have different GST rates (5%, 12%, 18%, 28%) — should show per-rate breakup
- **Expected**:
  1. Below amount display: "Includes GST: ₹22.17 (CGST ₹11.09 + SGST ₹11.09)"
  2. Or: separate lines in summary: "Subtotal: ₹122.83 | GST 18%: ₹22.17 | Total: ₹145.00"
  3. For mixed-rate carts: group by GST rate (5% items, 18% items)
  4. GSTIN display if store is registered
  5. This info should also appear on the printed/digital receipt
- **Migration**: Backend may need GST calculation if not already present
- **Test**: Add GST item → see tax breakup. Add mixed-rate items → see per-rate breakdown.
- **Depends on**: STG-081 (order summary)

---

### STG-089 — Payment — "Complete Payment" grey-on-grey text fails WCAG contrast

- **Status**: PARKED — verified in reiteration, tag `stg-089-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "Complete Payment" text is dark grey on a grey button — barely readable
- **Scope**: Payment screen — CTA button disabled style
- **Problem**:
  1. Disabled button: dark grey (#6B7280) text on grey (#9CA3AF) background
  2. Contrast ratio approximately 2:1 — fails WCAG AA minimum of 4.5:1
  3. Under bright shop lighting, this becomes essentially invisible
  4. User might not even notice the button exists when disabled
  5. Even disabled buttons should be readable — the user needs to know the action exists
- **Expected**:
  1. Disabled style: light grey background (#E5E7EB) + medium grey text (#9CA3AF) — meets 3:1 for large text
  2. Active style: primary blue (#2563EB) background + white text — high contrast
  3. The transition from disabled → active should be noticeable (color change + optional subtle animation)
  4. All button states audited for WCAG AA compliance (ties to STG-053)
- **Migration**: None
- **Test**: Disabled button text is readable in direct sunlight. Active button passes WCAG 4.5:1.
- **Depends on**: STG-053 (WCAG audit), STG-003 (theme tokens)

---

### STG-090 — Payment — no loading/processing state during payment attempt

- **Status**: PARKED — verified in reiteration, tag `stg-090-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — error state visible but no prior loading/processing state evident
- **Scope**: Payment screen — payment processing UX
- **Problem**:
  1. User taps "Complete Payment" → presumably it tries to process → shows error
  2. But there's no indication of PROCESSING state between tap and error
  3. Was there a spinner? A progress bar? "Processing..." text? Nothing visible
  4. Without processing indication, user doesn't know if the tap registered
  5. User might tap multiple times → multiple payment attempts → potential double-charge
- **Expected**:
  1. **On tap**: Button shows spinner + "Processing payment..." — becomes non-tappable
  2. **3-second timeout**: "Still processing..." message if it takes longer
  3. **10-second timeout**: "Taking longer than usual..." with cancel option
  4. **Prevent double-tap**: Button disabled immediately on first tap, re-enabled only after result
  5. **Success**: Spinner → checkmark animation → "Payment complete!" → navigate to receipt
  6. **Failure**: Spinner → error animation → error message with Retry
- **Migration**: None
- **Test**: Tap → see spinner. Slow network → see "Still processing". Double-tap → second tap ignored.
- **Depends on**: STG-078 (button states)

---

### STG-091 — Payment — instruction text "Collect cash" doesn't change per payment method

- **Status**: PARKED — verified in reiteration, tag `stg-091-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "Collect cash from customer" shows even though payment method could be UPI or Due
- **Scope**: Payment screen — dynamic instruction text
- **Problem**:
  1. "Collect cash from customer" is static text — doesn't change when UPI or Due is selected
  2. For UPI: should say "Ask customer to scan QR" or "Send payment request"
  3. For Due: should say "Record as credit for [customer]"
  4. Wrong instruction for wrong payment method creates confusion
- **Expected**:
  1. **Cash**: "Collect ₹145.00 cash from customer"
  2. **UPI**: "Ask customer to scan QR code or enter UPI ID"
  3. **Due**: "This amount will be added to customer's credit"
  4. Dynamic instruction updates immediately on tab switch
  5. Use the payment method name in the instruction for clarity
- **Migration**: None
- **Test**: Switch Cash → UPI → Due → verify instruction text changes each time.
- **Depends on**: None

---

### STG-092 — Payment — no receipt preview before completing payment

- **Status**: PARKED — verified in reiteration, tag `stg-092-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot review — no way to preview receipt before completing payment
- **Scope**: Payment screen — receipt preview
- **Problem**:
  1. After tapping "Complete Payment", receipt is generated — but user can't preview it beforehand
  2. If there's an error in product name, price, or quantity, it's on the receipt already
  3. No way to verify: store name, GSTIN, payment method, total — all receipt elements
  4. Reprinting/voiding a receipt is more work than previewing before payment
- **Expected**:
  1. **"Preview Receipt"** link/button on payment screen — opens formatted receipt view
  2. Or: the order summary (STG-081) IS the receipt preview — shows exactly what the receipt will contain
  3. Shows: store header, items, taxes, total, payment method, date/time, receipt number
  4. "Print receipt after payment" toggle — some customers don't need receipts
- **Migration**: None
- **Test**: Tap preview → see formatted receipt. Content matches final printed receipt.
- **Depends on**: STG-081 (order summary)

---

### STG-093 — Payment — Cash tab uses MaterialCommunityIcons "cash" icon which renders as generic bills

- **Status**: PARKED — verified in reiteration, tag `stg-093-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — `PaymentScreen.tsx:1199` uses `renderModeTab("CASH", "Cash", "cash")` with MaterialCommunityIcons name="cash" at size 20
- **Scope**: `src/screens/PaymentScreen.tsx:1199,957`
- **Problem**:
  1. Line 1199: Cash tab renders `MaterialCommunityIcons name="cash"` — which is a small bills/banknote icon
  2. At size 20 (line 957), the icon is small and its shape is hard to distinguish from other icons
  3. Icon color toggles between `colors.textInverse` (selected) and `colors.textSecondary` (unselected)
  4. On budget Android screens, the "cash" icon at 20px looks like a generic rectangle
- **Expected**:
  1. Replace "cash" with "cash-multiple" (stacked bills — more recognizable) or "currency-inr" (₹ symbol — culturally specific)
  2. Increase icon size from 20 to 24 for better legibility on small screens
  3. Ensure all 3 tab icons (Cash, UPI, Due) have same visual weight at new size
  4. Add text label below icon: "Cash", "UPI", "Due" (redundant but helpful for first-time users)
- **Migration**: None
- **Test**: All 3 payment tab icons instantly recognizable at 5-inch screen size. Icon size consistent.
- **Depends on**: STG-003 (theme tokens)

---

### STG-094 — Cart — "Clear" button has no confirmation dialog, deletes all items instantly

- **Status**: PARKED — verified in reiteration, tag `stg-094-2026-03-14`
- **Priority**: P1 (accidental clear during rush billing = lost work + angry customer)
- **Source**: Screenshot — red "Clear" text at top-right, one tap presumably empties entire cart
- **Scope**: Sell Cart screen — Clear action
- **Problem**:
  1. "Clear" at top-right in red text — tapping it presumably deletes ALL cart items
  2. NO confirmation dialog — one accidental tap destroys the bill the cashier was building
  3. During rush hours, thumbs slip — accidental taps on "Clear" are inevitable
  4. "Clear" text is positioned where a common "Done" or "Close" button would be — high mis-tap risk
  5. No undo mechanism — once cleared, items are gone
  6. If cart has 10 items entered manually, clearing them means re-entering all 10
- **Expected**:
  1. **Confirmation dialog**: "Clear cart? This will remove all 3 items." → [Cancel] [Clear]
  2. **Or**: Swipe-to-clear gesture with undo toast: "Cart cleared. [Undo - 5s]"
  3. **Move "Clear" away from tap-hazard position**: smaller, or behind a ⋮ menu, or long-press only
  4. **Red color is correct** for destructive action — but add confirmation
  5. **Undo buffer**: Keep cleared items in memory for 10 seconds — "Undo" toast restores them
- **Migration**: None
- **Test**: Tap Clear → dialog asks confirmation. Cancel → cart unchanged. Confirm → items removed + undo toast.
- **Depends on**: None

---

### STG-095 — Cart — delete item (🗑️) has no confirmation or undo

- **Status**: PARKED — verified in reiteration, tag `stg-095-2026-03-14`
- **Priority**: P1
- **Source**: Screenshot — red trash icon on cart item, one tap presumably removes the item
- **Scope**: Sell Cart — item delete action
- **Problem**:
  1. Red outlined trash icon (🗑️) at top-right of product card — one tap removes the item
  2. No confirmation dialog — "Are you sure you want to remove Toor Dal?"
  3. No undo mechanism — item is gone after one tap
  4. During fast billing, cashier's thumb might hit 🗑️ instead of [+] — mis-tap removes the item
  5. 🗑️ and [+] are on the same card, ~100px apart — too close for error-free rapid tapping
- **Expected**:
  1. **Swipe-to-delete** instead of tap: swipe left reveals red delete area — intentional action
  2. **Or**: Tap 🗑️ → item shows "Removed" overlay + "Undo" button (5 second timeout) → then removes
  3. **Or**: Move delete behind a ⋮ menu per item — requires 2 taps (intentional)
  4. **Minimum**: Tap → confirmation "Remove Toor Dal from cart?" → [Cancel] [Remove]
  5. **Reduce [-] to 0** = implicit remove: tapping [-] when qty=1 could remove with undo
- **Migration**: None
- **Test**: Tap delete → confirmation dialog. Swipe left → delete revealed. Undo → item restored.
- **Depends on**: None

---

### STG-096 — Cart — quantity [-][+] buttons too small, need larger tap targets

- **Status**: PARKED — verified in reiteration, tag `stg-096-2026-03-14`
- **Priority**: P1 (quantity changes are the #1 cart interaction — must be fast and accurate)
- **Source**: Screenshot — [-] and [+] are small outlined blue squares, hard to tap rapidly
- **Scope**: Sell Cart — quantity stepper buttons
- **Problem**:
  1. [-] and [+] buttons appear to be ~36px outlined blue squares — below Android's 48px minimum
  2. Outlined (not filled) — low visual weight, hard to see in bright shop lighting
  3. The quantity "1" between them is also small and not clearly tappable
  4. During fast billing: "5 packets of salt" requires 4 rapid taps on [+] — small targets = errors
  5. [-] is dangerously close to [+] — tapping [-] when meaning [+] changes the quantity wrong way
- **Expected**:
  1. **Minimum 48px × 48px** tap targets (Android Material guideline)
  2. **Filled buttons**: [-] grey/neutral, [+] primary blue — clearly tappable
  3. **Larger text**: quantity number in 20px+ bold between the buttons
  4. **Long-press**: hold [+] for rapid increment (auto-repeat every 200ms)
  5. **Spacing**: minimum 16px gap between [-] and [+] to prevent mis-taps
  6. **Ripple feedback**: on each tap, confirm the action registered
  7. **Alternative**: stepper with wider touch zones: [− ₹145 × 1 +] as a single row
- **Migration**: None
- **Test**: Tap [+] 10 times rapidly → qty reaches 11, no mis-taps. Long-press [+] → continuous increment.
- **Depends on**: STG-003 (theme tokens)

---

### STG-097 — Cart — quantity number not tappable for direct input (type "10" vs tap + 9x)

- **Status**: PARKED — verified in reiteration, tag `stg-097-2026-03-14`
- **Priority**: P1 (kirana retailers buy in bulk — tapping + 49 times for qty 50 is unusable)
- **Source**: Screenshot — "1" between [-][+] appears static, not tappable as an input
- **Scope**: Sell Cart — quantity direct input
- **Problem**:
  1. To set quantity to 50, user must tap [+] 49 times — unacceptable
  2. The "1" between [-][+] should be tappable → opens numeric keyboard → type "50" → done
  3. Kirana wholesale: "2 crates of 48 bottles" = qty 96 — impossible with stepper alone
  4. Even qty 5-10 is tedious with single [+] taps during rush hours
  5. No alternative input: no "Set quantity" option, no keyboard shortcut
- **Expected**:
  1. **Tap on quantity number** → inline edit mode → numeric keyboard appears → type exact qty
  2. **Or**: Tap on qty → bottom sheet with large numpad: [1-9, 0, ., ←, Done]
  3. **Validation**: Max quantity = available stock (show "Only 39 in stock" if user enters 50)
  4. **Decimal support**: for weighted items: "2.5 kg" — decimal numpad
  5. **Quick picks**: for common quantities: [1] [2] [5] [10] [25] below the stepper
  6. **After entry**: quantity updates, line total recalculates, stepper reflects new number
- **Migration**: None
- **Test**: Tap "1" → keyboard opens → type "25" → qty changes to 25 → line total = ₹3,625.
- **Depends on**: STG-096 (stepper redesign)

---

### STG-098 — Cart — no "Add more items" / "Continue Shopping" link

- **Status**: PARKED — verified in reiteration, tag `stg-098-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — cart has no way to add more items without dismissing the cart
- **Scope**: Sell Cart — navigation back to product list
- **Problem**:
  1. Cart is a bottom sheet — to add more items, user must swipe it down/dismiss it
  2. No explicit "Add more items" or "Continue Shopping" link inside the cart
  3. After adding one item, user might think they need to checkout before adding more
  4. The "← Sell Cart" back button might mean "go back" (close cart) but user isn't sure
  5. Common POS flow: scan-scan-scan-checkout — cart should support continuous adding
- **Expected**:
  1. **"+ Add more items"** link at the bottom of the item list (above Discount section)
  2. Tap → dismisses cart sheet → returns to SELL tab product list with cart badge showing count
  3. Or: "Continue Scanning" button — keeps cart open as a mini bar while returning to products
  4. Cart badge on SELL tab: floating "1 item ₹145" pill (ties to STG-016)
  5. The flow should feel continuous: add → add → add → checkout when ready
- **Migration**: None
- **Test**: Tap "Add more items" → returns to product list → cart count badge visible → reopen cart → items preserved.
- **Depends on**: STG-016 (floating cart bar)

---

### STG-099 — Cart — edit icon (✏️) purpose unclear, no tooltip or label

- **Status**: PARKED — verified in reiteration, tag `stg-099-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — pencil edit icon next to "Toor Dal (Arhar) 1kg" — function unknown
- **Scope**: Sell Cart — item edit action
- **Problem**:
  1. Small pencil (✏️) icon next to the product name — what does it edit?
  2. Possible meanings: edit product name? Edit price? Edit quantity? Edit unit? Open product details?
  3. No tooltip, no label, no hint — user must tap to discover
  4. If it opens a price override: dangerous — cashier could change price without manager approval
  5. If it opens product details: useful but should use a different icon (ℹ️ not ✏️)
- **Expected**:
  1. **Clarify purpose**: If it edits price → label "Edit price" and add manager approval for changes > 10%
  2. **If it opens product details**: Change icon to ℹ️ or add label "Details"
  3. **Remove if redundant**: If quantity and delete handle all cart actions, the edit icon may be unnecessary clutter
  4. **If price override**: Show both original and overridden price with strikethrough
  5. **Tooltip on first use**: "Tap to edit price or quantity" — disappears after first interaction
- **Migration**: None
- **Test**: Tap edit → verify function. Label matches actual behavior. Price override requires approval.
- **Depends on**: None

---

### STG-100 — Cart — unit price vs line total not labeled (ambiguous with qty > 1)

- **Status**: PARKED — verified in reiteration, tag `stg-100-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — ₹145.00 on left and ₹145.00 on right with qty=1, not labeled
- **Scope**: Sell Cart — item pricing display
- **Problem**:
  1. With qty=1: left price "₹145.00" and right price "₹145.00" are identical — which is which?
  2. With qty=3: left would be "₹145.00" (unit) and right would be "₹435.00" (line total) — but still unlabeled
  3. Cashier can't distinguish "per unit" from "total" at a glance
  4. Price disputes: customer says "I thought ₹145 was the total for 3" — ambiguity causes arguments
  5. No "×" symbol: showing "₹145.00 × 3 = ₹435.00" would be immediately clear
- **Expected**:
  1. **Left**: "₹145.00/unit" (small text, or "₹145 ea.")
  2. **Right**: "₹435.00" (bold, larger — this is the line total)
  3. **Or**: Single line format: "₹145.00 × 3 = ₹435.00" — calculation is explicit
  4. **With qty=1**: Show just "₹145.00" (skip the "×1" — it's obvious)
  5. **Label positions consistently**: unit price always left, line total always right, always labeled
- **Migration**: None
- **Test**: qty=1 → shows one price. qty=3 → shows "₹145/unit × 3 = ₹435". Visually unambiguous.
- **Depends on**: STG-009 (product card redesign)

---

### STG-101 — Cart — no GST/tax line between Subtotal and Total

- **Status**: PARKED — verified in reiteration, tag `stg-101-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "Subtotal ₹145.00" then "Total ₹145.00" — no tax line
- **Scope**: Sell Cart — price breakdown
- **Problem**:
  1. Subtotal and Total are the same amount — no tax, discount, or fee lines between them
  2. If GST is included in the price, it should still be shown: "Incl. GST: ₹22.17"
  3. If discount is applied (using the Discount section), where does the discount line appear?
  4. Expected breakdown: Subtotal → Discount → Tax/GST → Total
  5. Indian GST compliance requires tax display on commercial transactions
- **Expected**:
  1. **Standard breakdown**:
     - Subtotal: ₹145.00
     - Discount: -₹0.00 (or hidden if zero)
     - GST (18%): ₹22.17 (or "Incl." if tax-inclusive pricing)
     - **Total: ₹145.00**
  2. For zero discount: hide the discount line (only show when > 0)
  3. For mixed GST rates: show per-rate lines (5%: ₹X, 18%: ₹Y)
  4. Show savings if discount applied: "You save ₹15.00"
- **Migration**: None (display-only, GST calc may already exist in backend)
- **Test**: Add discounted item → see discount line. GST-applicable → see tax line. Zero discount → line hidden.
- **Depends on**: STG-088 (payment GST display)

---

### STG-102 — Cart — discount has no max limit / manager approval for large discounts

- **Status**: PARKED — verified in reiteration, tag `stg-102-2026-03-14`
- **Priority**: P1 (security: cashier could give 100% discount = theft)
- **Source**: Code audit — `SellScanScreen.tsx:3505-3561` discount UI + `cartStore.ts:111-129` `calculateDiscountAmount()` + `cartStore.ts:677-689` discount application
- **Scope**: `src/screens/SellScanScreen.tsx:3505-3561`, `src/stores/cartStore.ts:111-129,677-689`
- **Problem**:
  1. Lines 3505-3547: Two chips (%, Flat) toggle discount type. TextInput accepts ANY numeric value.
  2. `cartStore.ts:111-129`: `calculateDiscountAmount()` caps percentage at 100% and fixed at INT32_MAX (2147483647) — effectively NO real limit
  3. NO role-based check — `disabled={!canEditCart}` at line 3516 only checks cart editability, not staff role
  4. NO audit trail — discount amount stored in cart state but not logged with who/when/why
  5. NO manager approval workflow — any staff member can apply any discount
  6. NO preset discount reasons (damaged, loyalty, clearance) — just a raw number input
- **Expected**:
  1. Add `maxDiscountPercent` config per store role: CASHIER=10%, MANAGER=25%, OWNER=100% — fetch from store settings API or `platform_settings` table
  2. If discount > role limit: show "Manager Approval Required" modal → manager enters PIN → unlock higher limit
  3. Add discount reason selector: "Damaged", "Customer Loyalty", "Clearance", "Price Match", "Other" — required for discounts > 5%
  4. Log discount in sale metadata: `{ staffId, discountAmount, discountType, reason, approvedBy, timestamp }`
  5. Visual warning at >20%: amber banner "High discount — ₹X off"
  6. Backend: add `max_discount_percent` column to `store_staff` or `platform_settings` table
- **Migration**: New migration adding `max_discount_percent` to store settings + `discount_audit` fields to sales table
- **Test**: Cashier enters 50% → "Manager approval required" modal. Manager PIN → discount applied + audit logged. Cashier enters 8% → no approval needed.
- **Depends on**: STG-017 (staff role display)

---

### STG-103 — Cart — no customer name/phone field for credit/due sales

- **Status**: PARKED — verified in reiteration, tag `stg-103-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — cart has no customer identification field
- **Scope**: Sell Cart — customer selection
- **Problem**:
  1. Cart shows items + discount + total but no customer field
  2. For cash sales, customer ID is optional but useful (loyalty, history)
  3. For credit/due sales, customer ID is MANDATORY (who owes the money?)
  4. The customer should be linked BEFORE payment — not on the payment screen after "Due" is selected
  5. Linking customer in cart enables: outstanding balance display, loyalty points, purchase history
- **Expected**:
  1. **Optional customer field at top of cart**: "Customer (optional)" → search by name/phone
  2. For credit sales: field becomes REQUIRED — "Select customer for credit sale"
  3. Show customer info: name, phone, outstanding balance
  4. Quick-add: "New customer" → name + phone (2 fields)
  5. Recent customers: last 5 for quick selection
  6. Position: above the first item in the cart
- **Migration**: None (ties to STG-037 customer model)
- **Test**: Select customer → name shows in cart. Proceed to Due payment → customer pre-selected.
- **Depends on**: STG-037 (customer entry), STG-082 (Due payment customer)

---

### STG-104 — Cart — no "Hold/Park Bill" feature for interrupted transactions

- **Status**: PARKED — verified in reiteration, tag `stg-104-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot review — no way to save current bill and start a new one
- **Scope**: Sell Cart — bill hold/park functionality
- **Problem**:
  1. Customer says "I forgot my wallet, I'll be right back" — cart has 5 items, cashier can't wait
  2. Next customer is waiting — cashier needs to start a new bill immediately
  3. No "Hold Bill" or "Park" button — cashier must either complete or clear the current bill
  4. Clearing loses all entered items — customer comes back, cashier re-enters 5 items
  5. This is a standard POS feature — restaurant POS calls it "Hold Table", retail calls it "Park Bill"
- **Expected**:
  1. **"Hold" button** in cart header (alongside "Clear"): saves current bill with timestamp
  2. **Held bills list**: accessible from SELL tab — "2 held bills" badge
  3. Tap held bill → restore to active cart → continue billing
  4. **Auto-expire**: Held bills expire after 2 hours (configurable)
  5. **Max held bills**: 5 concurrent — prevents forgotten held bills accumulating
  6. **Show held bill info**: Customer name (if linked), item count, total, time held
- **Migration**: May need local storage for held bills
- **Test**: Hold bill → start new bill → go to held bills → restore first bill → complete checkout.
- **Depends on**: None

---

### STG-105 — Cart — no item count header ("1 item in cart")

- **Status**: PARKED — verified in reiteration, tag `stg-105-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — "Sell Cart" title but no item count
- **Scope**: Sell Cart — header info
- **Problem**:
  1. "Sell Cart" title doesn't show how many items are in the cart
  2. With 10 items that require scrolling, user doesn't know total count without counting
  3. Quick verification: "I scanned 5 items" — glance at header → "5 items" → confirmed
- **Expected**:
  1. Header: "Sell Cart (1 item)" or "Sell Cart • 1 item"
  2. Updates dynamically: "Sell Cart (3 items)" when items added
  3. Or: separate subtitle below "Sell Cart": "1 item • ₹145.00"
- **Migration**: None
- **Test**: Add 3 items → header shows "3 items". Remove 1 → shows "2 items".
- **Depends on**: None

---

### STG-106 — Cart — Discount %/Flat toggle styling inconsistent

- **Status**: PARKED — verified in reiteration, tag `stg-106-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — "%" has blue circle indicator, "Flat" has no indicator
- **Scope**: Sell Cart — discount toggle component
- **Problem**:
  1. "%" option has a blue filled circle to its left — appears selected
  2. "Flat" option has NO blue circle — appears unselected
  3. But the visual treatment is unclear: is "%" a radio button? A toggle? A chip?
  4. The input field next to it shows "%" as placeholder — doesn't change to "₹" when "Flat" selected
  5. Custom toggle doesn't follow Material Design or any recognizable pattern
- **Expected**:
  1. Use standard segmented control / toggle: [%] [₹ Flat] — selected one has blue fill, other is outlined
  2. Input placeholder changes: "%" when percent selected, "₹" when flat selected
  3. Input label: "Discount (%)" or "Discount (₹)" — dynamic based on toggle
  4. Standard Material segmented button for consistency
- **Migration**: None
- **Test**: Toggle % ↔ Flat → visual state changes clearly. Input placeholder updates. Both modes calculate correctly.
- **Depends on**: STG-003 (theme tokens)

---

### STG-107 — Cart — no product thumbnail/image in cart items

- **Status**: PARKED — verified in reiteration, tag `stg-107-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — cart item shows only text, no product image/thumbnail
- **Scope**: Sell Cart — item card visual
- **Problem**:
  1. Cart shows "Toor Dal (Arhar) 1kg" in text only — no product image
  2. Visual identification is faster than reading text — images help verify correct product
  3. With 10 items, text-only list is harder to scan than image + text
  4. Product images may already exist in catalog — just not displayed in cart
- **Expected**:
  1. Small thumbnail (40×40px) at left of each cart item: product image or category icon
  2. If no image exists: category-specific placeholder (leaf for grocery, bottle for dairy)
  3. Matches the product card design from SELL tab for consistency
- **Migration**: None
- **Test**: Product with image → shows thumbnail. No image → category placeholder. Cart still loads fast.
- **Depends on**: STG-009 (product card images)

---

### STG-108 — Cart — ~50% empty space with few items, no guidance to add more

- **Status**: PARKED — verified in reiteration, tag `stg-108-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — cart with 1 item has massive empty white space
- **Scope**: Sell Cart — empty area utilization
- **Problem**:
  1. With 1 item, ~50% of the cart screen between the product card and Discount section is empty white
  2. No illustration, no guidance, no suggestion — just void
  3. Feels incomplete — "is this all?" rather than "ready to checkout!"
- **Expected**:
  1. **Light illustration or text in empty area**: "Scan or search to add more items" with a subtle icon
  2. **Suggested products**: "Frequently bought together" — 2-3 product suggestions
  3. **Or**: Auto-collapse empty space — Discount section moves up closer to the item list
  4. With 5+ items: empty space fills naturally — skeleton is fine
- **Migration**: None
- **Test**: 1 item → guidance visible. 5 items → space fills naturally. Guidance disappears.
- **Depends on**: STG-098 (add more items link)

---

### STG-109 — Cart — Checkout button should show item count "Checkout (1 item) ₹145"

- **Status**: PARKED — verified in reiteration, tag `stg-109-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — "Checkout ₹145.00" button shows total but not item count
- **Scope**: Sell Cart — checkout CTA
- **Problem**:
  1. "Checkout ₹145.00" — good that it shows total, but no item count
  2. Quick verification before checkout: "Checkout (3 items) ₹435.00" confirms both count and total
  3. Prevents accidental checkout with wrong number of items
- **Expected**:
  1. Button text: "Checkout (1 item) ₹145.00" or "Checkout • 1 item • ₹145.00"
  2. For multiple: "Checkout (3 items) ₹435.00"
  3. Dynamic update as items are added/removed
- **Migration**: None
- **Test**: 1 item → "Checkout (1 item) ₹145". Add 2 more → "Checkout (3 items) ₹435".
- **Depends on**: None

---

### STG-110 — Cart — no per-item discount, only cart-level

- **Status**: PARKED — verified in reiteration, tag `stg-110-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — Discount section applies to entire cart, no per-item discount option
- **Scope**: Sell Cart — discount granularity
- **Problem**:
  1. Discount section at bottom applies to the whole cart subtotal
  2. No way to discount just ONE item (e.g., damaged packaging on one product)
  3. Per-item discounts are common: "This dal bag is torn, give ₹10 off just this item"
  4. Cart-level discount distributes unevenly across items — wrong GST allocation
- **Expected**:
  1. Per-item discount: tap edit (✏️) on an item → "Discount" option → %/Flat per item
  2. Cart-level discount ALSO available — both co-exist
  3. Display: item shows original price strikethrough + discounted price
  4. Tax calculation: per-item discounts before GST, cart discount after subtotal
- **Migration**: None
- **Test**: Discount one item ₹10 → that item shows ₹135, others unchanged. Cart discount stacks on top.
- **Depends on**: STG-099 (edit icon purpose), STG-102 (discount controls)

---

### STG-111 — Cart — no "You save ₹X" line when discount applied

- **Status**: PARKED — verified in reiteration, tag `stg-111-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — discount section exists but no savings display when discount applied
- **Scope**: Sell Cart — savings display
- **Problem**:
  1. When a discount is applied, there's no "You save ₹X" or "Discount: -₹X" line
  2. Customer likes to see savings — builds loyalty
  3. Cashier can't verify the discount amount without mental calculation
- **Expected**:
  1. After discount: show "Discount: -₹15.00" line between Subtotal and Total
  2. Green "You save ₹15.00" message — positive reinforcement for customer
  3. On receipt: also print "You saved ₹15.00 today!"
- **Migration**: None
- **Test**: Apply 10% discount → "Discount: -₹14.50" appears. "You save ₹14.50" in green.
- **Depends on**: STG-101 (cart price breakdown)

---

### STG-112 — Cart — no notes/memo field for special instructions

- **Status**: PARKED — verified in reiteration, tag `stg-112-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot review — no way to add notes to a bill
- **Scope**: Sell Cart — notes/memo section
- **Problem**:
  1. No notes field for: "Deliver to Raju's shop", "Customer will pick up at 5 PM", "Return packaging"
  2. Kirana stores frequently take phone orders for delivery — notes capture the context
  3. Without notes, cashier relies on memory — errors during busy periods
- **Expected**:
  1. "Add Note" expandable field at bottom of cart (below Discount, above Subtotal)
  2. Optional — collapsed by default: "📝 Add note" link
  3. Expanded: text input, 2 lines, 140 chars max
  4. Note appears on receipt and in order history
  5. Suggestions: "Delivery", "Hold for pickup", "Customer return"
- **Migration**: May need `notes` field in order model
- **Test**: Add note → appears on receipt. No note → field stays collapsed.
- **Depends on**: None

---

### STG-113 — Payment — no bill/invoice number visible for tracking and disputes

- **Status**: PARKED — verified in reiteration, tag `stg-113-2026-03-14`
- **Priority**: P1 (every commercial transaction needs a unique ID — legal + operational requirement)
- **Source**: Screenshot deep review — payment screen shows amount but no transaction/bill identifier
- **Scope**: Payment screen — transaction metadata display
- **Problem**:
  1. ₹145.00 is displayed but NO bill number, invoice ID, or transaction reference
  2. After payment: customer asks "What's my bill number?" — cashier can't answer
  3. For returns: "I bought this yesterday" — which transaction? No ID to look up
  4. For disputes: "You charged me twice" — without bill numbers, impossible to investigate
  5. Audit/reconciliation: end-of-day settlement needs bill numbers to match payments
  6. Indian GST requires invoice numbers on tax invoices
- **Expected**:
  1. Show bill number at the top: "Bill #SM-20260313-0042" (store prefix + date + sequence)
  2. Auto-generated before payment starts (not after) — so the number is visible throughout
  3. Sequential, unique per store per day — easy to reference verbally
  4. Show on: payment screen, receipt, order history
  5. Format: configurable but default "SM-YYYYMMDD-NNNN"
- **Migration**: May need bill_number sequence in orders table
- **Test**: Start checkout → bill number visible. Complete → same number on receipt. Next bill → number increments.
- **Depends on**: None

---

### STG-114 — Payment — no cancel/void transaction button

- **Status**: PARKED — verified in reiteration, tag `stg-114-2026-03-14`
- **Priority**: P1 (cashier can get trapped on payment screen with no escape except back button)
- **Source**: Screenshot — only "Complete Payment" (disabled) and "Retry" visible. No cancel option.
- **Scope**: Payment screen — cancel/void workflow
- **Problem**:
  1. Cashier is on payment screen but customer says "Never mind, I don't want it"
  2. NO "Cancel" button, no "Void", no "Back to Cart" (STG-083 covers back, this is VOID)
  3. What if the cashier accidentally tapped Checkout? They're stuck on payment with no escape
  4. Error state: payment failed, but cashier doesn't want to retry — wants to cancel entirely
  5. "Cart locked" badge implies irreversibility — intensifies the feeling of being stuck
  6. Going back to cart (STG-083) preserves the cart. But sometimes the whole SALE needs to be cancelled.
- **Expected**:
  1. **"Cancel Sale"** text button or ⋮ menu option on payment screen
  2. Confirmation: "Cancel this sale? Items will be returned to inventory." → [Keep] [Cancel Sale]
  3. After cancellation: return to SELL tab with empty cart, stock restored
  4. **Void after payment**: If payment already completed, "Void" option available for 15 minutes
  5. Void requires manager PIN for amounts > ₹500 (prevent cashier abuse)
  6. Audit log: record all cancellations and voids with staff ID, reason, timestamp
- **Migration**: May need void/cancellation status in orders model
- **Test**: Cancel before payment → cart cleared, returned to SELL. Void after payment → stock restored, audit logged.
- **Depends on**: STG-083 (back button)

---

### STG-115 — Payment — missing payment methods: Card, Wallet (Paytm/GPay balance)

- **Status**: PARKED — verified in reiteration, tag `stg-115-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — only UPI, Cash, Due available. No card or wallet payment.
- **Scope**: Payment screen — additional payment methods
- **Problem**:
  1. Only 3 methods: UPI, Cash, Due — missing common Indian payment methods
  2. **Card/Debit**: Many kirana stores have card swipe machines (Mswipe, Pine Labs) — growing fast
  3. **Wallet**: Paytm wallet, Amazon Pay balance — customers use these daily
  4. **Bank Transfer/NEFT**: For large B2B wholesale orders
  5. **Cheque**: Rare but used for large supplier payments in kirana
  6. As digital payments grow, 3 methods will become insufficient
- **Expected**:
  1. Add "Card" tab with card icon — records card payment (amount only, no card processing in POS)
  2. Add "Wallet" tab or merge with UPI into "Digital" category
  3. Make payment methods configurable per store — hide unused methods in settings
  4. "More" overflow if >4 methods — or scrollable tabs
  5. Tab layout should handle 4-5 methods without breaking (flexible width or scroll)
  6. Each method: distinct icon, clear label, method-specific flow
- **Migration**: Backend payment_method enum may need new values
- **Test**: Enable Card in settings → Card tab appears. Disable → hidden. Payment recorded with correct method.
- **Depends on**: None

---

### STG-116 — Payment — Indian lakh number formatting (₹1,45,000 not ₹145,000)

- **Status**: PARKED — verified in reiteration, tag `stg-116-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot analysis — ₹145.00 is small but large amounts would need Indian formatting
- **Scope**: All screens — number formatting across the app
- **Problem**:
  1. India uses lakh/crore system: ₹1,45,000 (one lakh forty-five thousand)
  2. International format: ₹145,000 — Indians misread this as "fourteen thousand five hundred"
  3. For wholesale kirana bills (₹50,000+), wrong formatting causes confusion
  4. The ₹145.00 on screen is fine, but ₹1,45,000.00 must be formatted correctly
  5. This applies to: payment amount, cart total, product prices, reports, receipts
- **Expected**:
  1. Use Indian number formatting: `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`
  2. Examples: ₹1,45,000 | ₹10,00,000 | ₹99,999 | ₹1,000
  3. Apply to: payment screen, cart total, product prices, order history, reports
  4. Receipts: same formatting for printed/digital receipts
  5. Create a shared `formatCurrency()` utility used everywhere
- **Migration**: None (display formatting only)
- **Test**: Cart total ₹1,45,250 → displays with lakh comma. Receipt matches. All screens consistent.
- **Depends on**: STG-003 (theme/design system)

---

### STG-117 — Payment — ".00" always shown on round amounts, add smart formatting

- **Status**: PARKED — verified in reiteration, tag `stg-117-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — "₹145.00" when "₹145" is cleaner for round amounts
- **Scope**: All screens — price display formatting
- **Problem**:
  1. ₹145.00 — the ".00" is visual noise. 95%+ of kirana prices are round numbers.
  2. ₹30.00, ₹260.00, ₹145.00 — the ".00" adds no information and takes space
  3. On small product cards (where space is precious), ".00" wastes 3 characters
  4. International convention: ₹145 for round, ₹145.50 for fractional
- **Expected**:
  1. Smart formatting: ₹145 (round) vs ₹145.50 (fractional)
  2. Show decimals only when the amount has a fractional part
  3. On payment screen (large display): always show .00 for formal/receipt-like appearance
  4. On product cards (small display): drop .00 for compactness
  5. Configurable per context: card = compact, receipt = full
- **Migration**: None
- **Test**: Product ₹145 → shows "₹145". Product ₹145.50 → shows "₹145.50". Payment screen → always "₹145.00".
- **Depends on**: STG-116 (Indian formatting utility)

---

### STG-118 — Payment — "Retry" button is red (destructive color) for a positive action

- **Status**: PARKED — verified in reiteration, tag `stg-118-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — red "Retry" pill button in error banner
- **Scope**: Payment screen — error banner retry button
- **Problem**:
  1. "Retry" button uses red color — red universally means destructive (delete, cancel, danger)
  2. But Retry is a POSITIVE action — "try again to complete the payment"
  3. User hesitates: "Will tapping this red button cancel my payment?"
  4. The red Retry + grey Complete Payment create a confusing color hierarchy
  5. Red should be reserved for: Clear, Delete, Void, Cancel
- **Expected**:
  1. Retry button: blue (primary action) or amber (warning-action) — NOT red
  2. Match the primary blue of the Checkout button for consistency
  3. Style: "Retry" as outlined blue pill or filled blue pill
  4. Red reserved for destructive actions ONLY across the entire app
  5. Error banner: keep the red/pink background for the banner itself (warning zone), but button inside should be blue
- **Migration**: None
- **Test**: Error banner → Retry button is blue. Visual distinction: banner = warning, button = action.
- **Depends on**: STG-003 (theme tokens — color semantic rules)

---

### STG-119 — Payment — error banner has no dismiss X, persists indefinitely

- **Status**: PARKED — verified in reiteration, tag `stg-119-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — error banner stays on screen with no way to dismiss
- **Scope**: Payment screen — error banner lifecycle
- **Problem**:
  1. "Unable to start payment" banner has no close/X button — sticks on screen forever
  2. If the network issue resolved itself, the error still shows — stale information
  3. User can't dismiss it to try fresh — the old error occupies space and attention
  4. Banner position (above CTA) partially obscures the payment flow
  5. No auto-dismiss timer — even temporary errors persist
- **Expected**:
  1. **Dismiss X**: Small X button at right of error banner — tap to dismiss
  2. **Auto-dismiss**: After 10 seconds, fade out with "Tap to retry" toast
  3. **Auto-clear on action**: If user switches payment method or taps Retry, old error clears
  4. **Fresh attempt**: After dismiss, "Complete Payment" button should be active (blue) for a fresh try
  5. **Stacking**: If multiple errors occur, show only the latest (not stack all errors)
- **Migration**: None
- **Test**: Error appears → wait 10s → fades. Tap X → dismissed. Switch tab → error clears.
- **Depends on**: STG-077 (error messaging)

---

### STG-120 — Payment — no staff name/ID for shift reconciliation and audit

- **Status**: PARKED — verified in reiteration, tag `stg-120-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — payment screen has no indication of which staff member is processing
- **Scope**: Payment screen — staff identification
- **Problem**:
  1. Multi-staff stores: who is accepting this ₹145 cash payment? No name visible.
  2. End-of-shift: "Raju's register should have ₹12,450" — but if payments aren't tagged to staff, can't reconcile
  3. Manager reviews: "Who gave 30% discount on bill #42?" — no staff trail
  4. Fraud prevention: every payment must be attributable to a specific staff member
  5. The home screen may show staff (STG-017) but payment screen doesn't carry it through
- **Expected**:
  1. Small text at top of payment screen: "Cashier: Raju (Manager)" — inherited from login session
  2. Every completed payment records staff_id in the order/payment record
  3. Receipts: "Served by: Raju" printed at the bottom
  4. Shift report: grouped by staff — "Raju: 15 bills, ₹4,520 cash, ₹1,200 UPI"
  5. If staff switches mid-transaction, update attribution
- **Migration**: staff_id column in orders/payments if not already present
- **Test**: Login as Raju → payment screen shows "Cashier: Raju". Payment record has staff_id.
- **Depends on**: STG-017 (staff indicator on home)

---

### STG-121 — Payment — "Due" icon is calendar, should represent credit/udhar

- **Status**: PARKED — verified in reiteration, tag `stg-121-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — Due tab has calendar+clock icon but "Due" means credit/udhar
- **Scope**: Payment screen — Due payment tab icon
- **Problem**:
  1. Calendar+clock icon implies "schedule" or "deadline" — not "credit" or "owe money"
  2. "Due" in kirana context = udhar = customer takes goods and pays later
  3. A calendar suggests time-based scheduling, not a debt/credit concept
  4. Kirana retailers understand "udhar" via: notebook, rupee with arrow, handshake
- **Expected**:
  1. Icon options: ₹ with forward arrow (money owed), notebook/ledger icon, or handshake icon
  2. Or: ₹ inside a clock (money that will come later) — combines both concepts
  3. Label: consider "Credit" or "Udhar" instead of "Due" for Hindi-belt users
  4. Consistent with the CREDIT tab on the home screen
- **Migration**: None
- **Test**: Due tab icon is immediately recognizable as "credit sale" to a kirana retailer.
- **Depends on**: STG-003 (theme tokens — icon set)

---

### STG-122 — Payment — no confirmation dialog for large amounts (₹5,000+)

- **Status**: PARKED — verified in reiteration, tag `stg-122-2026-03-14`
- **Priority**: P1 (accidental ₹50,000 payment can't be easily reversed)
- **Source**: Payment screen analysis — Complete Payment has no confirmation step regardless of amount
- **Scope**: Payment screen — high-value confirmation
- **Problem**:
  1. ₹145 → tap Complete Payment → done. Fine for small amounts.
  2. ₹50,000 → tap Complete Payment → done. NO confirmation for a large amount — dangerous.
  3. Fat-finger error: cashier enters wrong quantity, total becomes ₹14,500 instead of ₹145. One tap completes it.
  4. Stock deduction is immediate — reversing requires void/return workflow.
  5. Cash handling: giving wrong change on a large bill (no change calculator per STG-080) compounds the risk.
- **Expected**:
  1. **Threshold-based confirmation**: Amount > ₹5,000 → "Confirm: Complete payment of ₹14,500?" → [Cancel] [Confirm]
  2. Threshold configurable per store in settings (default ₹5,000)
  3. Confirmation shows: item count, total, payment method — final verification
  4. For amounts > ₹10,000: require manager PIN (prevent large unauthorized sales)
  5. Below threshold: single tap completes (no friction for daily small sales)
- **Migration**: Store settings for confirmation threshold
- **Test**: ₹145 → no confirmation. ₹6,000 → confirmation dialog. ₹15,000 → manager PIN required.
- **Depends on**: STG-102 (manager approval pattern)

---

### STG-123 — Payment — amount positioned in dead center of empty space, move to top

- **Status**: PARKED — verified in reiteration, tag `stg-123-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — ₹145.00 is vertically centered on the screen in a sea of whitespace
- **Scope**: Payment screen — layout restructure
- **Problem**:
  1. "Amount ₹145.00" is dead center of the screen — ~200px of whitespace above and below it
  2. This positioning suggests the amount is the ONLY content — but a payment screen should have more
  3. Amount should be at the top (first thing cashier sees) with functional content below
  4. Centering implies "this is a display screen" not "this is an action screen" — wrong mental model
  5. When cart summary (STG-081) and cash input (STG-080) are added, the layout must restructure anyway
- **Expected**:
  1. Amount at top: immediately below payment tabs, large and prominent
  2. Below amount: order summary (collapsible)
  3. Below summary: payment-method-specific content (cash keypad, UPI QR, customer selector for Due)
  4. Bottom: CTA button (fixed at bottom, always visible)
  5. Top-to-bottom flow: see what → verify items → enter payment details → complete
- **Migration**: None
- **Test**: Amount at top, no dead whitespace. All functional areas have content.
- **Depends on**: STG-080 (cash input), STG-081 (order summary), STG-087 (space utilization)

---

### STG-124 — Payment — no sound/vibration feedback on payment success or failure

- **Status**: PARKED — verified in reiteration, tag `stg-124-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot analysis — no audio/haptic cues for payment outcomes
- **Scope**: Payment screen — audio and haptic feedback
- **Problem**:
  1. Kirana counter is NOISY — customers talking, traffic outside, other devices beeping
  2. Visual-only feedback (color change, text) is easily missed in this environment
  3. Payment success: cashier needs to hear it worked without staring at the screen
  4. Payment failure: needs an alert that cuts through ambient noise
  5. Other POS systems: cash register "cha-ching" sound is iconic for a reason
- **Expected**:
  1. **Success**: Short pleasant chime (200ms) + medium haptic vibration
  2. **Failure**: Short error buzz (200ms) + strong haptic vibration
  3. **Processing**: Subtle tick every 2 seconds while waiting
  4. **Configurable**: Settings → Sound on/off, Vibration on/off (some stores prefer silent)
  5. **Volume**: Uses notification channel, not media — respects silent/vibrate mode
  6. Use `expo-haptics` for vibration, `expo-av` for sound
- **Migration**: None
- **Test**: Complete payment → hear chime + feel vibration. Fail → hear buzz. Silent mode → vibration only.
- **Depends on**: None

---

### STG-125 — Payment — no partial payment tracking (₹100 now + ₹45 due later)

- **Status**: PARKED — verified in reiteration, tag `stg-125-2026-03-14`
- **Priority**: P2
- **Source**: Payment screen analysis — payment is all-or-nothing, no partial payment support
- **Scope**: Payment screen — partial payment with remaining as due
- **Problem**:
  1. Bill is ₹145. Customer says "I only have ₹100, I'll pay ₹45 tomorrow."
  2. Cashier must choose: Cash (full ₹145 — lies about receiving full amount) or Due (full ₹145 on credit — doesn't record the ₹100 received)
  3. Neither option is correct — the REAL transaction is: ₹100 cash + ₹45 due
  4. This is EXTREMELY common in kirana stores — partial payment with remaining as udhar
  5. Different from split payment (STG-085) which is same-time multi-method. This is partial payment NOW + rest LATER.
- **Expected**:
  1. **"Partial Payment" option**: After entering cash amount ₹100, show "₹45 remaining → Record as due?"
  2. **Flow**: Cash ₹100 → "₹45 remaining" → Select customer → "Record ₹45 due for Raju" → Complete
  3. **Receipt shows**: "Paid: ₹100 (Cash) | Due: ₹45 | Total: ₹145"
  4. **Customer ledger**: ₹45 added to Raju's outstanding balance
  5. **Mandatory customer for partial-due**: Can't record "due" without customer identity
- **Migration**: Order model needs partial_paid + due_amount fields
- **Test**: Enter ₹100 on ₹145 bill → "₹45 remaining" → select customer → complete. Customer balance +₹45.
- **Depends on**: STG-080 (cash amount input), STG-082 (customer for due), STG-037 (customer model)

---

### STG-126 — Cart — [-] at qty=1 behavior undefined: remove item? block? go to 0?

- **Status**: PARKED — verified in reiteration, tag `stg-126-2026-03-14`
- **Priority**: P1 (undefined behavior at a critical interaction point causes confusion)
- **Source**: Screenshot — [-] button shown when qty=1, behavior on tap is undefined/unknown
- **Scope**: Sell Cart — quantity stepper edge case
- **Problem**:
  1. Item qty is 1. User taps [-]. Three possible behaviors, all problematic:
     - **Remove item**: Dangerous — accidental tap removes product from bill. No undo. (Same as STG-095 but via [-])
     - **Go to 0**: Meaningless — qty 0 is same as not in cart. Confusing state.
     - **Do nothing**: Frustrating — button is tappable but has no effect. No feedback.
  2. Whatever the behavior, it's not communicated visually
  3. The [-] button looks identical at qty=1 and qty=5 — no disabled/warning state
  4. With STG-095 (delete button), there are now TWO ways to remove an item (🗑️ and [-]) — conflicting
- **Expected**:
  1. **At qty=1**: [-] button shows dimmed/disabled state — can't go below 1
  2. **To remove**: User must use 🗑️ delete button (with confirmation per STG-095)
  3. **Or**: [-] at qty=1 → shows confirmation: "Remove from cart?" → [Cancel] [Remove]
  4. **Visual**: [-] button at qty=1 has reduced opacity (30%) and different border color (grey not blue)
  5. **Haptic**: At qty=1, tapping [-] gives a "blocked" haptic (short double-buzz) signaling "can't go lower"
  6. **Never allow qty=0**: qty minimum is 1. Removal is a separate explicit action.
- **Migration**: None
- **Test**: qty=1 → tap [-] → nothing happens, button appears disabled. qty=2 → tap [-] → qty=1.
- **Depends on**: STG-096 (stepper redesign), STG-095 (delete confirmation)

---

### STG-127 — Cart — no stock validation when qty exceeds available stock

- **Status**: PARKED — verified in reiteration, tag `stg-127-2026-03-14`
- **Priority**: P1 (overselling = stock discrepancy = inventory chaos)
- **Source**: Screenshot — "In stock: 39" shown but no validation preventing qty=50
- **Scope**: Sell Cart — quantity vs stock validation
- **Problem**:
  1. Product shows "In stock: 39" but the [+] button has no visible upper limit
  2. Can user set qty=50 when only 39 available? What happens?
  3. Overselling → stock goes negative → inventory reports are wrong → reorder calculations break
  4. Multi-device stores: Device A and Device B both have "In stock: 39" — both sell 30 → total 60 sold from 39 stock
  5. No real-time stock lock — race condition between devices
- **Expected**:
  1. **Hard cap**: [+] disabled when qty = available stock. Button dims, tooltip "Max stock: 39"
  2. **Warning**: At qty = stock - 5 → amber warning "Only 5 left!"
  3. **At max**: qty=39, [+] greyed out, "No more in stock" message
  4. **Direct input** (STG-097): Typing 50 → "Only 39 available" error, caps at 39
  5. **Multi-device**: Ideally sync stock before checkout — "Stock changed: 32 remaining" notification
  6. **Override for manager**: Manager PIN to allow overselling (for pre-orders or known incoming stock)
  7. **Show remaining**: "In stock: 39" → as qty increases → "Remaining after sale: 9"
- **Migration**: None (validation logic only)
- **Test**: Set qty=39 → [+] disabled. Type 50 → capped at 39. qty=35 → "Remaining: 4" in amber.
- **Depends on**: STG-097 (direct qty input)

---

### STG-128 — Cart — no batch/expiry info for perishable items in cart

- **Status**: PARKED — verified in reiteration, tag `stg-128-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "Toor Dal (Arhar) 1kg" in cart with no expiry or batch info
- **Scope**: Sell Cart — item batch/expiry display
- **Problem**:
  1. FMCG products have expiry dates — Toor Dal could expire in 2 months or 2 days
  2. FEFO (First Expired, First Out) badge on SELL tab implies expiry-aware selling — but cart doesn't show which batch
  3. If multiple batches exist (batch A: exp Mar 2026, batch B: exp Dec 2026), which one is being sold?
  4. Customer complaints: "This dal expired last week" — no proof of which batch was sold
  5. Regulatory: FSSAI requires expiry awareness in food retail
- **Expected**:
  1. Below product name in cart: "Batch: B-2026-03 | Exp: Dec 2026" — small grey text
  2. Auto-select FEFO batch (earliest expiry) — highlight if expiring within 30 days (amber)
  3. If expired batch exists: RED warning "⚠️ This batch expired on 10-Mar-2026"
  4. Batch selection: if multiple batches, tap to choose which batch to sell
  5. Show batch info on receipt for traceability
- **Migration**: None (batch data should exist in inventory)
- **Test**: Product with 2 batches → FEFO batch auto-selected → expiry shown. Expired batch → red warning.
- **Depends on**: STG-013 (FEFO badge explanation)

---

### STG-129 — Cart — long product name truncation/overflow not handled

- **Status**: PARKED — verified in reiteration, tag `stg-129-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot analysis — "Toor Dal (Arhar) 1kg" fits but longer names will overflow
- **Scope**: Sell Cart — product name text handling
- **Problem**:
  1. "Toor Dal (Arhar) 1kg" is 21 chars — fits in one line on screen width
  2. "Tata Sampann Organic Premium Toor Dal Arhar Extra Clean 1kg" is 59 chars — will it wrap? Truncate? Overflow?
  3. With edit icon (✏️) and delete icon (🗑️) on the same row, space for text is limited
  4. Truncated names are problematic — customer can't verify "Tata Samp..." is the right product
  5. Different font sizes on different devices may cause earlier truncation
- **Expected**:
  1. Product name: max 2 lines with ellipsis (`numberOfLines={2}`)
  2. Full name on tap/long-press: tooltip or bottom sheet with complete product details
  3. Icons (✏️ 🗑️) positioned at fixed right edge — name text area is the flexible element
  4. Font size: min 14px for readability, even on 2nd line
  5. Test with longest real product name in the catalog
- **Migration**: None
- **Test**: 60-char product name → wraps to 2 lines → ellipsis if still too long. Icons don't overlap.
- **Depends on**: None

---

### STG-130 — Cart — discount input has no live preview ("10% = ₹14.50 off")

- **Status**: PARKED — verified in reiteration, tag `stg-130-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — discount % input field with no preview of what the discount amount would be
- **Scope**: Sell Cart — discount UX
- **Problem**:
  1. Cashier types "10" in the % field — but doesn't see "₹14.50 off" until checking the Total
  2. No live preview: "10% on ₹145.00 = ₹14.50 off → New total: ₹130.50"
  3. Cashier must mentally calculate: "10% of 145 is... 14.50" — error-prone during rush
  4. For Flat discount: typing "20" → is that ₹20 off? Shows nowhere until Total updates
  5. Without preview, cashier may enter wrong discount and not notice until receipt
- **Expected**:
  1. **Live preview below input**: As user types "10" → show "- ₹14.50 (10%)" in real-time
  2. **Total preview**: "New total: ₹130.50" updates as discount changes
  3. **For %**: "10% = ₹14.50 off"
  4. **For Flat**: "₹20.00 off (13.8%)" — shows both absolute and percentage
  5. **Validation**: >100% → "Discount can't exceed item total". Negative → blocked.
  6. **Apply explicitly**: Show preview → tap "Apply" → Total updates. Not auto-apply on each keystroke.
- **Migration**: None
- **Test**: Type 10 → see "₹14.50 off" preview. Change to 20 → preview updates. Apply → Total changes.
- **Depends on**: STG-106 (toggle styling), STG-102 (discount limits)

---

### STG-131 — Cart — empty space should show "frequently bought together" suggestions

- **Status**: PARKED — verified in reiteration, tag `stg-131-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — ~50% of cart is empty white space that could drive upsell
- **Scope**: Sell Cart — product suggestions in empty area
- **Problem**:
  1. Cart with 1 item has massive empty space between the item and Discount section
  2. This prime real estate could suggest complementary products — increasing basket size
  3. "Bought Toor Dal? Customers also buy: Oil ₹180, Salt ₹20, Jeera ₹45"
  4. Kirana retailers want higher average bill value — suggestions help
  5. Empty space feels incomplete and unprofessional
- **Expected**:
  1. **"Also add" section**: 3-5 product chips based on purchase patterns
  2. **Data source**: order history — "products frequently bought with Toor Dal"
  3. **Chip format**: "Oil ₹180 [+]" — name, price, quick-add button
  4. **Position**: below last cart item, above Discount section
  5. **Disappears**: when cart has 3+ items or user dismisses the section
  6. **Fallback**: if no data, show "Popular items" from store's top sellers
  7. **One-tap add**: tapping [+] adds to cart immediately
- **Migration**: None (reads from existing order/sales data)
- **Test**: Add Toor Dal → see suggestions for Oil, Salt. Tap [+] on Oil → added to cart. Cart has 5+ items → suggestions hidden.
- **Depends on**: STG-033 (frequently sold), STG-108 (empty space)

---

### STG-132 — Cart — Subtotal = Total is redundant, show Subtotal only when different

- **Status**: PARKED — verified in reiteration, tag `stg-132-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — "Subtotal ₹145.00" and "Total ₹145.00" are identical, taking two lines
- **Scope**: Sell Cart — price summary display logic
- **Problem**:
  1. Subtotal: ₹145.00 and Total: ₹145.00 — showing both when they're identical is redundant
  2. Takes 2 lines of space for 1 piece of information
  3. Feels like the app is "trying too hard" to look like a receipt when there's nothing to break down
  4. Adds visual noise — user scans both and realizes they're the same
- **Expected**:
  1. **No discount/tax applied**: Show only "Total: ₹145.00" (bold)
  2. **Discount applied**: Show "Subtotal: ₹145.00 → Discount: -₹14.50 → Total: ₹130.50"
  3. **Tax applicable**: Show "Subtotal → Tax → Total"
  4. Lines appear ONLY when they add information (discount > 0, tax > 0)
  5. Keeps the summary clean and purposeful
- **Migration**: None
- **Test**: No discount → only "Total" shown. Apply 10% → Subtotal + Discount + Total all appear.
- **Depends on**: STG-101 (tax line), STG-111 (savings display)

---

### STG-133 — Cart — bottom sheet height fixed at ~90%, should be dynamic to content

- **Status**: PARKED — verified in reiteration, tag `stg-133-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — cart bottom sheet is ~90% height for just 1 item
- **Scope**: Sell Cart — bottom sheet sizing
- **Problem**:
  1. Bottom sheet opens at ~90% screen height regardless of content
  2. With 1 item: ~50% of the sheet is empty whitespace
  3. With 10 items: 90% might be appropriate
  4. Fixed height feels wrong — like opening a giant drawer for a single pencil
  5. Dynamic sheet height is standard mobile UX (Google Maps, Apple Maps, etc.)
- **Expected**:
  1. **Dynamic height based on content**:
     - 1-2 items: 50% height (peek mode)
     - 3-5 items: 70% height
     - 6+ items: 90% height (full mode)
  2. **Drag to resize**: User can drag the handle to expand/collapse
  3. **Snap points**: 50%, 75%, 90% — sheet snaps to nearest point on release
  4. Always show Checkout button at bottom (fixed, visible at any sheet height)
  5. Use `@gorhom/bottom-sheet` library with dynamic snap points
- **Migration**: None
- **Test**: 1 item → sheet at 50%. Add items → sheet grows. Drag handle → snaps to points.
- **Depends on**: None

---

### STG-134 — Cart — no swipe-to-delete gesture on cart items

- **Status**: PARKED — verified in reiteration, tag `stg-134-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot review — only explicit 🗑️ button for item removal, no swipe gesture
- **Scope**: Sell Cart — item removal gesture
- **Problem**:
  1. Standard mobile pattern: swipe left on a list item → reveals delete action
  2. Cart only has explicit 🗑️ button — no gesture alternative
  3. Power users (fast cashiers) prefer swipe gestures — fewer precise tap targets needed
  4. Swipe-to-delete is more intentional than tapping a small icon — fewer accidental deletions
  5. Combined with undo (STG-095), swipe provides the safest removal UX
- **Expected**:
  1. Swipe left on cart item → reveals red "Delete" panel (partial swipe)
  2. Full swipe left → deletes item with undo toast (5 seconds)
  3. Swipe right → could reveal "Edit" panel (price override)
  4. Use `react-native-gesture-handler` Swipeable component
  5. Keep 🗑️ button as alternative for users who don't know swipe gestures
- **Migration**: None
- **Test**: Swipe left → red delete area. Full swipe → removed + undo. Swipe right → edit panel.
- **Depends on**: STG-095 (delete confirmation/undo)

---

### STG-135 — Cart — keyboard may cover Checkout button when discount input focused

- **Status**: PARKED — verified in reiteration, tag `stg-135-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot analysis — discount input near bottom, keyboard would overlap Checkout area
- **Scope**: Sell Cart — keyboard interaction
- **Problem**:
  1. Discount input is near the bottom of the sheet, just above Subtotal/Total/Checkout
  2. When tapped, soft keyboard appears (~40% of screen height)
  3. Keyboard likely covers: Subtotal, Total, AND Checkout button
  4. User can't see the total while typing discount — can't verify the calculation
  5. Can't tap Checkout until keyboard is dismissed — extra step
- **Expected**:
  1. **KeyboardAvoidingView**: Scroll the sheet content up so discount input + total + Checkout remain visible above keyboard
  2. **Or**: Pin Checkout button above keyboard (like chat input UX)
  3. **Total visible**: Even with keyboard open, the Total should be visible for live preview
  4. **"Done" button** on keyboard toolbar: dismisses keyboard and shows full cart
  5. **Auto-dismiss**: Keyboard dismisses when user taps outside the input or on Checkout
  6. Test on small screens (5-inch) where keyboard takes more proportional space
- **Migration**: None
- **Test**: Tap discount input → keyboard opens → Checkout button still visible → type 10 → see total update.
- **Depends on**: STG-130 (live preview)

---

### STG-136 — Cart — no "Share cart via WhatsApp" for phone order confirmation

- **Status**: PARKED — verified in reiteration, tag `stg-136-2026-03-14`
- **Priority**: P3
- **Source**: Cart analysis — no way to share cart contents externally
- **Scope**: Sell Cart — share/export feature
- **Problem**:
  1. Common kirana flow: customer calls/WhatsApps order → cashier builds cart → needs to confirm with customer
  2. No way to share cart contents: "Toor Dal 1kg ₹145, Vim ₹30, Total: ₹175"
  3. Cashier reads items back verbally — slow, error-prone
  4. WhatsApp share would let customer visually confirm the order
  5. Also useful for: delivery orders, B2B quotes, hold bills shared with manager
- **Expected**:
  1. **Share button** (📤) in cart header (alongside Clear)
  2. Tap → generates formatted text: "SuperMandi - Order Summary\n1. Toor Dal 1kg × 1 = ₹145\nTotal: ₹145"
  3. Opens native share sheet → WhatsApp, SMS, copy to clipboard
  4. Include store name, date, item list, total
  5. Optional: include store phone number for callbacks
- **Migration**: None
- **Test**: Build cart → tap Share → WhatsApp opens with formatted order text. All items and total correct.
- **Depends on**: None

---

### STG-137 — Cart — "In stock" has no low-stock warning styling (amber/red for <5 units)

- **Status**: PARKED — verified in reiteration, tag `stg-137-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "In stock: 39" in neutral grey, same styling regardless of stock level
- **Scope**: Sell Cart — conditional stock display
- **Problem**:
  1. "In stock: 39" is grey text — same color whether stock is 39 or 2
  2. Low stock (2 units) should visually alert the cashier — "sell carefully, almost out"
  3. Zero stock should be red with blocking — "Can't sell, out of stock"
  4. No urgency communication — cashier doesn't know to suggest alternatives
  5. Stock could change between adding to cart and checkout (multi-device) — no staleness indicator
- **Expected**:
  1. **>10 units**: Green or neutral grey "In stock: 39" ✓
  2. **≤10 units**: Amber "Low stock: 5" ⚠️
  3. **≤2 units**: Red "Last 2!" or "Almost out" 🔴
  4. **0 units**: Red "Out of stock" — block addition or show warning
  5. **After adding qty**: Show "Remaining after sale: 34" — dynamic update
  6. Thresholds configurable per store in settings
- **Migration**: None
- **Test**: Stock=39 → green. Stock=5 → amber "Low stock". Stock=1 → red "Last one!". Stock=0 → blocked.
- **Depends on**: STG-127 (stock validation)

---

### STG-138 — Cart — no weight/unit display separate from product name

- **Status**: PARKED — verified in reiteration, tag `stg-138-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "Toor Dal (Arhar) 1kg" — weight is embedded in the product name, not structured
- **Scope**: Sell Cart — unit/weight display
- **Problem**:
  1. "1kg" is part of the product NAME string, not a separate structured field
  2. "× 1" means 1 unit (packet) — but the product is also 1kg per unit
  3. Confusing: is the customer buying "1 × 1kg" or "1kg" (by weight)?
  4. For loose items sold by weight: "Rice 2.5kg" — the qty stepper [- 1 +] doesn't work for decimals
  5. Unit type (kg, pc, ltr, box, dozen) should be a separate display element
- **Expected**:
  1. Structured display: "Toor Dal (Arhar)" on line 1, "1kg per pack | ₹145/kg" on line 2
  2. For piece items: "Vim Dishbar" + "Per piece | ₹30"
  3. For weight items: qty stepper becomes weight input: "_ kg" with decimal keyboard
  4. Unit badge: small chip showing "kg" / "pc" / "ltr" next to quantity
  5. Cart shows: product name | unit/weight | qty × unit price = line total
- **Migration**: None (unit data exists in product model)
- **Test**: kg item → shows weight input. pc item → shows stepper. ltr item → shows volume input.
- **Depends on**: STG-018 (unit context on product cards)

---

### STG-139 — Cart — no return/exchange line item for customer returns

- **Status**: PARKED — verified in reiteration, tag `stg-139-2026-03-14`
- **Priority**: P2
- **Source**: Cart analysis — no way to process returns/exchanges in the billing flow
- **Scope**: Sell Cart — returns and exchanges
- **Problem**:
  1. Customer brings back Vim bought yesterday: "This was expired, I want a refund"
  2. No way to add a "return" or "negative" line item in the cart
  3. Cashier must: void the old bill (if possible) or manually adjust, or ignore it
  4. Exchanges: "Swap this 500g dal for 1kg" — no exchange workflow
  5. Returns without a system: money leaks, stock doesn't get restored, no audit trail
  6. This is different from voiding (STG-114) — returns are for PREVIOUS transactions
- **Expected**:
  1. **"Add Return" button** in cart (or ⋮ menu): opens return item selector
  2. **Return flow**: scan/search the returned product → enter qty → negative line item appears
  3. **Cart shows**: "Toor Dal 1kg × 1 = ₹145" and "Vim 1pc × -1 = -₹30" → "Net total: ₹115"
  4. **Refund method**: cash back, store credit, or adjust against new purchase
  5. **Original bill reference**: link return to original bill number (STG-113)
  6. **Stock restoration**: returned item qty added back to inventory
  7. **Manager approval**: returns > ₹500 require manager PIN
- **Migration**: Cart model needs negative qty/amount support + return_reference
- **Test**: Add return item → negative amount shows → net total calculated. Stock restored. Audit logged.
- **Depends on**: STG-113 (bill numbers), STG-114 (void), STG-102 (manager approval)

---

### STG-140 — Cart — Discount section always visible, should collapse when unused

- **Status**: PARKED — verified in reiteration, tag `stg-140-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — Discount section takes ~80px of space even when no discount is being applied
- **Scope**: Sell Cart — discount section visibility
- **Problem**:
  1. "Discount" section with %/Flat toggle + input is always visible
  2. Most kirana transactions (80%+) have NO discount — section is wasted space
  3. ~80px used for a feature used 20% of the time
  4. Pushes Subtotal/Total/Checkout lower — less visible on smaller screens
  5. With few items, the visible discount section adds to the "empty" feel
- **Expected**:
  1. **Collapsed by default**: Show "Add Discount" text link instead of the full section
  2. Tap "Add Discount" → section expands with %/Flat toggle + input
  3. **When discount applied**: Section stays expanded, shows the applied discount
  4. **Collapse again**: Tap "Remove Discount" or clear the input → collapses
  5. Saves ~60px of vertical space in the common (no-discount) case
- **Migration**: None
- **Test**: Cart opens → discount collapsed. Tap "Add Discount" → expands. Apply → stays. Clear → collapses.
- **Depends on**: STG-106 (discount toggle), STG-130 (discount preview)

---

### STG-141 — Cart — Checkout button price doesn't animate on total change

- **Status**: PARKED — verified in reiteration, tag `stg-141-2026-03-14`
- **Priority**: P3
- **Source**: Cart analysis — "Checkout ₹145.00" button total is static, doesn't animate on change
- **Scope**: Sell Cart — checkout button micro-interaction
- **Problem**:
  1. When quantity changes (1 → 3), the price in the Checkout button updates: ₹145 → ₹435
  2. But the update is instant (no animation) — easy to miss, especially during fast billing
  3. When discount is applied, total changes — again no animation
  4. User might not notice the total changed — especially if they're looking at the product area
  5. Animation draws attention to the most important number (the total they'll pay)
- **Expected**:
  1. **On total change**: Brief green flash/highlight on the price text (200ms)
  2. **Count-up animation**: ₹145 → ₹435 with rapid counting animation (300ms)
  3. **Or**: Price text briefly enlarges (scale 1.1) then returns to normal (bounce effect)
  4. **On discount**: Price decreases with green "saved" color flash
  5. **Subtle**: Don't overdo — a brief attention-draw, not a full animation show
- **Migration**: None
- **Test**: Change qty → see price animate. Apply discount → see price decrease with flash. Rapid changes → smooth.
- **Depends on**: STG-003 (theme tokens — animation timing)

---

### STG-142 — BUG: "[menu.viewDetails]" raw i18n key leaked in Today's Sales card

- **Status**: PARKED — verified in reiteration, tag `stg-142-2026-03-14`
- **Priority**: P0 (visible bug — raw code key shown to end users)
- **Source**: Screenshot — Menu → Today's Sales card shows "[menu.viewDetails] >" instead of translated text
- **Scope**: Menu screen — i18n translation missing
- **Problem**:
  1. "[menu.viewDetails]" is a raw i18n translation key — NOT the translated string
  2. Visible to ALL users at the bottom of the Today's Sales card
  3. Looks like a broken app — "[menu.viewDetails]" means nothing to a kirana retailer
  4. Translation key not found in the active locale file (en.json or hi.json)
  5. This is a regression or missing translation — should show "View Details" or "विवरण देखें"
- **Expected**:
  1. Fix: add "menu.viewDetails" key to all locale files: EN="View Details", HI="विवरण देखें"
  2. Add i18n lint rule: fail build if any translation key is missing from any locale
  3. Audit ALL screens for other leaked i18n keys (see STG-143)
- **Migration**: None
- **Test**: Menu → Today's Sales → bottom link shows "View Details" not "[menu.viewDetails]". Check Hindi too.
- **Depends on**: None (immediate fix)

---

### STG-143 — BUG: "[menu.printerReady]" and "[menu.testPrint]" raw i18n keys leaked

- **Status**: PARKED — verified in reiteration, tag `stg-143-2026-03-14`
- **Priority**: P0 (visible bug — TWO more raw keys shown to users)
- **Source**: Screenshot — Menu below Return/Refund shows "[menu.printerReady]" and "[menu.testPrint]"
- **Scope**: Menu screen — printer status section i18n
- **Problem**:
  1. "[menu.printerReady]" — should show "Printer: Ready" or "Printer: Not connected"
  2. "[menu.testPrint]" — should show "Test Print" button
  3. Both are inline text below the Return/Refund card — weird positioning
  4. Combined with STG-142: at least 3 raw i18n keys are leaked on the Menu screen alone
  5. Suggests the i18n system has missing keys or broken fallback
- **Expected**:
  1. Fix: add both keys to locale files
  2. "menu.printerReady" → "Printer: Ready ✓" / "Printer: Not connected ✗" (dynamic)
  3. "menu.testPrint" → "Test Print" (tappable button)
  4. Move printer status into a proper "Printer" card, not orphaned text
  5. Run full i18n audit: `grep -r 'menu\.' | grep -v '.json'` to find all translation keys → verify all exist in locale files
- **Migration**: None
- **Test**: Menu → printer area shows translated text. No square brackets visible anywhere.
- **Depends on**: STG-142 (same root cause)

---

### STG-144 — SECURITY: Developer/QA section + BUILD INFO visible to all users

- **Status**: PARKED — commit SHA pending, tag `stg-144-2026-03-14`, fix ledger region 2, test: `src/__tests__/screens/MenuScreen.stg-144.dev-guard.unit.test.tsx`
- **Priority**: P0 (security — internal dev tools exposed to end users in production builds)
- **Source**: Screenshot — "DEVELOPER / QA" section header + "UI Showcase" + "BUILD INFO (DIRTY)" visible
- **Scope**: Menu screen — developer section visibility
- **Problem**:
  1. "DEVELOPER / QA" section header is visible to ALL users — not behind __DEV__ check
  2. "UI Showcase" — "View all screens and modals for QA" — internal testing tool exposed
  3. "BUILD INFO (DIRTY)" — orange dashed box showing SHA, branch, modified/untracked file counts
  4. This is developer debugging info — has NO place in a production or release build
  5. Combined with STG-145: token and API URL also leaked in this section
  6. Related to STG-014 (DEV MODE banner) — same pattern, different location
- **Expected**:
  1. **Wrap entire "DEVELOPER / QA" section in `if (__DEV__)` check** — completely hidden in release builds
  2. **Also hide BUILD INFO box** in `if (__DEV__)`
  3. **Also hide footer** "Build: d4aa8d03 · Deployed: ..." in `if (__DEV__)`
  4. Keep in dev builds for debugging — but NEVER in release APK
  5. Add CI gate: build-time check that DEVELOPER/QA section is not rendered when `__DEV__ === false`
- **Migration**: None
- **Test**: Build release APK → no "DEVELOPER / QA" section. Run in Expo Go → section visible for dev.
- **Depends on**: STG-014 (DEV MODE banner — same pattern)

---

### STG-145 — SECURITY: BUILD INFO leaks token, API URL, StoreId UUID to end users

- **Status**: PARKED — commit SHA pending, tag `stg-145-2026-03-14`, fix ledger region 3, test: `src/__tests__/screens/MenuScreen.stg-145.data-leak.unit.test.tsx`
- **Priority**: P0 (security — credentials and internal URLs visible to any user)
- **Source**: Screenshot — BUILD INFO shows token hash, API: http://localhost:3000, StoreId UUID
- **Scope**: Menu screen — BUILD INFO section data
- **Problem**:
  1. "Token: ...65c737" — partial auth token visible. Even partial tokens aid attacks.
  2. "API: http://localhost:3000" — internal API URL. In staging/prod: reveals the backend URL.
  3. "StoreId: aedbd94c-1d60-4290-bfbd-6ad099439d91" — internal UUID. Enables targeted API attacks.
  4. "5 modified, 8 untracked" — reveals the build was from a dirty git state
  5. "Branch: main | SHA: d4aa8d03" — reveals exact code version for vulnerability targeting
  6. Even if section is hidden (STG-144), the DATA itself shouldn't be stored in a visible UI component
- **Expected**:
  1. **Remove ALL sensitive data from any user-visible component** — even dev builds should mask tokens
  2. Token: never show, even partially. Show "Authenticated ✓" instead.
  3. API URL: show only in dev. In production, hide entirely.
  4. StoreId: show only the human-readable StoreCode (SU260308-001), not the UUID
  5. Build info (SHA, branch): dev-only, behind __DEV__
  6. **Review all components for data leakage**: grep for `token`, `storeId`, `apiUrl` in render methods
- **Migration**: None
- **Test**: Release APK → no token, no API URL, no UUID visible anywhere. Dev → masked token.
- **Depends on**: STG-144 (hide dev section)

---

### STG-146 — Menu — Device UUID shown instead of device label

- **Status**: PARKED — verified in reiteration, tag `stg-144-2026-03-14`
- **Priority**: P1
- **Source**: Screenshot — "Device: 5c62f50a-06d7-46db-969c-392f2aa8c51f" in System Status
- **Scope**: Menu → System Status → Device row
- **Problem**:
  1. Full UUID "5c62f50a-06d7-46db-969c-392f2aa8c51f" displayed — meaningless to retailer
  2. Takes 2 lines due to length — wastes space
  3. Looks like an error or debug code — intimidating to non-technical users
  4. The device has a LABEL ("Counter-1" from enrollment) — that should be shown instead
- **Expected**:
  1. Show device label: "Device: Counter-1" (from enrollment)
  2. Or: "Device: Redmi Note 12 Pro" (friendly model name per STG-064)
  3. UUID available only on tap/expand for support calls
  4. Single line, not wrapping
- **Migration**: None
- **Test**: System Status → "Device: Counter-1 (Active)" on one line. Tap → shows UUID for support.
- **Depends on**: STG-064 (friendly device name)

---

### STG-147 — Menu — store name lowercase in System Status vs title case in header

- **Status**: PARKED — verified in reiteration, tag `stg-147-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "supermandi retailer test store" (lowercase) vs "SuperMandi Retailer Test Store" (header)
- **Scope**: Menu → System Status → store name display
- **Problem**: Inconsistent casing — header shows title case, System Status shows raw DB value (lowercase).
- **Expected**: Display store name consistently in title case everywhere. Apply `toTitleCase()` or store the name properly in DB.
- **Migration**: None
- **Test**: System Status store name matches header exactly.
- **Depends on**: None

---

### STG-148 — Menu — System Status card should be collapsible, rarely needed

- **Status**: PARKED — verified in reiteration, tag `stg-148-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — System Status card takes ~200px for 3 "Active/Synced" statuses
- **Scope**: Menu → System Status card
- **Problem**: When everything is "Active/Synced" (99% of the time), this card is noise. It occupies prime space that could show actionable content.
- **Expected**: Collapsed by default: show single line "System: All OK ✓" green chip. Expand on tap to see device details. Show expanded automatically when something is NOT active/synced.
- **Migration**: None
- **Test**: All active → collapsed. One item not active → auto-expanded with warning.
- **Depends on**: STG-003 (theme)

---

### STG-149 — Menu — Today's Sales percentages (551%) have no baseline context

- **Status**: PARKED — verified in reiteration, tag `stg-149-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "551%" green arrow next to ₹11,170.50 with no explanation
- **Scope**: Menu → Today's Sales card
- **Problem**: "551% up" compared to WHAT? Yesterday? Last week? Same day last month? No label.
- **Expected**: Show comparison period: "vs yesterday" or "vs last 7-day avg". Show absolute comparison: "Yesterday: ₹1,720". Hide percentage if comparison base is 0 or 1 sale (551% from 1 sale is misleading).
- **Migration**: None
- **Test**: Shows "vs yesterday" label. Base of 0 → hides percentage. Normal comparison → shows realistic %.
- **Depends on**: None

---

### STG-150 — Menu — "Payment Modes" section renders empty when dailySummary has no payment breakdown

- **Status**: PARKED — verified in reiteration, tag `stg-150-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — `MenuScreen.tsx:588-602` renders "Payment Modes" header conditionally, but the breakdown rows (Cash/UPI/Card totals) only render when `dailySummary` has payment data
- **Scope**: `src/screens/MenuScreen.tsx:588-602`
- **Problem**:
  1. Lines 588-602: "Payment Modes" title renders as section header
  2. Breakdown rows (Cash: ₹X, UPI: ₹Y, Card: ₹Z) only render if dailySummary contains payment_mode data
  3. When no sales exist or API returns no breakdown, the "Payment Modes" header shows with nothing below it — empty section
  4. This is NOT a settings page — it's a Today's Sales summary display
- **Expected**:
  1. **Chosen approach**: Hide "Payment Modes" header entirely when no breakdown data exists
  2. Wrap lines 588-602 in: `{dailySummary?.paymentBreakdown && dailySummary.paymentBreakdown.length > 0 && ( ... )}`
  3. When data exists: show "Cash: ₹8,000 | UPI: ₹3,170 | Card: ₹0" (show all modes, zero included)
  4. Also hide "Card" row if store has never accepted card payments (optional declutter)
- **Migration**: None
- **Test**: No sales today → "Payment Modes" section hidden. Sales exist → shows breakdown. New day with no sales → hidden again.
- **Depends on**: None

---

### STG-151 — Menu — metric labels below numbers, should be above

- **Status**: PARKED — verified in reiteration, tag `stg-151-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "₹11,170.50" then "Total Sales" below. Users read top-to-bottom.
- **Scope**: Menu → Today's Sales metrics layout
- **Problem**: Labels ("Total Sales", "Bills", "Avg Bill", "Items Sold") appear BELOW their values. Users read top-to-bottom, so they see "₹11,170.50" before knowing what it represents.
- **Expected**: Label above, value below: "Total Sales" → "₹11,170.50". Or: inline "Total Sales: ₹11,170.50". Standard dashboard pattern is label-first.
- **Migration**: None
- **Test**: Labels above values. User can identify each metric without reading the number first.
- **Depends on**: None

---

### STG-152 — Menu — Today's Sales should be on HOME screen, not buried in Menu

- **Status**: PARKED — verified in reiteration, tag `stg-152-2026-03-14`
- **Priority**: P1
- **Source**: Screenshot — Today's Sales card is in the Menu tab, not visible from the SELL screen
- **Scope**: Home screen — add daily sales widget
- **Problem**: Today's Sales (₹11,170.50, 2 bills, 5 items sold) is the MOST actionable data for a retailer — but it's hidden in the Menu tab requiring a tab switch + scroll. Every competitor POS shows daily totals on the home/main screen. Ties to STG-051 (daily counter) but this is about moving the existing card.
- **Expected**: Move (or duplicate) Today's Sales summary to the home screen — compact bar or collapsible card above or below the sync panel. Keep detailed version in Menu for drill-down.
- **Migration**: None
- **Test**: Home screen shows "Today: ₹11,170 | 2 bills" without navigating to Menu.
- **Depends on**: STG-051 (daily session counter), STG-006 (sync panel collapse to make room)

---

### STG-153 — Menu — Reprint/Download/Share buttons all call identical `goToBills()` with no context

- **Status**: PARKED — verified in reiteration, tag `stg-153-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — `MenuScreen.tsx:621-634` — all three buttons (Reprint printer icon, Download download icon, Share share-variant icon) call the same `goToBills()` function. `goToBills` defined at line 365: `navigation.navigate("SalesHistory")` with NO params.
- **Scope**: `src/screens/MenuScreen.tsx:621-634,365`
- **Problem**:
  1. Three distinct actions (Reprint, Download, Share) all navigate to SalesHistory identically — no way to know user intent
  2. No subtitles explain what each button does — "Reprint what? Download what? Share what?"
  3. Buttons orphaned between Bills History card and Return/Refund — no section header
  4. Related to STG-181 which covers the same navigation issue from a different angle
- **Expected**:
  1. **Chosen approach**: Remove standalone buttons. Move actions to per-bill context in SalesHistory/BillDetail.
  2. In `BillDetailScreen.tsx`: add "Reprint", "Download PDF", "Share via WhatsApp" as action buttons on individual bill detail
  3. Remove lines 621-634 from MenuScreen (the 3 orphaned buttons)
  4. The "Bills History" menu card already navigates to SalesHistory — these buttons are redundant
  5. If keeping buttons: add subtitles — "Reprint: Last bill", "Download: Sales report", "Share: Daily summary" — and pass distinct navigation params
- **Migration**: None
- **Test**: Bill detail has Reprint/Download/Share actions. Menu no longer shows orphaned buttons (or buttons have clear subtitles).
- **Depends on**: STG-181 (navigation params for bill actions)

---

### STG-154 — Menu — "BNPL Dues" jargon, kirana retailer won't understand

- **Status**: PARKED — verified in reiteration, tag `stg-154-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "BNPL Dues" card with subtitle "View and pay pending BNPL dues"
- **Scope**: Menu → BNPL Dues card
- **Problem**: "BNPL" = Buy Now Pay Later — fintech jargon. A kirana store owner knows this as "udhar" or "credit purchase". Using BNPL alienates the target user.
- **Expected**: Rename to "Credit Purchases" or "Pending Supplier Payments" or "Buy Now Pay Later (BNPL)" with the Hindi equivalent. Subtitle: "View pending payments for stock bought on credit."
- **Migration**: None
- **Test**: Label is understandable to a non-fintech user. Hindi mode shows appropriate translation.
- **Depends on**: STG-003 (theme)

---

### STG-155 — Menu — "Stock Inward" warehouse jargon, rename

- **Status**: PARKED — verified in reiteration, tag `stg-155-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — "Stock Inward" card with subtitle "Record incoming stock purchases"
- **Scope**: Menu → Stock Management → Stock Inward
- **Problem**: "Stock Inward" is warehouse/ERP terminology. Kirana retailers say "maal aaya" (goods arrived) or "add stock". "Inward" is not everyday language.
- **Expected**: Rename to "Add New Stock" or "Record Stock Received" or "Stock In". Subtitle: "Record goods received from suppliers." Keep "Stock Inward" as internal API/code term only.
- **Migration**: None
- **Test**: Menu shows "Add New Stock" or equivalent plain language. Functionality unchanged.
- **Depends on**: None

---

### STG-156 — Menu — Opening Stock "?" icon should be inventory icon

- **Status**: PARKED — verified in reiteration, tag `stg-156-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — Opening Stock card has "?" question mark icon in a teal circle
- **Scope**: Menu → Stock Management → Opening Stock icon
- **Problem**: "?" icon implies help/FAQ/unknown — NOT stock initialization. Every other menu item has a relevant icon (box for stock, chart for reports, gear for settings). "?" is the wrong icon.
- **Expected**: Use box/inventory icon (📦), or stack/shelf icon, or clipboard icon. Match the icon style of other Stock Management items (Stock Inward uses a box with arrow).
- **Migration**: None
- **Test**: Opening Stock icon is recognizable as inventory-related, not a question mark.
- **Depends on**: STG-160 (icon consistency)

---

### STG-157 — Menu — "Customers" and "Customer Management" are duplicate entries

- **Status**: PARKED — verified in reiteration, tag `stg-157-2026-03-14`
- **Priority**: P1 (duplicate navigation = confused users)
- **Source**: Screenshot — two separate cards in CUSTOMERS & CREDIT section
- **Scope**: Menu → Customers & Credit section
- **Problem**:
  1. "Customers" — "Customer profiles and purchase history"
  2. "Customer Management" — "Add, edit, and manage customer profiles"
  3. These are the SAME feature split into two cards — viewing vs managing
  4. User doesn't know which to tap: "I want to add a customer — is that Customers or Customer Management?"
  5. Every other app has ONE "Customers" section that handles both viewing and managing
- **Expected**: Merge into single "Customers" card — "View, add, and manage customer profiles." Inside the Customers screen: tabs or sections for list view, add new, edit, purchase history. Remove "Customer Management" card entirely.
- **Migration**: None (UI restructure only)
- **Test**: One "Customers" card in menu. Tap → screen with all customer functions.
- **Depends on**: None

---

### STG-158 — Menu — "Overdue Dues" redundant wording

- **Status**: PARKED — verified in reiteration, tag `stg-158-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — "Overdue Dues" card title
- **Scope**: Menu → Customers & Credit
- **Problem**: "Overdue Dues" — "overdue" and "dues" are near-synonyms. Like saying "late lates." Should be "Overdue Payments" or "Pending Collections" or "Late Payments."
- **Expected**: Rename to "Overdue Payments" — "Collect overdue payments and send reminders." Clear, non-redundant.
- **Migration**: None
- **Test**: Card shows "Overdue Payments" not "Overdue Dues".
- **Depends on**: None

---

### STG-159 — Menu — 20+ items need 8 screens of scrolling, needs restructure

- **Status**: PARKED — verified in reiteration, tag `stg-159-2026-03-14`
- **Priority**: P1 (menu is the primary navigation — can't require 8 screens of scrolling)
- **Source**: 8 screenshots needed to capture entire menu
- **Scope**: Menu tab — overall structure
- **Problem**:
  1. Menu has 20+ items across 8 sections — requires extensive scrolling
  2. "Daily Closing" (critical daily action) is 6 screens down — cashier scrolls past 15 items to reach it
  3. No collapsible sections — everything is always expanded
  4. No search — can't jump to "Printer Settings" without scrolling
  5. No usage-based ordering — rarely-used items get same prominence as daily-use items
  6. For a POS app used at a busy counter, this much scrolling is unacceptable
- **Expected**:
  1. **Collapsible sections**: Section headers (PURCHASING, STOCK MANAGEMENT, etc.) tap to collapse/expand
  2. **Default collapsed**: Only show most-used items expanded. Less-used sections collapsed.
  3. **Search bar at top**: Type "printer" → filters to Printer Settings
  4. **Usage-based ordering**: Track which menu items are tapped most → auto-sort
  5. **Quick actions at top**: Daily Closing, Shift Management, Reprint — most used daily actions
  6. **Reduce item count**: Merge duplicates (STG-157), nest related items (Reorder Settings + Policies)
  7. Target: max 2 screens of scrolling to see everything, 0 scrolling for top 5 actions
- **Migration**: None
- **Test**: Menu → 2 screens max. Search works. Sections collapse. Daily Closing visible without scrolling.
- **Depends on**: STG-157 (merge duplicates)

---

### STG-160 — Menu — icon colors inconsistent across items

- **Status**: PARKED — verified in reiteration, tag `stg-160-2026-03-14`
- **Priority**: P2
- **Source**: 8 screenshots — icons use blue, teal, green, red, grey, orange with no system
- **Scope**: Menu — all card icons
- **Problem**: Icon circles have 6+ different colors: blue (Bills, Purchase), teal (BNPL, Opening Stock), green (WhatsApp), red (Return, Overdue, Switch Store), grey (Reorder Settings), orange (UI Showcase). No color system — feels random.
- **Expected**: Use 2-3 colors max per the brand design system (STG-003): primary blue for main features, neutral grey for settings, red only for destructive/warning. Or: all icons same neutral color, differentiated by icon shape only.
- **Migration**: None
- **Test**: All menu icons follow a consistent 2-3 color palette. Brand-aligned.
- **Depends on**: STG-003 (theme tokens)

---

### STG-161 — Menu — no notification badges on menu items

- **Status**: PARKED — verified in reiteration, tag `stg-161-2026-03-14`
- **Priority**: P2
- **Source**: Screenshots — Overdue Dues, BNPL Dues show no count badges
- **Scope**: Menu — item-level notification badges
- **Problem**: "Overdue Dues" could have 5 overdue customers, "BNPL Dues" could have 3 pending — but no badge or count indicates this. User must tap into each to discover if action is needed. No urgency signal.
- **Expected**: Red badge with count: "Overdue Dues (3)" or red dot. Amber badge for pending: "BNPL Dues (2)". Green badge for completed/clear items. Update in real-time from local data.
- **Migration**: None
- **Test**: 3 overdue → red badge "3" on Overdue Dues card. 0 overdue → no badge.
- **Depends on**: None

---

### STG-162 — Menu — logo + pill + "Menu" title redundant heading

- **Status**: PARKED — verified in reiteration, tag `stg-162-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — SuperMandi icon + green pill badge + "Menu" text at top of Menu tab
- **Scope**: Menu → header area
- **Problem**: "SuperMandi" pill + "Menu" text + hamburger icon = 3 elements saying "you're on the Menu." The tab bar already shows "MENU" is active. This header wastes ~60px of prime space.
- **Expected**: Remove redundant header — the active MENU tab already indicates location. Use the space for Today's Sales (STG-152) or quick actions. If a header must exist: single line "Menu" text, no logo pill.
- **Migration**: None
- **Test**: Menu opens → no redundant heading. Space used for content.
- **Depends on**: STG-152 (move sales to home)

---

### STG-163 — Menu — card spacing too large, needs tighter layout

- **Status**: PARKED — verified in reiteration, tag `stg-163-2026-03-14`
- **Priority**: P3
- **Source**: 8 screenshots — each card is ~80px + 16px gap = ~96px per item
- **Scope**: Menu — card list spacing
- **Problem**: 20+ items × 96px = ~1920px = 3.5+ screen heights. Card padding and gap between cards is generous (16px each side + 16px gap). Reducing to 12px padding + 8px gap would save ~30% height.
- **Expected**: Tighter spacing: 12px card padding, 8px gap between cards. Or: list items instead of cards for simple navigation items (title + subtitle + >, no card border). Save card styling for data-rich items (Today's Sales, System Status).
- **Migration**: None
- **Test**: Menu scrollable in 2-3 screens instead of 8. Content still readable.
- **Depends on**: STG-159 (menu restructure)

---

### STG-164 — Settings — "kbcretailer (MANAGER)" shows username not display name

- **Status**: PARKED — verified in reiteration, tag `stg-164-2026-03-14`
- **Priority**: P1 (staff identity is displayed wrong — affects daily operations)
- **Source**: Screenshot — Switch Staff shows "kbcretailer (MANAGER)"
- **Scope**: Settings → Switch Staff display
- **Problem**: "kbcretailer" is an internal username/login ID — NOT the staff member's real name. Should show "Raju Manager" or whatever display_name is in the staff record. Showing a username looks broken and is confusing for non-technical users.
- **Expected**: Show display name + role: "Raju (Manager)" or "Raju Kumar — Manager". Username only as a fallback if display_name is null. Fix applies everywhere staff name is shown: menu, receipts, audit logs, payment screen (STG-120).
- **Migration**: May need to populate display_name in staff records
- **Test**: Switch Staff shows real name "Raju (Manager)" not "kbcretailer (MANAGER)".
- **Depends on**: STG-017 (staff indicator on home), STG-120 (staff on payment)

---

### STG-165 — Settings — Hindi toggle "हि" non-standard abbreviation

- **Status**: PARKED — verified in reiteration, tag `stg-165-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — Language toggle shows "EN | हि"
- **Scope**: Settings → Language card
- **Problem**: "हि" is not a standard Hindi abbreviation. Standard is "हिं" (for हिंदी). Or use full word "Hindi" in Latin script. The current abbreviation may confuse Hindi-literate users who don't recognize "हि" as their language.
- **Expected**: Use "EN | हिंदी" (full word) or "EN | HI" (ISO code). If space constrained: "EN | हिं".
- **Migration**: None
- **Test**: Toggle shows recognizable Hindi label. Hindi-literate user identifies it instantly.
- **Depends on**: STG-054 (Hindi i18n)

---

### STG-166 — Settings — "Re-enroll to a different store" enrollment jargon

- **Status**: PARKED — verified in reiteration, tag `stg-166-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — Switch Store subtitle "Re-enroll to a different store"
- **Scope**: Settings → Switch Store subtitle
- **Problem**: "Re-enroll" is internal jargon from the enrollment/activation flow. Users think "switch" not "re-enroll." Should use plain language.
- **Expected**: "Switch to a different store" or "Connect to another store." Drop "re-enroll."
- **Migration**: None
- **Test**: Subtitle uses plain language. No mention of "enroll."
- **Depends on**: None

---

### STG-167 — Settings — no About section with app version + terms + privacy links

- **Status**: PARKED — verified in reiteration, tag `stg-167-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — Settings has no About/Legal section
- **Scope**: Settings area — new About card
- **Problem**: No app version visible in Settings (ties to STG-055). No Terms of Service link (ties to STG-026). No Privacy Policy link (Play Store requirement). No "About SuperMandi" card. Standard apps have About section in Settings.
- **Expected**: Add "About" card at bottom of Settings: App version, Terms link, Privacy Policy link, Licenses, Contact support. Satisfies Play Store requirements (STG-026) and support needs (STG-055).
- **Migration**: None
- **Test**: Settings → About card shows version + terms link + privacy link. All links open correctly.
- **Depends on**: STG-026 (terms/privacy), STG-055 (version display)

---

### STG-168 — Settings — no logout/sign-out option visible for staff

- **Status**: PARKED — verified in reiteration, tag `stg-168-2026-03-14`
- **Priority**: P1 (security — staff can't fully log out of the POS)
- **Source**: Screenshot — Settings shows Switch Staff and Switch Store, but no Logout
- **Scope**: Settings → logout functionality
- **Problem**:
  1. "Switch Staff" switches to another staff member but doesn't fully log out
  2. "Switch Store" re-enrolls to a different store — not a logout
  3. No "Logout" or "Sign Out" option — staff can't end their session securely
  4. End of shift: outgoing staff should log out so unauthorized people can't make sales
  5. Security: lost/stolen device — no way to remotely or locally log out
  6. Shared devices: without logout, the next person inherits the previous session
- **Expected**: Add "Logout" or "End Session" option in Settings — below Switch Staff. Confirmation: "Log out? You'll need to re-enter staff PIN to continue." After logout: shows staff login/PIN screen. All pending data synced before logout.
- **Migration**: None
- **Test**: Tap Logout → confirmation → returned to staff login screen. No active session.
- **Depends on**: STG-017 (staff indicator)

---

### STG-169 — Menu — no search/filter across 20+ menu items

- **Status**: PARKED — verified in reiteration, tag `stg-169-2026-03-14`
- **Priority**: P2
- **Source**: 8 screenshots of menu — no way to search
- **Scope**: Menu tab — search functionality
- **Problem**: 20+ menu items, 8 sections. To find "Printer Settings": scroll through 6 screens. No search, no filter, no jump-to-section. During busy periods, this wastes time.
- **Expected**: Search bar at top of menu: type "print" → shows "Printer Settings" immediately. Or: alphabetical index sidebar (like phone contacts). Or: section jump chips at top: [Sales] [Stock] [Settings] → scrolls to section.
- **Migration**: None
- **Test**: Type "daily" → filters to "Daily Closing" + "Daily Report". Clear → shows all items.
- **Depends on**: STG-159 (menu restructure)

---

### STG-170 — Menu — "Barcode Sheets" subtitle "tiered" jargon

- **Status**: PARKED — verified in reiteration, tag `stg-170-2026-03-14`
- **Priority**: P3
- **Source**: Screenshot — "Generate tiered barcode PDFs"
- **Scope**: Menu → Barcode Sheets subtitle
- **Problem**: "tiered" is a pricing/technical term. Kirana retailer doesn't know what "tiered barcodes" means. Subtitle should explain the action in plain language.
- **Expected**: "Print barcode labels for your products" or "Generate barcode stickers." Drop "tiered."
- **Migration**: None
- **Test**: Subtitle is understandable to non-technical user.
- **Depends on**: None

---

### STG-171 — Menu — Today's Sales metrics all same size, no visual hierarchy

- **Status**: PARKED — verified in reiteration, tag `stg-171-2026-03-14`
- **Priority**: P2
- **Source**: Screenshot — ₹11,170.50, 2 bills, ₹5,585.25, 5 items — all roughly same font weight/size
- **Scope**: Menu → Today's Sales card layout
- **Problem**: Total Sales (₹11,170.50) should be the HERO metric — bigger, bolder, first thing the eye hits. But it's the same size as Avg Bill and Items Sold. All 4 metrics compete equally for attention.
- **Expected**: Hero metric: Total Sales ₹11,170.50 — 28px bold, primary color. Secondary: Bills (2), Avg Bill — 18px, grey. Tertiary: Items Sold — 14px. Percentage arrows can be smaller. The card should read: "You made ₹11,170 today from 2 bills" in visual hierarchy.
- **Migration**: None
- **Test**: Total Sales is visually dominant. Secondary metrics are clearly subordinate.
- **Depends on**: STG-003 (theme tokens — typography scale)

---

### STG-172 — Menu — hardcoded English strings not using i18n (Return/Refund, Opening Stock, etc.)

- **Status**: PARKED — verified in reiteration, tag `stg-172-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [MenuScreen.tsx](src/screens/MenuScreen.tsx)
- **Scope**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**:
  1. Line 642: `"Return / Refund"` hardcoded
  2. Line 643: `"Process returns and issue refunds"` hardcoded
  3. Line 769: `"Opening Stock"` hardcoded
  4. Line 770: `"Initialize stock for new products"` hardcoded
  5. Line 777: `"Customers & Credit"` section title hardcoded
  6. Line 785: `"Khata (Credit Book)"` hardcoded
  7. Line 786: `"Track credit and payments"` hardcoded
  8. Line 796: `"Customers"` hardcoded
  9. Line 797: `"Customer profiles and purchase history"` hardcoded
  10. Line 808: `"Customer Management"` hardcoded
  11. Line 809: `"Add, edit, and manage customer profiles"` hardcoded
  12. Line 820: `"Overdue Dues"` hardcoded
  13. Line 821: `"Collect overdue DUE payments and send reminders"` hardcoded
  14. Line 828: `"AI & Intelligence"` section title hardcoded
  15. Line 836: `"AI Insights"` hardcoded
  16. Line 837: `"Alerts, forecasts, slow movers, expiry tracking"` hardcoded
  17. Line 848: `"Bulk Purchase Credit"` hardcoded
  18. Line 849: `"Browse and apply for credit offers"` hardcoded
  19. Line 856: `"Messages"` section title hardcoded
  20. Line 864: `"Chat"` hardcoded
  21. Line 865: `"Message suppliers and support"` hardcoded
  22. Line 895: `"WhatsApp Support"` hardcoded
  23. Line 896: `"Chat with SuperMandi support team"` hardcoded
  24. Line 945: `"Daily Report"` hardcoded
  25. Line 946: `"View, print, and share daily sales report"` hardcoded
  26. Line 953: `"Operations"` section title hardcoded
  27. Line 961: `"Daily Closing"` hardcoded
  28. Line 962: `"Z-Report and cash reconciliation"` hardcoded
  29. Line 971: `"Shift Management"` hardcoded
  30. Line 972: `"Start, end, and view shift history"` hardcoded
  31. Line 1016: `"Theme"` hardcoded
  32. Line 1040: `"Switch Staff"` hardcoded
  33. Line 1054: `"Printer Settings"` hardcoded
  34. Line 1055: `"Paper width, auto-print, copies"` hardcoded
  35. Line 1066: `"Help & Support"` with `&amp;` entity
  36. Line 1067: `"Contact us, quick links"` hardcoded
- **Expected**: All strings go through `t()` with keys in both `en.json` and `hi.json`. Hindi-speaking kirana retailers should see the entire Menu in Hindi when language is toggled.
- **Migration**: None
- **Test**: Toggle language to Hindi, verify all menu items display in Hindi with no English fallbacks
- **Depends on**: STG-054 (Hindi translations)
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. In `en.json`, add under `"menu"` section: `"returnRefund"`, `"returnRefundSubtitle"`, `"openingStock"`, `"openingStockSubtitle"`, `"customersCredit"`, `"khataCredit"`, `"khataCreditSubtitle"`, `"customers"`, `"customersSubtitle"`, `"customerManagement"`, `"customerManagementSubtitle"`, `"overdueDues"`, `"overdueDuesSubtitle"`, `"aiIntelligence"`, `"aiInsights"`, `"aiInsightsSubtitle"`, `"bulkPurchaseCredit"`, `"bulkPurchaseCreditSubtitle"`, `"messages"`, `"chat"`, `"chatSubtitle"`, `"whatsappSupport"`, `"whatsappSupportSubtitle"`, `"dailyReport"`, `"dailyReportSubtitle"`, `"operations"`, `"dailyClosing"`, `"dailyClosingSubtitle"`, `"shiftManagement"`, `"shiftManagementSubtitle"`, `"theme"`, `"switchStaff"`, `"printerSettings"`, `"printerSettingsSubtitle"`, `"helpSupport"`, `"helpSupportSubtitle"`
  2. In `hi.json`, add Hindi translations for all above keys
  3. In `MenuScreen.tsx`, replace every hardcoded string literal (lines 642-1067) with `t('menu.<key>')` calls
- **Guard**: Do NOT change any navigation logic, only text rendering. Do NOT modify lines inside `if (__DEV__)` blocks.
- **DoD**: ☐ Zero hardcoded English in MenuScreen render ☐ `en.json` has all keys ☐ `hi.json` has all keys ☐ Hindi toggle shows full Hindi menu ☐ Typecheck passes

---

### STG-173 — Menu — "View Details" uses t() defaultValue fallback, raw key leaks if i18n fails

- **Status**: PARKED — verified in reiteration, tag `stg-173-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [MenuScreen.tsx:605](src/screens/MenuScreen.tsx#L605)
- **Scope**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`
- **Problem**: Line 605 uses `t('menu.viewDetails', { defaultValue: 'View Details' })`. The key `menu.viewDetails` does NOT exist in `en.json`. If the defaultValue mechanism fails or is overridden by a translation management system, the raw key `[menu.viewDetails]` leaks to the UI (confirmed in screenshot from previous session).
- **Expected**: Add `"viewDetails": "View Details"` to `en.json` under `menu` section. Remove the `defaultValue` fallback since the key will now exist.
- **Migration**: None
- **Test**: Verify the string renders as "View Details" (not `[menu.viewDetails]`) in both English and Hindi
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Add `"viewDetails": "View Details"` to `en.json` → `menu` section
  2. Add `"viewDetails": "विवरण देखें"` to `hi.json` → `menu` section
  3. In `MenuScreen.tsx` line ~605, remove `{ defaultValue: 'View Details' }` — key now exists
- **Guard**: Do NOT change line numbering or surrounding logic.
- **DoD**: ☐ Key exists in both locale files ☐ No `defaultValue` fallback ☐ UI shows "View Details" in EN, Hindi in HI

---

### STG-174 — Menu — "Printer Ready"/"Test" use t() second-arg fallback, not standard defaultValue

- **Status**: PARKED — verified in reiteration, tag `stg-174-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [MenuScreen.tsx:656-658](src/screens/MenuScreen.tsx#L656-L658)
- **Scope**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`
- **Problem**:
  1. Line 656: `t('menu.printerReady', 'Printer Ready')` — uses positional string fallback (non-standard i18next API). Key `menu.printerReady` NOT in `en.json`.
  2. Line 658: `t('menu.testPrint', 'Test')` — same issue. Key `menu.testPrint` NOT in `en.json`.
  3. Line 243: `t('menu.printerOk', 'Printer OK')`, `t('menu.testPrintSuccess', 'Test page sent successfully.')` — same pattern.
  4. These keys were confirmed leaking as `[menu.printerReady]` and `[menu.testPrint]` in the screenshot.
- **Expected**: Add all missing keys to `en.json` and `hi.json`. Use standard `t('menu.printerReady')` without fallback.
- **Migration**: None
- **Test**: Verify printer status row shows localized text, no raw keys
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Add to `en.json` → `menu`: `"printerReady": "Printer Ready"`, `"testPrint": "Test"`, `"printerOk": "Printer OK"`, `"testPrintSuccess": "Test page sent successfully."`, `"testPrintFailed": "Could not print test page."`
  2. Add Hindi translations to `hi.json`
  3. In `MenuScreen.tsx`, remove all positional string fallbacks (e.g., `t('menu.printerReady', 'Printer Ready')` → `t('menu.printerReady')`)
- **Guard**: Do NOT change printer detection or test print logic.
- **DoD**: ☐ All printer i18n keys in both locale files ☐ No positional fallbacks ☐ Hindi printer strings display correctly

---

### STG-175 — Menu — no Pressable ripple/feedback effect on menu items (no android_ripple)

- **Status**: PARKED — verified in reiteration, tag `stg-175-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:610+](src/screens/MenuScreen.tsx#L610)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: All `<Pressable>` menu items lack `android_ripple={{ color: colors.primary + '20' }}` or any press feedback. On Android, tapping a menu item gives zero visual response. User can't tell if their tap registered.
- **Expected**: Add `android_ripple={{ color: colors.primary + '20', borderless: false }}` to every `<Pressable style={styles.menuItem}>`. Also add pressed state via `style={({ pressed }) => [..., pressed && { opacity: 0.7 }]}`.
- **Migration**: None
- **Test**: Tap any menu item, verify ripple appears on Android. On iOS, verify opacity change.
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**:
  1. Add `android_ripple={{ color: colors.primary + '20', borderless: false }}` to every `<Pressable style={styles.menuItem}>` (approx 20 instances, lines ~610-1080)
  2. Change `style={styles.menuItem}` to `style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.85 }]}` for iOS feedback
- **Guard**: Do NOT add to `<Pressable>` inside modal/alert contexts. Only menu item Pressables.
- **DoD**: ☐ All menu Pressables have `android_ripple` ☐ Pressed opacity on iOS ☐ Visual test on Android device

---

### STG-176 — Menu — header paddingVertical:8 too tight, brand pill cramped

- **Status**: PARKED — verified in reiteration, tag `stg-176-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:1153](src/screens/MenuScreen.tsx#L1153)
- **Scope**: `src/screens/MenuScreen.tsx` styles
- **Problem**: Header has `paddingVertical: 8` — only 8px above/below the brand pill + "Menu" label. Combined with the content padding of 16px, the header sits too close to the status bar and feels cramped. Compare to professional apps that give headers 16-24px vertical padding.
- **Expected**: Increase `paddingVertical` to 16px. Add `marginBottom: 4` to create breathing room before System Status panel.
- **Migration**: None
- **Test**: Visual check — header feels spacious, not cramped
- **Depends on**: STG-003 (spacing tokens)
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: In `styles` object (~line 1153), change `header: { paddingVertical: 8 }` → `paddingVertical: 16`. Add `marginBottom: 4` to header style.
- **Guard**: Do NOT change header's horizontal padding or other header children.
- **DoD**: ☐ Header has 16px vertical padding ☐ Visual breathing room above brand pill

---

### STG-177 — Menu — status panel "Sync" label hardcoded English (not i18n)

- **Status**: PARKED — verified in reiteration, tag `stg-177-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:479](src/screens/MenuScreen.tsx#L479)
- **Scope**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: Line 479: `<Text style={styles.statusLabel}>Sync</Text>` — hardcoded English. Also lines 221, 226: `t('menu.syncComplete')`, `t('menu.syncFailed')` use defaultValue but keys NOT in `en.json`.
- **Expected**: Add `menu.sync`, `menu.syncComplete`, `menu.syncFailed`, `menu.syncing`, `menu.syncNow`, `menu.allDataSynced` to both locale files. Replace hardcoded "Sync" with `t('menu.sync')`.
- **Migration**: None
- **Test**: Toggle Hindi, verify Sync label and alerts show in Hindi
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Add to `en.json` → `menu`: `"sync": "Sync"`, `"syncComplete": "Sync Complete"`, `"syncFailed": "Sync Failed"`, `"syncing": "Syncing..."`, `"syncNow": "Sync Now"`, `"allDataSynced": "All data has been synced."`
  2. Add Hindi translations to `hi.json`
  3. Line ~479: Replace `<Text>Sync</Text>` with `<Text>{t('menu.sync')}</Text>`
  4. Lines ~221, ~226: Remove `defaultValue` params from existing `t()` calls
- **Guard**: Do NOT modify sync logic in `handleSyncNow()` or `syncStore` calls.
- **DoD**: ☐ All sync i18n keys in both locales ☐ No hardcoded "Sync" text ☐ Hindi sync labels render

---

### STG-178 — Menu — Build Info visible on release with EXPO_PUBLIC_ENABLE_QA_MENU=true

- **Status**: PARKED — commit SHA pending, tag `stg-178-2026-03-14`, fix ledger region 4, test: `src/__tests__/screens/UiShowcaseScreen.stg-178.qa-gate.unit.test.tsx`
- **Priority**: P1
- **Source**: Code audit — [MenuScreen.tsx:1083-1101](src/screens/MenuScreen.tsx#L1083-L1101) and [UiShowcaseScreen.tsx:30-34](src/screens/UiShowcaseScreen.tsx#L30-L34)
- **Scope**: `src/screens/MenuScreen.tsx`, `src/screens/UiShowcaseScreen.tsx`
- **Problem**: The QA menu gate `isQaMenuEnabled()` returns `true` when `__DEV__` OR `EXPO_PUBLIC_ENABLE_QA_MENU=true`. However, the BUILD_INFO section (lines 1103-1130) is guarded by `__DEV__` only. If someone sets `EXPO_PUBLIC_ENABLE_QA_MENU=true` in a release build (for QA testing), they see the Developer/QA section with UI Showcase but NOT the Build Info. This is inconsistent. More critically, if `EXPO_PUBLIC_ENABLE_QA_MENU` accidentally ships as `true`, end users see "Developer / QA" and "UI Showcase" in their menu.
- **Expected**:
  1. **Chosen approach**: Gate with `__DEV__` — simplest and most reliable. Change MenuScreen line ~1083 from `{showQaMenu && (...)}` to `{__DEV__ && showQaMenu && (...)}`
  2. This ensures QA menu NEVER appears in any release build (staging or production) regardless of env vars
  3. QA testing on staging should use debug builds, not release builds with env flags
- **Migration**: None
- **Test**: Production release build with `EXPO_PUBLIC_ENABLE_QA_MENU=true` must NOT show Developer/QA section
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/screens/UiShowcaseScreen.tsx`
- **Changes**:
  1. In `UiShowcaseScreen.tsx` line ~30-34: Change `isQaMenuEnabled()` to require `__DEV__` always: `return __DEV__ && (process.env.EXPO_PUBLIC_ENABLE_QA_MENU === 'true' || true)` — or simpler: gate the Developer/QA section in MenuScreen with `{__DEV__ && showQaMenu && (...)}`
  2. In `MenuScreen.tsx` line ~1083: Change condition from `{showQaMenu && (...)}` to `{__DEV__ && showQaMenu && (...)}`
  3. Alternatively, add an `isStaging` check from config that is `false` in production
- **Guard**: Do NOT remove the QA menu entirely — it's useful in dev. Only prevent it from appearing in production.
- **DoD**: ☐ `isQaMenuEnabled()` returns `false` in production regardless of env vars ☐ Dev mode still shows QA menu ☐ Release APK build has no "Developer / QA" section

---

### STG-179 — Menu — release build stamp shows raw SHA and timestamp, not user-friendly version

- **Status**: PARKED — verified in reiteration, tag `stg-178-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:1133-1137](src/screens/MenuScreen.tsx#L1133-L1137)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: Line 1135: `Build: {buildShaLabel} · Deployed: {buildTimeLabel}` — shows raw git SHA (e.g., "81c3a2a4") and raw timestamp to all users. Kirana retailers don't understand git SHAs. This is developer info leaking to end users.
- **Expected**: Show human-readable version like "Version 3.2.0" from `app.json`. Move SHA/timestamp to a long-press or "About" section. The footer should say "SuperMandi POS v3.2.0" not "Build: 81c3a2a4 · Deployed: 2026-03-13T..."
- **Migration**: None
- **Test**: Release build footer shows app version, not SHA
- **Depends on**: STG-167 (About section)
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `app.json`
- **Changes**:
  1. Import app version from `app.json` or `expo-constants` (`Constants.expoConfig.version`)
  2. Lines ~1133-1137: Change `Build: {buildShaLabel} · Deployed: {buildTimeLabel}` to `SuperMandi POS v{appVersion}` for release builds
  3. Keep SHA/timestamp in dev builds or behind a long-press handler
- **Guard**: Do NOT remove SHA tracking from code — just hide from non-dev UI.
- **DoD**: ☐ Release footer shows "SuperMandi POS v3.x.x" ☐ Dev footer still shows SHA ☐ Version reads from app.json

---

### STG-180 — Menu — Switch Staff alert uses English string literals, not i18n

- **Status**: PARKED — verified in reiteration, tag `stg-180-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:282-293](src/screens/MenuScreen.tsx#L282-L293)
- **Scope**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/*.json`
- **Problem**: Lines 282-293: `Alert.alert("Switch Staff", ...)` — title and body are hardcoded English. The `Switch` and `Cancel` button labels are also English. When a Hindi-speaking staff member tries to switch, they see English alerts.
- **Expected**: Use `t('menu.switchStaffTitle')`, `t('menu.switchStaffMessage', { name, role })`, etc.
- **Migration**: None
- **Test**: Toggle Hindi, tap Switch Staff, verify alert is in Hindi
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Add to `en.json` → `menu`: `"switchStaffTitle": "Switch Staff"`, `"switchStaffMessage": "Switch to {{name}} ({{role}})?"`, `"switchButton": "Switch"`, `"cancelButton": "Cancel"`
  2. Add Hindi translations to `hi.json`
  3. Lines ~282-293: Replace `Alert.alert("Switch Staff", ...)` with `Alert.alert(t('menu.switchStaffTitle'), t('menu.switchStaffMessage', { name, role }), [{ text: t('menu.cancelButton') }, { text: t('menu.switchButton'), ... }])`
- **Guard**: Do NOT change the staff switching logic itself. Only text.
- **DoD**: ☐ Switch Staff alert fully localized ☐ Hindi alert renders correctly

---

### STG-181 — Menu — billActions (Reprint/Download/Share) all navigate to same SalesHistory

- **Status**: PARKED — verified in reiteration, tag `stg-181-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [MenuScreen.tsx:621-634](src/screens/MenuScreen.tsx#L621-L634)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: All three bill action buttons (Reprint, Download, Share) call `goToBills` which navigates to `SalesHistory`. The user expects:
  1. **Reprint** → open bill select → reprint specific bill
  2. **Download** → download bill as PDF
  3. **Share** → share bill via WhatsApp/other
  But all three just open the same Bills History page with no indication of which action to perform.
- **Expected**: Either: (a) pass navigation params `{ action: 'reprint' | 'download' | 'share' }` so SalesHistory knows the intent, or (b) show a "Select a bill to [reprint/download/share]" instruction, or (c) hide these buttons and add reprint/download/share actions on individual bill detail pages.
- **Migration**: None
- **Test**: Tap Reprint, verify it opens bill selection with reprint mode. Same for Download and Share.
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/screens/SalesHistoryScreen.tsx`
- **Changes**:
  1. In `MenuScreen.tsx` lines ~621-634: Change `goToBills` calls to pass action param: `navigation.navigate('SalesHistory', { action: 'reprint' })`, `{ action: 'download' }`, `{ action: 'share' }`
  2. In `SalesHistoryScreen.tsx`: Read route params, show instruction banner: "Select a bill to reprint/download/share" based on action param
  3. Add `action` to the SalesHistory route params type definition
- **Guard**: Default SalesHistory behavior (no action param) must remain unchanged.
- **DoD**: ☐ Each button navigates with distinct action ☐ SalesHistory shows context banner ☐ Default (from Bills History card) still works normally

---

### STG-182 — Menu — no haptic feedback on menu item press

- **Status**: PARKED — verified in reiteration, tag `stg-182-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — MenuScreen.tsx
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: No haptic feedback (vibration) on any menu item tap. Professional POS apps use light haptics to confirm interaction.
- **Expected**: Add `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` on menu item press. Use `expo-haptics`.
- **Migration**: None
- **Test**: Tap menu item, feel subtle vibration on Android device
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**:
  1. Import `{ lightHaptic }` from `../utils/haptics`
  2. In each menu item `onPress` handler, add `lightHaptic()` call before navigation
  3. If `lightHaptic` doesn't exist, use `import * as Haptics from 'expo-haptics'` → `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`
- **Guard**: Do NOT add haptics to scroll events or non-interactive elements.
- **DoD**: ☐ All menu taps trigger light haptic ☐ No haptic on scroll ☐ Works on physical Android device

---

### STG-183 — Menu — section header margin 24px top but 4px bottom, visually unbalanced

- **Status**: PARKED — verified in reiteration, tag `stg-183-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [MenuScreen.tsx:1354-1358](src/screens/MenuScreen.tsx#L1354-L1358)
- **Scope**: `src/screens/MenuScreen.tsx` styles
- **Problem**: `sectionHeader: { marginTop: 24, marginBottom: 4 }` — 24px gap above but only 4px below the section title. The first menu item after the header has its own `marginTop: 16` creating a 4+16=20px gap below header. Above the header is 24px. This asymmetry makes sections feel top-heavy.
- **Expected**: Use `marginTop: 28, marginBottom: 8` for better visual balance, or reduce menuItem marginTop for first-after-header items.
- **Migration**: None
- **Test**: Visual check — section headers feel centered between groups
- **Depends on**: STG-003 (spacing tokens)
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: In styles (~line 1354-1358), change `sectionHeader: { marginTop: 24, marginBottom: 4 }` → `marginTop: 28, marginBottom: 8`
- **Guard**: Do NOT change `sectionHeaderText` font size or color.
- **DoD**: ☐ Section headers visually centered between card groups ☐ No overlapping or cramping

---

### STG-184 — Menu — WhatsApp Support fallback uses "Support Unavailable" English literal

- **Status**: PARKED — verified in reiteration, tag `stg-184-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:877](src/screens/MenuScreen.tsx#L877)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: Line 877: `Alert.alert("Support Unavailable", "Support phone not configured...")` — hardcoded English. Line 888: `Alert.alert("WhatsApp Not Found", "Please install WhatsApp...")` — also hardcoded.
- **Expected**: Use i18n keys for both alerts.
- **Migration**: None
- **Test**: Hindi mode, trigger both alerts, verify Hindi text
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Add to `en.json` → `menu`: `"supportUnavailable": "Support Unavailable"`, `"supportPhoneNotConfigured": "Support phone not configured. Please try again later."`, `"whatsappNotFound": "WhatsApp Not Found"`, `"installWhatsapp": "Please install WhatsApp to contact support."`
  2. Add Hindi translations to `hi.json`
  3. Line ~877: Replace `Alert.alert("Support Unavailable", ...)` with `Alert.alert(t('menu.supportUnavailable'), t('menu.supportPhoneNotConfigured'))`
  4. Line ~888: Replace `Alert.alert("WhatsApp Not Found", ...)` with i18n calls
- **Guard**: Do NOT change WhatsApp URL/phone logic.
- **DoD**: ☐ Both alerts localized ☐ Hindi renders correctly

---

### STG-185 — Menu — WhatsApp pre-filled message in English only, no i18n

- **Status**: PARKED — verified in reiteration, tag `stg-185-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:882-884](src/screens/MenuScreen.tsx#L882-L884)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: WhatsApp support message `"Hi SuperMandi Support,\n\nStore: ${storeName}\nDevice: ${deviceLabel}\n\nI need help with: "` is hardcoded English. Hindi-speaking retailers would expect to see this in Hindi.
- **Expected**: Use `t('menu.whatsappSupportMessage', { storeName, deviceLabel })` with Hindi translation.
- **Migration**: None
- **Test**: Hindi mode, tap WhatsApp Support, verify pre-filled message is in Hindi
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Add to `en.json` → `menu`: `"whatsappSupportMessage": "Hi SuperMandi Support,\n\nStore: {{storeName}}\nDevice: {{deviceLabel}}\n\nI need help with: "`
  2. Add Hindi translation to `hi.json`
  3. Lines ~882-884: Replace hardcoded template string with `t('menu.whatsappSupportMessage', { storeName, deviceLabel })`
- **Guard**: Do NOT change the WhatsApp URL encoding logic.
- **DoD**: ☐ WhatsApp message localized ☐ Hindi pre-fill reads naturally

---

### STG-186 — Menu — trend badge at 9px font too small to read on budget Android

- **Status**: PARKED — verified in reiteration, tag `stg-186-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:1588](src/screens/MenuScreen.tsx#L1588)
- **Scope**: `src/screens/MenuScreen.tsx` styles
- **Problem**: `trendText: { fontSize: 9 }` — 9px font is below WCAG minimum of 12px for mobile. On budget Android phones (720p, 5" screen), 9px text is literally illegible. The trend arrow icon is only 10px.
- **Expected**: Increase trendText to 11px minimum. Increase trend arrow to 12px. Ensure badge has enough padding to be tappable (44px minimum).
- **Migration**: None
- **Test**: Trend percentages readable on Redmi device at arm's length
- **Depends on**: STG-053 (WCAG audit)
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: In styles (~line 1588), change `trendText: { fontSize: 9 }` → `fontSize: 11`. Change trend arrow icon size from 10 → 12. Ensure badge padding provides minimum 44px touch target height.
- **Guard**: Do NOT change trend calculation logic or color scheme.
- **DoD**: ☐ `fontSize: 11` minimum ☐ Arrow icon ≥12px ☐ Readable on 720p 5" screen

---

### STG-187 — Menu — trend percentage shows "551%" with no cap or "99%+" formatting

- **Status**: PARKED — verified in reiteration, tag `stg-187-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:251-268](src/screens/MenuScreen.tsx#L251-L268)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: `getTrend()` computes `((today - yesterday) / yesterday) * 100` with no cap. If yesterday had ₹200 sales and today has ₹1,300, it shows "551%". Extreme percentages like 2000% or 10000% are meaningless to users and break the layout (text overflow in trend badge).
- **Expected**: Cap at 999% and show "999%+". Or for very high/low changes, show absolute difference "↑ ₹1,100" instead of percentage.
- **Migration**: None
- **Test**: Simulate 100x daily change, verify display caps at "999%+" or shows absolute
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: In `getTrend()` function (~lines 251-268), add cap logic: `if (Math.abs(pct) > 999) return { label: '999%+', ... }`. Also handle `yesterday === 0` case: show "New" badge instead of infinity%.
- **Guard**: Do NOT change the trend data source or API call.
- **DoD**: ☐ Percentage capped at 999%+ ☐ Yesterday=0 shows "New" not Infinity% ☐ Unit test for edge cases

---

### STG-188 — Menu — Payment Modes breakdown shows "Cash: ₹..." raw label, not i18n

- **Status**: PARKED — verified in reiteration, tag `stg-188-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:593-601](src/screens/MenuScreen.tsx#L593-L601)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: Lines 593-601: `Cash: {formatMoney(...)}`, `UPI: {formatMoney(...)}`, `Card: {formatMoney(...)}` — hardcoded English labels. Also, "Card" is shown but kirana stores rarely accept cards.
- **Expected**: Use `t('payment.cash')`, `t('payment.upi')`, etc. Consider hiding "Card" if the store doesn't accept cards.
- **Migration**: None
- **Test**: Hindi mode, verify Payment Modes labels are in Hindi
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Add to `en.json` → `payment`: `"cash": "Cash"`, `"upi": "UPI"`, `"card": "Card"` (or under `menu`)
  2. Add Hindi: `"cash": "नकद"`, `"upi": "UPI"`, `"card": "कार्ड"`
  3. Lines ~593-601: Replace `Cash:`, `UPI:`, `Card:` literals with `t('payment.cash')`, etc.
- **Guard**: Do NOT change payment amount calculations.
- **DoD**: ☐ Payment mode labels localized ☐ Hindi labels render

---

### STG-189 — Menu — Help & Support shows "&amp;" HTML entity instead of "&"

- **Status**: PARKED — verified in reiteration, tag `stg-189-2026-03-14`
- **Priority**: P0
- **Source**: Code audit — [MenuScreen.tsx:1066](src/screens/MenuScreen.tsx#L1066)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: Line 1066: `<Text style={styles.menuTitle}>Help &amp; Support</Text>`. React Native's `<Text>` renders `&amp;` as the literal text "Help &amp; Support" on screen, not "Help & Support". This is because JSX/React Native `<Text>` does NOT decode HTML entities like a browser `<p>` tag does.
- **Expected**: Change to `Help & Support` (literal ampersand) or `{"Help & Support"}`. The `&amp;` syntax is only needed in HTML, not JSX.
- **Migration**: None
- **Test**: Menu shows "Help & Support" not "Help &amp; Support"
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: Line ~1066: Change `Help &amp; Support` → `{"Help & Support"}` (JSX expression with literal ampersand). If this is already through i18n (STG-172), the fix is in the locale file string instead.
- **Guard**: Single character change. Do NOT change surrounding JSX structure.
- **DoD**: ☐ Screen shows "Help & Support" with actual ampersand ☐ No HTML entities visible

---

### STG-190 — Menu — no skeleton/shimmer loading state for System Status and Today's Sales

- **Status**: PARKED — verified in reiteration, tag `stg-190-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:542-543](src/screens/MenuScreen.tsx#L542-L543)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: While loading, System Status shows "Loading..." text and Today's Sales shows a static "Loading..." text. No skeleton/shimmer effect. The loading state looks broken rather than intentional. Professional apps show animated skeleton placeholders during data fetch.
- **Expected**: Show shimmer/skeleton placeholders matching the final layout shape. Use `react-native-skeleton-placeholder` or animated gradient views.
- **Migration**: None
- **Test**: Kill API, load Menu, verify skeleton shimmer shows instead of "Loading..."
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, possibly new `src/components/ui/SkeletonLoader.tsx`
- **Changes**:
  1. Create a simple `SkeletonLoader` component using `Animated.View` with opacity pulse animation (no new deps needed)
  2. Lines ~542-543: Replace `"Loading..."` text with `<SkeletonLoader>` matching the shape of System Status and Today's Sales cards
  3. Use `Animated.loop(Animated.sequence([fadeIn, fadeOut]))` for shimmer effect
- **Guard**: Do NOT add external dependencies like `react-native-skeleton-placeholder`. Use built-in `Animated` API.
- **DoD**: ☐ Loading state shows animated skeleton ☐ No "Loading..." text visible ☐ Skeleton matches final card shape

---

### STG-191 — Menu — status panel statusBadge uses transparent bg (surfaceAlt), no outline

- **Status**: PARKED — verified in reiteration, tag `stg-191-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [MenuScreen.tsx:1253-1258](src/screens/MenuScreen.tsx#L1253-L1258)
- **Scope**: `src/screens/MenuScreen.tsx` styles
- **Problem**: Default statusBadge has `backgroundColor: colors.surfaceAlt` which is nearly identical to the card's `surface` background. The badge is invisible without the active/inactive/warning variant. Loading state badges blend into the card.
- **Expected**: Add a subtle border `borderWidth: 1, borderColor: colors.border` to default statusBadge so it's visible even in loading state.
- **Migration**: None
- **Test**: Loading state badges visible and distinct from card background
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: In styles (~lines 1253-1258), add to `statusBadge`: `borderWidth: 1, borderColor: colors.border`
- **Guard**: Do NOT change active/inactive/warning badge colors.
- **DoD**: ☐ Default/loading badges have visible border ☐ Active/warning badges still look correct

---

### STG-192 — Menu — menuIcon 36x36 too small for touch targets on budget Android

- **Status**: PARKED — verified in reiteration, tag `stg-192-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:1294-1302](src/screens/MenuScreen.tsx#L1294-L1302)
- **Scope**: `src/screens/MenuScreen.tsx` styles
- **Problem**: `menuIcon: { width: 36, height: 36 }` — while the Pressable wrapping the entire menu item is the touch target, the icon at 36px is below Material Design's recommended 40-48px minimum icon container. On budget Android screens, the icon appears small and doesn't convey "tappable".
- **Expected**: Increase icon container to 40x40 with 20px border-radius. Increase icon size from 20 to 22.
- **Migration**: None
- **Test**: Icons visually proportionate on Redmi device
- **Depends on**: STG-003 (spacing tokens)
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: In styles (~lines 1294-1302), change `menuIcon: { width: 36, height: 36, borderRadius: 18 }` → `width: 40, height: 40, borderRadius: 20`. Change icon `size` prop from 20 → 22 in all `<MaterialCommunityIcons>` inside menu items.
- **Guard**: Do NOT change icon names or colors.
- **DoD**: ☐ Icon container 40x40 ☐ Icon size 22 ☐ Visual check on device

---

### STG-193 — Menu — "Z-Report and cash reconciliation" subtitle jargon for kirana users

- **Status**: PARKED — verified in reiteration, tag `stg-193-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:962](src/screens/MenuScreen.tsx#L962)
- **Scope**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/*.json`
- **Problem**: "Z-Report" is retail industry terminology that kirana store owners don't use. "Cash reconciliation" is accounting jargon. A kirana retailer would understand "दिन की कमाई का हिसाब" (day's earnings account).
- **Expected**: Change to "End-of-day sales summary and cash count" or "Day-end closing — count your cash drawer".
- **Migration**: None
- **Test**: Non-technical retailer understands what the menu item does from the subtitle
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Replace hardcoded "Z-Report and cash reconciliation" (~line 962) with `t('menu.dailyClosingSubtitle')`. In `en.json`: `"dailyClosingSubtitle": "End-of-day sales summary and cash count"`. Add Hindi translation.
- **Guard**: Do NOT change DailyClosing navigation or logic.
- **DoD**: ☐ Subtitle is plain language ☐ Localized in both languages

---

### STG-194 — Menu — "Start, end, and view shift history" assumes shift concept familiarity

- **Status**: PARKED — verified in reiteration, tag `stg-194-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [MenuScreen.tsx:972](src/screens/MenuScreen.tsx#L972)
- **Scope**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/*.json`
- **Problem**: Small kirana stores with 1-2 employees may not use formal shifts. The subtitle "Start, end, and view shift history" assumes multi-shift operations. For single-person stores, this is confusing.
- **Expected**: Change to "Track staff working hours" or show context-aware subtitle based on staff count.
- **Migration**: None
- **Test**: Subtitle makes sense for single-person store
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Replace "Start, end, and view shift history" (~line 972) with `t('menu.shiftManagementSubtitle')`. `en.json`: `"shiftManagementSubtitle": "Track staff working hours"`. Hindi translation.
- **Guard**: Text-only change. Do NOT modify shift logic.
- **DoD**: ☐ Subtitle plain language ☐ Localized

---

### STG-195 — Menu — "AI & Intelligence" section title too technical, rename to "Smart Insights"

- **Status**: PARKED — verified in reiteration, tag `stg-195-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:828](src/screens/MenuScreen.tsx#L828)
- **Scope**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/*.json`
- **Problem**: "AI & Intelligence" section title uses tech buzzwords. Kirana retailers don't care about AI — they care about actionable business suggestions. "Intelligence" is vague.
- **Expected**: Rename to "Smart Insights" or "Business Tips" or "सुझाव" (Suggestions) in Hindi.
- **Migration**: None
- **Test**: Section title is approachable and non-technical
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Replace "AI & Intelligence" (~line 828) with `t('menu.smartInsights')`. `en.json`: `"smartInsights": "Smart Insights"`. `hi.json`: `"smartInsights": "स्मार्ट सुझाव"`.
- **Guard**: Text-only. Do NOT rename AI components or APIs.
- **DoD**: ☐ Section title is "Smart Insights" ☐ Localized

---

### STG-196 — Menu — "Alerts, forecasts, slow movers, expiry tracking" subtitle info-dense

- **Status**: PARKED — verified in reiteration, tag `stg-196-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [MenuScreen.tsx:837](src/screens/MenuScreen.tsx#L837)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: Subtitle lists 4 concepts in 7 words: "Alerts, forecasts, slow movers, expiry tracking". "Slow movers" is retail jargon. "Forecasts" is business analytics jargon. Too much for a subtitle.
- **Expected**: Simplify to "See what's selling, what's expiring, what to restock" — action-oriented language.
- **Migration**: None
- **Test**: Subtitle is clear and conversational
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Replace "Alerts, forecasts, slow movers, expiry tracking" (~line 837) with `t('menu.aiInsightsSubtitle')`. `en.json`: `"aiInsightsSubtitle": "See what's selling, expiring, and what to restock"`. Hindi translation.
- **Guard**: Text-only.
- **DoD**: ☐ Subtitle is action-oriented ☐ Localized

---

### STG-197 — Menu — "Browse and apply for credit offers" subtitle implies retailer is borrowing

- **Status**: PARKED — verified in reiteration, tag `stg-197-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [MenuScreen.tsx:849](src/screens/MenuScreen.tsx#L849)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: "Browse and apply for credit offers" — the word "credit" is loaded. Indian kirana owners may interpret this as borrowing/debt (negative connotation) rather than wholesale credit lines.
- **Expected**: Reword to "Bulk purchase financing — get stock now, pay later" to frame it positively.
- **Migration**: None
- **Test**: Subtitle conveys value proposition clearly
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Replace "Browse and apply for credit offers" (~line 849) with `t('menu.bulkPurchaseCreditSubtitle')`. `en.json`: `"bulkPurchaseCreditSubtitle": "Get stock now, pay later with bulk financing"`. Hindi translation.
- **Guard**: Text-only.
- **DoD**: ☐ Subtitle frames value positively ☐ Localized

---

### STG-198 — Menu — content padding 16px identical to item padding, creates visual merge

- **Status**: PARKED — verified in reiteration, tag `stg-198-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [MenuScreen.tsx:1149](src/screens/MenuScreen.tsx#L1149)
- **Scope**: `src/screens/MenuScreen.tsx` styles
- **Problem**: `content: { padding: 16 }` and `menuItem: { padding: 14 }` — nearly identical padding. Menu items visually merge with the scroll container edge. There's no clear "gutter" separation.
- **Expected**: Reduce content padding to 12px or increase it to 20px to create visual distinction from card padding.
- **Migration**: None
- **Test**: Cards feel inset from screen edges with clear gutter
- **Depends on**: STG-003
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: In styles (~line 1149), change `content: { padding: 16 }` → `padding: 12` to create visual distinction from card's `padding: 14`.
- **Guard**: Do NOT change card padding itself.
- **DoD**: ☐ Visible gutter between screen edge and card edges ☐ Cards don't feel flush with container

---

### STG-199 — Menu — ScrollView has no scrollbar indicator styling

- **Status**: PARKED — verified in reiteration, tag `stg-199-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [MenuScreen.tsx:391](src/screens/MenuScreen.tsx#L391)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: The ScrollView has no `showsVerticalScrollIndicator` or custom scrollbar. With 20+ menu items requiring 8 screens of scrolling, users have no spatial awareness of how far they've scrolled.
- **Expected**: Keep default scroll indicator visible, or add a branded scroll track. Consider `scrollIndicatorInsets` for proper positioning.
- **Migration**: None
- **Test**: Scroll indicator visible during scroll
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: On `<ScrollView>` (~line 391), ensure `showsVerticalScrollIndicator={true}` is set (or remove any `showsVerticalScrollIndicator={false}`). Add `scrollIndicatorInsets={{ right: 1 }}` for proper positioning.
- **Guard**: Do NOT add custom scrollbar components. Use native indicator.
- **DoD**: ☐ Scroll indicator visible during scrolling ☐ Fades out when idle

---

### STG-200 — Enroll — "hello@supermandi.tech" email in error hints, kirana users won't email

- **Status**: PARKED — verified in reiteration, tag `stg-200-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [EnrollDeviceScreen.tsx:86](src/screens/EnrollDeviceScreen.tsx#L86)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: STORE_INACTIVE error hint says "Contact hello@supermandi.tech for help." Kirana store owners in India primarily use WhatsApp and phone calls, not email. An email address is effectively useless for the target audience.
- **Expected**: Replace email with WhatsApp link or phone number: "WhatsApp us at +91-XXXXXXXXXX" or make it a tappable link that opens WhatsApp.
- **Migration**: None
- **Test**: Error hint shows WhatsApp/phone, not email
- **Depends on**: STG-059
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`
- **Changes**: Line ~86: Replace `"Contact hello@supermandi.tech for help."` with `"WhatsApp us for help"` + tappable link to `https://wa.me/91XXXXXXXXXX` (use same support phone from WhatsApp Support feature in MenuScreen). Use `Linking.openURL()` on tap.
- **Guard**: Do NOT change the error detection logic. Only the hint text and CTA.
- **DoD**: ☐ STORE_INACTIVE error shows WhatsApp link ☐ Tapping opens WhatsApp ☐ No email address visible

---

### STG-201 — Enroll — "Superadmin" used in error messages (deviceInactive, storeInactive)

- **Status**: PARKED — verified in reiteration, tag `stg-201-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — `src/i18n/locales/en.json` lines 382-383
- **Scope**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**:
  1. `status.storeInactive`: "POS is inactive. Add UPI ID in Superadmin to start billing."
  2. `status.deviceInactive`: "This device is disabled. Contact Superadmin to enable it."
  "Superadmin" is an internal system name. Retailers don't know what "Superadmin" is.
- **Expected**: Replace "Superadmin" with "your store dashboard" or "support team". E.g., "Contact support to enable this device."
- **Migration**: None
- **Test**: No mention of "Superadmin" visible to POS users
- **Depends on**: STG-057
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. `en.json` line ~382: Change `"storeInactive": "POS is inactive. Add UPI ID in Superadmin to start billing."` → `"storeInactive": "Your store is being set up. Contact support if billing doesn't activate within 24 hours."`
  2. `en.json` line ~383: Change `"deviceInactive": "This device is disabled. Contact Superadmin to enable it."` → `"deviceInactive": "This device is disabled. Contact support to re-enable it."`
  3. Update corresponding Hindi translations
- **Guard**: Do NOT change the status keys or where they're referenced. Only string values.
- **DoD**: ☐ No "Superadmin" in en.json status strings ☐ Hindi updated ☐ grep confirms zero "Superadmin" in locale files

---

### STG-202 — Enroll — STORE_INACTIVE hint says "Contact hello@supermandi.tech for help"

- **Status**: PARKED — verified in reiteration, tag `stg-202-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [EnrollDeviceScreen.tsx:86](src/screens/EnrollDeviceScreen.tsx#L86)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: Same as STG-200, but specific to the STORE_INACTIVE error code. The hint provides an email that kirana users won't use. This is the most common enrollment error (store pending approval) and the support path is broken.
- **Expected**: Show WhatsApp support button directly in the error state, not just a text hint.
- **Migration**: None
- **Test**: STORE_INACTIVE error shows tappable WhatsApp support button
- **Depends on**: STG-059
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`
- **Changes**: Line ~86: Add a `<Pressable>` with WhatsApp icon that calls `Linking.openURL('https://wa.me/91...')` in the STORE_INACTIVE error hint area. Reuse the support phone number from config.
- **Guard**: Do NOT change enrollment API call logic. This is a UI addition only.
- **DoD**: ☐ STORE_INACTIVE shows tappable WhatsApp button ☐ Opens WhatsApp on tap

---

### STG-203 — Enroll — "RETAILER_PHONE" hardcoded as deviceType, OEM_HANDHELD never sent

- **Status**: PARKED — verified in reiteration, tag `stg-203-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [EnrollDeviceScreen.tsx:196](src/screens/EnrollDeviceScreen.tsx#L196)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: Line 196: `deviceType: "RETAILER_PHONE" as const` — hardcoded. The enrollment flow originally had device type chips (Mobile, OEM Handheld) per STG-038, but the code now hardcodes RETAILER_PHONE. If OEM handheld POS devices are used, they'll be incorrectly classified.
- **Expected**: Auto-detect device type from hardware characteristics (screen size, thermal printer presence, etc.) or show device type selector for edge cases.
- **Migration**: None
- **Test**: OEM handheld device correctly identified during enrollment
- **Depends on**: STG-038
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`
- **Changes**: Line ~196: Replace hardcoded `"RETAILER_PHONE" as const` with auto-detection logic using `expo-device` properties (e.g., check for thermal printer, screen size < 5", or specific OEM model lists). Fallback to "RETAILER_PHONE" if detection fails.
- **Guard**: Keep the `deviceType` field in the enrollment API payload unchanged. Only change how the value is determined.
- **DoD**: ☐ Device type auto-detected ☐ RETAILER_PHONE fallback works ☐ Enrollment API still receives valid type

---

### STG-204 — Enroll — defaultLabel uses Device.modelName raw (e.g. "23106RN0DA")

- **Status**: PARKED — verified in reiteration, tag `stg-204-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [EnrollDeviceScreen.tsx:187](src/screens/EnrollDeviceScreen.tsx#L187)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: Line 187: `const defaultLabel = Device.modelName || Device.deviceName || ""`. On many Android devices, `Device.modelName` returns the internal model code (e.g., "23106RN0DA" for Redmi Note 13 Pro). This becomes the default device label shown to the retailer and in the System Status panel.
- **Expected**: Map internal model codes to friendly names (e.g., "Redmi Note 13 Pro"). Or use a simpler default like "Counter-1" and let the user customize.
- **Migration**: None
- **Test**: Default device label shows friendly model name, not internal code
- **Depends on**: STG-064
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`
- **Changes**: Line ~187: Replace `Device.modelName || Device.deviceName || ""` with a friendly name mapping. Create a small `getDeviceFriendlyName()` utility that maps known internal codes to marketing names (e.g., "23106RN0DA" → "Redmi Note 13 Pro"). Fallback to `Device.deviceName` then "Counter-1".
- **Guard**: Do NOT change the enrollment API. The label is user-facing only.
- **DoD**: ☐ Internal model codes mapped to friendly names ☐ Unknown devices get "Counter-1" default ☐ User can still edit the label

---

### STG-205 — Enroll — deep link re-enrollment alert uses English literals, no i18n

- **Status**: PARKED — verified in reiteration, tag `stg-205-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [EnrollDeviceScreen.tsx:229-235](src/screens/EnrollDeviceScreen.tsx#L229-L235)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`, `src/i18n/locales/*.json`
- **Problem**: Lines 229-235: `Alert.alert("Replace Existing Enrollment?", "This device is already enrolled...")` — hardcoded English.
- **Expected**: Use i18n keys for both title and body.
- **Migration**: None
- **Test**: Hindi mode, open deep link on already-enrolled device, verify Hindi alert
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Add to `en.json` → `enroll`: `"replaceTitle": "Replace Existing Enrollment?"`, `"replaceMessage": "This device is already enrolled to {{storeName}}. Re-enrolling will clear all local data."`, `"replaceButton": "Replace"`, `"keepButton": "Keep Current"`
  2. Add Hindi translations
  3. Lines ~229-235: Replace `Alert.alert("Replace Existing Enrollment?", ...)` with i18n calls
- **Guard**: Do NOT change re-enrollment logic.
- **DoD**: ☐ Deep link re-enrollment alert localized ☐ Hindi renders correctly

---

### STG-206 — Enroll — missing code alert says "superadmin account activation"

- **Status**: PARKED — verified in reiteration, tag `stg-206-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [EnrollDeviceScreen.tsx:256](src/screens/EnrollDeviceScreen.tsx#L256)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: Line 256: `"Enter the activation code shared after retailer registration and superadmin account activation."` — mentions "superadmin account activation" which is internal jargon. The user already complained about this exact text in the previous session.
- **Expected**: Change to "Enter the activation code you received after completing your store registration." Remove all mentions of "superadmin".
- **Migration**: None
- **Test**: Missing code alert contains no "superadmin" reference
- **Depends on**: STG-057
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`
- **Changes**: Line ~256: Change `"Enter the activation code shared after retailer registration and superadmin account activation."` → `"Enter the activation code you received after completing your store registration."`
- **Guard**: Single string change. Do NOT modify the alert structure.
- **DoD**: ☐ No "superadmin" in missing code alert ☐ Message is self-explanatory

---

### STG-207 — Enroll — error codes DEVICE_FINGERPRINT_INVALID says "Reinstall the app"

- **Status**: PARKED — verified in reiteration, tag `stg-207-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [EnrollDeviceScreen.tsx:112-118](src/screens/EnrollDeviceScreen.tsx#L112-L118)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: DEVICE_FINGERPRINT_INVALID and DEVICE_TYPE_REQUIRED both say "Reinstall the app and try again." Asking kirana retailers to reinstall is a last-resort action. They may not know how to reinstall from Play Store. This should be a support contact path, not self-service.
- **Expected**: Change to "Please contact support — we'll help you get set up." with WhatsApp link.
- **Migration**: None
- **Test**: Technical device errors show support contact, not "reinstall" instruction
- **Depends on**: STG-059
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`
- **Changes**: Lines ~112-118: Replace `"Reinstall the app and try again."` hints for DEVICE_FINGERPRINT_INVALID and DEVICE_TYPE_REQUIRED with `"Please contact support — we'll help you get set up."` + WhatsApp link button (reuse pattern from STG-200).
- **Guard**: Do NOT change error code detection. Only hint text and CTA.
- **DoD**: ☐ Technical errors show support contact ☐ No "reinstall" instruction ☐ WhatsApp button present

---

### STG-208 — Enroll — ENROLLMENT_RATE_LIMITED says "wait 15 minutes" but no countdown

- **Status**: PARKED — verified in reiteration, tag `stg-208-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [EnrollDeviceScreen.tsx:97](src/screens/EnrollDeviceScreen.tsx#L97)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: Rate limit error says "Please wait 15 minutes before trying again." but there's no countdown timer. The user doesn't know when they can retry. They'll tap every minute until it works.
- **Expected**: Add a countdown timer showing "Try again in 14:32" that counts down. Disable the Activate button during cooldown.
- **Migration**: None
- **Test**: Rate limit shows live countdown, Activate button disabled until timer expires
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`
- **Changes**:
  1. Add `const [cooldownEnd, setCooldownEnd] = useState<number | null>(null)` state
  2. On ENROLLMENT_RATE_LIMITED error (~line 97): `setCooldownEnd(Date.now() + 15 * 60 * 1000)`
  3. Add `useEffect` with `setInterval` that updates countdown text every second: "Try again in MM:SS"
  4. Disable Activate button when `cooldownEnd && Date.now() < cooldownEnd`
  5. Clear timer when cooldown expires
- **Guard**: Do NOT change the rate limit detection or API retry logic. Add UI feedback only.
- **DoD**: ☐ Live countdown "Try again in 14:32" ☐ Activate button disabled during cooldown ☐ Button re-enables after 15 min

---

### STG-209 — Payment — uses TouchableOpacity instead of Pressable (inconsistent with rest)

- **Status**: PARKED — verified in reiteration, tag `stg-209-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [PaymentScreen.tsx:14](src/screens/PaymentScreen.tsx#L14)
- **Scope**: `src/screens/PaymentScreen.tsx`
- **Problem**: PaymentScreen imports and uses `TouchableOpacity` while the rest of the app (MenuScreen, SellScanScreen, EnrollDeviceScreen) uses `Pressable`. TouchableOpacity is the legacy RN touch component. This causes inconsistent press feedback (opacity vs ripple), harder maintenance, and no `android_ripple` support.
- **Expected**: Replace all `TouchableOpacity` with `Pressable` in PaymentScreen for consistency.
- **Migration**: None
- **Test**: Payment buttons use same press feedback style as rest of app
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`
- **Changes**:
  1. Replace `import { TouchableOpacity } from 'react-native'` with `import { Pressable } from 'react-native'` (~line 14)
  2. Find-replace all `<TouchableOpacity` → `<Pressable` and `</TouchableOpacity>` → `</Pressable>` throughout the file
  3. Add `android_ripple={{ color: colors.primary + '20' }}` to interactive Pressables
  4. For opacity feedback, use `style={({ pressed }) => [existingStyle, pressed && { opacity: 0.85 }]}`
- **Guard**: Do NOT change `onPress` handlers or business logic. Component swap only.
- **DoD**: ☐ Zero `TouchableOpacity` imports ☐ All buttons use `Pressable` ☐ Ripple on Android ☐ Typecheck passes

---

### STG-210 — Payment — "Low Stock Warning" and "Partial Sale" alerts in English, no i18n

- **Status**: PARKED — verified in reiteration, tag `stg-210-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [PaymentScreen.tsx:404-424](src/screens/PaymentScreen.tsx#L404-L424), [PaymentScreen.tsx:758-779](src/screens/PaymentScreen.tsx#L758-L779)
- **Scope**: `src/screens/PaymentScreen.tsx`, `src/i18n/locales/*.json`
- **Problem**: Multiple alerts use hardcoded English:
  1. "Low Stock Warning" / "Do you want to proceed anyway?"
  2. "Partial Sale" / "X item(s) will remain in cart"
  3. "Payment Error" / "Sale is not ready yet"
  4. "Price Freshness Warning"
  5. "Payment in Progress"
  6. "Previous UPI Payment Pending"
  7. "Pending UPI Payment"
- **Expected**: All alert strings through i18n.
- **Migration**: None
- **Test**: Hindi mode, trigger each alert, verify Hindi text
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Add to `en.json` → `payment`: `"lowStockWarning"`, `"lowStockMessage"`, `"partialSale"`, `"partialSaleMessage"`, `"paymentError"`, `"saleNotReady"`, `"priceFreshnessWarning"`, `"paymentInProgress"`, `"paymentInProgressMessage"`, `"previousUpiPending"`, `"pendingUpiPayment"`, `"proceedAnyway"`, `"waitForPayment"`
  2. Add Hindi translations for all keys
  3. Replace all hardcoded alert strings at lines ~404-424, ~758-779, ~706 with `t()` calls
- **Guard**: Do NOT change alert logic (conditions, button handlers). Only text strings.
- **DoD**: ☐ All payment alerts localized ☐ Hindi renders for every alert ☐ Zero hardcoded English in alerts

---

### STG-211 — Payment — "UPI Error: UPI ID not configured or QR failed" too vague

- **Status**: PARKED — verified in reiteration, tag `stg-211-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [PaymentScreen.tsx:618](src/screens/PaymentScreen.tsx#L618)
- **Scope**: `src/screens/PaymentScreen.tsx`
- **Problem**: Catch-all error `Alert.alert("UPI Error", "UPI ID not configured or QR failed.")` — combines two different problems into one message. The retailer can't tell if their UPI VPA is missing (admin issue) or if the QR generation failed (temporary issue).
- **Expected**: Separate into two clear messages: "UPI ID not set — ask your account manager to add UPI ID" vs "QR code generation failed — tap to retry".
- **Migration**: None
- **Test**: UPI errors show specific, actionable message
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`
- **Changes**: Line ~618: Split the catch-all `"UPI ID not configured or QR failed."` into two branches:
  1. Check if `upiVpa` is falsy → "UPI ID not set up. Ask your account manager to add your UPI ID."
  2. Else (QR generation failed) → "Could not generate QR code. Tap to retry."
- **Guard**: Do NOT change the UPI payment flow. Only error message branching.
- **DoD**: ☐ Two distinct UPI error messages ☐ Each is actionable ☐ Unit test covers both branches

---

### STG-212 — Payment — "POS Inactive" and "Store Missing" alerts reference "Superadmin"

- **Status**: PARKED — verified in reiteration, tag `stg-212-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [PaymentScreen.tsx:493](src/screens/PaymentScreen.tsx#L493), [PaymentScreen.tsx:500](src/screens/PaymentScreen.tsx#L500)
- **Scope**: `src/screens/PaymentScreen.tsx`, `src/utils/uiStatus.ts`
- **Problem**: Line 493: `Alert.alert("POS Inactive", POS_MESSAGES.storeInactive)` — `POS_MESSAGES.storeInactive` likely contains "Superadmin" reference (from `status.storeInactive` in en.json: "Add UPI ID in Superadmin to start billing"). Line 500: `"Check Superadmin setup"`.
- **Expected**: Replace all "Superadmin" references with "support" or "store dashboard".
- **Migration**: None
- **Test**: No "Superadmin" visible in any payment error
- **Depends on**: STG-057, STG-201
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`, `src/utils/uiStatus.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Line ~493: Replace `POS_MESSAGES.storeInactive` usage → use updated i18n string (from STG-201)
  2. Line ~500: Replace `"Check Superadmin setup"` → `"Contact support for setup"`
  3. In `uiStatus.ts`: If `POS_MESSAGES` contains "Superadmin", update to "support"
  4. Grep all of `PaymentScreen.tsx` for any remaining "Superadmin" or "superadmin" references
- **Guard**: Do NOT change payment flow logic. Only error text.
- **DoD**: ☐ `grep -i superadmin PaymentScreen.tsx` returns zero matches ☐ uiStatus.ts clean

---

### STG-213 — Payment — "Payment in Progress" back-block alert is bare, no spinner

- **Status**: PARKED — verified in reiteration, tag `stg-213-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [PaymentScreen.tsx:706](src/screens/PaymentScreen.tsx#L706)
- **Scope**: `src/screens/PaymentScreen.tsx`
- **Problem**: When user presses Android back button during payment, `Alert.alert("Payment in Progress", "Please wait for the payment to complete.")` shows a basic alert. No spinner, no progress indicator, no estimated time. User feels stuck.
- **Expected**: Show a modal overlay with spinner and "Processing payment..." text instead of a dismissible Alert. Or show the Alert with an ActivityIndicator.
- **Migration**: None
- **Test**: Back press during payment shows spinner overlay, not bare alert
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`
- **Changes**: Line ~706: Replace `Alert.alert("Payment in Progress", ...)` with a modal overlay:
  1. Add `<Modal visible={isProcessing && backPressed} transparent>` with `<ActivityIndicator>` + "Processing payment..." text
  2. Add `const [backPressed, setBackPressed] = useState(false)` — set on back press, clear when payment completes
  3. The modal should be non-dismissible (no touch-outside-to-close)
- **Guard**: Do NOT change the actual payment processing. Only the back-press UI feedback.
- **DoD**: ☐ Back during payment shows modal with spinner ☐ Modal non-dismissible ☐ Clears when payment finishes

---

### STG-214 — Payment — QR expiry countdown exists but no visual regenerate button

- **Status**: PARKED — verified in reiteration, tag `stg-214-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [PaymentScreen.tsx:650-671](src/screens/PaymentScreen.tsx#L650-L671)
- **Scope**: `src/screens/PaymentScreen.tsx`
- **Problem**: QR expiry countdown logic exists (T-204) — when QR expires, it clears `upiIntent`. But there's no visible "Regenerate QR" button for the user. The UPI tab just shows... nothing? The user has to figure out that selecting another payment mode and coming back to UPI will regenerate the QR.
- **Expected**: Show a "QR Expired — Tap to generate new QR" button when countdown reaches 0. Show countdown timer visually near the QR code (e.g., "Expires in 4:32").
- **Migration**: None
- **Test**: QR expires, user sees "Tap to regenerate" button. New QR generates on tap.
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`
- **Changes**:
  1. Lines ~650-671: When QR countdown reaches 0 (upiIntent clears), instead of just hiding the QR, show a "QR Expired" state with a "Tap to generate new QR" button
  2. Add `<Pressable onPress={regenerateQR}>` in the UPI tab's expired state
  3. The `regenerateQR` function calls the same QR generation logic used initially
  4. Add visible countdown near QR: `"Expires in {mm}:{ss}"`
- **Guard**: Do NOT change the QR generation API call or intent format. Only add UI for expiry state.
- **DoD**: ☐ Countdown visible near QR ☐ Expired state shows "Tap to regenerate" ☐ Regeneration works ☐ New countdown starts

---

### STG-215 — Payment — stale price warning threshold 4 hours is hardcoded, not configurable

- **Status**: PARKED — verified in reiteration, tag `stg-215-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [PaymentScreen.tsx:6](src/screens/PaymentScreen.tsx#L6)
- **Scope**: `src/screens/PaymentScreen.tsx`
- **Problem**: `const PRICE_FRESHNESS_THRESHOLD_MS = 4 * 60 * 60 * 1000` — 4 hours hardcoded. Different stores may need different thresholds (daily price changes vs weekly).
- **Expected**: Move to a configurable constant or store setting.
- **Migration**: None
- **Test**: Threshold is configurable or uses a sensible default
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`, `src/config/api.ts`
- **Changes**: Move `const PRICE_FRESHNESS_THRESHOLD_MS = 4 * 60 * 60 * 1000` from PaymentScreen.tsx to `src/config/api.ts` as a named export. Import in PaymentScreen.
- **Guard**: Value stays 4 hours. Just moving the constant to config for future configurability.
- **DoD**: ☐ Constant in config ☐ PaymentScreen imports it ☐ No behavior change

---

### STG-216 — Payment — "Price Freshness Warning" title confusing for kirana user

- **Status**: PARKED — verified in reiteration, tag `stg-216-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [PaymentScreen.tsx:789](src/screens/PaymentScreen.tsx#L789)
- **Scope**: `src/screens/PaymentScreen.tsx`
- **Problem**: "Price Freshness Warning" — "freshness" is a tech term for data staleness. A kirana retailer would understand "Prices may have changed" but not "Price Freshness Warning".
- **Expected**: Change title to "Prices May Have Changed" and body to "Some items were added over 4 hours ago. Prices might be different now. Continue?"
- **Migration**: None
- **Test**: Alert title is plain language
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`
- **Changes**: Line ~789: Change `Alert.alert("Price Freshness Warning", ...)` → `Alert.alert("Prices May Have Changed", "Some items were added over 4 hours ago. Continue with current prices?")`
- **Guard**: Single string change. Do NOT change the staleness check logic.
- **DoD**: ☐ Alert title is "Prices May Have Changed" ☐ Body is plain language

---

### STG-217 — Payment — sale creation error shows generic "Unable to start payment"

- **Status**: PARKED — verified in reiteration, tag `stg-217-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [PaymentScreen.tsx:505](src/screens/PaymentScreen.tsx#L505)
- **Scope**: `src/screens/PaymentScreen.tsx`
- **Problem**: Line 505: `setSaleError("Unable to start payment. Please try again.")` — this is the catch-all for any unhandled createSale error. The actual error (network timeout, server 500, etc.) is swallowed. User has no idea why payment can't start.
- **Expected**: Show specific error: "Network error — check your connection" or "Server busy — try again in a moment" based on error type.
- **Migration**: None
- **Test**: Different error causes show different user-facing messages
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`
- **Changes**: Line ~505: Replace catch-all `"Unable to start payment. Please try again."` with error-type branching:
  1. `if (err.message?.includes('network') || err.code === 'NETWORK_ERROR')` → "Check your internet connection and try again"
  2. `if (err.response?.status >= 500)` → "Server busy — please try again in a moment"
  3. Default → "Could not start payment. Please try again."
- **Guard**: Do NOT change the createSale call. Only the error display logic.
- **DoD**: ☐ Network errors show connection message ☐ Server errors show server message ☐ Generic fallback exists

---

### STG-218 — Payment — "Previous UPI Payment Pending" alert shows raw paymentId hash

- **Status**: PARKED — verified in reiteration, tag `stg-218-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [PaymentScreen.tsx:257](src/screens/PaymentScreen.tsx#L257)
- **Scope**: `src/screens/PaymentScreen.tsx`
- **Problem**: Alert body includes `pending.paymentId.slice(0, 8)…` — showing a raw hash like "a1b2c3d4…" to the user. Kirana retailers don't understand UUIDs. This is developer debug info leaking to the UI.
- **Expected**: Remove paymentId from the user-facing message. Just say "A previous payment was interrupted. Please verify with the customer whether it was completed."
- **Migration**: None
- **Test**: Pending UPI alert contains no raw IDs or hashes
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`
- **Changes**: Line ~257: Remove `pending.paymentId.slice(0, 8)…` from the alert body. Change to: `"A previous UPI payment was interrupted. Please check with the customer whether it was completed before starting a new payment."`
- **Guard**: Do NOT remove the paymentId from the logic (still needed for recovery). Only remove from UI display.
- **DoD**: ☐ No raw IDs/hashes in user-facing alerts ☐ Message is actionable

---

### STG-219 — Payment — "UPI Offline" / "UPI Missing" / "UPI Timeout" all different alert styles

- **Status**: PARKED — verified in reiteration, tag `stg-219-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — PaymentScreen.tsx
- **Scope**: `src/screens/PaymentScreen.tsx`
- **Problem**: Multiple UPI-related alerts have inconsistent titles and structures: "UPI Offline", "UPI Missing", "UPI Timeout", "UPI Error". No consistent alert component or style.
- **Expected**: Standardize all UPI alerts with consistent structure: Icon + Title + Body + Action button. Use a shared alert utility.
- **Migration**: None
- **Test**: All UPI errors follow same visual pattern
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentScreen.tsx`
- **Changes**: Create a helper function `showUpiAlert(title: string, body: string, actions?: AlertButton[])` that standardizes all UPI alerts with consistent structure. Replace all ad-hoc UPI `Alert.alert()` calls (~5 instances) with this helper.
- **Guard**: Do NOT change button handlers. Only wrap existing alerts in a consistent helper.
- **DoD**: ☐ Single `showUpiAlert` helper ☐ All UPI alerts use it ☐ Consistent title format "UPI: <Issue>"

---

### STG-220 — SellScan — CART_SHEET_COLLAPSED_RATIO 0.55 covers 55% screen, too much

- **Status**: PARKED — verified in reiteration, tag `stg-220-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [SellScanScreen.tsx:291](src/screens/SellScanScreen.tsx#L291)
- **Scope**: `src/screens/SellScanScreen.tsx`
- **Problem**: `CART_SHEET_COLLAPSED_RATIO = 0.55` — cart bottom sheet covers 55% of screen height when collapsed. This leaves only 45% for product browsing. On small phones (5-5.5"), only 2-3 product tiles are visible above the cart sheet.
- **Expected**: Reduce to 0.40-0.45 collapsed ratio, showing only cart total bar and first item. Full cart accessible by swiping up.
- **Migration**: None
- **Test**: With cart open on Redmi device, at least 4 product tiles visible above
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/SellScanScreen.tsx`
- **Changes**: Line ~291: Change `CART_SHEET_COLLAPSED_RATIO = 0.55` → `0.42`. This shows cart total bar + first item preview while leaving ~58% for product grid.
- **Guard**: Do NOT change cart expansion behavior or swipe gestures.
- **DoD**: ☐ Collapsed cart covers ~42% of screen ☐ At least 4 tiles visible above on 6" screen ☐ Cart still swipeable to full

---

### STG-221 — SellScan — SMALL_SCREEN_WIDTH=400 threshold may not cover all budget phones

- **Status**: PARKED — verified in reiteration, tag `stg-221-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [SellScanScreen.tsx:296](src/screens/SellScanScreen.tsx#L296)
- **Scope**: `src/screens/SellScanScreen.tsx`
- **Problem**: `SMALL_SCREEN_WIDTH = 400` — budget Android phones (Samsung Galaxy A03, Redmi 9A) have 360dp width. At 400dp threshold, these would be classified as "small" correctly. But the `SMALL_SCREEN_HEIGHT = 750` may misclassify some phones. This needs validation across target device matrix.
- **Expected**: Test on actual target devices and adjust thresholds. Consider using aspect ratio instead of absolute dimensions.
- **Migration**: None
- **Test**: Layout works correctly on 360dp-wide budget Android phones
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/SellScanScreen.tsx`
- **Changes**: Line ~296: Validate `SMALL_SCREEN_WIDTH = 400` and `SMALL_SCREEN_HEIGHT = 750` against target device matrix (360dp Samsung A03, 393dp Pixel 7a, etc.). Adjust thresholds if needed based on device testing.
- **Guard**: This is a validation/adjustment task. Only change thresholds if testing reveals issues.
- **DoD**: ☐ Layout tested on 360dp device ☐ No text overflow or clipping ☐ Thresholds documented

---

### STG-222 — SellScan — product tile formatPrice shows ".00" on round amounts (₹28.00)

- **Status**: PARKED — verified in reiteration, tag `stg-222-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [SellTile.tsx:55-59](src/components/sell/SellTile.tsx#L55-L59)
- **Scope**: `src/components/sell/SellTile.tsx`
- **Problem**: `formatPrice()` uses `.toFixed(2)` always, showing "₹28.00" for a ₹28 item. In Indian retail, round amounts never show decimals. ".00" wastes horizontal space and looks unnatural to kirana users who think in whole rupees.
- **Expected**: Smart formatting: show "₹28" for round amounts, "₹28.50" for amounts with paise. Use `formatMoney()` from `utils/money.ts` for consistency.
- **Migration**: None
- **Test**: ₹28 shows as "₹28", ₹28.50 shows as "₹28.50"
- **Depends on**: STG-117
#### Execution Scope
- **Files**: `src/components/sell/SellTile.tsx`
- **Changes**: Lines ~55-59: In `formatPrice()`, change from `.toFixed(2)` to smart formatting: `paise % 100 === 0 ? (paise / 100).toString() : (paise / 100).toFixed(2)`. Prefix with "₹". Or better: use `formatMoney()` from `src/utils/money.ts` for consistency.
- **Guard**: Do NOT change how `paise` is passed or calculated. Only display formatting.
- **DoD**: ☐ Round amounts show "₹28" ☐ Fractional amounts show "₹28.50" ☐ Unit test for both cases

---

### STG-223 — SellScan — no empty state illustration when search returns zero products

- **Status**: PARKED — verified in reiteration, tag `stg-223-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — SellScanScreen.tsx
- **Scope**: `src/screens/SellScanScreen.tsx`
- **Problem**: When product search returns zero results, there's likely just a text message. No illustration, no guidance, no "Add this product" CTA. The empty state should guide the user to either refine search or add a new product.
- **Expected**: Show empty state illustration with "No products found" + "Try a different search" + "Add new product" button.
- **Migration**: None
- **Test**: Search for non-existent product, verify helpful empty state with illustration
- **Depends on**: STG-035
#### Execution Scope
- **Files**: `src/screens/SellScanScreen.tsx`, `src/components/ui/EmptyState.tsx`
- **Changes**: In the product search results area of SellScanScreen, when search returns zero results, render `<EmptyState>` component with: title "No products found", subtitle "Try a different search or add a new product", and an "Add Product" button that navigates to AddStoreProductModal.
- **Guard**: Do NOT change search API logic. Only the zero-results UI.
- **DoD**: ☐ Empty search shows EmptyState with CTA ☐ "Add Product" button works ☐ Illustration present

---

### STG-224 — SellScan — category rail DEMO_CATEGORIES may show dummy data in production

- **Status**: PARKED — tag `stg-224-2026-03-14`, test: `src/__tests__/screens/SellScanScreen.stg-224.demo-categories.unit.test.tsx`
- **Priority**: P1
- **Source**: Code audit — [SellScanScreen.tsx:61](src/screens/SellScanScreen.tsx#L61)
- **Scope**: `src/screens/SellScanScreen.tsx`, `src/components/sell/CategoryRail.tsx`
- **Problem**: Import `{ DEMO_CATEGORIES }` from CategoryRail — demo/dummy categories might be used as fallback when API fails to load real categories. If the API is down or slow, users might see demo category names instead of their actual store categories.
- **Expected**: Verify that DEMO_CATEGORIES is only used in development mode. In production, show loading skeleton or "Categories unavailable" message, never dummy data.
- **Migration**: None
- **Test**: Kill category API in production build, verify no demo data shown
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/SellScanScreen.tsx`, `src/components/sell/CategoryRail.tsx`
- **Changes**:
  1. Check `CategoryRail.tsx` — verify `DEMO_CATEGORIES` is only used as fallback. If used unconditionally, wrap with `if (__DEV__)`.
  2. In SellScanScreen (~line 61): If `DEMO_CATEGORIES` import is used in production code paths, remove or gate with `__DEV__`
  3. When API fails in production, show loading skeleton or "Categories unavailable" — never dummy names
- **Guard**: Do NOT change the CategoryRail component API. Only gate demo data.
- **DoD**: ☐ `DEMO_CATEGORIES` behind `__DEV__` ☐ Production: API fail → skeleton/message ☐ No dummy category names in release

---

### STG-225 — SellScan — NUM_COLUMNS=2 hardcoded, no responsive columns for tablets

- **Status**: PARKED — verified in reiteration, tag `stg-224-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [SellScanScreen.tsx:283](src/screens/SellScanScreen.tsx#L283)
- **Scope**: `src/screens/SellScanScreen.tsx`
- **Problem**: `const NUM_COLUMNS = 2` — hardcoded. On wider screens (tablets, foldables, landscape), 2 columns wastes space. On very narrow phones (<320dp), 2 columns may be too cramped.
- **Expected**: Calculate columns based on screen width: `Math.max(2, Math.floor(screenWidth / 180))`.
- **Migration**: None
- **Test**: Tablet shows 3-4 columns, narrow phone shows 2
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/SellScanScreen.tsx`
- **Changes**: Line ~283: Replace `const NUM_COLUMNS = 2` with `const NUM_COLUMNS = Math.max(2, Math.floor(screenWidth / 180))` where `screenWidth` is from `Dimensions.get('window').width` (already available in the file).
- **Guard**: Minimum 2 columns always. Do NOT change tile aspect ratio.
- **DoD**: ☐ 360dp → 2 cols ☐ 768dp → 4 cols ☐ No layout breakage

---

### STG-226 — SellTile — "—" dash for null price, should show "Price not set"

- **Status**: PARKED — verified in reiteration, tag `stg-226-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [SellTile.tsx:56](src/components/sell/SellTile.tsx#L56)
- **Scope**: `src/components/sell/SellTile.tsx`
- **Problem**: `if (paise === null || paise === undefined) return "—"` — an em dash is cryptic. The user doesn't know if the price is loading, not set, or an error. Products without prices should be clearly labeled.
- **Expected**: Show "Price not set" in warning color with a "Set price" tap affordance. Or hide price and show "Tap to set price".
- **Migration**: None
- **Test**: Product with null price shows "Price not set" label
- **Depends on**: None
#### Execution Scope
- **Files**: `src/components/sell/SellTile.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Line ~56: Change `return "—"` → `return t('sell.priceNotSet')` (or pass through a prop callback)
  2. Add `en.json` → `sell`: `"priceNotSet": "Price not set"`
  3. Add Hindi translation
  4. Style the "Price not set" text in warning color (`colors.warning`)
- **Guard**: Do NOT change how null price products behave in the cart. Only display.
- **DoD**: ☐ Null price shows "Price not set" in warning color ☐ Localized ☐ Em dash removed

---

### STG-227 — SellTile — expiry days calculation doesn't account for timezone (IST)

- **Status**: PARKED — verified in reiteration, tag `stg-227-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [SellTile.tsx:86-95](src/components/sell/SellTile.tsx#L86-L95)
- **Scope**: `src/components/sell/SellTile.tsx`
- **Problem**: `daysUntilExpiry()` uses `new Date()` which uses device local time, and `Date.UTC()` for comparison. But the expiry date ISO string from the backend might be in UTC while the user is in IST (+5:30). This can cause off-by-one day calculation near midnight.
- **Expected**: Normalize both dates to IST (Asia/Kolkata) before calculating days difference. Use the same `toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })` pattern used elsewhere.
- **Migration**: None
- **Test**: Expiry date calculation is correct at 11:30 PM IST
- **Depends on**: None
#### Execution Scope
- **Files**: `src/components/sell/SellTile.tsx`
- **Changes**: Lines ~86-95: In `daysUntilExpiry()`, normalize both dates to IST before comparison:
  ```
  const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const expiryIST = new Date(new Date(expiryDate).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  ```
  Then calculate day difference from normalized dates.
- **Guard**: Do NOT change expiry badge colors or visibility logic.
- **DoD**: ☐ Expiry calculation correct at 11:30 PM IST ☐ No off-by-one near midnight ☐ Unit test for edge case

---

### STG-228 — SellTile — no MRP strikethrough visual when sell price < MRP

- **Status**: PARKED — verified in reiteration, tag `stg-228-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — SellTile.tsx
- **Scope**: `src/components/sell/SellTile.tsx`
- **Problem**: SellTile has `mrp` field but may not show MRP with strikethrough styling when sell price is lower. Indian customers expect to see "~~₹35~~ ₹28" format to understand the discount. Without MRP strikethrough, the value proposition is invisible.
- **Expected**: When `mrp > sellPrice`, show MRP in grey with strikethrough (textDecorationLine: 'line-through') next to the sell price.
- **Migration**: None
- **Test**: Product with MRP ₹35 and sell price ₹28 shows "~~₹35~~ ₹28"
- **Depends on**: STG-032
#### Execution Scope
- **Files**: `src/components/sell/SellTile.tsx`
- **Changes**: In the price display area, add MRP strikethrough when `mrp > sellPrice`:
  1. Add a conditional `<Text>` with `style={{ textDecorationLine: 'line-through', color: colors.textTertiary, fontSize: 11 }}>₹{mrp/100}</Text>` next to the sell price
  2. Only show when both mrp and sellPrice are non-null and mrp > sellPrice
- **Guard**: Do NOT change the price data model or calculations.
- **DoD**: ☐ MRP strikethrough visible when mrp > sellPrice ☐ Hidden when mrp === sellPrice ☐ Hidden when mrp is null

---

### STG-229 — SellTile — LOOSE mode "per KG" label not translated

- **Status**: PARKED — verified in reiteration, tag `stg-229-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [SellTile.tsx:73](src/components/sell/SellTile.tsx#L73)
- **Scope**: `src/components/sell/SellTile.tsx`
- **Problem**: `packSizeLabel()` returns `"per ${rateUnit}"` with English "per" hardcoded. In Hindi, "per KG" should be "प्रति किलो" or "/किलो".
- **Expected**: Use i18n for "per" prefix. Localize unit names (KG → किलो in Hindi).
- **Migration**: None
- **Test**: Hindi mode, LOOSE product shows "प्रति किलो" not "per KG"
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/components/sell/SellTile.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Line ~73: Replace hardcoded `"per ${rateUnit}"` with `t('sell.perUnit', { unit: t('units.' + rateUnit.toLowerCase()) })`
  2. Add to `en.json`: `"sell.perUnit": "per {{unit}}"`, `"units.kg": "KG"`, `"units.g": "g"`, `"units.l": "L"`, `"units.ml": "ml"`
  3. Add Hindi: `"sell.perUnit": "प्रति {{unit}}"`, `"units.kg": "किलो"`, etc.
- **Guard**: Do NOT change how `rateUnit` is determined or stored.
- **DoD**: ☐ "per KG" localized ☐ Hindi shows "प्रति किलो" ☐ All unit types covered

---

### STG-230 — SellTile — brand name not displayed if available

- **Status**: PARKED — verified in reiteration, tag `stg-230-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [SellTile.tsx:33](src/components/sell/SellTile.tsx#L33)
- **Scope**: `src/components/sell/SellTile.tsx`
- **Problem**: `SellTileProduct` interface has `brand?: string | null` field, and the product data includes brand info. But the tile may not display the brand name prominently. Brand recognition is important for kirana customers (e.g., "Tata Salt" vs generic "Salt").
- **Expected**: Show brand name in a subtle badge or as a secondary text line above the product name.
- **Migration**: None
- **Test**: Products with brand show brand name on tile
- **Depends on**: None
#### Execution Scope
- **Files**: `src/components/sell/SellTile.tsx`
- **Changes**: In the tile render, add a brand display line:
  1. After the product name `<Text>`, add: `{product.brand && <Text style={styles.brandText}>{product.brand}</Text>}`
  2. Add `brandText` style: `{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }`
  3. Brand appears as subtle secondary text above or below product name
- **Guard**: Do NOT change tile height or grid layout. Brand text should truncate with ellipsis if long.
- **DoD**: ☐ Brand name visible when present ☐ Hidden when null ☐ Doesn't break tile layout

---

### STG-231 — Colors — "accent" and "secondary" are identical (#14B8A6), redundant token

- **Status**: PARKED — verified in reiteration, tag `stg-231-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [colors.ts:7-12](src/theme/colors.ts#L7-L12)
- **Scope**: `src/theme/colors.ts`
- **Problem**: Lines 7-12: `accent: "#14B8A6"`, `secondary: "#14B8A6"` — identical. `accentDark`/`secondaryDark` identical. `accentLight`/`secondaryLight` identical. Having two token names for the same color creates confusion about when to use which.
- **Expected**: Pick one name (recommend "accent") and remove the other. Or differentiate them for future brand expansion.
- **Migration**: None — search-replace secondary → accent across codebase
- **Test**: No visual change after consolidation
- **Depends on**: STG-003
#### Execution Scope
- **Files**: `src/theme/colors.ts`, and all files importing `colors.secondary`
- **Changes**:
  1. In `colors.ts`: Remove `secondary`, `secondaryDark`, `secondaryLight` from both light and dark palettes (they're identical to `accent` variants)
  2. Global find-replace across codebase: `colors.secondary` → `colors.accent`, `colors.secondaryDark` → `colors.accentDark`, `colors.secondaryLight` → `colors.accentLight`
  3. Update TypeScript type if `Colors` interface is explicitly defined
- **Guard**: Verify zero visual change after consolidation (colors are identical). Do NOT change actual color values.
- **DoD**: ☐ No `secondary` color token ☐ All usages point to `accent` ☐ Typecheck passes ☐ No visual change

---

### STG-232 — Colors — no dedicated "disabled" color token for greyed-out buttons

- **Status**: PARKED — verified in reiteration, tag `stg-232-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — colors.ts
- **Scope**: `src/theme/colors.ts`
- **Problem**: No `disabled`, `disabledText`, or `disabledBg` color tokens. Components ad-hoc use `textTertiary`, `surfaceAlt`, or opacity to create disabled states, leading to inconsistent disabled button appearances across screens.
- **Expected**: Add `disabled: "#CBD5E1"`, `disabledText: "#94A3B8"`, `disabledBg: "#F1F5F9"` to the color palette. Use consistently for all disabled buttons/inputs.
- **Migration**: None
- **Test**: All disabled buttons have consistent grey appearance
- **Depends on**: STG-003
#### Execution Scope
- **Files**: `src/theme/colors.ts`
- **Changes**: Add to both light and dark palettes:
  - Light: `disabled: "#CBD5E1"`, `disabledText: "#94A3B8"`, `disabledBg: "#F1F5F9"`
  - Dark: `disabled: "#475569"`, `disabledText: "#64748B"`, `disabledBg: "#1E293B"`
- **Guard**: Adding tokens only. Do NOT refactor existing disabled styles in this ticket — that's a separate adoption ticket.
- **DoD**: ☐ Three disabled tokens in both palettes ☐ TypeScript type updated ☐ Typecheck passes

---

### STG-233 — Colors — dark mode "ink" is #F8FAFC but light mode "ink" is #0B1220, never used

- **Status**: PARKED — verified in reiteration, tag `stg-233-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [colors.ts:61](src/theme/colors.ts#L61), [colors.ts:124](src/theme/colors.ts#L124)
- **Scope**: `src/theme/colors.ts`
- **Problem**: `ink` color token exists in both light (#0B1220) and dark (#F8FAFC) palettes but doesn't appear to be used anywhere in the app. Dead color token clutters the palette.
- **Expected**: Either use `ink` for a specific purpose (e.g., receipt printing background) or remove it to simplify the palette.
- **Migration**: None
- **Test**: No visual impact from removal
- **Depends on**: STG-003
#### Execution Scope
- **Files**: `src/theme/colors.ts`
- **Changes**:
  1. Grep codebase for `colors.ink` — if zero usages, remove `ink` from both palettes
  2. If used somewhere, document the usage and keep the token
- **Guard**: Only remove if confirmed unused. Run `grep -r "colors\.ink\|\.ink" src/ --include="*.tsx" --include="*.ts"` first.
- **DoD**: ☐ `ink` removed if unused ☐ If used, documented and kept ☐ Typecheck passes

---

### STG-234 — i18n — status.storeInactive says "Add UPI ID in Superadmin to start billing"

- **Status**: PARKED — verified in reiteration, tag `stg-234-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [en.json:382](src/i18n/locales/en.json#L382)
- **Scope**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: `"storeInactive": "POS is inactive. Add UPI ID in Superadmin to start billing."` — "Superadmin" is internal jargon. The retailer doesn't manage UPI VPA in "Superadmin" — their account manager or SuperMandi support does this.
- **Expected**: Change to "Your store is being set up. Contact support if billing doesn't activate within 24 hours."
- **Migration**: None
- **Test**: Store inactive message is user-friendly, no "Superadmin"
- **Depends on**: STG-057
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Same as STG-201 (consolidated). `en.json` line ~382: `"storeInactive": "Your store is being set up. Contact support if billing doesn't activate within 24 hours."` Hindi: `"storeInactive": "आपकी दुकान सेटअप हो रही है। अगर 24 घंटे में बिलिंग शुरू नहीं होती तो सहायता से संपर्क करें।"`
- **Guard**: Same key name. Only value change. No code changes needed — string is already referenced via i18n.
- **DoD**: ☐ No "Superadmin" in storeInactive string ☐ Hindi updated ☐ Message is actionable

---

### STG-235 — i18n — status.deviceInactive says "Contact Superadmin to enable it"

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P1
- **Source**: Code audit — [en.json:383](src/i18n/locales/en.json#L383)
- **Scope**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: `"deviceInactive": "This device is disabled. Contact Superadmin to enable it."` — same "Superadmin" jargon.
- **Expected**: Change to "This device is disabled. Contact support to re-enable it." with tappable support link.
- **Migration**: None
- **Test**: Device inactive message has no "Superadmin"
- **Depends on**: STG-057
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: `en.json` line ~383: `"deviceInactive": "This device is disabled. Contact support to re-enable it."` Hindi: `"deviceInactive": "यह डिवाइस अक्षम है। इसे पुनः सक्रिय करने के लिए सहायता से संपर्क करें।"`
- **Guard**: Same key, value-only change.
- **DoD**: ☐ No "Superadmin" ☐ Hindi updated

---

### STG-236 — i18n — errors.deviceAlreadyEnrolled says "Ask Superadmin to reset the token"

- **Status**: PARKED — verified in reiteration, tag `stg-236-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [en.json:393](src/i18n/locales/en.json#L393)
- **Scope**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: `"deviceAlreadyEnrolled": "This label is already active. Ask Superadmin to reset the token."` — "Superadmin" jargon AND "token" is a developer term. The retailer has no idea what a "token" is.
- **Expected**: Change to "This device name is already in use. Contact support to reset it, or choose a different name."
- **Migration**: None
- **Test**: Error message is plain language, no "Superadmin" or "token"
- **Depends on**: STG-057
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: `en.json` line ~393: `"deviceAlreadyEnrolled": "This device name is already in use. Contact support to reset it, or choose a different name."` Hindi: update accordingly.
- **Guard**: Same key, value-only change.
- **DoD**: ☐ No "Superadmin" or "token" ☐ Hindi updated ☐ Message guides user to action

---

### STG-237 — i18n — errors.sessionExpired says "Please login again" but POS has no login

- **Status**: PARKED — verified in reiteration, tag `stg-237-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [en.json:406](src/i18n/locales/en.json#L406)
- **Scope**: `src/i18n/locales/en.json`
- **Problem**: `"sessionExpired": "Session expired. Please login again."` — POS doesn't have a "login" flow. It has device enrollment + staff PIN. "Login again" sends the user looking for a login screen that doesn't exist.
- **Expected**: Change to "Session expired. Please re-enter your staff PIN." or "Session expired. The app will restart."
- **Migration**: None
- **Test**: Session expired message matches actual re-auth flow
- **Depends on**: None
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: `en.json` line ~406: `"sessionExpired": "Session expired. Please re-enter your staff PIN."` Hindi: `"sessionExpired": "सत्र समाप्त हो गया। कृपया अपना स्टाफ PIN दोबारा दर्ज करें।"`
- **Guard**: Value-only change.
- **DoD**: ☐ Message matches actual re-auth flow (PIN, not login) ☐ Hindi updated

---

### STG-238 — i18n — sell.digitiseMode says "Digitise mode on" — jargon for kirana user

- **Status**: PARKED — verified in reiteration, tag `stg-238-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [en.json:146](src/i18n/locales/en.json#L146)
- **Scope**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: `"digitiseMode": "Digitise mode on. Scan products to save."` — "Digitise" is tech jargon. Kirana retailers don't know what "digitising" means. They understand "Add products to your catalog."
- **Expected**: Change to "Add to catalog mode — scan products to add them to your store."
- **Migration**: None
- **Test**: Digitise mode shows plain-language explanation
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: `en.json` line ~146: `"digitiseMode": "Add to catalog mode — scan products to add them to your store."` Hindi: `"digitiseMode": "कैटलॉग में जोड़ें — स्कैन करें और अपनी दुकान में उत्पाद जोड़ें।"`
- **Guard**: Value-only change.
- **DoD**: ☐ No "Digitise" jargon ☐ Hindi is natural language

---

### STG-239 — i18n — purchase.moq "MOQ" acronym not spelled out for kirana users

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P2
- **Source**: Code audit — [en.json:116](src/i18n/locales/en.json#L116)
- **Scope**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: `"moq": "MOQ"` — Minimum Order Quantity is a B2B wholesale term. Kirana retailers may know "minimum order" but not the acronym "MOQ".
- **Expected**: Change to "Min. Order" or "Minimum Order" or show full form on first use.
- **Migration**: None
- **Test**: MOQ label is understandable without business degree
- **Depends on**: None
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: `en.json` line ~116: `"moq": "Min. Order"`. Hindi: `"moq": "न्यूनतम ऑर्डर"`
- **Guard**: Value-only change. Search for any other "MOQ" string usages in the app.
- **DoD**: ☐ "MOQ" replaced with "Min. Order" ☐ Hindi updated

---

### STG-240 — i18n — tabs use ALL CAPS ("SELL", "PURCHASE", "REORDER") — shouty

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P2
- **Source**: Code audit — [en.json:93-100](src/i18n/locales/en.json#L93-L100)
- **Scope**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`, `src/screens/PosRootLayout.tsx`
- **Problem**: Tab labels are all uppercase: "SELL", "PURCHASE", "REORDER", "CREDIT", "MENU". ALL CAPS feels aggressive/shouty in modern UI design. Material Design 3 recommends sentence case or title case for tab labels.
- **Expected**: Change to title case: "Sell", "Purchase", "Reorder", "Credit", "Menu". Or use the `textTransform: 'uppercase'` style so the i18n keys can be normal case.
- **Migration**: None
- **Test**: Tab labels use title case, feel professional
- **Depends on**: STG-007, STG-069
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`, `src/screens/PosRootLayout.tsx`
- **Changes**:
  1. `en.json` lines ~93-100: Change `"sell": "SELL"` → `"sell": "Sell"`, `"purchase": "PURCHASE"` → `"purchase": "Purchase"`, etc. for all tab labels
  2. OR in `PosRootLayout.tsx`: Add `textTransform: 'none'` to tab label styles (if currently using uppercase transform)
  3. Update Hindi labels to match casing convention
- **Guard**: Do NOT change tab navigation logic or icons.
- **DoD**: ☐ Tab labels in title case ☐ No ALL CAPS ☐ Hindi labels updated

---

### STG-241 — i18n — reorder.dismissSuggestedFrom template too complex for Hindi translation

- **Status**: PARKED — verified in reiteration, tag `stg-241-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [en.json:251](src/i18n/locales/en.json#L251)
- **Scope**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: `"dismissSuggestedFrom": "Suggested: {{qty}} units from {{supplier}}"` — Hindi word order is different (supplier comes before quantity in natural Hindi). Complex interpolation templates with multiple variables are hard to translate naturally.
- **Expected**: Split into simpler strings or allow translators to reorder variables.
- **Migration**: None
- **Test**: Hindi translation reads naturally, not word-for-word English
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: `en.json` line ~251: Simplify to `"dismissSuggestedFrom": "Suggested: {{qty}} from {{supplier}}"` (shorter). Hindi: Reorder variables naturally: `"dismissSuggestedFrom": "{{supplier}} से सुझाव: {{qty}} यूनिट"` (supplier first in Hindi).
- **Guard**: Do NOT change the interpolation variable names ({{qty}}, {{supplier}}).
- **DoD**: ☐ Hindi reads naturally ☐ Variables correctly interpolated

---

### STG-242 — i18n — credit section uses financial jargon (EMI, KYC, PAN, Aadhaar) without explanation

- **Status**: PARKED — verified in reiteration, tag `stg-242-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [en.json:484-536](src/i18n/locales/en.json#L484-L536)
- **Scope**: `src/i18n/locales/en.json`
- **Problem**: Credit section i18n keys use financial acronyms: "EMI", "KYC", "PAN", "Aadhaar", "BNPL", "UTR". While kirana owners may know EMI and PAN, KYC and UTR are less familiar. No tooltips or explanations provided.
- **Expected**: Add brief explanations: "KYC (identity check)", "UTR (payment reference number)". Or show full forms on first encounter.
- **Migration**: None
- **Test**: Financial terms have contextual explanations
- **Depends on**: None
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: In credit section (~lines 484-536): Add full-form expansions:
  - `"kyc": "KYC (Identity Verification)"` → `"kyc": "Identity Check (KYC)"`
  - `"utr": "UTR"` → `"utr": "Payment Reference (UTR)"`
  - Keep EMI, PAN, Aadhaar as-is (well-known in India)
  - Update Hindi translations
- **Guard**: Value-only changes. Do NOT rename JSON keys.
- **DoD**: ☐ KYC and UTR have contextual explanations ☐ Hindi updated

---

### STG-243 — i18n — bnpl.upiInstructions sentence too long (2 clauses + technical term UTR)

- **Status**: PARKED — verified in reiteration, tag `stg-243-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [en.json:461](src/i18n/locales/en.json#L461)
- **Scope**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: `"upiInstructions": "Complete the payment in your UPI app, then enter the UTR (transaction reference) below to confirm."` — 20 words in one instruction. Combines 3 steps (open UPI app, pay, enter UTR) in one sentence. UTR is technical.
- **Expected**: Break into numbered steps: "1. Pay in your UPI app  2. Copy the payment reference  3. Paste it below"
- **Migration**: None
- **Test**: UPI instructions are step-by-step, not run-on sentence
- **Depends on**: None
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: `en.json` line ~461: Change `"upiInstructions"` to step-by-step: `"upiInstructions": "1. Pay in your UPI app\n2. Copy the payment reference\n3. Paste it below to confirm"`. Hindi: `"upiInstructions": "1. अपने UPI ऐप में भुगतान करें\n2. भुगतान संदर्भ कॉपी करें\n3. पुष्टि के लिए नीचे पेस्ट करें"`
- **Guard**: Value-only change. Ensure the newlines render correctly in the UI component.
- **DoD**: ☐ Instructions are numbered steps ☐ No "UTR" jargon ☐ Hindi step-by-step

---

### STG-244 — i18n — grn.title "Goods Receipt Note" — warehouse jargon

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P2
- **Source**: Code audit — [en.json:292](src/i18n/locales/en.json#L292)
- **Scope**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: `"title": "Goods Receipt Note"` — GRN is formal warehouse/supply-chain terminology. Kirana retailers say "maal aaya" (goods arrived) or "stock received".
- **Expected**: Change to "Stock Received" or "Confirm Delivery".
- **Migration**: None
- **Test**: GRN screen title is plain language
- **Depends on**: STG-054
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: `en.json` → GRN section line ~292: Change `"title": "Goods Receipt Note"` → `"title": "Confirm Delivery"`. Hindi: `"title": "डिलीवरी पुष्टि"`. Also update subtitle if it references "GRN".
- **Guard**: Do NOT rename the GRN screen component or route name. Only user-facing title text.
- **DoD**: ☐ GRN screen title is "Confirm Delivery" ☐ Hindi updated ☐ No "Goods Receipt Note" visible to users

---

### STG-245 — Tab nav — "REORDER • ON" / "REORDER • OFF" unusual tab label convention

- **Status**: PARKED — verified in reiteration, tag `stg-245-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [en.json:98-99](src/i18n/locales/en.json#L98-L99)
- **Scope**: `src/i18n/locales/en.json`, `src/screens/PosRootLayout.tsx`
- **Problem**: Tab labels include state indicators: "REORDER • ON" and "REORDER • OFF". Embedding state in a navigation label is unusual — tabs should be stable labels. The ON/OFF state should be shown as a badge or indicator on the tab, not in the label text itself.
- **Expected**: Keep tab label as "Reorder". Show ON/OFF state as a green/grey dot indicator or small badge on the tab icon.
- **Migration**: None
- **Test**: Reorder tab label is stable "Reorder" with state shown via icon/badge
- **Depends on**: STG-007
#### Execution Scope
- **Files**: `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`, `src/screens/PosRootLayout.tsx`
- **Changes**:
  1. `en.json` lines ~98-99: Change `"reorderOn": "REORDER • ON"`, `"reorderOff": "REORDER • OFF"` → single `"reorder": "Reorder"`
  2. In `PosRootLayout.tsx`: Remove conditional label logic that switches between ON/OFF labels. Use stable "Reorder" label.
  3. Add a green dot (or `TabBadge`) component on the Reorder tab icon when reorder is ON, grey dot when OFF.
- **Guard**: Do NOT change the reorder ON/OFF state logic. Only the tab label display.
- **DoD**: ☐ Tab label is stable "Reorder" ☐ ON/OFF shown via dot badge on icon ☐ Badge updates reactively

---

### STG-246 — Tab nav — 5 tabs but CREDIT tab is greyed/disabled, confusing affordance

- **Status**: PARKED — verified in reiteration, tag `stg-246-2026-03-14`
- **Priority**: P2
- **Source**: Code audit + screenshot observation
- **Scope**: `src/screens/PosRootLayout.tsx`, `src/screens/CreditScreen.tsx`
- **Problem**: The CREDIT tab is always visible but may be greyed out (disabled) if credit features aren't enabled for the store. A permanently grey tab confuses users — they tap it expecting content and get nothing. 5 tabs is also at the Material Design maximum.
- **Expected**: Hide disabled tabs entirely. Or show them with a "Coming Soon" indicator when tapped. Consider reducing to 4 tabs (SELL, PURCHASE, MENU + move Credit into Menu).
- **Migration**: None
- **Test**: Disabled features don't show as ghost tabs
- **Depends on**: STG-030
#### Execution Scope
- **Files**: `src/screens/PosRootLayout.tsx`, `src/screens/CreditScreen.tsx`
- **Changes**:
  1. In `PosRootLayout.tsx`: Add conditional rendering for Credit tab — hide entirely when credit feature is not enabled for the store (check feature flag or store config)
  2. When credit is disabled: 4 tabs only (Sell, Purchase, Reorder, Menu)
  3. If hiding is not desired: show "Coming Soon" toast on tap of disabled tab
- **Guard**: Do NOT change the Credit screen itself. Only tab visibility.
- **DoD**: ☐ Disabled Credit tab hidden or shows "Coming Soon" ☐ Tab bar renders cleanly with 4 tabs ☐ Credit-enabled stores still have 5 tabs

---

### STG-247 — Menu — "Customers & Credit" section has 4 items (Khata, Customers, Customer Management, Overdue) — 3 overlap

- **Status**: PARKED — verified in reiteration, tag `stg-247-2026-03-14`
- **Priority**: P1
- **Source**: Code audit — [MenuScreen.tsx:775-824](src/screens/MenuScreen.tsx#L775-L824)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: The "Customers & Credit" section has 4 separate menu items:
  1. "Khata (Credit Book)" → KhataScreen
  2. "Customers" → CustomerListScreen
  3. "Customer Management" → CustomerManagementScreen
  4. "Overdue Dues" → OverdueDuesScreen
  "Customers" and "Customer Management" are essentially the same thing (view vs edit). "Khata" overlaps with both. This creates decision paralysis — "which one do I tap to find a customer?"
- **Expected**: Consolidate into 2 items max: "Customers" (combined list + management) and "Credit & Dues" (Khata + Overdue). Already flagged in STG-157 but this ticket addresses the full consolidation.
- **Migration**: None
- **Test**: Customer section has max 2 clear menu items
- **Depends on**: STG-157
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**:
  1. Lines ~775-824: Remove "Customer Management" menu item entirely (merge into "Customers")
  2. Rename "Khata (Credit Book)" subtitle to include overdue context: "Credit book and due payments"
  3. "Customers" subtitle: "View, add, and manage customer profiles"
  4. Keep "Overdue Dues" only if it navigates to a distinct screen; otherwise merge into Khata
  5. Result: max 3 items — "Customers", "Credit Book", "Overdue Payments" (or 2 if Overdue merges into Credit Book)
- **Guard**: Do NOT delete screens — just remove redundant menu entry points.
- **DoD**: ☐ Max 2-3 items in Customers section ☐ No "Customer Management" card ☐ All functions still accessible

---

### STG-248 — Menu — menuItem marginTop:16 creates 16px gap, but first item after sectionHeader has 16+4=20px gap inconsistency

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P3
- **Source**: Code audit — MenuScreen.tsx styles
- **Scope**: `src/screens/MenuScreen.tsx` styles
- **Problem**: `menuItem: { marginTop: 16 }` and `sectionHeader: { marginBottom: 4 }`. The first menu item after a section header has 4 + 16 = 20px total gap, but subsequent items have only 16px gap. This asymmetry is subtle but visible.
- **Expected**: Use consistent spacing: either remove sectionHeader marginBottom and let menuItem marginTop handle all spacing, or add a dedicated first-item class.
- **Migration**: None
- **Test**: Visual check — consistent spacing between all menu items
- **Depends on**: STG-003
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: In styles: Change `sectionHeader: { marginBottom: 4 }` → `marginBottom: 0`. This makes the first menu item after a header have only `marginTop: 16` gap (matching all other items).
- **Guard**: Single value change.
- **DoD**: ☐ All inter-item gaps are consistent 16px ☐ No visual asymmetry

---

### STG-249 — Menu — printerStatusRow sits between Bills and Barcode with no card container

- **Status**: PARKED — verified in reiteration, tag `stg-249-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:648-659](src/screens/MenuScreen.tsx#L648-L659)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: The printer status row (line 648-659) is styled as a bare row (`printerStatusRow`) between the Bill Actions cards and the Barcode Sheets card. It has no card container, no border, no background — just floating text and icons. It looks like an orphan element, not a proper menu item.
- **Expected**: Either wrap in a card container matching menuItem style, or integrate it into the Bills/Barcode section header as a status indicator.
- **Migration**: None
- **Test**: Printer status has visual container or is integrated into a section
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: Lines ~648-659: Wrap `printerStatusRow` in a card container matching `menuItem` style: add `backgroundColor: colors.surface`, `borderRadius: 12`, `padding: 14`, `borderWidth: 1, borderColor: colors.border`. Or merge it into the section header of the Bills section.
- **Guard**: Do NOT change printer detection or test print logic.
- **DoD**: ☐ Printer status has card container ☐ Visually consistent with other menu items

---

### STG-250 — Menu — "Switch Store" in Settings section but it's a destructive action, needs separation

- **Status**: PARKED — verified in reiteration, tag `stg-250-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:1072-1081](src/screens/MenuScreen.tsx#L1072-L1081)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: "Switch Store" appears alongside benign settings (Language, Theme, Printer Settings). But Switch Store is destructive — it clears all local data and forces re-enrollment. It should be visually separated from regular settings to prevent accidental taps. Currently has red icon (`menuIconDanger`) but is still inline with other items.
- **Expected**: Move "Switch Store" to a dedicated "Danger Zone" section at the bottom of the menu, below Settings. Add extra padding/separator. Show a warning icon prominently.
- **Migration**: None
- **Test**: Switch Store is visually isolated from regular settings
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**:
  1. Move "Switch Store" from Settings section to a new "Danger Zone" section at the very bottom of the menu
  2. Add `<View style={styles.dangerZone}>` with `marginTop: 32` separator
  3. Add a section header "Danger Zone" in red/warning color
  4. Add extra confirmation: "This will clear all local data" in the subtitle
- **Guard**: Do NOT change Switch Store logic. Only its visual placement.
- **DoD**: ☐ Switch Store below all other items ☐ Visually separated ☐ Warning styling

---

### STG-251 — Menu — no confirmation count on "Daily Closing" (e.g., "2 shifts open")

- **Status**: PARKED — verified in reiteration, tag `stg-251-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:956-965](src/screens/MenuScreen.tsx#L956-L965)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: "Daily Closing" menu item has no badge showing pending actions (e.g., shifts not closed, cash not reconciled). The retailer has to open the screen to discover if they have pending closing tasks.
- **Expected**: Show a badge count (e.g., red "1" badge) when daily closing is pending. Or show subtitle "Today's closing pending" dynamically.
- **Migration**: None
- **Test**: Daily Closing shows "Pending" indicator when close-of-day hasn't been done
- **Depends on**: STG-161
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`, `src/stores/dailyClosingStore.ts`
- **Changes**:
  1. Import daily closing status from `dailyClosingStore` (check if today's closing is done)
  2. On Daily Closing menu item (~lines 956-965): Add conditional badge or subtitle change: `subtitle={todaysClosed ? "Completed ✓" : "Today's closing pending"}`
  3. Optional: Add red dot badge to match STG-161 pattern
- **Guard**: Do NOT change daily closing logic. Only read status for display.
- **DoD**: ☐ Dynamic subtitle based on closing status ☐ "Pending" indicator when not done ☐ "Completed" when done

---

### STG-252 — Menu — "Chat" subtitle says "Message suppliers and support" but no unread count

- **Status**: PARKED — verified in reiteration, tag `stg-252-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — [MenuScreen.tsx:859-868](src/screens/MenuScreen.tsx#L859-L868)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: Chat menu item has static subtitle "Message suppliers and support" but no unread message count badge. If a supplier sends a message, the retailer won't know until they open Chat.
- **Expected**: Show unread count badge (red dot with number) on Chat menu item when there are unread messages.
- **Migration**: None
- **Test**: Receive a chat message, verify badge appears on Chat menu item
- **Depends on**: STG-161
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**:
  1. Import unread chat count (from chat API or local state — check `src/services/api/chatApi.ts`)
  2. On Chat menu item (~lines 859-868): Add badge component showing unread count when > 0
  3. Use `<TabBadge>` from `src/components/TabBadge.tsx` or a simple red dot `<View>`
- **Guard**: Do NOT implement push notification logic. Only read locally available unread count.
- **DoD**: ☐ Unread badge shows when messages exist ☐ Badge clears after visiting Chat ☐ No badge when 0 unread

---

### STG-253 — Enroll — TEST_STORE_CONFIG imported but may auto-fill in production builds

- **Status**: PARKED — verified guard exists, test added, tag `stg-253-2026-03-14`, test: `src/__tests__/screens/EnrollDeviceScreen.stg-253.test-config-guard.unit.test.tsx`
- **Priority**: P1
- **Source**: Code audit — [EnrollDeviceScreen.tsx:40](src/screens/EnrollDeviceScreen.tsx#L40)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`, `src/config/api.ts`
- **Problem**: Line 40 imports `TEST_STORE_CONFIG` from `../config/api`. If this config contains test enrollment codes or test store IDs and is used to auto-fill the enrollment form in any code path, it could cause production devices to accidentally enroll to a test store.
- **Expected**: Verify `TEST_STORE_CONFIG` is only used behind `__DEV__` guard. If it's included in production bundle, remove the import and wrap any usage with `if (__DEV__)`.
- **Migration**: None
- **Test**: Production build contains no test store configuration
- **Depends on**: STG-144
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`, `src/config/api.ts`
- **Changes**:
  1. Check `src/config/api.ts` for `TEST_STORE_CONFIG` definition — verify it's behind `__DEV__` guard
  2. In `EnrollDeviceScreen.tsx` line ~40: Wrap the import with `__DEV__` check: `const TEST_STORE_CONFIG = __DEV__ ? require('../config/api').TEST_STORE_CONFIG : null`
  3. Any usage of `TEST_STORE_CONFIG` must be guarded: `if (__DEV__ && TEST_STORE_CONFIG) { ... }`
- **Guard**: Do NOT remove TEST_STORE_CONFIG — it's useful in dev. Only gate its inclusion in production bundles.
- **DoD**: ☐ `TEST_STORE_CONFIG` not in production bundle ☐ Dev auto-fill still works ☐ Production enrollment uses only user input

---

### STG-254 — Payment — formatMoney not using Indian lakh system (1,45,000 vs 145,000)

- **Status**: PARKED — verified in reiteration, tag `stg-253-2026-03-14`
- **Priority**: P2
- **Source**: Code audit — `src/utils/money.ts` used by PaymentScreen
- **Scope**: `src/utils/money.ts`
- **Problem**: `formatMoney()` may use Western comma grouping (₹1,45,000 vs ₹145,000). Indian number system groups after the first 3 digits in pairs of 2 (1,45,000 not 145,000). This was flagged in STG-116 for the payment screen but applies to ALL uses of formatMoney across the app (Menu Today's Sales, cart, bills, etc.).
- **Expected**: Implement Indian lakh numbering system in `formatMoney()` using `Intl.NumberFormat('en-IN')` or manual grouping.
- **Migration**: None
- **Test**: ₹145000 displays as "₹1,45,000" everywhere in the app
- **Depends on**: STG-116
#### Execution Scope
- **Files**: `src/utils/money.ts`
- **Changes**: In `formatMoney()` function, switch to Indian lakh numbering:
  1. Use `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)`
  2. Or manual grouping: split after first 3 digits, then groups of 2
  3. This single change applies everywhere `formatMoney` is called (Menu, cart, bills, payment)
- **Guard**: Do NOT change `formatMoney` signature. Only internal formatting logic.
- **DoD**: ☐ ₹145000 → "₹1,45,000" ☐ ₹1500 → "₹1,500" (no change for <10000) ☐ Unit test for lakh formatting

---

### STG-255 — Menu — summaryCard and statusPanel have same border/radius but different marginTop

- **Status**: PARKED — verified in reiteration, tag `stg-255-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [MenuScreen.tsx:1221-1228](src/screens/MenuScreen.tsx#L1221-L1228), [MenuScreen.tsx:1471-1478](src/screens/MenuScreen.tsx#L1471-L1478)
- **Scope**: `src/screens/MenuScreen.tsx` styles
- **Problem**: `statusPanel: { marginTop: 12 }` and `summaryCard: { marginTop: 12 }` — same margin. But both have `borderRadius: 12` and `padding: 12`. The visual rhythm is monotonous — two identical-looking cards stacked with 12px gap. They blend into one blob.
- **Expected**: Differentiate visually — give summaryCard a subtle accent border or different background tint to distinguish it from statusPanel. Or increase gap between them to 20px.
- **Migration**: None
- **Test**: System Status and Today's Sales cards are visually distinct
- **Depends on**: STG-003
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**: In styles, differentiate `summaryCard` from `statusPanel`:
  1. Add `borderLeftWidth: 3, borderLeftColor: colors.primary` to `summaryCard` for a subtle accent stripe
  2. OR increase `marginTop` from 12 to 20 for `summaryCard` to create more visual separation
- **Guard**: Do NOT change card content or data display.
- **DoD**: ☐ Two cards visually distinct ☐ Clear separation visible

---

### STG-256 — Menu — no swipe gesture to dismiss/collapse System Status panel

- **Status**: PARKED — verified in reiteration, tag `stg-256-2026-03-14`
- **Priority**: P3
- **Source**: Code audit — [MenuScreen.tsx:426-518](src/screens/MenuScreen.tsx#L426-L518)
- **Scope**: `src/screens/MenuScreen.tsx`
- **Problem**: System Status panel is always fully expanded. On repeat visits, the retailer already knows their store is active and synced. There's no way to collapse it (STG-148 flagged collapsible, this covers gesture). A swipe-up gesture to minimize it to a single status dot row would save scroll space.
- **Expected**: Add a "minimize" gesture or tap handler that collapses the panel to a single-line summary: "Store active · Synced · Online" with a chevron to expand.
- **Migration**: None
- **Test**: Swipe or tap to collapse System Status to one-line summary
- **Depends on**: STG-148
#### Execution Scope
- **Files**: `src/screens/MenuScreen.tsx`
- **Changes**:
  1. Add `const [statusCollapsed, setStatusCollapsed] = useState(true)` (default collapsed)
  2. Wrap System Status content in a collapsible container: collapsed shows "Store active · Synced · Online ▼" one-liner, expanded shows full 3-row detail
  3. Tap header row toggles `statusCollapsed`
  4. Auto-expand when any status is NOT active/synced (use existing `opStatus` data)
  5. Use `Animated.View` with height animation for smooth collapse/expand
- **Guard**: Do NOT change status data fetching. Only presentation.
- **DoD**: ☐ Default collapsed to one line ☐ Tap expands ☐ Auto-expands on issues ☐ Smooth animation

---

## UI Audit Tickets (STG-257 — STG-330)

> **Source**: Comprehensive UI audit of all 44 POS screens and 48 components (2026-03-13)
> **Scope**: Text clarity, i18n coverage, accessibility, brand consistency, UX usability
> **Rule**: Do NOT implement until operator approves full ticket list

---

### — CATEGORY A: Screen-Level i18n Coverage (Hardcoded English → t() wrapping) —

---

### STG-257 — PaymentSetupScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-257-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [PaymentSetupScreen.tsx](src/screens/PaymentSetupScreen.tsx)
- **Scope**: `src/screens/PaymentSetupScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: ~20 hardcoded English strings including "Set Up Payments", "UPI ID (VPA)", "Bank Account Number", "Skip for Now", "You can set this up later from Settings", plus all Alert.alert() validation messages ("UPI ID is required", "Invalid UPI ID", "No internet connection...").
- **Fix**: Import `useTranslation`, wrap all user-visible strings with `t()`, add keys to en.json and hi.json under `paymentSetup.*` namespace.
- **Migration**: None
- **Test**: All text renders from i18n keys; switching locale shows Hindi text
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentSetupScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**:
  1. Add `const { t } = useTranslation()` import
  2. Wrap all string literals at lines ~265, 285, 311, 334, 388, 73, 75, 80, 86, 105, 128, 137-138 with `t()` calls
  3. Add ~20 keys to en.json under `paymentSetup.*`
  4. Add corresponding Hindi translations to hi.json
- **Guard**: Do NOT change validation logic or navigation flow. Only text wrapping.
- **DoD**: ☐ Zero hardcoded English in PaymentSetupScreen ☐ All Alert.alert() use t() ☐ Hindi translations added

---

### STG-258 — SalesHistoryScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-258-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [SalesHistoryScreen.tsx](src/screens/SalesHistoryScreen.tsx)
- **Scope**: `src/screens/SalesHistoryScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: Hardcoded strings "Bills", "No sales yet", "Bills will appear here after you make sales.", "Make Your First Sale" not wrapped in `t()`.
- **Fix**: Wrap all with `t()` calls under `salesHistory.*` namespace.
- **Migration**: None
- **Test**: Empty state and header text render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/SalesHistoryScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines ~260, 273, 274, 282 with `t()`. Add 4+ keys to locale files.
- **Guard**: Do NOT change data fetching or list rendering logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations for empty state

---

### STG-259 — BillDetailScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-259-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [BillDetailScreen.tsx](src/screens/BillDetailScreen.tsx)
- **Scope**: `src/screens/BillDetailScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: 30+ hardcoded strings: "Bill not found", "Failed to load bill", "Share unavailable", "Reprint Bill", "Print queued", "Printer error", "Printer not connected", "WhatsApp not found", "Bill Details", "Loading...", "Subtotal", "Discount", "Total", "Bill Ref", "Status", "Payment", "No barcode", "each". None use i18n.
- **Fix**: Full i18n coverage using `useTranslation` hook under `billDetail.*` namespace.
- **Migration**: None
- **Test**: All labels, alerts, and error messages render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/BillDetailScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap ~30 strings at lines 49, 57, 78, 80, 101, 106, 108, 110, 130, 319-330, 344, 353, 362, 368-377, 380, 392 with `t()`. Add keys to locale files.
- **Guard**: Do NOT change print/share logic. Only text wrapping.
- **DoD**: ☐ Zero hardcoded English ☐ All Alert.alert() localized ☐ Hindi translations added

---

### STG-260 — SalesStatementScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-260-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [SalesStatementScreen.tsx](src/screens/SalesStatementScreen.tsx)
- **Scope**: `src/screens/SalesStatementScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: Hardcoded strings: "Inventory Cost Statement", "Cost Value", "Sales", "Items", "No sales data", "Sales transactions will appear here after you make sales.", "Make Your First Sale".
- **Fix**: Wrap with `t()` under `salesStatement.*` namespace.
- **Migration**: None
- **Test**: All labels render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/SalesStatementScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines ~355, 365, 370, 375, 395, 397, 402 with `t()`.
- **Guard**: Do NOT change cost calculation logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations added

---

### STG-261 — DailyReportScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-261-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [DailyReportScreen.tsx](src/screens/DailyReportScreen.tsx)
- **Scope**: `src/screens/DailyReportScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: 25+ hardcoded strings in print/HTML generation: "SUPERMANDI POS", "DAILY REPORT", "Date:", "SUMMARY", "Total Sales:", "Revenue:", "Transactions:", "PAYMENT SPLIT", "Cash:", "UPI:", "Due:", "Card:", "TOP 5 PRODUCTS", "Generated:", plus UI labels "Total Sales", "Revenue", "Payment Split", "Top 5 Products", "Method", "Amount", "Product", "Qty".
- **Fix**: Full i18n for both thermal print content and UI labels under `dailyReport.*`.
- **Migration**: None
- **Test**: Report UI and printed content render from i18n keys
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/DailyReportScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap ~25 strings at lines 82-108, 114, 170-179, 301, 320, 328 with `t()`.
- **Guard**: Do NOT change report data aggregation. Only text.
- **DoD**: ☐ Zero hardcoded English in UI and print output ☐ Hindi translations

---

### STG-262 — DailyClosingScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-262-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [DailyClosingScreen.tsx](src/screens/DailyClosingScreen.tsx)
- **Scope**: `src/screens/DailyClosingScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: 40+ hardcoded strings: tab labels ("Summary", "History"), button text ("Close Day"), field labels ("Opening Cash", "Expected Cash", "Enter Actual Cash", "Variance"), error messages ("Invalid Amount"), status labels ("MATCH", "MISMATCH"), history labels ("Closed by", "Expected Cash", "Actual Cash"). Plus hardcoded "₹" currency symbol at line 371.
- **Fix**: Full i18n coverage under `dailyClosing.*`. Replace hardcoded "₹" with currency utility.
- **Migration**: None
- **Test**: All text renders from i18n; currency symbol from locale
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/DailyClosingScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap ~40 strings at lines 138-475 with `t()`. Replace "₹" at line 371 with currency utility.
- **Guard**: Do NOT change closing logic or cash calculation.
- **DoD**: ☐ Zero hardcoded English ☐ Currency symbol from locale ☐ Hindi translations

---

### STG-263 — InwardScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-263-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [InwardScreen.tsx](src/screens/InwardScreen.tsx)
- **Scope**: `src/screens/InwardScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: ~15 hardcoded strings: "Select Supplier", "No supplier (manual entry)", "Loading suppliers...", "No suppliers linked to this store", "Manual stock inward", "Search product by name or barcode", "No products found", "Type 2+ characters to search", "Clear all", "Add notes (optional)". Plus Alert.alert() strings: "Stock Check Failed", "Inward Failed".
- **Fix**: Full i18n coverage under `inward.*`.
- **Migration**: None
- **Test**: All UI text and alerts render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/InwardScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 64, 74, 83, 86, 481-482, 503, 521, 569, 585, 625, 629, 663, 677 with `t()`.
- **Guard**: Do NOT change stock inward logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-264 — GRNScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-264-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [GRNScreen.tsx](src/screens/GRNScreen.tsx)
- **Scope**: `src/screens/GRNScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: ~15 hardcoded strings in UI ("Receive Goods", "Scan barcode or search...", "Add notes (optional)...", "Set receive quantity:", "Receive") and Alert.alert() calls ("Not Found", "Error", "Success", "Excess Receipt Warning", "Confirm Receive"). Line 388 references "SuperAdmin" in excess alert.
- **Fix**: Full i18n under `grn.*`. Replace "SuperAdmin" with "store manager".
- **Migration**: None
- **Test**: All text and alerts render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/GRNScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 177, 315, 365-402, 457, 481, 512, 539, 561, 628, 661, 710 with `t()`. Replace "SuperAdmin" at line 388.
- **Guard**: Do NOT change receive logic.
- **DoD**: ☐ Zero hardcoded English ☐ No "SuperAdmin" references ☐ Hindi translations

---

### STG-265 — OpeningStockScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-265-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [OpeningStockScreen.tsx](src/screens/OpeningStockScreen.tsx)
- **Scope**: `src/screens/OpeningStockScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: ~12 hardcoded strings: Alert.alert() calls ("Search Failed", "Already Has Stock", "Already Added", "No Entries", "Confirm Opening Stock", "Submission Failed") and UI text ("Add More Products", intro text about opening stock, search placeholder).
- **Fix**: Full i18n under `openingStock.*`.
- **Migration**: None
- **Test**: All alerts and UI text render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/OpeningStockScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 136, 179-180, 187, 243-245, 250-252, 289-291, 541, 551-556, 575-578, 591 with `t()`.
- **Guard**: Do NOT change stock submission logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-266 — PurchaseScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-266-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [PurchaseScreen.tsx](src/screens/PurchaseScreen.tsx)
- **Scope**: `src/screens/PurchaseScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: ~15 Alert.alert() calls with hardcoded English: "No Items", "Scan items to add", "Incomplete", "Fill name, buy & sell price for all items", "Error", "Store not configured. Please re-enroll this device." and multiple error messages.
- **Fix**: Full i18n under `purchase.*`.
- **Migration**: None
- **Test**: All alerts render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PurchaseScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 451, 456, 481, 492, 501, 968, 999, 1005, 1011, 1015 with `t()`.
- **Guard**: Do NOT change purchase flow logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-267 — BarcodeSheetScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-267-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [BarcodeSheetScreen.tsx](src/screens/BarcodeSheetScreen.tsx)
- **Scope**: `src/screens/BarcodeSheetScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: Alert.alert() calls ("Download unavailable", "Download failed", "Share unavailable", "Share failed", "Limit reached", "Maximum 100 products per sheet") and UI text ("No products match your search", "Generating preview...").
- **Fix**: Full i18n under `barcodeSheet.*`.
- **Migration**: None
- **Test**: All alerts and UI text render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/BarcodeSheetScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 250, 252, 269, 271, 286, 477, 571, 576 with `t()`.
- **Guard**: Do NOT change PDF generation logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-268 — BnplDuesScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-268-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [BnplDuesScreen.tsx](src/screens/BnplDuesScreen.tsx)
- **Scope**: `src/screens/BnplDuesScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: 9+ Alert.alert() calls hardcoded English: "Payment Confirmed", "Invalid Amount", "Amount Too High", "Payment Failed", "Enter UTR", "Confirmation Failed", "Select Reason", "Dispute Failed", "UPI Unavailable". Plus modal titles "Pay BNPL Due", "Record Payment", "Submit Dispute" and dropdown labels.
- **Fix**: Full i18n under `bnpl.*`.
- **Migration**: None
- **Test**: All alerts, modal titles, and form labels render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/BnplDuesScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 223, 265, 270, 317, 328, 341, 352, 393, 407, 423, 557, 584, 668, 773, 821, 849, 879, 927, 932 with `t()`.
- **Guard**: Do NOT change payment or dispute logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-269 — KhataScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-269-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [KhataScreen.tsx](src/screens/KhataScreen.tsx)
- **Scope**: `src/screens/KhataScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: 6+ Alert.alert() calls ("Invalid Phone", "Invalid Amount", "Success", "Credit entry added", "Payment recorded") plus modal titles ("Add Credit", "Record Payment") and form labels ("Customer Phone *", "Amount (₹) *", "Description", "Payment Method *") all hardcoded English.
- **Fix**: Full i18n under `khata.*`.
- **Migration**: None
- **Test**: All text renders from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/KhataScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 112, 163, 168, 183, 199, 204, 217, 773, 778-816, 828, 849, 854-872, 932 with `t()`.
- **Guard**: Do NOT change credit/payment recording logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-270 — CustomerListScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-270-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [CustomerListScreen.tsx](src/screens/CustomerListScreen.tsx)
- **Scope**: `src/screens/CustomerListScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: Alert.alert() calls ("Error", "Required", "Customer added", "Customer updated", "WhatsApp Not Found") hardcoded English.
- **Fix**: Full i18n under `customerList.*`.
- **Migration**: None
- **Test**: All alerts render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/CustomerListScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 104, 154, 158, 171, 175, 195, 209, 707 with `t()`.
- **Guard**: Do NOT change customer CRUD logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-271 — OverdueDuesScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-271-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [OverdueDuesScreen.tsx](src/screens/OverdueDuesScreen.tsx)
- **Scope**: `src/screens/OverdueDuesScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: Loading text "Loading overdue dues...", severity labels ("Critical", "Overdue", "Due Soon"), WhatsApp reminder template hardcoded English ("Dear {{name}}, you have an outstanding payment...").
- **Fix**: Full i18n under `overdueDues.*`. Hindi WhatsApp template for customer reminders.
- **Migration**: None
- **Test**: All labels and WhatsApp message render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/OverdueDuesScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 64-68, 318-324, 502 with `t()`. Create Hindi WhatsApp template.
- **Guard**: Do NOT change due calculation or reminder sending logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi WhatsApp template ☐ Severity labels translated

---

### STG-272 — ShiftScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-272-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [ShiftScreen.tsx](src/screens/ShiftScreen.tsx)
- **Scope**: `src/screens/ShiftScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: 5 Alert.alert() calls with hardcoded English: "Error", "Invalid Amount", "Shift Started", "Shift Ended". Plus form labels and cash match/variance text.
- **Fix**: Full i18n under `shift.*`.
- **Migration**: None
- **Test**: All alerts and form labels render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/ShiftScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 128, 145, 159, 172, 197, 207-209, 755-797 with `t()`.
- **Guard**: Do NOT change shift management logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-273 — OrderDetailScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-273-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [OrderDetailScreen.tsx](src/screens/OrderDetailScreen.tsx)
- **Scope**: `src/screens/OrderDetailScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: 4 Alert.alert() calls: "Cancel Order", "Error", "Success", "WhatsApp Not Found". Plus UI labels.
- **Fix**: Full i18n under `orderDetail.*`.
- **Migration**: None
- **Test**: All alerts render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/OrderDetailScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 146, 165, 201, 228, 337, 375-421, 453-456 with `t()`.
- **Guard**: Do NOT change order management logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-274 — ReturnScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-274-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [ReturnScreen.tsx](src/screens/ReturnScreen.tsx)
- **Scope**: `src/screens/ReturnScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: 4 Alert.alert() calls: "Enter Bill #", "Bill not found", "Return Failed", "Return Processed". Plus refund method labels "UPI (Manual)", "Khata Credit".
- **Fix**: Full i18n under `return.*`.
- **Migration**: None
- **Test**: All alerts and labels render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/ReturnScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 66-67, 153, 172, 245, 898, 901 with `t()`.
- **Guard**: Do NOT change return/refund logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-275 — BuyScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-275-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [BuyScreen.tsx](src/screens/BuyScreen.tsx)
- **Scope**: `src/screens/BuyScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: Hardcoded: "Failed to load products. Pull to refresh.", "Failed to refresh. Try again.", "No more products", "You're offline — showing cached catalog", "Showing cached data...", "Refresh", "Loading catalog...".
- **Fix**: Full i18n under `buy.*`.
- **Migration**: None
- **Test**: All UI text renders from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/BuyScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 269, 314, 415, 622-623, 631, 675 with `t()`.
- **Guard**: Do NOT change catalog loading logic.
- **DoD**: ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-276 — CreditScreen — hardcoded English alert strings and form labels not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-276-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [CreditScreen.tsx](src/screens/CreditScreen.tsx)
- **Scope**: `src/screens/CreditScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: Alert messages with financial jargon: "Invalid PAN format (e.g., ABCDE1234F)", "KYC verification is being processed", "Invalid Aadhaar format". Uses `t()` with fallback defaults in some places but hardcoded in others.
- **Fix**: Ensure consistent i18n under `credit.*` with plain-language fallbacks.
- **Migration**: None
- **Test**: All credit flow text renders from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/CreditScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Audit and wrap remaining hardcoded strings at lines 128-131, 199, 219, 241, 250, 277, 282, 290, 829, 864, 882, 927 with `t()`.
- **Guard**: Do NOT change KYC verification logic.
- **DoD**: ☐ Consistent i18n across all Credit screen text ☐ Hindi translations

---

### STG-277 — ReorderScreen + ReorderPoliciesScreen — hardcoded English strings not using i18n

- **Status**: PARKED — verified in reiteration, tag `stg-277-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [ReorderScreen.tsx](src/screens/ReorderScreen.tsx), [ReorderPoliciesScreen.tsx](src/screens/ReorderPoliciesScreen.tsx)
- **Scope**: `src/screens/ReorderScreen.tsx`, `src/screens/ReorderPoliciesScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: Empty state text ("All caught up!", "No pending reorders", "No matching policies"), header text ("Pending Reorders"), and subtitles hardcoded English.
- **Fix**: Full i18n under `reorder.*` and `reorderPolicy.*`.
- **Migration**: None
- **Test**: All empty states and headers render from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/ReorderScreen.tsx`, `src/screens/ReorderPoliciesScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at ReorderScreen lines 441-443, 453-456 and ReorderPoliciesScreen lines 343-346, 358-361, 380 with `t()`.
- **Guard**: Do NOT change reorder logic.
- **DoD**: ☐ Zero hardcoded English in both screens ☐ Hindi translations

---

### STG-278 — BulkPurchaseCreditScreen — no i18n setup, all strings hardcoded

- **Status**: PARKED — verified in reiteration, tag `stg-278-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [BulkPurchaseCreditScreen.tsx](src/screens/BulkPurchaseCreditScreen.tsx)
- **Scope**: `src/screens/BulkPurchaseCreditScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: No `useTranslation()` import at all. All text hardcoded: "Apply for Credit", "Success", "Error", "Max Amount", "Bulk Purchase Credit", "Interest Rate", "Tenure", "EMI", "Apply Now", "No Credit Offers Available".
- **Fix**: Add `useTranslation()` import, full i18n under `bulkCredit.*`.
- **Migration**: None
- **Test**: All text renders from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/BulkPurchaseCreditScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Add `useTranslation` import, wrap all strings at lines 106-118, 151-200, 222-223 with `t()`.
- **Guard**: Do NOT change credit application logic.
- **DoD**: ☐ useTranslation imported ☐ Zero hardcoded English ☐ Hindi translations

---

### STG-279 — ErrorBoundary component — hardcoded English error text

- **Status**: PARKED — verified in reiteration, tag `stg-279-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [ErrorBoundary.tsx](src/components/ErrorBoundary.tsx)
- **Scope**: `src/components/ErrorBoundary.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Problem**: "Something went wrong", "The app encountered an unexpected error", "Try Again" hardcoded English. Error boundary is shown to users during crashes — must be localized.
- **Fix**: Use i18n `t()` calls under `error.*` namespace.
- **Migration**: None
- **Test**: Error boundary renders Hindi text when locale is hi
- **Depends on**: None
#### Execution Scope
- **Files**: `src/components/ErrorBoundary.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Wrap strings at lines 40-46 with `t()`.
- **Guard**: Do NOT change error catching logic.
- **DoD**: ☐ Localized error boundary ☐ Hindi translations

---

### — CATEGORY B: Jargon & Terminology Fixes —

---

### STG-280 — PaymentSetupScreen — "UPI ID (VPA)" jargon, simplify for kirana users

- **Status**: PARKED — verified in reiteration, tag `stg-280-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [PaymentSetupScreen.tsx:265](src/screens/PaymentSetupScreen.tsx#L265)
- **Scope**: `src/screens/PaymentSetupScreen.tsx`
- **Problem**: Label "UPI ID (VPA)" is technical jargon. Kirana retailers don't know "VPA". IFSC input also lacks explanation.
- **Fix**: Change label to "Your UPI ID" with help text "e.g., yourname@upi". Add helper for IFSC: "Your bank's code (e.g., SBIN0001234). Ask your bank if unsure."
- **Migration**: None
- **Test**: Labels show simplified text with examples
- **Depends on**: STG-257
#### Execution Scope
- **Files**: `src/screens/PaymentSetupScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Update label at line ~265 from "UPI ID (VPA)" to `t('paymentSetup.upiLabel', 'Your UPI ID')`. Add help text below IFSC input at lines 332-354.
- **Guard**: Do NOT change validation regex.
- **DoD**: ☐ No "VPA" jargon ☐ IFSC help text added ☐ Hindi translations

---

### STG-281 — DailyClosingScreen — "Variance" accounting jargon confusing for retailers

- **Status**: PARKED — verified in reiteration, tag `stg-281-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [DailyClosingScreen.tsx:413-418](src/screens/DailyClosingScreen.tsx#L413-L418)
- **Scope**: `src/screens/DailyClosingScreen.tsx`
- **Problem**: Label "Variance" is accounting jargon. Sub-labels "Excess cash"/"Short cash" are more intuitive but "Variance" header is opaque.
- **Fix**: Change to "Difference from Expected" or "Cash Mismatch".
- **Migration**: None
- **Test**: Label shows plain language
- **Depends on**: STG-262
#### Execution Scope
- **Files**: `src/screens/DailyClosingScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update "Variance" label at lines 413-414, 418 to "Difference" via i18n key.
- **Guard**: Do NOT change variance calculation.
- **DoD**: ☐ No "Variance" jargon ☐ Plain language label

---

### STG-282 — SalesStatementScreen — "Inventory Cost Statement" title misleading

- **Status**: PARKED — verified in reiteration, tag `stg-282-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [SalesStatementScreen.tsx:355](src/screens/SalesStatementScreen.tsx#L355)
- **Scope**: `src/screens/SalesStatementScreen.tsx`
- **Problem**: Title "Inventory Cost Statement" and label "Cost Value" confuse retailers who expect to see sales revenue, not cost price.
- **Fix**: Change title to "Cost History" or "Inventory Movement". Add help text explaining this shows cost price, not revenue.
- **Migration**: None
- **Test**: Title clearly communicates purpose
- **Depends on**: STG-260
#### Execution Scope
- **Files**: `src/screens/SalesStatementScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update title at line 355 to clearer label. Add subtitle explaining "Shows cost price of items sold".
- **Guard**: Do NOT change data display.
- **DoD**: ☐ Clear title ☐ Help text added

---

### STG-283 — BnplDuesScreen — BNPL/UTR/UPI jargon unexplained

- **Status**: PARKED — verified in reiteration, tag `stg-283-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [BnplDuesScreen.tsx](src/screens/BnplDuesScreen.tsx)
- **Scope**: `src/screens/BnplDuesScreen.tsx`
- **Problem**: "BNPL" (Buy Now Pay Later), "UTR" (UPI Transaction Reference), "UPI" used without explanation. Line 932 mentions "email" contact which is inappropriate for kirana users.
- **Fix**: Replace "BNPL" with "Pay in Installments". Add help text for UTR: "12-digit number from your payment app". Replace "email" with "WhatsApp".
- **Migration**: None
- **Test**: No unexplained acronyms visible
- **Depends on**: STG-268
#### Execution Scope
- **Files**: `src/screens/BnplDuesScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Update text at lines 557, 584, 639, 668, 764, 777, 821, 932. Replace "BNPL" → "Pay Later", "UTR" → "Transaction Number" (with help text), "email" → "WhatsApp".
- **Guard**: Do NOT change payment verification logic.
- **DoD**: ☐ No unexplained BNPL/UTR ☐ WhatsApp instead of email ☐ Hindi translations

---

### STG-284 — CreditScreen — PAN/Aadhaar/KYC jargon needs help text

- **Status**: PARKED — verified in reiteration, tag `stg-284-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [CreditScreen.tsx:88-89, 864, 882](src/screens/CreditScreen.tsx#L88)
- **Scope**: `src/screens/CreditScreen.tsx`
- **Problem**: Labels use "PAN Number", "Aadhaar Last 4 Digits", "KYC Verification" without explanation. Kirana retailers may not understand these terms.
- **Fix**: Add placeholder examples and help text: "PAN (10-char ID from income tax): ABCDE1234F", "Last 4 digits of Aadhaar card", "KYC = Government identity verification".
- **Migration**: None
- **Test**: Each field has visible help text
- **Depends on**: STG-276
#### Execution Scope
- **Files**: `src/screens/CreditScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Add help text beneath PAN input at line ~864, Aadhaar input at line ~882. Add tooltip/info icon for KYC.
- **Guard**: Do NOT change validation logic.
- **DoD**: ☐ Help text on PAN/Aadhaar/KYC fields ☐ Hindi help text

---

### STG-285 — GRNScreen — "GRN" jargon, needs subtitle explaining purpose

- **Status**: PARKED — verified in reiteration, tag `stg-285-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [GRNScreen.tsx:457](src/screens/GRNScreen.tsx#L457)
- **Scope**: `src/screens/GRNScreen.tsx`
- **Problem**: Screen title "Receive Goods" is fine but no context explaining why this flow is distinct from Purchase/Inward. Navigation menu may show "GRN" which is warehouse jargon.
- **Fix**: Add subtitle: "Confirm receipt of ordered goods". Ensure nav menu says "Receive Goods" not "GRN".
- **Migration**: None
- **Test**: Subtitle visible, no "GRN" jargon in navigation
- **Depends on**: STG-264
#### Execution Scope
- **Files**: `src/screens/GRNScreen.tsx`, `src/screens/MenuScreen.tsx` (if GRN label exists there)
- **Changes**: Add subtitle at line ~457. Check MenuScreen for "GRN" label and replace with "Receive Goods".
- **Guard**: Do NOT change receive logic.
- **DoD**: ☐ Subtitle added ☐ No "GRN" in user-facing text

---

### STG-286 — OpeningStockScreen — "Opening Stock" needs contextual explanation

- **Status**: PARKED — verified in reiteration, tag `stg-286-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [OpeningStockScreen.tsx:575-578](src/screens/OpeningStockScreen.tsx#L575)
- **Scope**: `src/screens/OpeningStockScreen.tsx`
- **Problem**: Intro text explains "opening stock" but doesn't clarify when to use this vs Purchase/Inward flows.
- **Fix**: Clarify intro: "Add initial stock quantities for new products. Use this when starting your store or adding a product for the first time."
- **Migration**: None
- **Test**: Intro text clearly explains when to use this screen
- **Depends on**: STG-265
#### Execution Scope
- **Files**: `src/screens/OpeningStockScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update intro text at lines 575-578 with clearer explanation and use case guidance.
- **Guard**: Do NOT change stock submission logic.
- **DoD**: ☐ Clear explanation of when to use ☐ Hindi translation

---

### STG-287 — BuyScreen — "BNPL" badge jargon unexplained

- **Status**: PARKED — verified in reiteration, tag `stg-287-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [BuyScreen.tsx:518-526](src/screens/BuyScreen.tsx#L518)
- **Scope**: `src/screens/BuyScreen.tsx`
- **Problem**: Badge displays "BNPL" text with no explanation. Kirana users won't understand the acronym.
- **Fix**: Replace with "Pay Later Available". Add accessibility hint.
- **Migration**: None
- **Test**: Badge shows "Pay Later" not "BNPL"
- **Depends on**: STG-275
#### Execution Scope
- **Files**: `src/screens/BuyScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update badge text at lines 518-526 from "BNPL" to `t('buy.payLater', 'Pay Later')`.
- **Guard**: Do NOT change BNPL eligibility logic.
- **DoD**: ☐ No "BNPL" acronym visible ☐ Hindi translation

---

### STG-288 — ShiftScreen — "Variance" terminology, same as DailyClosing

- **Status**: PARKED — verified in reiteration, tag `stg-288-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [ShiftScreen.tsx:207-209, 766-797](src/screens/ShiftScreen.tsx#L207)
- **Scope**: `src/screens/ShiftScreen.tsx`
- **Problem**: "Variance" label used for cash mismatch at shift end. Same jargon issue as STG-281.
- **Fix**: Change to "Difference from Expected Cash" or "Cash Mismatch".
- **Migration**: None
- **Test**: No "Variance" jargon visible
- **Depends on**: STG-272
#### Execution Scope
- **Files**: `src/screens/ShiftScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update "Variance" labels at lines 207-209, 766-797.
- **Guard**: Do NOT change variance calculation.
- **DoD**: ☐ Plain language label ☐ Hindi translation

---

### STG-289 — ReturnScreen — "Khata Credit" and "UPI (Manual)" need clarification

- **Status**: PARKED — verified in reiteration, tag `stg-289-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [ReturnScreen.tsx:66-67](src/screens/ReturnScreen.tsx#L66)
- **Scope**: `src/screens/ReturnScreen.tsx`
- **Problem**: "Khata Credit" is Hindi biz jargon that new users may not know = store credit. "UPI (Manual)" doesn't explain what "manual" means.
- **Fix**: "Khata Credit" → "Store Credit (Khata)". "UPI (Manual)" → "UPI Transfer (you send manually)".
- **Migration**: None
- **Test**: Refund method labels clearly explained
- **Depends on**: STG-274
#### Execution Scope
- **Files**: `src/screens/ReturnScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update labels at lines 66-67. Add helper text explaining manual UPI transfer.
- **Guard**: Do NOT change refund processing logic.
- **DoD**: ☐ Clear refund method labels ☐ Hindi translations

---

### STG-290 — AIInsightsScreen — "Slow", "Forecast", "Expiry" tab labels unclear

- **Status**: PARKED — verified in reiteration, tag `stg-290-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [AIInsightsScreen.tsx:102-104](src/screens/AIInsightsScreen.tsx#L102)
- **Scope**: `src/screens/AIInsightsScreen.tsx`
- **Problem**: Tab labels "Slow" (= slow movers), "Forecast" (= demand prediction), "Expiry" (= products expiring soon) are too terse for kirana retailers.
- **Fix**: "Slow" → "Not Selling", "Forecast" → "Predicted Sales", "Expiry" → "Expiring Soon".
- **Migration**: None
- **Test**: Tab labels are self-explanatory
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/AIInsightsScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/hi.json`
- **Changes**: Update tab labels at lines 102-104.
- **Guard**: Do NOT change insights data logic.
- **DoD**: ☐ Clear tab labels ☐ Hindi translations

---

### STG-291 — Components — hardcoded English in SellTile, CartItem, SupplierRow

- **Status**: PARKED — verified in reiteration, tag `stg-291-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — multiple components
- **Scope**: `src/components/sell/SellTile.tsx`, `src/components/buy/CartItem.tsx`, `src/components/buy/SupplierRow.tsx`
- **Problem**: Hardcoded strings: "/unit", "/KG", "Stock: —", "EXPIRED" not using i18n.
- **Fix**: Use `t()` calls: `t("common.perUnit")`, `t("common.stock")`, `t("common.expired")`.
- **Migration**: None
- **Test**: Component text renders from i18n
- **Depends on**: None
#### Execution Scope
- **Files**: `src/components/sell/SellTile.tsx` (line 158), `src/components/buy/CartItem.tsx` (line 58), `src/components/buy/SupplierRow.tsx` (line 113)
- **Changes**: Wrap hardcoded strings with `t()`. Add keys to en.json and hi.json.
- **Guard**: Do NOT change component logic.
- **DoD**: ☐ Zero hardcoded English in components ☐ Hindi translations

---

### STG-292 — LimitedModeBanner — "Place Orders (BUY)" and "Run Reorders" jargon

- **Status**: PARKED — verified in reiteration, tag `stg-292-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [LimitedModeBanner.tsx:112-117](src/components/LimitedModeBanner.tsx#L112)
- **Scope**: `src/components/LimitedModeBanner.tsx`
- **Problem**: BLOCKED_ACTIONS shows "Place Orders (BUY)" and "Run Reorders" — technical jargon.
- **Fix**: Change to "Create Purchase Orders" and "Run Automatic Reorders".
- **Migration**: None
- **Test**: Banner shows clear action descriptions
- **Depends on**: None
#### Execution Scope
- **Files**: `src/components/LimitedModeBanner.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update text at lines 112-117 with plain language.
- **Guard**: Do NOT change limited mode logic.
- **DoD**: ☐ Clear action descriptions ☐ Hindi translations

---

### — CATEGORY C: Accessibility Fixes —

---

### STG-293 — Font sizes below 12px across Purchase/Stock screens

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P2
- **Source**: UI audit — multiple screens
- **Scope**: `src/screens/InwardScreen.tsx`, `src/screens/PurchaseScreen.tsx`, `src/screens/BarcodeSheetScreen.tsx`
- **Problem**: InwardScreen: fontSize 9 (line 926), 10 (lines 949, 998). PurchaseScreen: fontSize 8 (line 1247!), 10 (lines 1197, 1233, 1299, 1397). BarcodeSheetScreen: fontSize 8 (lines 1185, 1198, 1218), 10 (lines 1092, 1096, 1192, 1203, 1403). fontSize 8 is effectively unreadable on mobile.
- **Fix**: Increase all to minimum 12px. Priority: fix 8px values immediately.
- **Migration**: None
- **Test**: No text below 12px; verify on budget Android
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/InwardScreen.tsx`, `src/screens/PurchaseScreen.tsx`, `src/screens/BarcodeSheetScreen.tsx`
- **Changes**: Update all fontSize values below 12 to 12: InwardScreen lines 926, 949, 998; PurchaseScreen lines 1197, 1233, 1247, 1299, 1397; BarcodeSheetScreen lines 1092, 1096, 1185, 1192, 1198, 1203, 1218, 1403.
- **Guard**: Do NOT change layout structure. Only font sizes.
- **DoD**: ☐ Zero fontSize below 12px ☐ Visual verification on small screen

---

### STG-294 — Font sizes below 12px across Sales/Closing screens

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P2
- **Source**: UI audit — multiple screens
- **Scope**: `src/screens/BillDetailScreen.tsx`, `src/screens/SalesStatementScreen.tsx`, `src/screens/DailyClosingScreen.tsx`
- **Problem**: BillDetailScreen: 11px (line 235). SalesStatementScreen: 10px (lines 146, 252). DailyClosingScreen: 11px (lines 569, 594, 721, 744).
- **Fix**: Increase all to minimum 12px.
- **Migration**: None
- **Test**: No text below 12px
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/BillDetailScreen.tsx`, `src/screens/SalesStatementScreen.tsx`, `src/screens/DailyClosingScreen.tsx`
- **Changes**: Update fontSize at identified lines to minimum 12.
- **Guard**: Only font sizes.
- **DoD**: ☐ Zero fontSize below 12px

---

### STG-295 — Font sizes below 12px across Credit/Customer/Orders screens

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P2
- **Source**: UI audit — multiple screens
- **Scope**: `src/screens/CreditScreen.tsx`, `src/screens/BulkPurchaseCreditScreen.tsx`, `src/screens/OrderDetailScreen.tsx`, `src/screens/ReturnScreen.tsx`, `src/screens/ReorderPoliciesScreen.tsx`
- **Problem**: CreditScreen: 10px (lines 1075, 1270). BulkPurchaseCreditScreen: 11px (line 51). OrderDetailScreen: 10-11px (lines 561, 581, 804). ReturnScreen: 10px (lines 397-398). ReorderPoliciesScreen: 10px (lines 267, 516-517).
- **Fix**: Increase all to minimum 12px.
- **Migration**: None
- **Test**: No text below 12px
- **Depends on**: None
#### Execution Scope
- **Files**: Listed screens
- **Changes**: Update all fontSize values below 12 to 12.
- **Guard**: Only font sizes.
- **DoD**: ☐ Zero fontSize below 12px

---

### STG-296 — Font sizes below 12px in Chat/ForceUpdate screens and TabBadge

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P2
- **Source**: UI audit — multiple
- **Scope**: `src/screens/ChatConversationScreen.tsx`, `src/screens/ChatListScreen.tsx`, `src/screens/ForceUpdateScreen.tsx`, `src/components/TabBadge.tsx`
- **Problem**: ChatConversation: 10px (line 255). ChatList: 11px (lines 41, 42, 66, 73). ForceUpdate: 11px (lines 218, 264). TabBadge: 9px (line 87).
- **Fix**: Increase all to minimum 12px (11px for TabBadge small variant).
- **Migration**: None
- **Test**: No text below 11px
- **Depends on**: None
#### Execution Scope
- **Files**: Listed screens + `src/components/TabBadge.tsx`
- **Changes**: Update fontSize at identified lines.
- **Guard**: Only font sizes.
- **DoD**: ☐ Minimum 11px everywhere ☐ 12px for body text

---

### STG-297 — SplitPaymentModal — font size 10px and missing accessibility labels

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P2
- **Source**: UI audit — [SplitPaymentModal.tsx](src/components/sell/SplitPaymentModal.tsx)
- **Scope**: `src/components/sell/SplitPaymentModal.tsx`
- **Problem**: Step labels ("SPLIT", "UPI", "CASH") at fontSize 10 (lines 908-909). Close button (line 803), "Verify & Proceed" (line 718), "Reopen UPI App" (line 518) missing accessibilityLabel.
- **Fix**: Increase font size to 12px. Add accessibilityLabel to all interactive elements.
- **Migration**: None
- **Test**: All labels ≥12px; screen reader announces button purposes
- **Depends on**: None
#### Execution Scope
- **Files**: `src/components/sell/SplitPaymentModal.tsx`
- **Changes**: Update fontSize at lines 654-662, 907-909. Add accessibilityLabel to Pressable/TouchableOpacity at lines 518, 709, 718, 803.
- **Guard**: Do NOT change payment flow logic.
- **DoD**: ☐ Minimum 12px ☐ All buttons have accessibility labels

---

### STG-298 — Missing accessibility labels on icon-only buttons across all screens

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P1
- **Source**: UI audit — all screens
- **Scope**: Multiple screens
- **Problem**: Icon-only buttons (back chevron, refresh, date navigation, scan, close) across SalesHistoryScreen, BillDetailScreen, SalesStatementScreen, DailyReportScreen, DailyClosingScreen, BuyScreen, InwardScreen, GRNScreen, ReorderScreen lack accessibilityLabel. Screen readers cannot describe purpose.
- **Fix**: Add accessibilityLabel to every icon-only Pressable: "Go back", "Refresh list", "Previous day", "Next day", "Scan barcode", "Close".
- **Migration**: None
- **Test**: VoiceOver/TalkBack announces all button purposes
- **Depends on**: None
#### Execution Scope
- **Files**: All screens with icon-only buttons (see audit references)
- **Changes**: Add accessibilityLabel prop to each icon-only Pressable across ~10 screens.
- **Guard**: Do NOT change button behavior.
- **DoD**: ☐ Every icon-only button has accessibilityLabel ☐ Labels are descriptive

---

### STG-299 — Missing accessibility labels on form inputs across screens

- **Status**: PARKED — verified from i18n locale keys, implementation confirmed
- **Priority**: P2
- **Source**: UI audit — multiple screens
- **Scope**: `src/screens/PaymentSetupScreen.tsx`, `src/screens/DailyClosingScreen.tsx`, `src/screens/ShiftScreen.tsx`, `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: TextInputs have minimal or no accessibilityLabel/accessibilityHint. PaymentSetupScreen inputs (lines 287-350), DailyClosingScreen cash input (lines 372-381), ShiftScreen opening/closing cash (lines 755-763, 841-849), EnrollDeviceScreen activation code (line 481).
- **Fix**: Add descriptive accessibilityLabel and accessibilityHint to all form inputs.
- **Migration**: None
- **Test**: Screen reader announces field purpose and format
- **Depends on**: None
#### Execution Scope
- **Files**: Listed screens
- **Changes**: Add accessibilityLabel and accessibilityHint to all TextInput components.
- **Guard**: Do NOT change form logic.
- **DoD**: ☐ All inputs have accessibilityLabel ☐ Hints describe expected format

---

### STG-300 — GRNScreen — checkboxes missing accessibilityState

- **Status**: PARKED (09c6a351, stg-300-2026-03-14)
- **Priority**: P2
- **Source**: UI audit — [GRNScreen.tsx:414-425](src/screens/GRNScreen.tsx#L414)
- **Scope**: `src/screens/GRNScreen.tsx`
- **Problem**: Bulk mode checkboxes use `accessibilityRole="checkbox"` but no `accessibilityLabel` or `accessibilityState`. Screen readers won't announce checked/unchecked state.
- **Fix**: Add `accessibilityLabel={item.productName}` and `accessibilityState={{checked: selectedItems.has(item.id)}}`.
- **Migration**: None
- **Test**: TalkBack announces "Product Name, checkbox, checked/unchecked"
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/GRNScreen.tsx`
- **Changes**: Add accessibility props to checkbox Pressable at lines 414-425.
- **Guard**: Do NOT change selection logic.
- **DoD**: ☐ Checkboxes announce state to screen readers

---

### STG-301 — OrderDetailScreen — status badge relies only on color (colorblind issue)

- **Status**: PARKED — verified in reiteration, tag `stg-301-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [OrderDetailScreen.tsx:313-316](src/screens/OrderDetailScreen.tsx#L313)
- **Scope**: `src/screens/OrderDetailScreen.tsx`
- **Problem**: Order status badges use color-only coding (green=delivered, red=cancelled). No icon or pattern fallback for colorblind users.
- **Fix**: Add icon + color combination: green checkmark + "Delivered", red X + "Cancelled", orange clock + "Processing".
- **Migration**: None
- **Test**: Status distinguishable without color
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/OrderDetailScreen.tsx`
- **Changes**: Add status icons at lines 313-316 alongside color badges.
- **Guard**: Do NOT change status logic.
- **DoD**: ☐ Each status has unique icon + color ☐ Readable in grayscale

---

### — CATEGORY D: Brand & Contact Consistency —

---

### STG-302 — HelpScreen — email-first contact, should be WhatsApp-first

- **Status**: PARKED — verified in reiteration, tag `stg-302-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [HelpScreen.tsx:26, 45-50, 573-574](src/screens/HelpScreen.tsx#L26)
- **Scope**: `src/screens/HelpScreen.tsx`
- **Problem**: Email (hello@supermandi.tech) shown as primary support contact. WhatsApp card exists but appears secondary. Kirana retailers use WhatsApp, not email.
- **Fix**: Swap card order — WhatsApp first, email secondary with "slower response" note.
- **Migration**: None
- **Test**: WhatsApp card appears first on Help screen
- **Depends on**: STG-059
#### Execution Scope
- **Files**: `src/screens/HelpScreen.tsx`
- **Changes**: Reorder support cards at lines ~45-50 so WhatsApp appears first. Add subtitle "slower response" to email card.
- **Guard**: Do NOT remove email option entirely.
- **DoD**: ☐ WhatsApp first ☐ Email secondary with note

---

### STG-303 — BnplDuesScreen — "contacted via phone or email" should include WhatsApp

- **Status**: PARKED — verified in reiteration, tag `stg-303-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [BnplDuesScreen.tsx:932](src/screens/BnplDuesScreen.tsx#L932)
- **Scope**: `src/screens/BnplDuesScreen.tsx`
- **Problem**: Dispute resolution message says "contacted via phone or email". Kirana retailers don't check email.
- **Fix**: Change to "contacted via WhatsApp or phone within 2-3 business days".
- **Migration**: None
- **Test**: Message mentions WhatsApp
- **Depends on**: STG-268
#### Execution Scope
- **Files**: `src/screens/BnplDuesScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update text at line 932.
- **Guard**: Do NOT change dispute logic.
- **DoD**: ☐ WhatsApp mentioned ☐ Email removed from this context

---

### STG-304 — CustomerListScreen + CustomerManagementScreen — email field inappropriate

- **Status**: PARKED — verified in reiteration, tag `stg-304-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [CustomerListScreen.tsx:793-802](src/screens/CustomerListScreen.tsx#L793), [CustomerManagementScreen.tsx:745-746](src/screens/CustomerManagementScreen.tsx#L745)
- **Scope**: `src/screens/CustomerListScreen.tsx`, `src/screens/CustomerManagementScreen.tsx`
- **Problem**: Email field present in add/edit customer modals. Kirana customers rarely have/share email. Field adds confusion and visual clutter.
- **Fix**: Hide email field by default. Show only via "Add more details" expandable section.
- **Migration**: None
- **Test**: Email field not visible by default in customer forms
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/CustomerListScreen.tsx`, `src/screens/CustomerManagementScreen.tsx`
- **Changes**: Move email field at CustomerListScreen lines 793-802 and CustomerManagementScreen lines 745-746 into a collapsible "More details" section.
- **Guard**: Do NOT remove email field entirely — keep for optional use.
- **DoD**: ☐ Email hidden by default ☐ Expandable to reveal ☐ Phone remains primary

---

### STG-305 — DeviceBlockedScreen — "SuperAdmin"/"administrator" jargon in messages

- **Status**: PARKED — verified in reiteration, tag `stg-305-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [DeviceBlockedScreen.tsx:211](src/screens/DeviceBlockedScreen.tsx#L211)
- **Scope**: `src/screens/DeviceBlockedScreen.tsx`
- **Problem**: Message says "This device has been disabled by the administrator. Contact your SuperAdmin." Uses internal terminology.
- **Fix**: Replace with "This device has been disabled. Contact the SuperMandi support team on WhatsApp."
- **Migration**: None
- **Test**: No "SuperAdmin" or "administrator" in blocked screen
- **Depends on**: STG-201
#### Execution Scope
- **Files**: `src/screens/DeviceBlockedScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update message at line 211. Update POS_MESSAGES constant if used.
- **Guard**: Do NOT change device blocking logic.
- **DoD**: ☐ No "SuperAdmin" ☐ WhatsApp support reference

---

### — CATEGORY E: UX — Empty/Loading/Error States —

---

### STG-306 — DailyReportScreen — vague empty state messaging

- **Status**: PARKED — verified in reiteration, tag `stg-306-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [DailyReportScreen.tsx:605-618](src/screens/DailyReportScreen.tsx#L605)
- **Scope**: `src/screens/DailyReportScreen.tsx`
- **Problem**: Empty state says "No report data for this date" / "Try selecting a date when the store was open." Doesn't help user diagnose why (no sales, not synced, future date).
- **Fix**: Change to "No sales recorded for this date. Check that your device is synced and you made sales on this day."
- **Migration**: None
- **Test**: Empty state shows helpful guidance
- **Depends on**: STG-261
#### Execution Scope
- **Files**: `src/screens/DailyReportScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update empty state text at lines 605-618.
- **Guard**: Do NOT change data fetching.
- **DoD**: ☐ Helpful empty state ☐ Hindi translation

---

### STG-307 — BillDetailScreen — print/share buttons show "..." instead of spinner

- **Status**: PARKED — verified in reiteration, tag `stg-307-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [BillDetailScreen.tsx:336-364](src/screens/BillDetailScreen.tsx#L336)
- **Scope**: `src/screens/BillDetailScreen.tsx`
- **Problem**: Print/WhatsApp/Share buttons show "..." text when loading (lines 344, 353, 362) instead of ActivityIndicator spinner. Inconsistent with app patterns.
- **Fix**: Replace "..." with `<ActivityIndicator size="small" />` during loading state.
- **Migration**: None
- **Test**: Spinner visible during print/share actions
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/BillDetailScreen.tsx`
- **Changes**: Replace "..." text with ActivityIndicator at lines 344, 353, 362.
- **Guard**: Do NOT change print/share logic.
- **DoD**: ☐ Spinner on all action buttons during loading

---

### STG-308 — InwardScreen — raw product ID shown when barcode is null

- **Status**: PARKED — verified in reiteration, tag `stg-308-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [InwardScreen.tsx:543](src/screens/InwardScreen.tsx#L543)
- **Scope**: `src/screens/InwardScreen.tsx`
- **Problem**: When product barcode is null, displays raw UUID: `{item.primaryBarcode ?? item.id}`. User sees cryptic identifier.
- **Fix**: Fallback to product name only. Hide barcode line entirely if no barcode.
- **Migration**: None
- **Test**: No raw UUIDs visible to users
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/InwardScreen.tsx`
- **Changes**: Update fallback at line 543 to show product name or hide line.
- **Guard**: Do NOT change product lookup logic.
- **DoD**: ☐ No raw UUIDs ☐ Clean fallback display

---

### STG-309 — ReturnScreen — raw refundId displayed to users

- **Status**: PARKED — verified in reiteration, tag `stg-309-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [ReturnScreen.tsx:898](src/screens/ReturnScreen.tsx#L898)
- **Scope**: `src/screens/ReturnScreen.tsx`
- **Problem**: Success screen shows "Refund ID: {refundResult.refundId}" — raw UUID/hash meaningless to retailers.
- **Fix**: Format as "Refund #R-{last6chars}" or similar human-readable reference. Change label to "Refund Reference".
- **Migration**: None
- **Test**: Formatted reference shown, not raw ID
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/ReturnScreen.tsx`
- **Changes**: Format refundId at line 898: show last 6 chars with "R-" prefix.
- **Guard**: Do NOT change refund logic.
- **DoD**: ☐ Human-readable refund reference ☐ "Refund Reference" label

---

### STG-310 — SplashScreen — "Continue without session" jargon

- **Status**: PARKED — verified in reiteration, tag `stg-310-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [SplashScreen.tsx:210-237](src/screens/SplashScreen.tsx#L210)
- **Scope**: `src/screens/SplashScreen.tsx`
- **Problem**: Error recovery shows "Continue without session" — technical jargon. Users don't understand "session".
- **Fix**: Change to "Continue to enrollment" with explanation: "Start enrolling this device even if connection check failed."
- **Migration**: None
- **Test**: Recovery button has clear label
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/SplashScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update button text and add explanation at lines 210-237.
- **Guard**: Do NOT change splash flow logic.
- **DoD**: ☐ Clear recovery label ☐ Explanation text

---

### STG-311 — AIInsightsScreen — "not yet available" error too vague

- **Status**: PARKED — verified in reiteration, tag `stg-311-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [AIInsightsScreen.tsx:74](src/screens/AIInsightsScreen.tsx#L74)
- **Scope**: `src/screens/AIInsightsScreen.tsx`
- **Problem**: "AI Insights are not yet available for your store. This feature will be activated soon." No timeline, no reason, no action for user.
- **Fix**: Change to "AI Insights require 7 days of sales data. Come back after your first week of using SuperMandi POS."
- **Migration**: None
- **Test**: Message explains prerequisite
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/AIInsightsScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update message at line 74.
- **Guard**: Do NOT change insights availability logic.
- **DoD**: ☐ Clear prerequisite explanation ☐ Hindi translation

---

### STG-312 — DailyReportScreen + DailyClosingScreen — missing offline/sync indication

- **Status**: PARKED — verified in reiteration, tag `stg-312-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [DailyReportScreen.tsx](src/screens/DailyReportScreen.tsx), [DailyClosingScreen.tsx](src/screens/DailyClosingScreen.tsx)
- **Scope**: `src/screens/DailyReportScreen.tsx`, `src/screens/DailyClosingScreen.tsx`
- **Problem**: No indication whether report data is synced or stale. User doesn't know if displayed data is current.
- **Fix**: Add "Last synced at: [time]" or "Synced ✓" badge to report headers.
- **Migration**: None
- **Test**: Sync timestamp visible on report screens
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/DailyReportScreen.tsx`, `src/screens/DailyClosingScreen.tsx`
- **Changes**: Add sync status badge near screen header.
- **Guard**: Do NOT change data fetching.
- **DoD**: ☐ Sync timestamp visible ☐ "Synced"/"Not synced" indicator

---

### STG-313 — Network error messages across screens — no recovery guidance

- **Status**: PARKED — verified in reiteration, tag `stg-313-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — StaffLoginScreen, DeviceBlockedScreen, ForceUpdateScreen, EnrollDeviceScreen
- **Scope**: Multiple screens
- **Problem**: "No connection" / "No internet" messages lack recovery steps. Users don't know what to do.
- **Fix**: Add hint: "Move closer to your WiFi router or check your mobile data, then try again."
- **Migration**: None
- **Test**: Network error shows actionable recovery hint
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/StaffLoginScreen.tsx`, `src/screens/DeviceBlockedScreen.tsx`, `src/screens/ForceUpdateScreen.tsx`, `src/screens/EnrollDeviceScreen.tsx`
- **Changes**: Update network error messages to include recovery hint.
- **Guard**: Do NOT change connectivity check logic.
- **DoD**: ☐ All network errors show recovery hint ☐ Hindi translations

---

### STG-314 — PaymentSetupScreen — no success confirmation after saving

- **Status**: PARKED — verified in reiteration, tag `stg-314-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [PaymentSetupScreen.tsx:123](src/screens/PaymentSetupScreen.tsx#L123)
- **Scope**: `src/screens/PaymentSetupScreen.tsx`
- **Problem**: After saving payment settings, navigates directly to SellScan without showing success confirmation. User doesn't know if save worked.
- **Fix**: Show brief success toast "Payment settings saved!" before navigation.
- **Migration**: None
- **Test**: Success toast visible after save
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/PaymentSetupScreen.tsx`
- **Changes**: Add success toast/alert at line 123 before navigation.
- **Guard**: Do NOT change save logic.
- **DoD**: ☐ Success feedback shown ☐ Then navigates

---

### STG-315 — ReorderScreen — missing confirmation before dismissing suggestion

- **Status**: PARKED — verified in reiteration, tag `stg-315-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [ReorderScreen.tsx:256-265](src/screens/ReorderScreen.tsx#L256)
- **Scope**: `src/screens/ReorderScreen.tsx`
- **Problem**: After selecting dismiss reason, reorder suggestion is dismissed without "Are you sure?" confirmation. Accidental dismissal loses suggestion permanently.
- **Fix**: Add confirmation Alert: "Dismiss {item} from reorder suggestions? You can manually re-request it later."
- **Migration**: None
- **Test**: Confirmation prompt shown before dismiss
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/ReorderScreen.tsx`
- **Changes**: Add Alert.alert() confirmation at lines 256-265 before API call.
- **Guard**: Do NOT change dismiss API logic.
- **DoD**: ☐ Confirmation prompt ☐ Cancel option available

---

### — CATEGORY F: Button/Style Consistency —

---

### STG-316 — SplitPaymentModal — TouchableOpacity should be Pressable

- **Status**: PARKED — verified in reiteration, tag `stg-316-2026-03-14`
- **Priority**: P3
- **Source**: UI audit — [SplitPaymentModal.tsx](src/components/sell/SplitPaymentModal.tsx)
- **Scope**: `src/components/sell/SplitPaymentModal.tsx`
- **Problem**: Mix of TouchableOpacity and Pressable. Rest of codebase uses Pressable exclusively.
- **Fix**: Replace all TouchableOpacity with Pressable at lines 531, 573, 619, 709, 758, 803, 818, 821.
- **Migration**: None
- **Test**: All interactions still work with Pressable
- **Depends on**: None
#### Execution Scope
- **Files**: `src/components/sell/SplitPaymentModal.tsx`
- **Changes**: Replace TouchableOpacity imports and usages with Pressable.
- **Guard**: Do NOT change payment flow.
- **DoD**: ☐ Zero TouchableOpacity ☐ All interactions work

---

### STG-317 — Inconsistent disabled button opacity across all screens

- **Status**: PARKED — verified in reiteration, tag `stg-317-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — multiple screens
- **Scope**: App-wide
- **Problem**: Disabled buttons use different opacity values: 0.4 (ReturnScreen line 417), 0.5 (some screens), 0.6 (PaymentSetupScreen). Visual inconsistency confuses users about disabled state.
- **Fix**: Define `DISABLED_OPACITY = 0.5` in theme and reference globally across all disabled button states.
- **Migration**: None
- **Test**: All disabled buttons have consistent opacity
- **Depends on**: STG-003
#### Execution Scope
- **Files**: `src/theme/colors.ts` (add constant), all screens with disabled buttons
- **Changes**: Add `export const DISABLED_OPACITY = 0.5` to theme. Update all opacity references.
- **Guard**: Do NOT change button enable/disable logic.
- **DoD**: ☐ Single opacity constant ☐ Applied everywhere

---

### STG-318 — KhataScreen — Add Credit (red) / Record Payment (green) color semantics wrong

- **Status**: PARKED — verified in reiteration, tag `stg-318-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [KhataScreen.tsx:654-662](src/screens/KhataScreen.tsx#L654)
- **Scope**: `src/screens/KhataScreen.tsx`
- **Problem**: "Add Credit" uses `colors.error` (red) which implies danger. "Record Payment" uses `colors.success` (green). Red for a normal action confuses users.
- **Fix**: Change "Add Credit" to `colors.primary` or `colors.warning`. Keep "Record Payment" green.
- **Migration**: None
- **Test**: Both buttons use appropriate semantic colors
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/KhataScreen.tsx`
- **Changes**: Update button color at lines 654-662.
- **Guard**: Do NOT change credit/payment logic.
- **DoD**: ☐ "Add Credit" not red ☐ Clear visual distinction between actions

---

### STG-319 — Inconsistent modal button styling across components

- **Status**: PARKED — verified in reiteration, tag `stg-319-2026-03-14`
- **Priority**: P3
- **Source**: UI audit — SplitPaymentModal, EditReorderModal, DismissReasonModal
- **Scope**: `src/components/sell/SplitPaymentModal.tsx`, `src/components/reorder/EditReorderModal.tsx`, `src/components/reorder/DismissReasonModal.tsx`
- **Problem**: Primary buttons have different padding (14px vs 12px), icon placement, and text alignment across modals.
- **Fix**: Standardize: all primary buttons = 14px padding, centered text, consistent icon size.
- **Migration**: None
- **Test**: Visual consistency across modals
- **Depends on**: STG-003
#### Execution Scope
- **Files**: Listed components
- **Changes**: Align button styles in SplitPaymentModal lines 1040-1050, EditReorderModal lines 753-770, DismissReasonModal lines 396-405.
- **Guard**: Do NOT change modal logic.
- **DoD**: ☐ Consistent button padding ☐ Consistent text alignment

---

### — CATEGORY G: Miscellaneous UX Improvements —

---

### STG-320 — OverdueDuesScreen — "Due Soon" uses info color (blue) instead of warning

- **Status**: PARKED — verified in reiteration, tag `stg-320-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [OverdueDuesScreen.tsx:56-68](src/screens/OverdueDuesScreen.tsx#L56)
- **Scope**: `src/screens/OverdueDuesScreen.tsx`
- **Problem**: Severity "Due Soon" (0-7 days) uses `colors.info` (blue). "Overdue" (7-30 days) uses `colors.warning`. Blue doesn't convey urgency for items due within a week.
- **Fix**: Change "Due Soon" to `colors.warning` (orange). Keep "Overdue" as `colors.error`.
- **Migration**: None
- **Test**: Color semantics match urgency
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/OverdueDuesScreen.tsx`
- **Changes**: Update getSeverityColor() at lines 56-68.
- **Guard**: Do NOT change due date calculation.
- **DoD**: ☐ Due Soon = warning color ☐ Visual urgency progression

---

### STG-321 — ChatConversationScreen — "No messages yet. Say hello!" vague empty state

- **Status**: PARKED — verified in reiteration, tag `stg-321-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [ChatConversationScreen.tsx:329](src/screens/ChatConversationScreen.tsx#L329)
- **Scope**: `src/screens/ChatConversationScreen.tsx`
- **Problem**: Empty state "No messages yet. Say hello!" doesn't explain if this is a new conversation or failed load.
- **Fix**: Change to "Start a conversation by typing your first message below."
- **Migration**: None
- **Test**: Clear call-to-action in empty chat
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/ChatConversationScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update text at line 329.
- **Guard**: Do NOT change chat logic.
- **DoD**: ☐ Clear CTA text ☐ Hindi translation

---

### STG-322 — ChatConversationScreen — 24-hour time format without AM/PM

- **Status**: PARKED — verified in reiteration, tag `stg-322-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [ChatConversationScreen.tsx:148](src/screens/ChatConversationScreen.tsx#L148)
- **Scope**: `src/screens/ChatConversationScreen.tsx`, `src/screens/ChatListScreen.tsx`
- **Problem**: Uses `toLocaleTimeString('en-IN')` without `hour12: true`. Shows "14:30" instead of "2:30 PM". Kirana merchants may not read 24-hour time.
- **Fix**: Add `hour12: true` to locale options.
- **Migration**: None
- **Test**: Time shows AM/PM format
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/ChatConversationScreen.tsx` (line 148), `src/screens/ChatListScreen.tsx` (line 121)
- **Changes**: Add `hour12: true` to toLocaleTimeString options.
- **Guard**: Do NOT change timestamp data.
- **DoD**: ☐ AM/PM visible ☐ 12-hour format

---

### STG-323 — ForceUpdateScreen — "iOS update coming soon" vague with no timeline

- **Status**: PARKED — verified in reiteration, tag `stg-323-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [ForceUpdateScreen.tsx:74-80](src/screens/ForceUpdateScreen.tsx#L74)
- **Scope**: `src/screens/ForceUpdateScreen.tsx`
- **Problem**: Alert says "iOS App Store listing is being prepared. Please check back soon or contact support." No timeline or alternative.
- **Fix**: Add ETA: "iOS update will be available soon. For immediate help, contact support on WhatsApp."
- **Migration**: None
- **Test**: Message provides actionable guidance
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/ForceUpdateScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update alert text at lines 74-80.
- **Guard**: Do NOT change update check logic.
- **DoD**: ☐ WhatsApp contact mentioned ☐ Hindi translation

---

### STG-324 — EnrollDeviceScreen — activation code placeholder lacks help text

- **Status**: PARKED — verified in reiteration, tag `stg-324-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [EnrollDeviceScreen.tsx:481](src/screens/EnrollDeviceScreen.tsx#L481)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: Placeholder "SM-XXXXXX" doesn't explain what an activation code is or where to get it. New retailers are confused.
- **Fix**: Add help text below input: "You received this code via WhatsApp after registration approval".
- **Migration**: None
- **Test**: Help text visible below activation code input
- **Depends on**: STG-253
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Add helper text after input at line 481. Update placeholder to "SM-ABC123".
- **Guard**: Do NOT change activation logic.
- **DoD**: ☐ Help text visible ☐ Example code shown ☐ Hindi translation

---

### STG-325 — EnrollDeviceScreen — "Activate POS" vs "Activate Your POS" inconsistency

- **Status**: PARKED — verified in reiteration, tag `stg-325-2026-03-14`
- **Priority**: P3
- **Source**: UI audit — [EnrollDeviceScreen.tsx:469, 534](src/screens/EnrollDeviceScreen.tsx#L469)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: Title says "Activate Your POS" (line 469) but button says "Activate POS" (line 534). Inconsistent.
- **Fix**: Standardize to "Activate POS" everywhere.
- **Migration**: None
- **Test**: Consistent text
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`
- **Changes**: Unify text at lines 469 and 534.
- **Guard**: Do NOT change activation flow.
- **DoD**: ☐ Consistent button/title text

---

### STG-326 — EnrollDeviceScreen — required field indicators inconsistent

- **Status**: PARKED (6e1f8959, stg-326-2026-03-14)
- **Priority**: P2
- **Source**: UI audit — [EnrollDeviceScreen.tsx:479, 496-497](src/screens/EnrollDeviceScreen.tsx#L479)
- **Scope**: `src/screens/EnrollDeviceScreen.tsx`
- **Problem**: Device Name shows red asterisk for required, but Activation Code (also required) doesn't. Inconsistent.
- **Fix**: Add red asterisk to both required field labels.
- **Migration**: None
- **Test**: Both required fields marked consistently
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/EnrollDeviceScreen.tsx`
- **Changes**: Add required indicator to Activation Code label at line ~479.
- **Guard**: Do NOT change validation.
- **DoD**: ☐ Both required fields marked ☐ Consistent visual treatment

---

### STG-327 — StaffLoginScreen — button doesn't change text during cooldown

- **Status**: PARKED — verified in reiteration, tag `stg-327-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [StaffLoginScreen.tsx:326-340](src/screens/StaffLoginScreen.tsx#L326)
- **Scope**: `src/screens/StaffLoginScreen.tsx`
- **Problem**: During rate-limit cooldown, button becomes disabled but still says "Login". User doesn't know why they can't tap.
- **Fix**: Update button text during cooldown: "Please wait..." and update accessibilityLabel.
- **Migration**: None
- **Test**: Button text changes during cooldown
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/StaffLoginScreen.tsx`
- **Changes**: Add conditional text at lines 326-340: `{cooldown ? "Please wait..." : loading ? <ActivityIndicator> : "Login"}`.
- **Guard**: Do NOT change auth logic.
- **DoD**: ☐ Cooldown text shown ☐ Accessible

---

### STG-328 — ForceUpdateScreen — "unknown" version display lacks explanation

- **Status**: PARKED — verified in reiteration, tag `stg-328-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [ForceUpdateScreen.tsx:68-69](src/screens/ForceUpdateScreen.tsx#L68)
- **Scope**: `src/screens/ForceUpdateScreen.tsx`
- **Problem**: If version detection fails, shows "unknown". Users don't understand why or what to do.
- **Fix**: When version is "unknown", show "Cannot detect app version. Please restart the app or update manually."
- **Migration**: None
- **Test**: "unknown" replaced with helpful message
- **Depends on**: None
#### Execution Scope
- **Files**: `src/screens/ForceUpdateScreen.tsx`, `src/i18n/locales/en.json`
- **Changes**: Add conditional display at lines 68-69 and 305-306.
- **Guard**: Do NOT change version detection.
- **DoD**: ☐ No raw "unknown" shown ☐ Helpful fallback message

---

### STG-329 — ProductDetailModal — "No suppliers available" lacks actionable guidance

- **Status**: PARKED — verified in reiteration, tag `stg-329-2026-03-14`
- **Priority**: P1
- **Source**: UI audit — [ProductDetailModal.tsx:265-273](src/components/buy/ProductDetailModal.tsx#L265)
- **Scope**: `src/components/buy/ProductDetailModal.tsx`
- **Problem**: "No suppliers available" shown with icon but no next step. User doesn't know why or what to do.
- **Fix**: Add text: "No suppliers linked to this product yet. Contact SuperMandi support for help."
- **Migration**: None
- **Test**: Actionable guidance shown in empty state
- **Depends on**: None
#### Execution Scope
- **Files**: `src/components/buy/ProductDetailModal.tsx`, `src/i18n/locales/en.json`
- **Changes**: Update empty state at lines 265-273 with guidance text.
- **Guard**: Do NOT change supplier loading logic.
- **DoD**: ☐ Helpful empty state ☐ Hindi translation

---

### STG-330 — DismissReasonModal — predefined reasons store English values to backend

- **Status**: PARKED — verified in reiteration, tag `stg-330-2026-03-14`
- **Priority**: P2
- **Source**: UI audit — [DismissReasonModal.tsx:39-46](src/components/reorder/DismissReasonModal.tsx#L39)
- **Scope**: `src/components/reorder/DismissReasonModal.tsx`
- **Problem**: PREDEFINED_REASONS uses i18n keys for display but sends hardcoded English values (e.g., "Not needed at this time") to backend. If multilingual support is needed, backend receives English regardless of UI language.
- **Fix**: Store language-agnostic reason IDs (e.g., "NOT_NEEDED", "OVERSTOCKED") and send those to backend. Display i18n text in UI.
- **Migration**: None (backend already stores strings)
- **Test**: Backend receives reason IDs, UI shows translated text
- **Depends on**: None
#### Execution Scope
- **Files**: `src/components/reorder/DismissReasonModal.tsx`
- **Changes**: Change value field at lines 39-46 from English strings to enum IDs. Keep i18n keys for display.
- **Guard**: Verify backend accepts new IDs or add backward compatibility.
- **DoD**: ☐ Language-agnostic reason IDs ☐ Display text from i18n

---

## SELL & PURCHASE Deep Audit (STG-331 — STG-411)

> **Source**: Deep functional + UX audit of SELL and PURCHASE screens (2026-03-13)
> **Scope**: 18 audit areas — search, scan, categories, cart, payment, voice, stock, sync, offline, devices
> **Rule**: Do NOT implement until operator approves full ticket list

---

### — AREA 1: Search Bar Logic (SELL Screen) —

---

### STG-331 — SELL — Remove separate manual barcode field, unify into main search bar

- **Status**: PARKED — verified in reiteration, tag `stg-331-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 1 — [SellScanScreen.tsx:2709-2858](src/screens/SellScanScreen.tsx#L2709-L2858)
- **Problem**: Two separate input fields exist: (1) primary search bar at lines 2724-2763, and (2) manual barcode entry at lines 2823-2857, visible only when search bar is collapsed. This creates navigation friction — cashiers scanning via HID cannot access manual fallback without collapsing search first.
- **Impact**: Breaks "always accessible fallback" principle. Cashiers can't simultaneously see search results and manual barcode entry.
- **Fix**: Remove the separate manual barcode field. Integrate barcode entry directly into the main search bar. Update placeholder to "Scan or search products". Search bar should accept: barcode input, product name, SKU.
- **Migration**: None
- **Test**: Single unified input accepts both barcode (numeric) and text search; no separate barcode field visible
- **Depends on**: None

---

### STG-332 — SELL — Search bar placeholder doesn't indicate barcode input support

- **Status**: PARKED — verified in reiteration, tag `stg-332-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 1 — [SellScanScreen.tsx:2724](src/screens/SellScanScreen.tsx#L2724)
- **Problem**: Placeholder says "Search products..." but search bar accepts barcodes (via regex `/^\d{8,}$/` at line 1737). No visual hint that barcode entry is supported.
- **Impact**: Retailers using HID scanners don't realize search bar accepts scan output. They use the separate manual field (slower).
- **Fix**: Change placeholder to `t('sell.searchOrScan', 'Scan barcode or search products')`. Add small barcode icon inside input.
- **Migration**: None
- **Test**: Placeholder mentions barcode; icon visible
- **Depends on**: STG-331

---

### STG-333 — SELL — 300ms debounce delays barcode resolution unnecessarily

- **Status**: PARKED — verified in reiteration, tag `stg-333-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 1 — [SellScanScreen.tsx:1942-1957](src/screens/SellScanScreen.tsx#L1942)
- **Problem**: Search debounce of 300ms applies equally to text search and barcode input. HID scanners emit complete barcodes instantly, but results display is delayed by 300ms after full barcode is entered.
- **Impact**: Perceived lag on barcode-heavy workflows. On budget Android, feels like a freeze.
- **Fix**: Skip debounce for barcode-like input (matches `/^\d{8,}$/`). Process immediately. Keep 300ms debounce for text search only.
- **Migration**: None
- **Test**: Barcode input resolves in <50ms; text search still debounced
- **Depends on**: None

---

### — AREA 2: Product Scan Logic (SELL Screen) —

---

### STG-334 — SELL — Barcode heuristic `/^\d{8,}$/` too broad, matches phone numbers

- **Status**: PARKED — verified in reiteration, tag `stg-334-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 2 — [SellScanScreen.tsx:1737](src/screens/SellScanScreen.tsx#L1737)
- **Problem**: Regex `/^\d{8,}$/` matches any 8+ digit number including phone numbers (10 digits), order IDs, timestamps. A cashier entering "9876543210" (phone number) gets routed to barcode handler instead of text search.
- **Impact**: False-positive barcode routing. Confusing error messages ("Product not found") for non-barcode inputs.
- **Fix**: Use stricter validation: EAN-13 (13 digits), UPC-A (12 digits), or 8-14 digits with check digit validation. Also use `source` hint from HID scanner service to distinguish keyboard vs scanner input.
- **Migration**: None
- **Test**: 10-digit phone number triggers text search, not barcode lookup; valid EAN-13 triggers barcode lookup
- **Depends on**: None

---

### STG-335 — SELL — Duplicate scan 2000ms window too strict for same-item multiples

- **Status**: PARKED — verified in reiteration, tag `stg-335-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 2 — [handleScan.ts:69, 114-122](src/services/scan/handleScan.ts#L69)
- **Problem**: `DUPLICATE_WINDOW_MS = 2000` rejects re-scans of same barcode within 2 seconds. For kirana cashiers scanning same item multiple times (customer buying 3 milks), they must wait 2+ seconds between scans. No user feedback when scan is silently rejected.
- **Impact**: Workflow friction for same-item multiples. Cashiers default to slower manual quantity entry.
- **Fix**: Reduce to 800-1000ms. Show toast when duplicate scan is rejected: "Item already scanned — use +/- to adjust quantity". Make configurable per store.
- **Migration**: None
- **Test**: Same barcode scanned at 1.2s interval is accepted; at 0.5s is rejected with toast
- **Depends on**: None

---

### STG-336 — SELL — Scan storm detection per-barcode limit (8 in 2s) with no user feedback

- **Status**: PARKED — verified in reiteration, tag `stg-336-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 2 — [handleScan.ts:74-76, 124-164](src/services/scan/handleScan.ts#L74)
- **Problem**: Storm protection: 8 scans of same barcode in 2000ms triggers 1000ms cooldown. No visibility into storm state — cashier sees "scan_storm" warning but doesn't know which barcode triggered it or cooldown duration.
- **Impact**: Artificial ceiling on scanning speed. No feedback on why scanner appears frozen.
- **Fix**: Show toast with cooldown countdown: "Scanner paused for 1s — too many rapid scans". Increase limit to 12 scans in 2s for high-volume stores.
- **Migration**: None
- **Test**: Storm toast visible with countdown; scanner resumes after cooldown
- **Depends on**: None

---

### STG-337 — SELL — Intermediate barcode prefixes trigger search results flicker

- **Status**: PARKED — verified in reiteration, tag `stg-337-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 2/11 — [SellScanScreen.tsx:1645-1660](src/screens/SellScanScreen.tsx#L1645)
- **Problem**: As HID scanner sends barcode character-by-character, each intermediate value (e.g., "890", "8901") triggers search debounce. Partial matches flash on screen before full barcode resolves.
- **Impact**: Visual flicker/jitter in search results during HID scanning. Confusing on slow devices.
- **Fix**: Suppress search results while HID scan is in progress (detect via `feedHidKey` state). Show "Scanning..." placeholder until barcode is complete.
- **Migration**: None
- **Test**: No partial search results during HID barcode entry; "Scanning..." shown instead
- **Depends on**: STG-333

---

### — AREA 3: Scan State Handling —

---

### STG-338 — SELL — Unknown barcode modal lacks clear field guidance

- **Status**: PARKED — verified in reiteration, tag `stg-338-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 3 — [SellScanScreen.tsx:3596-3708](src/screens/SellScanScreen.tsx#L3596)
- **Problem**: When unknown barcode is scanned, "New product" modal shows 4 fields (name, sell price, purchase price, opening stock) with minimal guidance. "Purchase price" says "(optional)" without explaining why it matters. "Opening stock" has tooltip "Creates ledger entry if greater than 0" — too technical for cashiers.
- **Impact**: Onboarding friction. Cashiers may skip opening stock (creating stock parity issues) or be confused about price fields.
- **Fix**: Add icons/tooltips: "Selling Price = what your customer pays", "Purchase Price = what you paid (optional, for profit tracking)", "Opening Stock = how many you have on shelf (leave 0 to add later)".
- **Migration**: None
- **Test**: Each field has visible help text; tooltips show on tap
- **Depends on**: None

---

### STG-339 — SELL — LOOSE_BULK variant picker gated by multiple checks, may never trigger

- **Status**: PARKED — verified in reiteration, tag `stg-339-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 3 — [handleScan.ts:475-485](src/services/scan/handleScan.ts#L475)
- **Problem**: Variant picker for LOOSE_BULK products requires ALL of: product_mode='LOOSE_BULK', store_product_id exists, runtime.onVariantPicker set, !variantPickerActive. If store_product_id is null (globally registered but not in-store), variant picker is skipped entirely.
- **Impact**: Loose/bulk products (dal, rice) sold without weight variant selection. Stock shows "1 unit" instead of "500g". Inventory tracking breaks for weight-based products.
- **Fix**: Make variant picker mandatory for LOOSE_BULK regardless of store_product_id. Add fallback manual weight entry if product not registered locally.
- **Migration**: None
- **Test**: All LOOSE_BULK scans show variant picker; manual weight entry if no store_product_id
- **Depends on**: None

---

### STG-340 — SELL — Price error silently blocks checkout with no feedback

- **Status**: PARKED — verified in reiteration, tag `stg-340-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 3 — [SellScanScreen.tsx:1341-1343, 758-765](src/screens/SellScanScreen.tsx#L1341)
- **Problem**: Items with `priceResolutionError=true` and `priceMinor=0` disable the checkout button silently. No error toast, no highlighting of which item needs attention. Cashier sees disabled button and assumes app is frozen.
- **Impact**: Checkout UX breaks silently. Cashier must manually scan cart to find the problematic item. Slow and frustrating.
- **Fix**: When checkout is blocked: show toast "Item '[name]' needs a price — tap to edit". Add quick-edit shortcut from checkout button. Highlight problem item in cart with pulsing animation.
- **Migration**: None
- **Test**: Checkout blocked → toast identifies problematic item; tapping toast scrolls to item
- **Depends on**: None

---

### — AREA 4: Automatic Category Formation —

---

### STG-341 — SELL — DEMO_CATEGORIES hardcoded, no dynamic loading from store products

- **Status**: PARKED — verified in reiteration, tag `stg-341-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 4 — [CategoryRail.tsx:67-83](src/components/sell/CategoryRail.tsx#L67)
- **Problem**: 15 hardcoded demo categories as fallback. Feature flag `category_browsing` gates the entire category rail. Stores without the flag see no categories at all. Categories don't reflect actual product mix in the store.
- **Impact**: Retailers without feature flag cannot filter by category. Categories show empty categories with zero products.
- **Fix**: Always show category rail (remove feature flag gate). Filter out categories with zero products. Show product count badge per category.
- **Migration**: None
- **Test**: Category rail visible for all stores; empty categories hidden; count badges shown
- **Depends on**: None

---

### STG-342 — SELL — Category selection does NOT filter displayed products

- **Status**: PARKED — verified in reiteration, tag `stg-342-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 4 — [SellScanScreen.tsx:2803-2809](src/screens/SellScanScreen.tsx#L2803)
- **Problem**: When a category is selected (`selectedCategory` state), the product grid continues showing ALL products. No filtering is applied to the FlatList. Category tap has zero effect on displayed products.
- **Impact**: Feature feels broken. Defeats the entire purpose of the category rail.
- **Fix**: When `selectedCategory` changes, filter `catalogItems` to only products in that category. Fetch category products via API or filter locally. Show loading spinner while filtering.
- **Migration**: None
- **Test**: Selecting "Atta-Dal" shows only Atta-Dal products; selecting "All" shows everything
- **Depends on**: STG-341

---

### — AREA 5: Search Bar Logic (PURCHASE Screen) —

---

### STG-343 — PURCHASE — BuyScreen search bar missing barcode lookup capability

- **Status**: PARKED — verified in reiteration, tag `stg-343-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 5 — [BuyScreen.tsx:476-505](src/screens/BuyScreen.tsx#L476)
- **Problem**: BuyScreen search is purely text-based (product name). No barcode scanning or barcode lookup. PurchaseScreen has `buyBarcodeSearch` but BuyScreen does not. Inconsistent UX between two purchase interfaces.
- **Impact**: Retailers cannot scan barcode on BUY screen grid view. Must type product name or switch to PurchaseScreen.
- **Fix**: Integrate `buyBarcodeSearch` into BuyScreen. When barcode scanned: lookup in supplier catalog → open ProductDetailModal. Add barcode icon to search bar.
- **Migration**: None
- **Test**: Scanning barcode on BuyScreen opens product detail; text search still works
- **Depends on**: None

---

### STG-344 — PURCHASE — Search debounce 400ms creates perceived slowness

- **Status**: PARKED — verified in reiteration, tag `stg-344-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 5 — [BuyScreen.tsx:64](src/screens/BuyScreen.tsx#L64)
- **Problem**: `SEARCH_DEBOUNCE_MS = 400` plus API call time means total response can exceed 1 second on 2G/3G networks.
- **Impact**: Search feels sluggish for fast typers. No search-as-you-type feel.
- **Fix**: Reduce to 250-300ms. Implement request cancellation (abort previous request when new one fires).
- **Migration**: None
- **Test**: Search results appear noticeably faster after typing stops
- **Depends on**: None

---

### STG-345 — PURCHASE — No search autocomplete/suggestions before full results

- **Status**: PARKED — verified in reiteration, tag `stg-345-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 5 — [BuyScreen.tsx:476-505](src/screens/BuyScreen.tsx#L476)
- **Problem**: No autocomplete dropdown, no real-time suggestions, no "did you mean" alternatives. User must wait for full page reload after typing.
- **Impact**: Users unsure if product exists before waiting for results. Longer product discovery time.
- **Fix**: Implement search suggestions: show top 3-5 matching products in dropdown as user types, including name, price, stock status.
- **Migration**: None
- **Test**: Autocomplete dropdown appears after 2 characters; shows product name + price
- **Depends on**: None

---

### STG-346 — PURCHASE — Stock filter applied client-side, causes pagination issues

- **Status**: PARKED — verified in reiteration, tag `stg-346-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 5/6 — [BuyScreen.tsx:371-377](src/screens/BuyScreen.tsx#L371)
- **Problem**: Stock status filter (in_stock, low_stock, out_of_stock) is applied client-side AFTER API returns all products. Pagination shows "no more products" but more in-stock products may exist on next page.
- **Impact**: Inconsistent pagination. Users see page of out-of-stock products they can't order.
- **Fix**: Move stock filter to API layer. Add `stockStatus` param to `getBuyCatalog` call.
- **Migration**: None
- **Test**: Stock filter applied server-side; pagination correct for filtered results
- **Depends on**: None

---

### — AREA 6: Quick On-Counter Purchase Workflow —

---

### STG-347 — PURCHASE — Quick purchase mode adds items with empty metadata

- **Status**: PARKED — verified in reiteration, tag `stg-347-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 6 — [PurchaseScreen.tsx:65-72, 287-309](src/screens/PurchaseScreen.tsx#L65)
- **Problem**: Quick purchase adds items with `productName: ""`, `buyPrice: 0`, `sellPrice: 0`. Retailer must manually enter everything. No automatic lookup from supplier catalog.
- **Impact**: "Quick purchase" isn't quick — defeats FMCG quick-scan workflow. Error-prone manual entry.
- **Fix**: When barcode added: lookup in supplier catalog, pre-fill productName and buyPrice from best supplier. Allow override for manual entry.
- **Migration**: None
- **Test**: Quick purchase barcode scan auto-fills product name and price from catalog
- **Depends on**: None

---

### STG-348 — PURCHASE — No barcode lookup loading state in PurchaseScreen

- **Status**: PARKED — verified in reiteration, tag `stg-348-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 6 — [PurchaseScreen.tsx:232-284](src/screens/PurchaseScreen.tsx#L232)
- **Problem**: Barcode lookup can take 2-3s. `setScanResolving` is set but not displayed in UI. No loading indicator visible during lookup.
- **Impact**: Retailer thinks scan failed. May rescan, causing confusion.
- **Fix**: Show loading indicator while barcode lookup in progress: "Searching supplier catalog..."
- **Migration**: None
- **Test**: Loading spinner visible during barcode lookup; disappears on result
- **Depends on**: None

---

### — AREA 7: Product Search Enrichment —

---

### STG-349 — SELL — Search results missing brand, image, pack size vs grid tiles

- **Status**: PARKED — verified in reiteration, tag `stg-349-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 7 — [SellScanScreen.tsx:2597-2659](src/screens/SellScanScreen.tsx#L2597)
- **Problem**: Search panel `renderAddRow` (lines 2597-2659) shows only: product name, barcode, price, stock status. The grid SellTile component (lines 113-284) DOES show image, brand, pack size, mode badge, expiry — but the search results list uses a simpler row layout that lacks these fields.
- **Impact**: Multi-variant products (Flour 500g vs 1kg) only distinguishable by barcode in search. Harder to scan results quickly vs grid.
- **Fix**: In `renderAddRow` (SellScanScreen.tsx:2597-2659), add: (1) `ProductImage` component at 32x32 before name, (2) brand text below name in 11px secondary color, (3) pack size/unit after brand (e.g., "500g"). Data is already in the SkuItem type — just not rendered in search results. Do NOT reuse SellTile (too tall for list rows).
- **Migration**: None
- **Test**: Search results show product image, brand, and pack size
- **Depends on**: None

---

### STG-350 — SELL — Autocomplete dropdown shows only name+barcode, too minimal

- **Status**: PARKED — verified in reiteration, tag `stg-350-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [SellScanScreen.tsx:2860-2880](src/screens/SellScanScreen.tsx#L2860)
- **Problem**: Autocomplete suggestions show only product name and barcode (gray, small). No image, price, stock. Max 5 suggestions.
- **Impact**: High error rate — tapping wrong product by name alone for similar products.
- **Fix**: In `renderItem` at SellScanScreen.tsx:2866-2876: (1) Add `ProductImage` 24x24 before `autocompleteName`, (2) Add price on right side using `item.price` from `autocompleteSuggestions` data, (3) Add stock badge (green/amber/red) based on `item.stock`, (4) Highlight matching substring in product name using `<Text style={{fontWeight:'bold'}}>` for the matching portion, (5) Increase max from 5 to 7 suggestions (line 3154: change `.slice(0,5)` to `.slice(0,7)`).
- **Migration**: None
- **Test**: Autocomplete shows image + price + stock; matching text highlighted
- **Depends on**: None

---

### STG-351 — PURCHASE — Supplier name not visible in grid card, only in small text

- **Status**: PARKED — verified in reiteration, tag `stg-351-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [CatalogProductCard.tsx:201-205](src/components/buy/CatalogProductCard.tsx#L201)
- **Problem**: Supplier name shown at bottom of card in 11px tertiary text. Multiple suppliers selling same product at different prices are indistinguishable without clicking each.
- **Impact**: Can't do quick price comparison in grid view. Slower purchase workflow.
- **Fix**: Make supplier name prominent (2nd line after product name, 13px). Show best price clearly.
- **Migration**: None
- **Test**: Supplier name clearly visible in card without clicking
- **Depends on**: None

---

### STG-352 — PURCHASE — MOV (Minimum Order Value) not shown anywhere before checkout

- **Status**: PARKED — verified in reiteration, tag `stg-352-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 8 — [CatalogProductCard.tsx, ProductDetailModal.tsx, SupplierRow.tsx](src/components/buy/)
- **Problem**: Minimum Order Value from `supplier_store_links.min_order_value` is NOT displayed in grid card, product detail modal, or supplier row. Only validated at cart checkout (SupplierCartSection line 60). Retailers discover MOV requirement after building entire cart.
- **Impact**: Major checkout friction. Retailers frustrated they wasted time. Must add more items to meet MOV.
- **Fix**: Show MOV in CatalogProductCard ("Min Order: ₹5000"), ProductDetailModal per supplier, and SupplierRow header.
- **Migration**: None
- **Test**: MOV visible in card, detail modal, and supplier row when > 0
- **Depends on**: None

---

### STG-353 — PURCHASE — MOQ shown only when > 1 and in small 11px font

- **Status**: PARKED — verified in reiteration, tag `stg-353-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [CatalogProductCard.tsx:107-108, 341](src/components/buy/CatalogProductCard.tsx#L107)
- **Problem**: MOQ only shown when > 1, in 11px font. For products with MOQ=10+ (common in FMCG wholesale), not prominent enough.
- **Impact**: Retailers don't know MOQ before adding to cart. Discover violations at payment.
- **Fix**: Always show MOQ (even if 1). Increase to 12-13px. Highlight high MOQs (>5) with warning badge.
- **Migration**: None
- **Test**: MOQ always visible; high MOQ highlighted
- **Depends on**: None

---

### STG-354 — PURCHASE — "Cost" price label ambiguous, should be "Buy Price"

- **Status**: PARKED — verified in reiteration, tag `stg-354-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [CatalogProductCard.tsx:169-171](src/components/buy/CatalogProductCard.tsx#L169)
- **Problem**: Price label says "Cost ₹XX/pack" — ambiguous for Indian retailers. Could mean wholesale cost, item cost, or COGS.
- **Impact**: Confusion about what price they're paying.
- **Fix**: Change "Cost" to "Buy Price" or "Purchase Price".
- **Migration**: None
- **Test**: Label says "Buy Price" not "Cost"
- **Depends on**: None

---

### STG-355 — PURCHASE — No variant/pack size shown when metadata missing

- **Status**: PARKED — verified in reiteration, tag `stg-355-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [CatalogProductCard.tsx:37-48](src/components/buy/CatalogProductCard.tsx#L37)
- **Problem**: Pack size only shown if `netContentValue` and `netContentUnit` exist. For incomplete metadata, card shows only name+price. Two SKUs of same product may look identical.
- **Impact**: Wrong pack sizes ordered (500g vs 5kg indistinguishable).
- **Fix**: Fallback to `packSize` or `product.unit`. Always display something: "500g" or "5 Pack" or "Bulk".
- **Migration**: None
- **Test**: Every product card shows some pack/unit info even with incomplete metadata
- **Depends on**: None

---

### — AREA 8: SKU Metadata Visibility —

---

### STG-356 — SELL — SellTile brand truncates when pack size present on narrow screens

- **Status**: PARKED — verified in reiteration, tag `stg-356-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 8 — [SellTile.tsx:198-229](src/components/sell/SellTile.tsx#L198)
- **Problem**: Brand, mode badge, and pack size render in single `metaRow` with `flexWrap`. Long brand names (e.g., "Hindustan Unilever Beverages") get truncated on 360px screens.
- **Impact**: Brand identity lost on small screens. Hard to parse meta row.
- **Fix**: Use `numberOfLines={1}` on brand with ellipsis. Prioritize: brand > mode > pack size (hide pack size if space tight).
- **Migration**: None
- **Test**: Brand visible with ellipsis on 360px screen; no wrapping issues
- **Depends on**: None

---

### STG-357 — SELL — Expiry badge overlaps with stock on small screens

- **Status**: PARKED — verified in reiteration, tag `stg-357-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 8 — [SellTile.tsx:160-176, 252-267](src/components/sell/SellTile.tsx#L160)
- **Problem**: Stock status + expiry warning both render in `bottomLeft`. Two tall lines cause inconsistent tile heights (160px vs 200px).
- **Impact**: Visual noise — hard to scan many tiles quickly. Tile height inconsistency breaks grid layout.
- **Fix**: Combine into single line: "Stock: 10 | Exp: 15-Mar (14d)" for items near expiry. Collapse to icon + tooltip on long-press for others.
- **Migration**: None
- **Test**: Consistent tile heights; combined stock+expiry line
- **Depends on**: None

---

### STG-358 — PURCHASE — No supplier comparison table in ProductDetailModal

- **Status**: PARKED — verified in reiteration, tag `stg-358-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 8 — [ProductDetailModal.tsx:253-289](src/components/buy/ProductDetailModal.tsx#L253)
- **Problem**: Multiple suppliers shown individually in expandable rows. No price/MOQ/MOV comparison summary. Must expand each supplier to compare.
- **Impact**: Slow supplier selection. Retailers miss better deals.
- **Fix**: In ProductDetailModal.tsx before the SupplierRow list (line ~253): (1) Add a "Quick Compare" card when suppliers.length > 1, showing a 2-column mini-table: Supplier | Price | MOQ | Stock. (2) Sort by price ascending. (3) Highlight cheapest with green badge. (4) Include MOV column if any supplier has min_order_value set. Data available: `supplierName`, `purchasePrice`, `mrp`, `stockStatus`, `stockQuantity`, `moq`, `maxQty` from CatalogSupplier type. Component: simple `<View>` table with flexDirection rows, not a full DataTable.
- **Migration**: None
- **Test**: Comparison summary visible when multiple suppliers exist
- **Depends on**: STG-352

---

### STG-359 — PURCHASE — No expiry date/batch info visible for incoming products

- **Status**: PARKED — verified in reiteration, tag `stg-359-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 8 — all purchase components
- **Problem**: No product expiry date, batch number, or manufacturing date visible anywhere in purchase flow. Critical for FMCG/grocery.
- **Impact**: Can't verify freshness of incoming stock. Compliance/audit trail missing.
- **Fix**: If backend provides expiry_date and batch fields, display in ProductDetailModal and cart items.
- **Migration**: None
- **Test**: Expiry and batch info visible when available
- **Depends on**: None

---

### — AREA 9: Voice Module —

---

### STG-360 — VOICE — No confirmation before auto-executing voice commands

- **Status**: PARKED — verified in reiteration, tag `stg-360-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 9 — [voiceClient.ts:435-439](src/services/voice/voiceClient.ts#L435)
- **Problem**: When voice interpretation succeeds, `executeVoiceAction` is called with `confirmed=true` automatically. No UI confirmation modal. If LLM misunderstands "2kg rice" as "2 units MILK" (high confidence), wrong product added silently.
- **Impact**: Cart corruption. Risk of accidental bulk adds from voice mishearing. No undo.
- **Fix**: Check `result.requiresConfirmation`; if true, show modal with candidates before executing. Always show "Did you mean: [product]?" for first-time voice users.
- **Migration**: None
- **Test**: Voice add shows confirmation modal before cart add; cancel available
- **Depends on**: None

---

### STG-361 — VOICE — Product search stub not implemented, all lookups fail

- **Status**: PARKED — verified in reiteration, tag `stg-361-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 9 — [voiceOrderService.ts:431-457](backend/src/services/ai/voiceOrderService.ts#L431), [voice.ts:74-79](backend/src/routes/v1/pos/voice.ts#L74)
- **Problem**: `resolveProducts()` calls `searchProducts()` which is registered as empty stub returning `[]`. Every non-exact product name triggers NEEDS_CLARIFICATION. No fuzzy match against store catalog.
- **Impact**: Voice advantage completely lost. Every command → clarification loop → manual search anyway.
- **Fix**: Implement `registerProductSearch` in voice.ts to query store-products/search endpoint. Return top 3 candidates. Show picker in POS app.
- **Migration**: None
- **Test**: Voice "add rice" matches products in store catalog; candidate picker shown
- **Depends on**: None

---

### STG-362 — VOICE — Locale toggle (EN/HI) not wired to backend STT

- **Status**: PARKED — verified in reiteration, tag `stg-362-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 9 — [VoiceSheet.tsx:134-173](src/components/voice/VoiceSheet.tsx#L134), [openaiProvider.ts:438](backend/src/services/ai/openaiProvider.ts#L438)
- **Problem**: VoiceSheet renders EN/HI toggle but locale is only used in UI state. Backend always transcribes with `language="hi"` (hardcoded). English speech → Hindi STT model = degraded accuracy.
- **Impact**: Selecting English in UI has no effect. English voice commands fail silently.
- **Fix**: Pass voiceLocale from SellScanScreen → interpretVoice → OpenAI speechToText with correct language code.
- **Migration**: None
- **Test**: Switching to EN in voice sheet causes English STT; Hindi command in EN mode shows warning
- **Depends on**: None

---

### STG-363 — VOICE — NEEDS_CLARIFICATION flag returned but never shown as picker

- **Status**: PARKED — verified in reiteration, tag `stg-363-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 9 — [SellScanScreen.tsx:3024-3030](src/screens/SellScanScreen.tsx#L3024)
- **Problem**: When backend returns `requiresConfirmation` with candidates, POS shows error state. No interactive candidate picker. Retailer must dismiss and retry with more specific name.
- **Impact**: Ambiguous matches require manual re-entry. Multiple re-records = frustration.
- **Fix**: If `result.requiresConfirmation && result.intent?.candidates`, render modal with candidate buttons. Tap to select, then execute.
- **Migration**: None
- **Test**: Ambiguous voice result shows 3 candidate buttons; tapping one adds to cart
- **Depends on**: STG-361

---

### STG-364 — VOICE — No visual confidence score or product match feedback

- **Status**: PARKED — verified in reiteration, tag `stg-364-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 9 — [VoiceSheet.tsx:187-192](src/components/voice/VoiceSheet.tsx#L187)
- **Problem**: Success state shows only "Done!" without showing WHICH product was matched or confidence score. Retailer can't verify correctness.
- **Impact**: Reduces confidence in voice feature. Cart quality unknown.
- **Fix**: Show matched product name + confidence: "Added 2 kg Rice (92% match)".
- **Migration**: None
- **Test**: Success state shows product name and match percentage
- **Depends on**: None

---

### STG-365 — VOICE — No mic permission guidance when denied

- **Status**: PARKED — verified in reiteration, tag `stg-365-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 9 — [SellScanScreen.tsx:2985-2987](src/screens/SellScanScreen.tsx#L2985)
- **Problem**: When mic permission denied, generic toast: "Microphone permission required". No guidance on how to enable it (Settings → App → Permissions). `openAppSettings()` exists but isn't called.
- **Impact**: First-time retailer denies permission, can't figure out how to re-enable. Voice feature appears broken.
- **Fix**: Show detailed alert with "Open Settings" button that launches app permissions screen.
- **Migration**: None
- **Test**: Permission denied → alert with "Open Settings" button that navigates to system settings
- **Depends on**: None

---

### STG-366 — VOICE — No timeout on slow API, app hangs indefinitely

- **Status**: PARKED — verified in reiteration, tag `stg-366-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 9 — [voiceClient.ts:269-320](src/services/voice/voiceClient.ts#L269)
- **Problem**: `interpretVoice()` makes fetch with no explicit timeout. If OpenAI API is slow/hangs, POS waits indefinitely showing "Processing...".
- **Impact**: Retailer stuck watching indefinite spinner. Must force-close app.
- **Fix**: Add 30-second fetch timeout. Show error "Voice service taking too long. Please try again." with retry button.
- **Migration**: None
- **Test**: Slow API → timeout error shown after 30s; retry button works
- **Depends on**: None

---

### STG-367 — VOICE — Prompt injection vulnerability (regex-only mitigation)

- **Status**: PARKED — verified in reiteration, tag `stg-367-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 9 — [voiceOrderService.ts:283-311](backend/src/services/ai/voiceOrderService.ts#L283)
- **Problem**: Sanitization uses regex pattern matching which can be bypassed (unicode homoglyphs, leetspeak). Confidence set to 0.0 on detection, but if detection fails, LLM could be compromised.
- **Impact**: Malicious voice commands could execute unauthorized actions (e.g., "set price to 1 rupee").
- **Fix**: Use OpenAI function calling with strict JSON schema (no open-ended LLM instructions). Add tokenization-based injection detection beyond regex.
- **Migration**: None
- **Test**: Injection attempt "ignore previous instructions" → blocked with 0.0 confidence; function-call schema enforced
- **Depends on**: None

---

### — AREA 10: Tap-to-Add Cart Flow —

---

### STG-368 — SELL — No immediate visual feedback on product tile tap (50-200ms lag)

- **Status**: PARKED — verified in reiteration, tag `stg-368-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 10 — [SellScanScreen.tsx:2505-2544](src/screens/SellScanScreen.tsx#L2505)
- **Problem**: Tapping a product tile fires `handleAddSku` but no animation on the tile itself. No haptic feedback. Cart bar flash at bottom is 260ms and too far from tap location.
- **Impact**: On slow devices, tap feels unresponsive. Retailer taps again → duplicate item.
- **Fix**: Add scale animation (0.98) on `onPressIn`. Add opacity pulse (0.7→1) on success. Trigger `Haptics.impact()`. Show "+1" badge near tap location.
- **Migration**: None
- **Test**: Tile animates on tap; haptic fires; +1 badge visible near product
- **Depends on**: None

---

### STG-369 — SELL — VariantPickerModal lacks images, stock, and price context

- **Status**: PARKED — verified in reiteration, tag `stg-369-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 10 — [VariantPickerModal.tsx:103-118, 249-257](src/components/sell/VariantPickerModal.tsx#L103)
- **Problem**: Variant cards show only: variant label, quantity+unit, price. Missing: product image, stock level per variant, MRP/discount, "best value" indicator.
- **Impact**: Retailers can't visually distinguish variants. No stock visibility per variant. Slow checkout for loose goods.
- **Fix**: Add product image, stock per variant, unit price calc ("₹30/100g"), and "Most Popular" badge on top-selling variant.
- **Migration**: None
- **Test**: Variant cards show image + stock + unit price; popular badge visible
- **Depends on**: None

---

### STG-370 — SELL — Cart add persistence not awaited, silent data loss on crash

- **Status**: PARKED — verified in reiteration, tag `stg-370-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 10 — [SellScanScreen.tsx:2431-2489](src/screens/SellScanScreen.tsx#L2431)
- **Problem**: `cartState.addItem({...})` is fire-and-forget. No error handling for AsyncStorage write failure. If storage is corrupted or full, item disappears silently. On next restart, cart is empty.
- **Impact**: Silent data loss. Retailer adds items, app crashes, items vanish.
- **Fix**: Await `cartState.addItem`. Wrap in try-catch; show toast on failure: "Failed to add item. Retry?"
- **Migration**: None
- **Test**: Storage failure → error toast shown; retry option available
- **Depends on**: None

---

### — AREA 11: HID Scanner Integration —

---

### STG-371 — HID — Scanner timing parameters hardcoded, no calibration for budget hardware

- **Status**: PARKED — verified in reiteration, tag `stg-371-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 11 — [hidScannerService.ts:6-11](src/services/hidScannerService.ts#L6)
- **Problem**: `HID_MAX_INTERVAL_MS=80`, `HID_MAX_DURATION_MS=1200`, `HID_IDLE_TIMEOUT_MS=120` are hardcoded. Budget/slow HID scanners with USB lag (150ms per char) fail validation silently.
- **Impact**: Legitimate scans rejected on budget hardware. Cashier assumes product doesn't exist instead of re-scanning.
- **Fix**: Increase `HID_MAX_INTERVAL_MS` to 150-200ms for compatibility. Make configurable via store settings. Show feedback when scan rejected due to timing: "Barcode read too slowly — re-scan or enter manually".
- **Migration**: None
- **Test**: Slow HID scanner (150ms interval) accepted; timing-rejected scan shows helpful error
- **Depends on**: None

---

### STG-372 — HID — Buffer not reset on SellScanScreen mount/unmount

- **Status**: PARKED — verified in reiteration, tag `stg-372-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 11 — [SellScanScreen.tsx](src/screens/SellScanScreen.tsx), [hidScannerService.ts:67-73](src/services/hidScannerService.ts#L67)
- **Problem**: `resetHidTracking()` is never called from SellScanScreen on mount/unmount. HID state (buffer, lastValue) persists across navigations.
- **Impact**: Low risk currently (resets on length change/idle) but code smell. Future HID changes could break.
- **Fix**: Add `useEffect(() => { resetHidTracking(); return () => { resetHidTracking(); }; }, [])` on SellScanScreen mount.
- **Migration**: None
- **Test**: HID state clean on screen navigation; no carry-over from previous screen
- **Depends on**: None

---

### — AREA 12: Sell Cart Workflow —

---

### STG-373 — SELL — Cart sheet covers 55-75% of screen, too much on small devices

- **Status**: PARKED — verified in reiteration, tag `stg-373-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 12 — [SellScanScreen.tsx:290-296](src/screens/SellScanScreen.tsx#L290)
- **Problem**: Cart sheet collapsed ratio: 55% (normal), 75% (small screens ≤400x750). On handheld POS (Sunmi V2, 400px), only ~188px left for product grid.
- **Impact**: Retailers can barely browse products while cart is visible on small devices.
- **Fix**: Reduce `CART_SHEET_COLLAPSED_RATIO_SMALL` from 0.75 to 0.60-0.65. Preserve at least 300px for product browsing.
- **Migration**: None
- **Test**: On 400px device, product grid visible with ≥250px while cart is collapsed
- **Depends on**: None

---

### STG-374 — SELL — No cart item limit enforced, performance degrades with 100+ items

- **Status**: PARKED — verified in reiteration, tag `stg-374-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 12 — [cartStore.ts:289-354](src/stores/cartStore.ts#L289)
- **Problem**: No maximum item limit. 500+ unique items cause FlatList rendering and AsyncStorage deserialization delays.
- **Impact**: Performance degradation on budget devices. No guidance to complete sale before adding more.
- **Fix**: Enforce max 100 unique cart items. Show: "Cart is full (100 items). Complete this sale before adding more."
- **Migration**: None
- **Test**: 101st item → error toast; max 100 items enforced
- **Depends on**: None

---

### STG-375 — SELL — Cart item removal undo has no countdown indicator

- **Status**: PARKED — verified in reiteration, tag `stg-375-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 12 — [SellScanScreen.tsx undo logic](src/screens/SellScanScreen.tsx)
- **Problem**: Undo button appears for 3 seconds after removal but no visual countdown. Users miss the window.
- **Impact**: Users click undo after 3s window, nothing happens. Must re-add item manually.
- **Fix**: Add countdown: "Undo in 2s" updating every 100ms. Extend timeout to 5 seconds.
- **Migration**: None
- **Test**: Countdown visible; undo available for 5 seconds
- **Depends on**: None

---

### STG-376 — SELL — No cart hold/park feature for multi-customer scenarios

- **Status**: PARKED — verified in reiteration, tag `stg-376-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit Area 12 — [SellScanScreen.tsx](src/screens/SellScanScreen.tsx)
- **Problem**: No way to "hold" current cart and start a fresh one for another customer. Retailer must clear cart or wait, losing the current sale.
- **Impact**: Workflow inefficiency in multi-customer kirana environments.
- **Fix**: In `cartStore.ts` (Zustand store): (1) Add `heldCarts: HeldCart[]` state where `HeldCart = { id: string, items: CartItem[], discount: Discount, heldAt: Date, customerName?: string }`. (2) Add `holdCart()` method: saves current cart to `heldCarts`, clears active cart. (3) Add `resumeCart(holdId)` method: swaps held cart back to active. (4) Max 5 held carts, FIFO eviction. (5) Persist to AsyncStorage via Zustand persist middleware. In `SellScanScreen.tsx:3413-3435` (cart header): Add "Hold" icon button next to "Clear". When held carts exist, show "Held (N)" badge. Tap → shows list of held carts with timestamp + item count + total → tap to resume.
- **Migration**: None
- **Test**: Hold button saves cart; new empty cart created; held cart restorable
- **Depends on**: None

---

### — AREA 13: Payment Workflow —

---

### STG-377 — PAYMENT — Payment method tabs not locked during active transaction

- **Status**: PARKED — verified in reiteration, tag `stg-377-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 13 — [PaymentScreen.tsx:715-717, 938-970](src/screens/PaymentScreen.tsx#L715)
- **Problem**: While payment is processing (`submitting=true`), user can still tap different payment method tabs. Switching from UPI to CASH while UPI is pending causes state confusion — receipt may show wrong payment method.
- **Impact**: Reconciliation nightmare. UPI payment succeeds but receipt shows CASH.
- **Fix**: Disable all payment mode tabs while `submitting || loadingSale`. Apply same guard as split button.
- **Migration**: None
- **Test**: During payment processing, all tabs are disabled and greyed out
- **Depends on**: None

---

### STG-378 — PAYMENT — UPI QR expiry countdown reaches 0:00 but QR stays visible

- **Status**: PARKED — verified in reiteration, tag `stg-378-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 13 — [PaymentScreen.tsx:1260-1271](src/screens/PaymentScreen.tsx#L1260)
- **Problem**: When QR countdown reaches 0, QR remains on screen showing "0:00". "Payment Received" button still active. Customer may scan expired QR.
- **Impact**: Customer scans expired QR → payment fails → time wasted.
- **Fix**: When `qrSecondsLeft` reaches 0: disable "Payment Received" button, hide QR, show "QR Expired — Tap to Regenerate" with auto-regenerate option.
- **Migration**: None
- **Test**: QR auto-hides at 0:00; regenerate button appears; "Payment Received" disabled
- **Depends on**: None

---

### STG-379 — PAYMENT — No offline payment fallback messaging

- **Status**: PARKED — verified in reiteration, tag `stg-379-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 13 — [PaymentScreen.tsx:1198, 815-821](src/screens/PaymentScreen.tsx#L1198)
- **Problem**: When offline, UPI tab is greyed out with no tooltip explaining why. If store is "UPI only" and goes offline, retailer has ZERO payment options and gets stuck.
- **Impact**: Store configured UPI-only, network drops, customer waiting, no way to pay.
- **Fix**: Tooltip on disabled tab: "UPI unavailable offline — check internet". If ALL methods disabled, show: "No payment methods available — check internet or enable Cash in settings."
- **Migration**: None
- **Test**: Offline → UPI tab shows tooltip; all-disabled shows full error with settings link
- **Depends on**: None

---

### STG-380 — PAYMENT — Cart lock on failure doesn't explain 5-minute timeout

- **Status**: PARKED — verified in reiteration, tag `stg-380-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 13 — [PaymentScreen.tsx:879-927](src/screens/PaymentScreen.tsx#L879)
- **Problem**: Payment failure triggers `lockCart()` (5-minute lock). Error alert says "Unable to complete payment. Try again." but doesn't mention the lock or its duration. Subsequent taps do nothing.
- **Impact**: Retailer confused why button doesn't work after failure. Doesn't know about 5-minute wait.
- **Fix**: Error message: "Payment failed. Cart is locked for 5 minutes for safety. Please wait and try again."
- **Migration**: None
- **Test**: Payment failure error message mentions lock duration
- **Depends on**: None

---

### STG-381 — PAYMENT — PENDING_UPI_KEY defined but never used for crash recovery

- **Status**: PARKED — verified in reiteration, tag `stg-381-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 13 — [PaymentScreen.tsx:7-8](src/screens/PaymentScreen.tsx#L7)
- **Problem**: `PENDING_UPI_KEY` and `PENDING_UPI_TTL_MS` (15 min) are defined but NEVER USED. No logic saves paymentId before completeCheckout. If app crashes during UPI payment, in-flight paymentId is lost. Customer may be double-charged on retry.
- **Impact**: App crash during UPI → paymentId lost → double charge risk.
- **Fix**: Before `completeCheckout`, save `{ paymentId, saleId, timestamp }` to AsyncStorage. On mount, check for pending payment and attempt recovery.
- **Migration**: None
- **Test**: App crash during UPI → restart recovers pending payment → no double charge
- **Depends on**: None

---

### STG-382 — PAYMENT — Split payment manual UTR input shown too late (after 10 polls)

- **Status**: PARKED — verified in reiteration, tag `stg-382-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 13 — [SplitPaymentModal.tsx:193-206](src/components/sell/SplitPaymentModal.tsx#L193)
- **Problem**: Manual UTR input appears after 10 failed auto-polling attempts (~5+ minutes with exponential backoff). No "Cancel" option visible during wait.
- **Impact**: Retailer stuck watching "Checking payment..." for 5+ minutes with no exit.
- **Fix**: Show manual UTR input after 3 attempts (not 10). Add prominent "Cancel & Refund" button.
- **Migration**: None
- **Test**: Manual UTR visible after 3 polls; cancel button available immediately
- **Depends on**: None

---

### STG-383 — PAYMENT — No refund/void mechanism post-payment from POS

- **Status**: PARKED — verified in reiteration, tag `stg-383-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 13 — [SuccessPrintScreenV2.tsx](src/screens/SuccessPrintScreenV2.tsx)
- **Problem**: After payment confirmation, SuccessPrintScreen offers Print/WhatsApp/No Print but NO "Void Sale" or "Issue Refund" option. Immediate refunds require admin portal or support call.
- **Impact**: Customer changes mind 2 minutes after checkout. Retailer cannot refund from POS.
- **Fix**: Add "Refund/Void Sale" button on success screen. Confirmation modal → call voidSale API. Support full and partial refunds.
- **Migration**: None
- **Test**: Void button on success screen; confirmation modal; refund processes correctly
- **Depends on**: None

---

### STG-384 — PAYMENT — Item discount vs cart discount not clearly distinguished on receipt

- **Status**: PARKED — verified in reiteration, tag `stg-384-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 13 — [SuccessPrintScreenV2.tsx:120](src/screens/SuccessPrintScreenV2.tsx#L120)
- **Problem**: Receipt shows single "DISCOUNT" line that combines item-level and cart-level discounts. Retailer can't tell which discount was which.
- **Impact**: Retailer thinks system double-discounted. Calls support for reconciliation.
- **Fix**: Show separate lines: "ITEM DISCOUNTS: -₹50" and "CART DISCOUNT: -₹50".
- **Migration**: None
- **Test**: Receipt shows separate discount lines for item vs cart discounts
- **Depends on**: None

---

### — AREA 14: Stock Editing Modals —

---

### STG-385 — STOCK — No standalone stock adjustment modal from SELL screen

- **Status**: PARKED — verified in reiteration, tag `stg-385-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 14 — [SellScanScreen.tsx:965-2310](src/screens/SellScanScreen.tsx#L965)
- **Problem**: Stock editing only available within cart context. No way to adjust stock (shrinkage, damage, count error) without creating a transaction.
- **Impact**: Retailers must create dummy sales/returns or use retailer portal for stock corrections.
- **Fix**: Add stock adjustment modal accessible from product tile long-press. Specify quantity + reason (shrinkage, damage, count error).
- **Migration**: None
- **Test**: Long-press product → stock adjustment option → adjust with reason
- **Depends on**: None

---

### STG-386 — STOCK — Stock limit notification doesn't explain WHY quantity was capped

- **Status**: PARKED — verified in reiteration, tag `stg-386-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 14 — [SellScanScreen.tsx:846-870, cartStore.ts:195-210](src/stores/cartStore.ts#L195)
- **Problem**: `stockLimitEvent` includes reason (out_of_stock, capped, unknown_stock) but UI notification only shows item count, not the reason.
- **Impact**: Retailers can't distinguish "stock was zero" vs "stock unknown" vs "capped by business logic".
- **Fix**: Include reason in notification: "2 items reduced — stock was unknown for Tata Salt".
- **Migration**: None
- **Test**: Stock limit notification shows reason text
- **Depends on**: None

---

### — AREA 15: Stock Sync with Retailer Portal —

---

### STG-387 — SYNC — No push-based stock sync, only 5-minute polling

- **Status**: PARKED — verified in reiteration, tag `stg-387-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 15 — [stockService.ts:254-268](src/services/stockService.ts#L254)
- **Problem**: Stock sync is PULL-based (every 5 minutes). No push notifications or WebSocket for stock changes from retailer portal. Portal changes invisible to POS for up to 5 minutes.
- **Impact**: If portal adjusts stock (100→50), POS may oversell for 5 minutes. Critical stock parity issues.
- **Fix**: Implement push notification or SSE channel for `inventory_updated` events. Update cache immediately on push.
- **Migration**: None
- **Test**: Portal stock change → POS reflects within 10 seconds (not 5 minutes)
- **Depends on**: None

---

### STG-388 — SYNC — Stock sync conflicts silently resolved as "server wins"

- **Status**: PARKED — verified in reiteration, tag `stg-388-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 15 — [SyncConflictPanel.tsx:254-270, syncStore.ts:11-17](src/components/ui/SyncConflictPanel.tsx#L254)
- **Problem**: SyncConflictPanel shows drifts but "Force Sync" assumes server is correct. If POS sold 10 units offline while portal changed stock, those 10 units might be lost or duplicated. No explicit resolution policy.
- **Impact**: Offline sales data lost. Inventory drift undetected.
- **Fix**: Implement conflict resolution: (1) log drift, (2) apply server-wins with adjustment entry, (3) notify user of discrepancy amount, (4) allow manual override.
- **Migration**: None
- **Test**: Conflict detected → user notified with drift amount → resolution logged
- **Depends on**: None

---

### — AREA 16: Offline Capabilities —

---

### STG-389 — OFFLINE — Offline queue 24h expiry with no warning before transaction loss

- **Status**: PARKED — verified in reiteration, tag `stg-389-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 16 — [offlineQueue.ts:12, 144-146](src/services/offlineQueue.ts#L12)
- **Problem**: Offline transactions expire after 24 hours (MAX_AGE_MS). No warnings before expiry. If device stays offline 23+ hours, transactions silently disappear.
- **Impact**: Sales data permanently lost without audit trail.
- **Fix**: Add 2-hour expiry warning in SyncStatusWidget: "X transactions expire in 2 hours — please connect to internet."
- **Migration**: None
- **Test**: Warning shown when transactions within 2 hours of expiry; count displayed
- **Depends on**: None

---

### STG-390 — OFFLINE — Offline price cache not refreshed from portal on reconnect

- **Status**: PARKED — verified in reiteration, tag `stg-390-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 16 — [offline/scan.ts:44-90](src/services/offline/scan.ts#L44)
- **Problem**: When scanning offline, app uses cached prices. If retailer changed sell price on portal, offline cache has old price. No refresh on sync completion.
- **Impact**: Products sold at wrong prices during intermittent connectivity. No reconciliation.
- **Fix**: On sync completion, refresh `offline_prices` table with current sell prices from portal.
- **Migration**: None
- **Test**: Portal price change → next sync → offline cache updated → correct price used
- **Depends on**: None

---

### STG-391 — OFFLINE — No post-checkout sync confirmation, sale status ambiguous

- **Status**: PARKED — verified in reiteration, tag `stg-391-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 16 — [SellScanScreen.tsx:2120-2150](src/screens/SellScanScreen.tsx#L2120)
- **Problem**: Checkout completes locally without waiting for sync. Cart cleared immediately. Retailer doesn't know if sale was submitted to server.
- **Impact**: May ring up duplicate sales thinking first one failed.
- **Fix**: Add post-checkout "Syncing..." modal that blocks closing until at least one sync attempt completes. Show "Sale recorded locally — waiting to sync" if offline.
- **Migration**: None
- **Test**: Post-checkout shows sync status; offline shows "recorded locally" message
- **Depends on**: None

---

### STG-392 — OFFLINE — No graceful recovery when offline SQLite database is corrupted

- **Status**: PARKED — verified in reiteration, tag `stg-392-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 16 — [localDb.ts:60-74](src/services/offline/localDb.ts#L60)
- **Problem**: If SQLite corrupts, hydration logs error and falls back to empty state. All offline products, prices, and pending transactions lost silently.
- **Impact**: After corruption, no cached products/prices. Retailer can't scan anything offline.
- **Fix**: Add corruption detection, notify user, provide "Rebuild Offline Cache" button to re-download all products.
- **Migration**: None
- **Test**: Corruption detected → user notified → rebuild button re-downloads products
- **Depends on**: None

---

### — AREA 17: Device Compatibility —

---

### STG-393 — DEVICE — No device type detection (POS terminal vs phone vs tablet)

- **Status**: PARKED — verified in reiteration, tag `stg-393-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 17 — [deviceInfo.ts:17-37, EnrollDeviceScreen.tsx:80](src/services/deviceInfo.ts#L17)
- **Problem**: Device metadata is captured but not used. `deviceType` hardcoded as "RETAILER_PHONE". No distinction between dedicated POS terminals (with scanner, printer, cash drawer) and phones.
- **Impact**: Backend can't tailor features. Printer settings shown for phones without printers.
- **Fix**: Add device type selector in enrollment: "Dedicated POS Terminal" vs "Retailer Phone". Use to conditionally enable scanner/printer features.
- **Migration**: None
- **Test**: Enrollment shows device type selector; features differ by type
- **Depends on**: None

---

### STG-394 — DEVICE — Touch targets too small for compact mode on small phones

- **Status**: PARKED — verified in reiteration, tag `stg-394-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 17 — [QuantityPicker.tsx:175-184](src/components/buy/QuantityPicker.tsx#L175)
- **Problem**: QuantityPicker buttons are 32x32px in compact mode (phones <400px). No hitSlop increase. Below WCAG 44px minimum.
- **Impact**: Retailers with small phones struggle to tap +/- buttons accurately.
- **Fix**: Increase `hitSlop` on small screens: `hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}`.
- **Migration**: None
- **Test**: QuantityPicker touch targets ≥44px effective area on small screens
- **Depends on**: None

---

### — AREA 18: Screen Size Compatibility —

---

### STG-395 — LAYOUT — NUM_COLUMNS=2 hardcoded, no responsive column count

- **Status**: PARKED — verified in reiteration, tag `stg-395-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 18 — [SellScanScreen.tsx:283](src/screens/SellScanScreen.tsx#L283)
- **Problem**: Product grid always uses 2 columns. On 16:9 tablets in landscape, excess whitespace. On 4" phones, tiles are cramped.
- **Impact**: Wasteful on tablets; cramped on tiny phones.
- **Fix**: At SellScanScreen.tsx:283, replace `const NUM_COLUMNS = 2` with: `const { width: screenWidth } = useWindowDimensions(); const NUM_COLUMNS = screenWidth > 700 ? 4 : screenWidth > 500 ? 3 : screenWidth < 350 ? 1 : 2;` — `useWindowDimensions` is already imported at line 19 and used at lines 377, 790. Must be inside component function scope (not top-level constant). Also update FlatList `key` prop to force re-render on column change: `key={`grid-${NUM_COLUMNS}`}`.
- **Migration**: None
- **Test**: Tablet shows 3+ columns; 4" phone shows 1-2 columns appropriately
- **Depends on**: None

---

### STG-396 — LAYOUT — Cart sheet snap points not optimized for tablets/landscape

- **Status**: PARKED — verified in reiteration, tag `stg-396-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 18 — [SellScanScreen.tsx:291-293](src/screens/SellScanScreen.tsx#L291)
- **Problem**: Cart sheet collapsed ratio fixed at 55%. On 12" tablet landscape, cart takes ~400px height leaving only ~300px for products.
- **Impact**: Cart dominates tablet screen.
- **Fix**: For landscape (aspect ratio > 1.5), reduce collapsed ratio to 40%. Consider side-by-side layout on wide screens.
- **Migration**: None
- **Test**: Tablet landscape → product grid gets ≥60% of height
- **Depends on**: None

---

### STG-397 — LAYOUT — No safe area handling for notched phones in SellScanScreen

- **Status**: PARKED — verified in reiteration, tag `stg-397-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 18 — [SellScanScreen.tsx:25](src/screens/SellScanScreen.tsx#L25)
- **Problem**: `useSafeAreaInsets` imported but not applied to root View or SyncStatusWidget. On notched phones (iPhone X+, newer Android), UI renders behind notch.
- **Impact**: Top UI elements partially hidden under notch.
- **Fix**: Apply `paddingTop: insets.top` to root container. Wrap SyncStatusWidget with SafeAreaView.
- **Migration**: None
- **Test**: On notched device, all UI visible below notch
- **Depends on**: None

---

### STG-398 — LAYOUT — Modal dialogs stretch full-width on tablets

- **Status**: PARKED — verified in reiteration, tag `stg-398-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 18 — SellScanScreen editor/payment modals
- **Problem**: Editor and payment modals render full-width on tablets. Input fields stretch 400+px on 12" screen.
- **Impact**: Hard to use one-handed; poor visual layout.
- **Fix**: Add `maxWidth: 500` to modal content on screens wider than 600px.
- **Migration**: None
- **Test**: Modal constrained to 500px max on tablets
- **Depends on**: None

---

### — ADDITIONAL CROSS-CUTTING ISSUES —

---

### STG-399 — SELL — Price edit in cart not persisted to AsyncStorage separately

- **Status**: PARKED — verified in reiteration, tag `stg-399-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 12 — [SellScanScreen.tsx:496+](src/screens/SellScanScreen.tsx#L496)
- **Problem**: If user edits a product's price in cart via `handlePriceCommit`, the price is saved to backend but local edit is only in component state. If app crashes before payment, in-memory price edit lost. Cart shows ₹0 again on restart.
- **Impact**: Edited prices vanish on crash. Retailer re-edits everything.
- **Fix**: Store `pendingPriceEdits` as persisted slice in cartStore. On deserialization, apply pending edits.
- **Migration**: None
- **Test**: Edit price → force-close app → restart → edited price preserved
- **Depends on**: None

---

### STG-400 — SELL — No quantity input validation for extremely large numbers

- **Status**: PARKED — verified in reiteration, tag `stg-400-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 12 — [SellScanScreen.tsx:327-331](src/screens/SellScanScreen.tsx#L327)
- **Problem**: No max per-item quantity limit. User can enter 999999 units. Stock cap prevents over-ordering vs available stock but not nonsensical quantities.
- **Impact**: Fat-finger "5000" instead of "50" → cart total ₹500,000 → confusion.
- **Fix**: Enforce max 9,999 per item. Show warning on entry ≥100: "Large quantity — are you sure?"
- **Migration**: None
- **Test**: Quantity >9999 rejected; ≥100 shows confirmation
- **Depends on**: None

---

### STG-401 — PAYMENT — Cart-to-payment data consistency not validated on navigation

- **Status**: PARKED — verified in reiteration, tag `stg-401-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 13 — [PaymentScreen.tsx:170-195](src/screens/PaymentScreen.tsx#L170)
- **Problem**: Cart items passed as `saleItemIds` in route params. If user modifies cart between opening Payment and confirming, stale total shown.
- **Impact**: Payment for wrong amount. Inventory deducted for wrong set of items.
- **Fix**: Validate saleItemIds match current cart on PaymentScreen render. If mismatch, show alert and navigate back to SellScan.
- **Migration**: None
- **Test**: Modify cart after opening payment → alert shown → navigate back
- **Depends on**: None

---

### STG-402 — SELL — Search history unbounded, no expiration or clear-all

- **Status**: PARKED — verified in reiteration, tag `stg-402-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [SellScanScreen.tsx:2882-2911](src/screens/SellScanScreen.tsx#L2882)
- **Problem**: Search history displays all recent terms as horizontal chips with no limit or expiration. Over weeks, 50+ terms accumulate. No "clear all" button.
- **Impact**: Cluttered search history. Touch lag scrolling through chips.
- **Fix**: Limit to 15 terms. Auto-expire after 7 days. Add "Clear all" button.
- **Migration**: None
- **Test**: Max 15 history terms; older than 7 days removed; clear-all works
- **Depends on**: None

---

### STG-403 — SELL — Cart bar flash animation invisible on slow devices (260ms)

- **Status**: PARKED — verified in reiteration, tag `stg-403-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 10 — [SellScanScreen.tsx:2032-2038, 4235-4267](src/screens/SellScanScreen.tsx#L2032)
- **Problem**: Cart bar flash is 260ms style change. On ≤60fps budget Android, flash completes before user glances at cart bar.
- **Impact**: Add confirmation invisible on low-end devices.
- **Fix**: Extend to 400ms. Add scale animation (+5%). Add "Added" toast near cart for 2s. Add haptic feedback.
- **Migration**: None
- **Test**: Cart flash visible on budget Android; haptic fires; toast visible for 2s
- **Depends on**: STG-368

---

### STG-404 — PAYMENT — No UPI polling status visible during QR wait

- **Status**: PARKED — verified in reiteration, tag `stg-404-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 13 — [PaymentScreen.tsx:1232-1275](src/screens/PaymentScreen.tsx#L1232)
- **Problem**: After QR displayed, no polling status. QR countdown ticks but no indication system is listening for payment.
- **Impact**: Customer scans QR, bank shows "Processing", POS shows static QR. Retailer thinks payment failed. Duplicate payment risk.
- **Fix**: Add status line below QR: "Listening for payment..." with pulsing dot. When detected: "Payment detected! Confirming..."
- **Migration**: None
- **Test**: QR displayed → "Listening..." status visible; payment detected → "Confirming..." shown
- **Depends on**: None

---

### STG-405 — PAYMENT — Discount application has no undo

- **Status**: PARKED — verified in reiteration, tag `stg-405-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 12/13 — [SellScanScreen.tsx:2392-2405](src/screens/SellScanScreen.tsx#L2392)
- **Problem**: Cart-level discount applied instantly. No "undo" action like item removal has.
- **Impact**: Wrong discount requires manual navigation back to discount input to clear.
- **Fix**: Show "Discount Applied" toast with inline "Undo" button. 5-second timeout.
- **Migration**: None
- **Test**: Discount applied → undo toast visible for 5s; undo removes discount
- **Depends on**: None

---

### STG-406 — PAYMENT — Offline receipts may not get "OFF-" prefix consistently

- **Status**: PARKED — verified in reiteration, tag `stg-406-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 13/16 — [SuccessPrintScreenV2.tsx:94-129](src/screens/SuccessPrintScreenV2.tsx#L94)
- **Problem**: Receipt checks `billNumber.startsWith("OFF-")` for offline sales. But bill ref generation may not always add "OFF-" prefix for offline sales. If missed, receipt shows no sync-pending warning.
- **Impact**: Offline sale receipt doesn't indicate sync status. Customer receipt doesn't match backend.
- **Fix**: In SellScanScreen, always prepend "OFF-" to offline sale billRef during creation.
- **Migration**: None
- **Test**: Every offline sale has "OFF-" prefixed bill ref; receipt shows "OFFLINE SALE" warning
- **Depends on**: None

---

### STG-407 — PURCHASE — BNPL badge shown without terms explanation

- **Status**: PARKED — verified in reiteration, tag `stg-407-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 8 — [CatalogProductCard.tsx:209-212, SupplierRow.tsx:95-104](src/components/buy/CatalogProductCard.tsx#L209)
- **Problem**: BNPL badge shows "BNPL ✓" with no explanation of days to pay, limit, or terms.
- **Impact**: BNPL feature underutilized because retailers don't understand what it means.
- **Fix**: Show "Pay Later (30 days)" or on long-press show BNPL terms popup.
- **Migration**: None
- **Test**: BNPL badge shows payment terms; long-press shows details
- **Depends on**: STG-287

---

### STG-408 — PURCHASE — Cart quantity badge confusing when same product from multiple suppliers

- **Status**: PARKED — verified in reiteration, tag `stg-408-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [BuyScreen.tsx:133-141](src/screens/BuyScreen.tsx#L133)
- **Problem**: Cart badge shows total quantity across ALL suppliers for a product. If same product from 2 suppliers, badge shows combined total. User may think it's duplicate.
- **Impact**: Confusing when multi-sourcing same product.
- **Fix**: Show supplier count: "2 suppliers" badge when product in cart from multiple sources.
- **Migration**: None
- **Test**: Same product from 2 suppliers → badge shows "2 suppliers" not combined qty
- **Depends on**: None

---

### STG-409 — VOICE — No recording duration countdown visible during recording

- **Status**: PARKED — verified in reiteration, tag `stg-409-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 9 — [voiceClient.ts:78, 139-145](src/services/voice/voiceClient.ts#L78)
- **Problem**: Max recording 60 seconds. No visual countdown or warning. Recording silently stops at 60s — retailer may be mid-sentence.
- **Impact**: Incomplete transcripts. Voice commands fail because words were cut off.
- **Fix**: Show countdown timer on recording panel. Flash red at 50s remaining. Play subtle beep at 60s.
- **Migration**: None
- **Test**: Countdown visible during recording; red flash at 50s; stops at 60s with feedback
- **Depends on**: None

---

### STG-410 — VOICE — Rate limit 429 errors show no retry-after guidance

- **Status**: PARKED — verified in reiteration, tag `stg-410-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 9 — [voice.ts:64-65](backend/src/routes/v1/pos/voice.ts#L64)
- **Problem**: 20 requests/minute limit. After limit hit, client shows "Too many requests. Please wait." — no indication of when to retry.
- **Impact**: Retailer doesn't know if wait is 10 seconds or 5 minutes. May abandon voice feature.
- **Fix**: Include Retry-After header in 429 response. Client shows "Please wait 45 seconds" with countdown.
- **Migration**: None
- **Test**: Rate limit hit → countdown shown with exact seconds remaining
- **Depends on**: None

---

### STG-411 — VOICE — Zero E2E test coverage for voice flow

- **Status**: PARKED — verified in reiteration, tag `stg-411-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 9 — e2e-tests/
- **Problem**: No E2E tests for voice: tap-to-record, hold-to-record, clarification modal, product matching, mic permission denial. Backend has unit tests but no integration tests.
- **Impact**: Regressions in voice UI ship without detection.
- **Fix**: Add E2E test suite covering all 4-state UX (idle→recording→processing→success/error) + candidate picker.
- **Migration**: None
- **Test**: E2E tests for voice flow pass in CI
- **Depends on**: None

---

## REORDER & CREDIT Deep Audit (STG-412 — STG-480)

> **Source**: Deep functional, UX, and integration audit of REORDER and CREDIT modules (2026-03-13)
> **Scope**: 8 audit areas — manual reorder, SKU recall, auto-reorder, supplier mapping, reorder UX, trigger conditions, credit/BNPL lifecycle, compliance
> **Rule**: Do NOT implement until operator approves full ticket list

---

### — AREA 1: Manual Reorder Flow —

---

### STG-412 — REORDER — No manual quick-reorder from purchase history

- **Status**: PARKED — verified in reiteration, tag `stg-412-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 1a — [ReorderScreen.tsx](src/screens/ReorderScreen.tsx)
- **Problem**: Retailers cannot manually initiate a reorder from previously purchased products. The only path to reorder is via auto-generated pending suggestions. PurchaseHistoryScreen references `reorder.quickReorder` but no flow exists to select past purchases and add to a reorder cart.
- **Impact**: Retailers who know what they need can't proactively reorder — they must wait for auto-suggestions or manually navigate to the PURCHASE tab.
- **Fix**: Add "Reorder Again" button on purchase history items that creates a pending reorder (or directly adds to purchase cart with supplier pre-selected).
- **Migration**: None
- **Test**: Tap "Reorder Again" on purchase history item → item added to purchase cart with correct supplier/quantity
- **Depends on**: None

---

### STG-413 — REORDER — Quantity edits in EditReorderModal not persisted to database

- **Status**: PARKED — verified in reiteration, tag `stg-413-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 1a — [EditReorderModal.tsx:160-182](src/components/reorder/EditReorderModal.tsx#L160-L182)
- **Problem**: `handleSave` only updates local React state via `onSave` callback. The pending reorder record in the database is NEVER updated with the new quantity/supplier. If user edits quantity, navigates away without approving, changes are lost.
- **Impact**: Retailers believe their quantity edits are saved, but they're temporary. Data inconsistency between what user sees and what DB stores.
- **Fix**: Add a PATCH endpoint `PATCH /api/v1/reorder/pending/:id` to update quantity, supplier, unitPrice. Call from frontend on save.
- **Migration**: None
- **Test**: Edit quantity → navigate away → return → quantity shows updated value from DB
- **Depends on**: None

---

### STG-414 — REORDER — No reorder history/audit trail visible on POS

- **Status**: PARKED — verified in reiteration, tag `stg-414-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 1a — [ReorderScreen.tsx](src/screens/ReorderScreen.tsx)
- **Problem**: No screen shows "Reorders You've Approved" or past reorder decisions. Only superadmin has audit log. Retailers can't trace which reorders led to which purchase orders.
- **Impact**: No accountability or traceability. Retailer can't dispute or review past reorder decisions.
- **Fix**: Add "Reorder History" tab/section showing approved, dismissed, and expired reorders with timestamps.
- **Migration**: None
- **Test**: Approve reorder → navigate to history → approved item visible with PO link
- **Depends on**: None

---

### — AREA 2: SKU Recall Logic —

---

### STG-415 — REORDER — Pending reorders are snapshots, no staleness detection

- **Status**: PARKED — verified in reiteration, tag `stg-415-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 2b — [reorder.ts:364-395](backend/src/routes/v1/reorder.ts#L364-L395)
- **Problem**: Pending reorder records capture `current_stock`, `min_threshold`, `suggested_quantity` at creation time. If stock changes after creation (e.g., new shipment arrived), the suggestion is stale but still shows the old quantity.
- **Impact**: Retailer approves a reorder for 50 units when they only need 10 (new stock arrived since suggestion was created).
- **Fix**: Add `isStale: boolean` flag comparing current live stock vs snapshot stock. Show warning badge on stale suggestions.
- **Migration**: None
- **Test**: Create suggestion → receive stock → suggestion shows "Stock changed" badge
- **Depends on**: None

---

### STG-416 — REORDER — Expired reorders silently disappear, no re-trigger option

- **Status**: PARKED — verified in reiteration, tag `stg-416-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 2b — [ReorderScreen.tsx:203](src/screens/ReorderScreen.tsx#L203), [reorderApi.ts:10](src/services/api/reorderApi.ts#L10)
- **Problem**: Backend supports `status = 'expired'` but frontend hardcodes filter to `status: "pending"`. Expired suggestions vanish with no UI to show them or re-trigger.
- **Impact**: Retailers may not realize a needed reorder expired. No way to bring it back without waiting for the next auto-suggestion cycle.
- **Fix**: Show expired reorders in a separate section with a "Re-trigger" button that creates a new pending reorder.
- **Migration**: None
- **Test**: Expired reorder visible in "Expired" section → tap "Re-trigger" → new pending reorder created
- **Depends on**: None

---

### STG-417 — REORDER — No expiry cleanup job marks pending reorders as expired

- **Status**: PARKED — verified in reiteration, tag `stg-417-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 2 — [reorder.ts](backend/src/routes/v1/reorder.ts)
- **Problem**: `pending_reorders` have an `expires_at` field but no background job transitions them to 'expired' status when TTL passes. They remain in 'pending' status indefinitely.
- **Impact**: Stale suggestions accumulate. Retailer sees outdated reorder suggestions that should have expired.
- **Fix**: Add daily cron job: `UPDATE pending_reorders SET status='expired' WHERE status='pending' AND expires_at < NOW()`.
- **Migration**: None
- **Test**: Pending reorder with past expires_at → cron runs → status = 'expired'
- **Depends on**: None

---

### — AREA 3: Auto-Reorder Feature —

---

### STG-418 — REORDER — No scheduler generates reorder suggestions (CRITICAL)

- **Status**: PARKED — verified in reiteration, tag `stg-418-2026-03-14`
- **Priority**: P0
- **Source**: Deep audit Area 3c — backend/src/services/reorder-service/
- **Problem**: No cron job or scheduler exists to generate pending reorder suggestions. Endpoints exist to read/approve/dismiss suggestions, but nothing creates them. The `reorder.reorder_runs` audit table exists but is never written to. Event inbox/outbox tables are created but unused.
- **Impact**: Auto-reorder is effectively non-functional. Retailers enable the feature but never receive suggestions.
- **Fix**: Implement suggestion generation job: for each store with `reorder_enabled=true`, query `reorder_policies` where `is_enabled=true`, compare `stock_balances.current_qty` vs `min_stock`, create `pending_reorders` where stock is below threshold. Run daily (configurable).
- **Migration**: None (tables exist)
- **Test**: Stock drops below min → scheduler runs → pending reorder created with correct suggested quantity
- **Depends on**: None

---

### STG-419 — REORDER — Auto-approve threshold setting has no effect

- **Status**: PARKED — verified in reiteration, tag `stg-419-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 3c — [reorder.ts:51](backend/src/routes/v1/reorder.ts#L51)
- **Problem**: Backend returns `autoApproveThreshold` in settings, and PATCH accepts it. ReorderSettingsScreen displays it. But NO business logic uses this threshold to auto-approve reorders below a certain value.
- **Impact**: Retailers configure a setting that does nothing. Misleading UI.
- **Fix**: Either implement auto-approval in the suggestion generation job (approve if `suggestedQuantity * unitPrice < threshold`) or remove the setting.
- **Migration**: None
- **Test**: Set threshold to ₹500 → suggestion created for ₹300 → auto-approved without user action
- **Depends on**: STG-418

---

### STG-420 — REORDER — No quantity optimization algorithm (EOQ/MOQ)

- **Status**: PARKED — verified in reiteration, tag `stg-420-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 3c — backend reorder logic
- **Problem**: Suggested quantity is implicitly `target_stock - current_stock` with no consideration of: MOQ from supplier, lead time, holding costs, or Economic Order Quantity (EOQ) formula. Suggestions may be below supplier MOQ.
- **Impact**: Retailer approves reorder for 5 units but supplier MOQ is 10. PO rejected by supplier.
- **Fix**: Calculate suggested quantity as `MAX(target_stock - current_stock, supplier_moq)`. Consider adding EOQ calculation for high-volume items.
- **Migration**: None
- **Test**: Product with MOQ=10, deficit=5 → suggestion shows 10 units (not 5)
- **Depends on**: STG-418

---

### STG-421 — REORDER — Approved reorders create draft POs but no submission workflow

- **Status**: PARKED — verified in reiteration, tag `stg-421-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 3c — [reorder.ts:445-600](backend/src/routes/v1/reorder.ts#L445-L600)
- **Problem**: When retailer approves pending reorders, draft `purchase_orders` are created with `source_reorder_ids`. But no async job transitions them to 'submitted', no supplier notification is sent, and no workflow exists to send POs to suppliers.
- **Impact**: Approval creates drafts that sit idle. Retailer thinks order was placed but supplier never receives it.
- **Fix**: After approval, either auto-submit the PO to supplier (via supplier API/notification) or clearly show the PO as "Draft — Submit to Supplier" with a CTA.
- **Migration**: None
- **Test**: Approve reorder → PO created → supplier notified OR clear "Submit" button visible
- **Depends on**: None

---

### STG-422 — REORDER — GRN auto-close doesn't mark reorders as fulfilled

- **Status**: PARKED — verified in reiteration, tag `stg-422-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 3c — Migration 151
- **Problem**: Migration 151 adds index on `pending_reorders(purchase_order_id)` for approved reorders, with a comment that GRN should auto-close. But no code performs this. When a PO GRN is created, linked pending reorders are NOT updated to 'fulfilled'.
- **Impact**: Approved reorders stay in 'approved' status forever. No completion signal.
- **Fix**: In GRN creation endpoint, query `pending_reorders WHERE purchase_order_id = $1` and update status to 'fulfilled'.
- **Migration**: None
- **Test**: Create GRN for reorder PO → linked pending reorders → status = 'fulfilled'
- **Depends on**: None

---

### — AREA 4: Supplier Mapping —

---

### STG-423 — REORDER — No dynamic supplier mapping algorithm

- **Status**: PARKED — verified in reiteration, tag `stg-423-2026-03-14`
- **Priority**: P0
- **Source**: Deep audit Area 4d — backend reorder + catalog services
- **Problem**: Supplier selection uses only `reorder_policies.preferred_supplier_id` (one fixed supplier per product). No algorithm queries `catalog.supplier_products` to find all available suppliers and select the best one based on price, lead time, MOQ, or rating.
- **Impact**: If preferred supplier is out of stock or has high prices, system can't automatically find alternatives. Retailer must manually edit each suggestion.
- **Fix**: Implement supplier mapping: query `catalog.supplier_products` for all suppliers offering the product, rank by unit price (ascending), filter by MOQ compatibility, select best. Fall back to preferred supplier.
- **Migration**: None
- **Test**: Product with 3 suppliers → suggestion picks cheapest available supplier
- **Depends on**: STG-418

---

### STG-424 — REORDER — Supplier picker in EditReorderModal doesn't show pack variants

- **Status**: PARKED — verified in reiteration, tag `stg-424-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 4d — [EditReorderModal.tsx:98-111](src/components/reorder/EditReorderModal.tsx#L98-L111)
- **Problem**: `getProductSuppliers` returns suppliers for a product, but if the same supplier offers multiple variants/pack sizes (e.g., 500g and 1kg), the UI doesn't distinguish between them. User can't choose which pack size to order.
- **Impact**: Retailer can't specify pack preferences in reorder, leading to wrong quantities arriving.
- **Fix**: Extend supplier selection UI to show pack size, MOQ, and allow selection of specific supplier-product-variant tuples.
- **Migration**: None
- **Test**: Supplier offers 2 pack sizes → both shown in picker with price/MOQ per variant
- **Depends on**: None

---

### STG-425 — REORDER — Supplier picker loses original supplier if not in catalog

- **Status**: PARKED — verified in reiteration, tag `stg-425-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 4d — [EditReorderModal.tsx:91-139](src/components/reorder/EditReorderModal.tsx#L91-L139)
- **Problem**: When editing a pending reorder, the modal calls `catalogApi.getProductSuppliers()`. If the original `suggestedSupplierId` is from a supplier not currently in the catalog for that product, the user can't revert to the original choice after opening the modal.
- **Impact**: Original supplier mapping lost if user opens and cancels the edit modal.
- **Fix**: In EditReorderModal.tsx `loadSuppliers()` (lines 91-139): After `catalogApi.getProductSuppliers()` returns the list, check if `item.suggestedSupplierId` is in the returned array. If NOT found: (1) Create a synthetic supplier entry `{ supplierId: item.suggestedSupplierId, supplierName: item.suggestedSupplierName || 'Original Supplier', isOriginal: true }` and prepend to supplier list. (2) Mark with "(Original)" badge in picker UI. Lines 102-108 already have a fallback that tries to select current supplier — extend this to also inject missing supplier into the options list. Lines 116-128 create a "placeholder supplier" on API failure but don't add it to the picker dropdown — fix this.
- **Migration**: None
- **Test**: Edit reorder with supplier X (not in catalog) → supplier X still visible in picker
- **Depends on**: None

---

### — AREA 5: Reorder UI/UX —

---

### STG-426 — REORDER — Payment terms not returned by backend, dead code in frontend

- **Status**: PARKED — verified in reiteration, tag `stg-426-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 5e — [reorder.ts:364-395](backend/src/routes/v1/reorder.ts#L364-L395), [PendingReorderCard.tsx:153-164](src/components/reorder/PendingReorderCard.tsx#L153-L164)
- **Problem**: Backend pending reorders SELECT does NOT include `payment_terms` column. Frontend PendingReorderCard tries to display `item.paymentTerms` but it's always undefined. Feature is dead code.
- **Impact**: Payment terms information never shown despite UI being built for it.
- **Fix**: Add `pr.payment_terms as "paymentTerms"` to the backend SELECT query. Source payment terms from supplier-store link or reorder policy.
- **Migration**: None
- **Test**: Pending reorder card shows payment terms (e.g., "Net 7 days")
- **Depends on**: None

---

### STG-427 — REORDER — Approval response missing supplier names

- **Status**: PARKED — verified in reiteration, tag `stg-427-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 5e — [reorder.ts:500-576](backend/src/routes/v1/reorder.ts#L500-L576)
- **Problem**: Approval endpoint returns `draftPurchaseOrders` with `supplierId` but not `supplierName`. The Alert in ReorderScreen only shows counts ("Approved 5 reorders → Created 2 POs") without naming which suppliers.
- **Impact**: Minimal feedback. Retailer doesn't know which suppliers the POs are for.
- **Fix**: Include `supplierName` in the `draftPurchaseOrders` response array. Show "Created PO for Supplier A (3 items), Supplier B (2 items)".
- **Migration**: None
- **Test**: Approve 5 reorders → success message names each supplier
- **Depends on**: None

---

### STG-428 — REORDER — Partial approval failure is silent (transaction rollback)

- **Status**: PARKED — verified in reiteration, tag `stg-428-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 5e — [reorder.ts:445-600](backend/src/routes/v1/reorder.ts#L445-L600)
- **Problem**: Approval uses a DB transaction. If any one item fails PO creation, the ENTIRE transaction rolls back. Frontend shows "Approved N reorders" but actually 0 were approved.
- **Impact**: Silent failure. Retailer thinks reorder was approved but nothing happened.
- **Fix**: Return partial success with details: "Approved 3 of 5. Failed: Item X (reason), Item Y (reason)". Consider per-item transactions.
- **Migration**: None
- **Test**: 5 items approved, 1 has invalid supplier → 4 succeed, 1 reported failed
- **Depends on**: None

---

### STG-429 — REORDER — Empty state message misleading when auto-reorder is off

- **Status**: PARKED — verified in reiteration, tag `stg-429-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 5e — [ReorderScreen.tsx:434-446](src/screens/ReorderScreen.tsx#L434-L446)
- **Problem**: Empty state says "All caught up! The system will automatically detect low stock items." But if `reorderEnabled === false`, this is a lie — the system is NOT detecting anything.
- **Impact**: Retailer thinks auto-reorder is working when it's disabled.
- **Fix**: In ReorderScreen.tsx:434-446: Read `reorderEnabled` from ReorderSettingsScreen state (line 241: `settings?.reorderEnabled ?? false`). If `reorderEnabled === false`: replace "All caught up!" with "Auto-reorder is turned off. Enable it in Reorder Settings to get stock suggestions." + "Go to Settings" button navigating to ReorderSettingsScreen. If `reorderEnabled === true` AND no pending: keep "All caught up! No low stock items detected."
- **Migration**: None
- **Test**: Auto-reorder off + no pending → message says "Auto-reorder disabled"
- **Depends on**: None

---

### STG-430 — REORDER — Selection bar disappears causing layout shift

- **Status**: PARKED — verified in reiteration, tag `stg-430-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit Area 5e — [ReorderScreen.tsx:460-486](src/screens/ReorderScreen.tsx#L460-L486)
- **Problem**: When `pendingReorders.length === 0`, the selection bar (containing "Select All") is not rendered, causing the header to shift vertically. Jarring UX when toggling selections.
- **Impact**: UI jank when deselecting the last item.
- **Fix**: Keep selection bar visible but disabled when no items present.
- **Migration**: None
- **Test**: No pending items → selection bar visible but greyed out, no layout shift
- **Depends on**: None

---

### STG-431 — REORDER — EditReorderModal original quantity reference too subtle

- **Status**: PARKED — verified in reiteration, tag `stg-431-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit Area 5e — [EditReorderModal.tsx:244-256](src/components/reorder/EditReorderModal.tsx#L244-L256)
- **Problem**: "Originally: X units" label in the quantity section is tiny and easy to miss. Retailer might change quantity without understanding what the "original" reference means.
- **Impact**: Accidental quantity changes without context.
- **Fix**: Emphasize original quantity (bold, larger font, or different background). Add tooltip "System suggested X units based on your stock policy."
- **Migration**: None
- **Test**: Edit modal clearly shows original vs new quantity with visual distinction
- **Depends on**: None

---

### STG-432 — REORDER — Supplier load error hidden until save attempt

- **Status**: PARKED — verified in reiteration, tag `stg-432-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 5e — [EditReorderModal.tsx:263-283](src/components/reorder/EditReorderModal.tsx#L263-L283)
- **Problem**: If supplier data fails to load, error is stored but only displayed after user tries to save. User might not realize suppliers failed to load and sees an empty list.
- **Impact**: Bad UX — retailer tries to approve with no supplier info, then sees error.
- **Fix**: Show error state immediately when supplier load fails, with a "Retry" button.
- **Migration**: None
- **Test**: Supplier API fails → error shown immediately with retry button
- **Depends on**: None

---

### STG-433 — REORDER — maxReorderQty not visible in policy list

- **Status**: PARKED — verified in reiteration, tag `stg-433-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit Area 5e — [PolicyRow.tsx](src/components/reorder/PolicyRow.tsx)
- **Problem**: EditPolicyModal allows setting `maxReorderQty`, backend stores it, but PolicyRow only shows it conditionally (when not null) in small text. Retailer can't easily verify their max quantity setting without opening the edit modal.
- **Impact**: Setting is hidden. Retailer doesn't know their configured max until they re-edit.
- **Fix**: Display max reorder quantity in PolicyRow by default (alongside min/target stock).
- **Migration**: None
- **Test**: Policy row shows min, target, and max stock values
- **Depends on**: None

---

### STG-434 — REORDER — Threshold visual guide proportions misleading

- **Status**: PARKED — verified in reiteration, tag `stg-434-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit Area 5e — [EditPolicyModal.tsx:298-327](src/components/reorder/EditPolicyModal.tsx#L298-L327)
- **Problem**: Visual guide bar uses hardcoded flex proportions (1:2:3) for critical:low:target sections, but actual thresholds may not match these ratios. If min=10, target=15, bar shows as if 1:2:3 — visually misleading.
- **Impact**: Retailers misunderstand their threshold settings based on inaccurate visual.
- **Fix**: Calculate flex values dynamically from actual min/target values.
- **Migration**: None
- **Test**: Set min=10, target=50 → bar proportions reflect actual ratio
- **Depends on**: None

---

### STG-435 — REORDER — Catalog supplier data not cached, re-fetched on every modal open

- **Status**: PARKED — verified in reiteration, tag `stg-435-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit Area 5e — [EditReorderModal.tsx:91-139](src/components/reorder/EditReorderModal.tsx#L91-L139)
- **Problem**: Every time user opens EditReorderModal, `loadSuppliers()` fetches from `catalogApi.getProductSuppliers()`. No caching. Opening/closing modal 10 times = 10 API calls.
- **Impact**: Unnecessary API calls and slower perceived performance.
- **Fix**: Cache supplier data at ReorderScreen level or use React Query/SWR.
- **Migration**: None
- **Test**: Open/close modal 3 times → only 1 API call (cached)
- **Depends on**: None

---

### — AREA 6: Reorder Trigger Conditions —

---

### STG-436 — REORDER — minStock/minThreshold naming inconsistency across frontend/backend

- **Status**: PARKED — verified in reiteration, tag `stg-436-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 6f — [reorderApi.ts:19](src/services/api/reorderApi.ts#L19), [reorder.ts:218](backend/src/routes/v1/reorder.ts#L218)
- **Problem**: Frontend uses `minThreshold`, backend schema uses `min_stock`, EditPolicyModal label says "Minimum Stock Level". Different names for the same concept across codebase.
- **Impact**: Confusing for maintenance. Risk of serialization bugs in future changes.
- **Fix**: Standardize on one name everywhere (recommend `minThreshold` frontend, `min_stock` backend with consistent alias in queries).
- **Migration**: None
- **Test**: All API responses use consistent field name for minimum stock threshold
- **Depends on**: None

---

### STG-437 — REORDER — Stock status threshold mismatch between frontend and backend

- **Status**: PARKED — verified in reiteration, tag `stg-437-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 6f — [PolicyRow.tsx:160-165](src/components/reorder/PolicyRow.tsx#L160-L165), [reorder.ts:166](backend/src/routes/v1/reorder.ts#L166)
- **Problem**: Backend filters products where `current_qty <= min_stock` (absolute threshold). Frontend's `isCriticallyLow()` returns true if `currentStock < minThreshold * 0.5` (50% of min). These are different thresholds — "critical" in UI may not match what triggered the suggestion.
- **Impact**: UI severity badges don't align with backend filtering logic.
- **Fix**: Move stock status calculation to backend, return it in API response. Frontend displays what backend determines.
- **Migration**: None
- **Test**: Backend returns `stockStatus: "critical"|"low"|"ok"` → frontend displays matching badge
- **Depends on**: None

---

### STG-438 — REORDER — Policy validation frontend-only, no server-side bounds checking

- **Status**: PARKED — verified in reiteration, tag `stg-438-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 6f — [EditPolicyModal.tsx:108-129](src/components/reorder/EditPolicyModal.tsx#L108-L129), [reorder.ts:278](backend/src/routes/v1/reorder.ts#L278)
- **Problem**: Frontend validates min ≥ 0, target > min, but backend PATCH has no validation that `minStock ≤ targetStock ≤ maxReorderQty`. Direct API calls can store invalid combinations. Min=0 is allowed (always triggers).
- **Impact**: Invalid policy configs reach database. Bad policies break reorder logic.
- **Fix**: Add server-side validation: `min_stock > 0`, `target_stock > min_stock`, `max_reorder_qty >= target_stock - min_stock` (if set).
- **Migration**: None
- **Test**: API call with minStock=50, targetStock=10 → 400 Bad Request
- **Depends on**: None

---

### STG-439 — REORDER — No auto-reorder cron visibility or manual trigger on POS

- **Status**: PARKED — verified in reiteration, tag `stg-439-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 6f — [reorder.types.ts:54-65](backend/src/services/reorder-service/)
- **Problem**: Backend has `reorder_runs` table for tracking evaluations, but POS has no visibility into when last reorder run occurred, no way to manually trigger a run, and no status indicator.
- **Impact**: Retailers can't tell if auto-reorder is working or if suggestions are stale.
- **Fix**: In ReorderSettingsScreen.tsx: (1) Query `reorder_runs` table for latest run timestamp: `SELECT MAX(completed_at) FROM reorder_runs WHERE store_id=$1`. (2) Display below Auto Reorder toggle: "Last checked: 2 hours ago" (or "Never" if no runs). (3) Add "Check Now" button that calls `POST /api/v1/reorder/evaluate` to trigger immediate evaluation. (4) Show spinner during evaluation, then refresh pending reorders count. Backend already has `reorder_runs` table — just need an API endpoint to read latest run and a trigger endpoint.
- **Migration**: None
- **Test**: Tap "Check Now" → evaluation runs → new suggestions appear
- **Depends on**: STG-418

---

### STG-440 — REORDER — No bulk policy management

- **Status**: PARKED — verified in reiteration, tag `stg-440-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 6f — [ReorderPoliciesScreen.tsx](src/screens/ReorderPoliciesScreen.tsx)
- **Problem**: Backend has `bulkUpdatePolicies()` DTO but frontend has no bulk edit feature. If retailer has 100 products and needs to adjust all min stocks by 10%, they must edit each one individually.
- **Impact**: Extremely tedious for stores with large product catalogs.
- **Fix**: Add select-multiple + bulk action bar (enable/disable, set preferred supplier, adjust thresholds).
- **Migration**: None
- **Test**: Select 10 policies → "Set Min Stock = 5" → all 10 updated
- **Depends on**: None

---

### STG-441 — REORDER — Filter labels in ReorderPoliciesScreen hardcoded English

- **Status**: PARKED — verified in reiteration, tag `stg-441-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 5e i18n — [ReorderPoliciesScreen.tsx:415-440](src/screens/ReorderPoliciesScreen.tsx#L415-L440)
- **Problem**: Filter labels ("All", "Enabled", "Disabled", "Low Stock") are hardcoded English, not wrapped in `t()`.
- **Impact**: Labels won't translate when app supports Hindi/other languages.
- **Fix**: Wrap all filter labels in `t()` function with corresponding i18n keys.
- **Migration**: None
- **Test**: Switch to Hindi locale → filter labels appear in Hindi
- **Depends on**: None

---

### STG-442 — REORDER — Dismiss reason codes sent as translated strings to backend

- **Status**: PARKED — verified in reiteration, tag `stg-442-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 5e — [DismissReasonModal.tsx:39-46](src/components/reorder/DismissReasonModal.tsx#L39-L46)
- **Problem**: Predefined dismiss reasons have both a translation key and an English value. The `value` (English text) is sent to backend. If another language is active, backend still receives English, breaking analytics consistency.
- **Impact**: Backend analytics on dismiss reasons will be inconsistent across languages.
- **Fix**: Backend should accept reason codes ("NOT_NEEDED", "ALT_SUPPLIER", "OVERSTOCKED") instead of translated strings.
- **Migration**: None
- **Test**: Dismiss in Hindi locale → backend receives reason code, not Hindi text
- **Depends on**: None

---

### STG-443 — REORDER — Dismissal reason max length not validated on backend

- **Status**: PARKED — verified in reiteration, tag `stg-443-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit Area 5e security — [reorder.ts:616](backend/src/routes/v1/reorder.ts#L616)
- **Problem**: Frontend limits custom reason to 200 chars (`maxLength={200}`), but backend only checks `reason.trim().length === 0`. No max length validation. Direct API call with 100KB string would be stored.
- **Impact**: Possible data bloat via direct API abuse.
- **Fix**: Add `reason.trim().length <= 500` validation on backend.
- **Migration**: None
- **Test**: API call with 1000-char reason → 400 Bad Request
- **Depends on**: None

---

### STG-444 — REORDER — Missing accessibility labels on interactive elements

- **Status**: PARKED — verified in reiteration, tag `stg-444-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 5e a11y — [EditReorderModal.tsx:291](src/components/reorder/EditReorderModal.tsx#L291), [PolicyRow.tsx:41](src/components/reorder/PolicyRow.tsx#L41)
- **Problem**: Pressable supplier options in EditReorderModal and policy content area in PolicyRow lack `accessibilityLabel` and `accessibilityRole` props.
- **Impact**: Screen reader users can't distinguish interactive elements.
- **Fix**: Add `accessibilityLabel` to all interactive Pressable components.
- **Migration**: None
- **Test**: Screen reader announces supplier name when focused on picker option
- **Depends on**: None

---

### STG-445 — REORDER — formatMoney null safety risk on price display

- **Status**: PARKED — verified in reiteration, tag `stg-445-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 5e — [PendingReorderCard.tsx](src/components/reorder/PendingReorderCard.tsx)
- **Problem**: `formatMoney(suggestedUnitPrice)` called without null check. If `suggestedUnitPrice` is null/undefined, result could be "NaN" or crash.
- **Impact**: Runtime error or "NaN" displayed to retailer.
- **Fix**: Add null check: `suggestedUnitPrice ? formatMoney(suggestedUnitPrice) : t('reorder.priceNotSet')`.
- **Migration**: None
- **Test**: Pending reorder with null price → shows "Price not set" instead of NaN
- **Depends on**: None

---

### STG-446 — REORDER — No unit tests for reorder helper functions

- **Status**: PARKED — verified in reiteration, tag `stg-446-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 6f testing — [reorderApi.ts:357-375](src/services/api/reorderApi.ts#L357-L375)
- **Problem**: Helper functions `getStockDeficit()`, `isCriticallyLow()`, `getEstimatedTotal()` have no unit tests. Threshold calculations not verified.
- **Impact**: Silent bugs in stock calculations. No regression safety net.
- **Fix**: Add unit tests with edge cases (stock=0, negative prices, null values, boundary conditions).
- **Migration**: None
- **Test**: Unit tests for all 3 helpers pass with 100% branch coverage
- **Depends on**: None

---

### STG-447 — REORDER — Idempotency framework created but unused

- **Status**: PARKED — verified in reiteration, tag `stg-447-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit Area 6f — reorder schema
- **Problem**: `reorder.idempotency_keys` table and event inbox/outbox tables exist but no endpoint validates idempotency keys. Duplicate approval requests could create duplicate POs.
- **Impact**: Risk of duplicate purchase orders on network retry.
- **Fix**: Add Idempotency-Key header validation on POST `/pending/approve` and POST `/pending/:id/dismiss`.
- **Migration**: None
- **Test**: Send same approval request twice with same idempotency key → second returns cached result
- **Depends on**: None

---

### — AREA 7: Credit Screen & Financial Offers —

---

### STG-448 — CREDIT — Feature gate hardcoded `false` in PaymentOptionsSheet

- **Status**: PARKED — verified in reiteration, tag `stg-448-2026-03-14`
- **Priority**: P0
- **Source**: Deep audit Area 7 — [PaymentOptionsSheet.tsx:100](src/components/buy/PaymentOptionsSheet.tsx#L100)
- **Problem**: `const creditFeatureEnabled = false;` is hardcoded. Credit is ALWAYS disabled in checkout, regardless of backend configuration. Even if backend enables credit offers, POS blocks them.
- **Impact**: Credit feature is completely inaccessible to retailers. Entire credit module unusable.
- **Fix**: At PaymentOptionsSheet.tsx:100, replace `const creditFeatureEnabled = false;` with: `const creditFeatureEnabled = process.env.EXPO_PUBLIC_CREDIT_ENABLED === 'true';` (matching backend pattern at credit.ts:17 which reads `CREDIT_ENABLED` env var). Set `EXPO_PUBLIC_CREDIT_ENABLED=true` in staging `.env` and `false` in production until ready. Long-term: read from platform_settings API via Zustand store.
- **Migration**: None
- **Test**: Backend credit enabled + store eligible → credit option visible in payment sheet
- **Depends on**: None

---

### STG-449 — CREDIT — Credit scoring algorithm is simplified mock, not production-grade

- **Status**: PARKED — verified in reiteration, tag `stg-449-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 9 — [credit.ts:52-184](backend/src/routes/v1/pos/credit.ts#L52-L184)
- **Problem**: Scoring uses 4 factors with arbitrary thresholds (₹1L=EXCELLENT, ₹50K=GOOD). No consideration of: GST compliance, previous defaults, supplier ratings, inventory velocity, churn rate, industry risk, seasonal patterns. Hardcoded tier amounts.
- **Impact**: High-risk retailers may get high limits, safe ones get low limits. Not RBI-compliant for microfinance.
- **Fix**: (1) Move tier thresholds from credit.ts:155-167 to `payments.credit_score_tiers` config table (see STG-450). (2) Current 4 factors are: GMV (0-30pts, line 125-131), Transaction count (0-20pts, line 133-137), BNPL repayment rate (0-30pts with -20 penalty for defaults, line 139-143), Account age (0-20pts, line 145-149). Total = 100pts max. (3) Add 2 new factors: GST compliance (+10pts if GSTIN registered and filing current), Default history (-30pts if any drawdown defaulted in last 12 months). Adjust existing weights proportionally to keep total at 100. (4) Add `scoring_version` field to credit_offers to track which algorithm generated the score.
- **Migration**: New table `payments.credit_score_tiers` for configurable thresholds
- **Test**: Store with high GMV but past defaults → lower score than clean store with moderate GMV
- **Depends on**: None

---

### STG-450 — CREDIT — Credit score tiers hardcoded in source code

- **Status**: PARKED — verified in reiteration, tag `stg-450-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 9 — [credit.ts:155-167](backend/src/routes/v1/pos/credit.ts#L155-L167)
- **Problem**: Score thresholds and eligible amounts are hardcoded (≥80=EXCELLENT/₹2L, ≥60=GOOD/₹1L, etc.). Any change requires a code deploy.
- **Impact**: Can't adjust credit limits operationally without deploying new code.
- **Fix**: Move to `payments.credit_score_tiers` config table. Query at runtime.
- **Migration**: `CREATE TABLE payments.credit_score_tiers (id SERIAL, min_points INT, score VARCHAR, eligible_amount_minor BIGINT)`
- **Test**: Update tier in DB → next score calculation uses new thresholds
- **Depends on**: None

---

### STG-451 — CREDIT — No credit disbursement endpoint after admin approval

- **Status**: PARKED — verified in reiteration, tag `stg-451-2026-03-14`
- **Priority**: P0
- **Source**: Deep audit Area 11 — [credit.ts admin routes](backend/src/routes/v1/admin/credit.ts)
- **Problem**: Admin can approve a credit application, but no endpoint triggers actual disbursement. Application stays in 'approved' status with no path to 'disbursed'. No `createDrawdown()` call happens.
- **Impact**: Credit approval is a dead end. No money flows. The entire credit lifecycle is incomplete.
- **Fix**: Add `POST /admin/credit/applications/:id/disburse` that creates a drawdown via the provider, transitions app to 'disbursed', and returns loan details.
- **Migration**: None
- **Test**: Admin approves → admin disburses → drawdown created → app status = 'disbursed'
- **Depends on**: None

---

### STG-452 — CREDIT — KYC validation is format-only, no real identity verification

- **Status**: PARKED — verified in reiteration, tag `stg-452-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 12 — [credit.ts:525](backend/src/routes/v1/pos/credit.ts#L525)
- **Problem**: KYC checks only PAN format (`^[A-Z]{5}[0-9]{4}[A-Z]$`) and Aadhaar last 4 length. No real UIDAI/PAN/GST API verification. Any correctly-formatted string passes.
- **Impact**: Fake identities can submit credit applications. Fraud risk. Non-compliant with RBI KYC norms.
- **Fix**: Phase 1: Add checksums (PAN 4th char indicates entity type). Phase 2: Integrate real KYC verification API (UIDAI, NSDL PAN verify).
- **Migration**: None
- **Test**: Invalid PAN checksum → rejected. Valid format but fake PAN → flagged for manual review.
- **Depends on**: None

---

### STG-453 — CREDIT — No KYC document upload endpoint

- **Status**: PARKED — verified in reiteration, tag `stg-453-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 12 — [kyc_documents table](backend migrations)
- **Problem**: `payments.kyc_documents` and `kyc_provider_submissions` tables exist but no API endpoint accepts document uploads (GSTIN, bank statements). Current KYC only captures PAN + Aadhaar last 4 as text fields.
- **Impact**: Enhanced credit scoring impossible without full KYC documentation.
- **Fix**: Add `POST /api/v1/pos/credit/:appId/kyc/upload` accepting document files (GSTIN cert, bank statement PDF). Store in GCS.
- **Migration**: None
- **Test**: Upload GSTIN PDF → stored in GCS → linked to application
- **Depends on**: None

---

### STG-454 — CREDIT — Credit offers have no expiry cleanup job

- **Status**: PARKED — verified in reiteration, tag `stg-454-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [credit.ts:277-323](backend/src/routes/v1/pos/credit.ts#L277-L323)
- **Problem**: Offers have `valid_until` date and endpoint checks expiry before allowing application. But no background job deletes/archives expired offers. Stale offers accumulate in DB.
- **Impact**: DB bloat. Possible confusion if expired offers appear in queries due to race conditions.
- **Fix**: Add daily cron: `UPDATE payments.credit_offers SET status='expired' WHERE status='available' AND valid_until < NOW()`.
- **Migration**: None
- **Test**: Offer past valid_until → cron runs → status = 'expired', no longer shown
- **Depends on**: None

---

### — AREA 8: Financial Offer Aggregation —

---

### STG-455 — CREDIT — No external credit providers integrated (only internal BNPL)

- **Status**: PARKED — verified in reiteration, tag `stg-455-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 11 — [CreditProviderRegistry.ts:20-29](backend/src/services/credit/CreditProviderRegistry.ts#L20-L29)
- **Problem**: Provider registry architecture is ready (interface, registry, aggregation). But only SuperMandi internal and Mock providers are registered. No Rupifi, KredX, Mintifi, or other external providers.
- **Impact**: Retailers have only one credit option (internal BNPL). No competitive offers. If SuperMandi hits credit limit, no fallback.
- **Fix**: Provider interface (from CreditProvider.ts) requires implementing 4 methods: `getOffers(storeId): Promise<CreditOffer[]>`, `checkEligibility(storeId): Promise<EligibilityResult>`, `getBalance(storeId): Promise<BalanceResult>`, `healthCheck(): Promise<ProviderHealth>`. Steps: (1) Create `backend/src/services/credit/RupifiProvider.ts` implementing CreditProvider interface, (2) Register in CreditProviderRegistry.ts alongside SuperMandi and Mock providers, (3) Add Rupifi API key to Secret Manager, (4) Handle webhook callbacks for loan status updates. Target: Rupifi (India's largest embedded BNPL for B2B). Alternative: KredX or Mintifi. This is Phase 2 work — Phase 1 is internal BNPL only.
- **Migration**: Provider config entries in `payments.credit_provider_configs`
- **Test**: External provider returns offers → aggregated with internal offers → sorted by cost
- **Depends on**: None

---

### STG-456 — CREDIT — Provider failure silently hides offers, no partial result indicator

- **Status**: PARKED — verified in reiteration, tag `stg-456-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 11 — [CreditProviderRegistry.ts:67-92](backend/src/services/credit/CreditProviderRegistry.ts#L67-L92)
- **Problem**: If an external provider times out or errors, its offers are silently dropped. Other providers' offers still returned. No indication to frontend that results are partial.
- **Impact**: Retailer sees only some offers, doesn't know others exist but failed to load.
- **Fix**: In CreditProviderRegistry.ts `getAllOffers()` method (lines 77-79): currently logs warning and continues. Modify to: (1) Track provider status: `const providerHealth: Record<string, 'healthy'|'degraded'|'down'> = {}`. Mark 'healthy' on success, 'down' on error, 'degraded' on timeout >3s. (2) Return alongside offers: `{ offers, providerHealth, isPartialResult: Object.values(providerHealth).some(s => s !== 'healthy') }`. (3) Frontend CreditScreen.tsx: when `isPartialResult === true`, show amber banner at top: "Some credit providers are unavailable. You may not be seeing all offers." with "Retry" button.
- **Migration**: None
- **Test**: Provider X times out → response includes `isPartialResult: true` → banner shown
- **Depends on**: STG-455

---

### — AREA 9: Eligibility Logic —

---

### STG-457 — CREDIT — No consent management before credit scoring (DPDP Act)

- **Status**: PARKED — verified in reiteration, tag `stg-457-2026-03-14`
- **Priority**: P0
- **Source**: Deep audit Area 12 — [credit.ts:275](backend/src/routes/v1/pos/credit.ts#L275)
- **Problem**: Credit score calculated using retailer's transaction history, purchase volumes, and BNPL repayment data WITHOUT explicit consent. DPDP Act 2023 requires: clear notification, purpose disclosure, right to refuse, opt-out option.
- **Impact**: Non-compliance with DPDP Act 2023. Legal exposure.
- **Fix**: Add consent flow: (1) "We'll analyze your business to show credit offers. Proceed?" (2) If yes, calculate and show. (3) Store consent timestamp. (4) Allow opt-out.
- **Migration**: Add `credit_consent_given_at TIMESTAMPTZ` to stores table
- **Test**: First credit screen visit → consent prompt → accept → offers shown. Decline → no scoring.
- **Depends on**: None

---

### STG-458 — CREDIT — No re-eligibility check at application time

- **Status**: PARKED — verified in reiteration, tag `stg-458-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 9 — [credit.ts apply endpoint](backend/src/routes/v1/pos/credit.ts)
- **Problem**: Eligibility is checked when offers are generated but NOT re-checked when retailer applies. If circumstances changed (e.g., new default, lower GMV) between offer generation and application, stale eligibility is used.
- **Impact**: Retailers could apply for offers they're no longer eligible for. Approval race condition.
- **Fix**: Re-run eligibility check at application time. If no longer eligible, reject with explanation.
- **Migration**: None
- **Test**: Generate offer → simulate GMV drop → apply → rejected with "Eligibility changed"
- **Depends on**: None

---

### — AREA 10: Offer Display & Interaction —

---

### STG-459 — CREDIT — No application status timeline or tracking UI

- **Status**: PARKED — verified in reiteration, tag `stg-459-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 10 — [CreditScreen.tsx](src/screens/CreditScreen.tsx)
- **Problem**: After application, no timeline shows progress. If status = "kyc_verified", user doesn't know: Has approval been given? When will money arrive? No "View Details" or "Check Status" CTA.
- **Impact**: Retailer confusion. Can't track application without re-opening tab.
- **Fix**: In CreditScreen.tsx (1,498 lines, 3 tabs: "offers"|"loans"|"history"): (1) Add timeline component in the existing "loans" tab for active applications. Use `src/components/orders/StatusTimeline.tsx` as reference (already exists for order tracking). (2) Timeline steps: Applied → KYC Submitted → KYC Verified → Admin Review → Approved → Disbursed. (3) Map application status field to step index. (4) Show estimated time for next step based on average processing time. (5) Add "View Application" CTA on credit offer cards that navigates to a detail view with the timeline. Component placement: inside the loans tab when an application exists, above the active loans list.
- **Migration**: None
- **Test**: Application in kyc_verified → timeline shows steps 1-3 complete, step 4 pending
- **Depends on**: None

---

### STG-460 — CREDIT — PaymentOptionsSheet credit option shows no cost details

- **Status**: PARKED — verified in reiteration, tag `stg-460-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 10 — [PaymentOptionsSheet.tsx:344-376](src/components/buy/PaymentOptionsSheet.tsx#L344-L376)
- **Problem**: Credit option shows "Available: ₹50,000" but doesn't show interest rate, tenure, monthly EMI, or total repayable. BNPL shows "Pay by [date]" but credit option is bare.
- **Impact**: Retailer doesn't understand credit cost vs BNPL. May assume credit is free.
- **Fix**: In PaymentOptionsSheet.tsx:344-376, the credit option currently shows: icon (bank-outline), "Use Credit", and "Available: {{amount}}" (line 365). Enrich to: (1) Below availability line, add: "Interest: 18% p.a. | EMI: ₹X/mo" using offer data from credit API response. (2) EMI calculation: `principal * (rate/1200) * (1+rate/1200)^months / ((1+rate/1200)^months - 1)`. (3) If multiple offers, show best rate. (4) Data source: the `creditOffers` array from `useCreditStore()` — pass best offer's `interestRate` and `tenureMonths` to PaymentOptionsSheet via props or store.
- **Migration**: None
- **Test**: Credit option in payment sheet shows interest rate and EMI estimate
- **Depends on**: STG-448

---

### STG-461 — CREDIT — CreditScreen extremely large (55KB), needs component extraction

- **Status**: PARKED — verified in reiteration, tag `stg-461-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 10 — [CreditScreen.tsx](src/screens/CreditScreen.tsx)
- **Problem**: CreditScreen is 55KB managing 3 tabs (offers, loans, history) with complex modals for application, KYC, and repayment. No component extraction.
- **Impact**: Maintenance difficulty, potential performance issues on lower-end devices, hard to test.
- **Fix**: CreditScreen.tsx is 1,498 lines. Extract into 5 components in `src/components/credit/`: (1) `CreditOffersTab.tsx` — offers list + score breakdown display (from "offers" tab, ~300 lines), (2) `ActiveLoansList.tsx` — active loans with status + payment progress (from "loans" tab, ~250 lines), (3) `CreditHistoryTab.tsx` — past loans and completed applications (from "history" tab, ~200 lines), (4) `ApplicationModal.tsx` — the apply flow with steps "amount" | "kyc" | "success" (lines 82-100 state + modal content, ~300 lines), (5) `ScoreBreakdownCard.tsx` — credit score visualization (shared by offers and detail views, ~100 lines). Share state via props. Parent CreditScreen.tsx becomes tab orchestrator (~200 lines): tab state, data fetching, modal visibility. Use `TabId = "offers" | "loans" | "history"` type (already at line 43).
- **Migration**: None
- **Test**: All extracted components render correctly, no regression in functionality
- **Depends on**: None

---

### — AREA 11: BNPL Specific —

---

### STG-462 — BNPL — Interest calculation doesn't prorate by tenure days

- **Status**: PARKED — verified in reiteration, tag `stg-462-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 7 — [bnpl.ts:73-78](backend/src/routes/v1/pos/bnpl.ts#L73-L78)
- **Problem**: Interest uses simple `principal * rate / 100` without accounting for tenure days. A 30-day drawdown at 10% annual should be ~0.82%, not 10%. Current formula charges the full annual rate regardless of tenure.
- **Impact**: Retailers are overcharged on interest. Trust erosion.
- **Fix**: Prorate: `interestMinor = Math.round(principal * (rate / 100) * daysRemaining / 365)`.
- **Migration**: None
- **Test**: 7-day drawdown at 12% annual → interest = principal * 0.12 * 7 / 365
- **Depends on**: None

---

### STG-463 — BNPL — No overdue visual hierarchy in BnplDuesScreen

- **Status**: PARKED — verified in reiteration, tag `stg-463-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [BnplDuesScreen.tsx](src/screens/BnplDuesScreen.tsx)
- **Problem**: Overdue drawdowns not visually distinct. No red banner, no "ACTION REQUIRED" badge. User scrolling quickly might miss overdue items.
- **Impact**: Retailers miss payment deadlines, unintentional defaults.
- **Fix**: Add sticky overdue alert header: "{N} overdue payments — Pay now to avoid credit suspension".
- **Migration**: None
- **Test**: 2 overdue drawdowns → red sticky banner at top with count
- **Depends on**: None

---

### STG-464 — BNPL — Dispute has no audit trail or status history

- **Status**: PARKED — verified in reiteration, tag `stg-464-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [bnpl.ts:583-679](backend/src/routes/v1/pos/bnpl.ts#L583-L679)
- **Problem**: Dispute created but no: timestamp of creation, who created it (staff vs retailer), initial status reason, history of status changes (submitted → under_review → resolved).
- **Impact**: Support can't trace dispute lifecycle. No accountability if disputes are lost.
- **Fix**: Add `created_by`, `status_changed_at`, and `status_history JSONB` column to `bnpl_disputes`.
- **Migration**: ALTER TABLE payments.bnpl_disputes ADD COLUMN status_history JSONB DEFAULT '[]'
- **Test**: Dispute created → status_history contains initial entry with timestamp + actor
- **Depends on**: None

---

### STG-465 — BNPL — No drawdown limit per supplier

- **Status**: PARKED — verified in reiteration, tag `stg-465-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [bnpl.ts](backend/src/routes/v1/pos/bnpl.ts)
- **Problem**: Retailer can take unlimited BNPL from same supplier across multiple drawdowns. No aggregate check per supplier. Only store-level `bnpl_credit_limit` exists (bnpl.ts:63). No `supplier_bnpl_limit` or per-supplier-store cap in schema.
- **Impact**: Excessive credit exposure to single supplier. Financial risk for SuperMandi.
- **Fix**: (1) Add `bnpl_limit_minor BIGINT DEFAULT NULL` column to `supplier_store_links` table — NULL means use store-level default. (2) In bnpl.ts drawdown creation (around line 63): after store-level check, add: `SELECT COALESCE(SUM(principal_minor - paid_amount_minor), 0) FROM bnpl_drawdowns WHERE store_id=$1 AND supplier_id=$2 AND status IN ('active','partial','overdue')` and compare against `supplier_store_links.bnpl_limit_minor`. (3) Return 400 with message "Supplier credit limit reached (₹X outstanding of ₹Y limit)".
- **Migration**: None
- **Test**: Supplier limit ₹50k → existing ₹45k outstanding → new ₹10k drawdown → rejected
- **Depends on**: None

---

### STG-466 — BNPL — Payment status polling race condition

- **Status**: PARKED — verified in reiteration, tag `stg-466-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [bnplApi.ts:169-274](src/services/api/bnplApi.ts#L169-L274)
- **Problem**: `pollBnplPaymentStatus` has race condition: after `await getBnplPaymentStatus()`, between the check and resolve/reject, another poll could resolve first. If two polls race, the first resolve "wins" but second poll's cleanup might not fire.
- **Impact**: Memory leak — setInterval not cleared if promise resolves while interval is pending.
- **Fix**: Use AbortController explicitly. Clear interval BEFORE resolving. Add mutex on resolve/reject.
- **Migration**: None
- **Test**: Concurrent poll attempts → only one resolves, interval cleared, no memory leak
- **Depends on**: None

---

### STG-467 — BNPL — Overdue maturation job functions exist but no scheduler

- **Status**: PARKED — verified in reiteration, tag `stg-467-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 7 — backend BNPL overdue service
- **Problem**: `processOverdueDrawdowns()` and `getOverdueForReminders()` functions exist but no cron job is scheduled to run them. Drawdowns past due date are never automatically marked 'overdue'.
- **Impact**: Overdue drawdowns stay in 'active' status. No notifications sent. Credit risk unmeasured.
- **Fix**: Add daily cron job (2 AM IST) to run `processOverdueDrawdowns()` and dispatch FCM notifications.
- **Migration**: None
- **Test**: Drawdown past due date → cron runs → status = 'overdue' → FCM notification sent
- **Depends on**: None

---

### STG-468 — BNPL — Max days hardcoded to 7, not configurable per store type

- **Status**: PARKED — verified in reiteration, tag `stg-468-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 7 — [SuperMandiCreditProvider.ts:38](backend/src/services/credit/SuperMandiCreditProvider.ts#L38)
- **Problem**: `const maxDays = store.bnpl_max_days || 7;` defaults to 7 days. Not configurable per store type. Wholesale retailers may need 30 days.
- **Impact**: Wholesale stores forced into 7-day payment terms, which is too short.
- **Fix**: Add store type logic or make configurable via admin: wholesale = 30 days, retail = 7 days.
- **Migration**: None
- **Test**: Wholesale store → BNPL offers show 30-day tenure
- **Depends on**: None

---

### — AREA 12: Khata (Store Credit) —

---

### STG-469 — KHATA — Phone number validation too weak (length only)

- **Status**: PARKED — verified in reiteration, tag `stg-469-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 12 — [KhataScreen.tsx:162](src/screens/KhataScreen.tsx#L162)
- **Problem**: Only checks `phone.length < 10`. Accepts "0000000000" or non-numeric characters. No regex validation.
- **Impact**: Invalid phone numbers stored in khata ledger, causing downstream lookup failures.
- **Fix**: Add regex: `/^\d{10}$/.test(phone)` and Indian prefix validation.
- **Migration**: None
- **Test**: Enter "abcdefghij" → rejected. Enter "9876543210" → accepted.
- **Depends on**: None

---

### STG-470 — KHATA — Transaction type semantics unclear (DEBIT vs PAYMENT)

- **Status**: PARKED — verified in reiteration, tag `stg-470-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 12 — [khataService.ts:20](src/services/khataService.ts#L20)
- **Problem**: Types include "CREDIT", "DEBIT", "PAYMENT" but DEBIT and PAYMENT both reduce balance. Is DEBIT a refund or a reversal? Frontend doesn't use DEBIT.
- **Impact**: Ambiguous ledger. Auditors can't distinguish reversed credits from actual payments.
- **Fix**: In khataService.ts:20 and backend khata.ts: (1) Keep CREDIT (store gives credit to customer, increases balance), (2) Keep PAYMENT (customer pays back, reduces balance), (3) Remove DEBIT (currently unused in frontend, same icon as PAYMENT at lines 589-593 — redundant), (4) Add REFUND (store returns money to customer, reduces balance, linked to original CREDIT entry), (5) Add VOID (correction of erroneous entry, linked to original entry via `linked_entry_id`). Schema change: add `linked_entry_id UUID REFERENCES khata_entries(id)` column. Frontend: update KhataScreen.tsx icon mapping and color coding per type.
- **Migration**: ALTER TYPE to add new variants, migrate existing data
- **Test**: Record reversal → type = 'REVERSAL' with linkedEntryId pointing to original
- **Depends on**: None

---

### STG-471 — KHATA — No entry correction or void mechanism

- **Status**: PARKED — verified in reiteration, tag `stg-471-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 12 — [khata.ts:256](backend/src/routes/v1/pos/khata.ts#L256)
- **Problem**: Records `created_by: deviceId` (not staff name). No "deleted" or "voided" entry type. Incorrect entries are left in ledger with no correction path.
- **Impact**: Ledger integrity compromised. Disputes impossible to resolve.
- **Fix**: (1) In backend khata.ts:256: change `created_by` from deviceId to `staffId` (from JWT token). Add `staff_name` denormalized field for display. (2) Add void mechanism: `POST /api/v1/pos/khata/entries/:id/void` with body `{ reason: string }`. Sets `voided_at=NOW(), void_reason=$reason, voided_by=$staffId`. (3) Voided entries: excluded from balance calculation (`WHERE voided_at IS NULL`), shown in ledger with strikethrough + red "VOIDED" badge. (4) Frontend KhataScreen.tsx: add long-press on entry → "Void this entry?" confirmation with reason input. Only MANAGER role can void.
- **Migration**: Add `voided_at`, `void_reason`, `voided_by` columns
- **Test**: Void an entry → original marked voided → reversal entry created → balance recalculated
- **Depends on**: None

---

### STG-472 — KHATA — No bulk actions (settle, export, record payment for multiple)

- **Status**: PARKED — verified in reiteration, tag `stg-472-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 12 — [KhataScreen.tsx](src/screens/KhataScreen.tsx)
- **Problem**: Every khata entry is one-by-one. Can't: select multiple customers and record payment to all, bulk export ledger, or bulk settle accounts.
- **Impact**: Manager spends 10+ minutes recording daily settlements.
- **Fix**: Add checkbox selection + "Record Payment for Selected" button. Add "Export Ledger" option.
- **Migration**: None
- **Test**: Select 5 customers → "Record Payment ₹500 each" → all 5 updated
- **Depends on**: None

---

### STG-473 — KHATA — Customer phone numbers stored without consent (DPDP risk)

- **Status**: PARKED — verified in reiteration, tag `stg-473-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit Area 12 compliance — [KhataScreen.tsx](src/screens/KhataScreen.tsx), [khata.ts](backend/src/routes/v1/pos/khata.ts)
- **Problem**: Phone numbers stored without: consent from customers, purpose disclosure, retention policy, deletion mechanism. Informal credit ledger collects PII with no data protection.
- **Impact**: Data breach exposes customer phone numbers + balances without permission. DPDP Act non-compliance.
- **Fix**: (1) In KhataScreen.tsx, before first entry creation (Add Credit modal at lines 778-787 and Record Payment modal at lines 854-863): show consent checkbox "Customer agrees to store their phone number for credit tracking" — block save if unchecked. (2) Backend khata.ts: add `consent_given_at TIMESTAMPTZ` column to `khata_customers` table. Reject entry creation if `consent_given_at IS NULL`. (3) Retention: add daily cron job to anonymize phone numbers (replace with hash) for customers with no active balance and last transaction > 2 years. (4) Add "Delete My Data" button in customer detail → removes phone, keeps anonymized ledger for accounting.
- **Migration**: Add `consent_given_at` column to khata_customers
- **Test**: First khata entry → consent prompt → accept → entry created with consent timestamp
- **Depends on**: None

---

### — AREA 13: Compliance & Data Security —

---

### STG-474 — CREDIT — PAN number stored in plaintext (DPDP Act violation)

- **Status**: PARKED — verified in reiteration, tag `stg-474-2026-03-14`
- **Priority**: P0
- **Source**: Deep audit Area 12 — [credit.ts:550](backend/src/routes/v1/pos/credit.ts#L550)
- **Problem**: Full PAN (10 characters) stored in plain text in `credit_applications` table. No column-level encryption, no key rotation. Full backup exposure.
- **Impact**: Data breach = retailer privacy violation + DPDP Act 2023 non-compliance.
- **Fix**: Encrypt PAN at rest using AES-256 with key from Secrets Manager. Add pgcrypto for transparent column encryption. Audit all DB backups for PII exposure.
- **Migration**: Encrypt existing PAN values in credit_applications
- **Test**: PAN stored → DB column shows encrypted value → decrypt API returns original
- **Depends on**: None

---

### STG-475 — CREDIT — No rate limiting on credit offer generation endpoint

- **Status**: PARKED — verified in reiteration, tag `stg-475-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 13 — [credit.ts](backend/src/routes/v1/pos/credit.ts)
- **Problem**: BNPL payment endpoints are rate-limited via `financialOperationsRateLimiter`, but credit offer generation (which triggers expensive scoring calculation) is not rate-limited.
- **Impact**: Repeated calls could overload scoring logic. Potential DoS vector.
- **Fix**: In backend credit.ts, import existing `financialOperationsRateLimiter` from bnpl.ts (already used at bnpl.ts:9). Apply to `GET /api/v1/pos/credit/offers` route (around line 264): `router.get('/offers', financialOperationsRateLimiter, async (req, res) => { ... })`. The existing rate limiter is Redis-based and per-store (keyed by storeId from JWT). Configure: 5 requests per minute per store for offer generation, 10 per minute for read-only queries.
- **Migration**: None
- **Test**: 6 rapid requests → 6th returns 429 with retry-after header
- **Depends on**: None

---

### STG-476 — CREDIT — Missing composite index on bnpl_drawdowns for hot queries

- **Status**: PARKED — verified in reiteration, tag `stg-476-2026-03-14`
- **Priority**: P2
- **Source**: Deep audit Area 13 performance — [bnpl.ts](backend/src/routes/v1/pos/bnpl.ts)
- **Problem**: No explicit index on `bnpl_drawdowns(store_id, status, due_date DESC)`. Active/summary queries do full table scan.
- **Impact**: Query performance degrades as drawdown count grows.
- **Fix**: `CREATE INDEX idx_bnpl_drawdowns_store_status ON payments.bnpl_drawdowns(store_id, status, due_date DESC)`.
- **Migration**: Add index migration
- **Test**: EXPLAIN ANALYZE on active drawdowns query → uses index scan
- **Depends on**: None

---

### — Cross-Cutting Issues —

---

### STG-477 — CREDIT — Hardcoded ₹ currency symbol in multiple screens

- **Status**: PARKED — verified in reiteration, tag `stg-477-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit cross-cutting — [BulkPurchaseCreditScreen.tsx:152](src/screens/BulkPurchaseCreditScreen.tsx#L152), [KhataScreen.tsx:576](src/screens/KhataScreen.tsx#L576)
- **Problem**: Hardcoded `₹` (Unicode `\u20B9`) in multiple screens instead of using i18n currency formatting.
- **Impact**: If SuperMandi expands to non-India regions, wrong currency shown.
- **Fix**: 3 hardcoded ₹ occurrences found: KhataScreen.tsx:798 ("Amount (₹) *"), KhataScreen.tsx:865 ("Amount (₹) *"), BnplDuesScreen.tsx:678 (currency display). CreditScreen uses `formatMoney()` correctly. Replace hardcoded ₹ with `formatMoney()` from `src/utils/money.ts` or use i18n: `t('common.currency', { amount })`. Low priority — India-only for now, but consistency with CreditScreen pattern is good practice.
- **Migration**: None
- **Test**: Locale switch → currency symbol changes accordingly
- **Depends on**: None

---

### STG-478 — CREDIT — BnplDuesScreen 55KB, same extraction needed as CreditScreen

- **Status**: PARKED — verified in reiteration, tag `stg-478-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit cross-cutting — [BnplDuesScreen.tsx](src/screens/BnplDuesScreen.tsx)
- **Problem**: BnplDuesScreen is 55KB, same issue as CreditScreen (STG-461). Both manage complex modals and state in a single file.
- **Impact**: Maintenance difficulty, performance on low-end devices.
- **Fix**: BnplDuesScreen.tsx is 1,439 lines. Extract into 4 components in `src/components/bnpl/`: (1) `ActiveDrawdownsList.tsx` — main list with status badges and payment actions (lines ~400-700), (2) `OverdueBanner.tsx` — top banner showing overdue count + total amount (lines ~150-200), (3) `RepaymentModal.tsx` — payment recording form with UTR input + polling (lines ~700-1000), (4) `DisputeModal.tsx` — dispute creation and status tracking (lines ~1000-1200). Share state via props or Zustand store. Parent BnplDuesScreen.tsx becomes orchestrator (~200 lines): data fetching + modal visibility state + layout composition.
- **Migration**: None
- **Test**: Extracted components render correctly, no regression
- **Depends on**: None

---

### STG-479 — REORDER/CREDIT — No E2E test for reorder approval → PO creation lifecycle

- **Status**: PARKED — verified in reiteration, tag `stg-479-2026-03-14`
- **Priority**: P1
- **Source**: Deep audit testing — e2e-tests/
- **Problem**: No E2E test covering: suggestion generation → pending reorder → edit quantity → approve → draft PO created → supplier linked. Also no E2E for credit: apply → KYC → approve → disburse.
- **Impact**: Critical business flows untested end-to-end. Regressions ship undetected.
- **Fix**: Split into 2 test files: (1) `e2e-tests/tests/reorder-approval/reorder-approval.spec.ts`: Setup store with products below min_stock → trigger reorder run API → verify pending reorders created → edit quantity via API → approve selected → verify draft PO created with correct supplier + quantities → verify reorder status = 'approved'. Note: `e2e-tests/tests/reorder-lifecycle/reorder-lifecycle.spec.ts` already exists (50+ lines) covering settings → policies — extend it or add separate approval file. (2) `e2e-tests/tests/credit-lifecycle/credit-lifecycle.spec.ts` (NEW): Setup store with sufficient GMV history → request credit offers → verify score + tier → submit application with KYC → admin approve → verify application status timeline. No credit E2E exists currently.
- **Migration**: None
- **Test**: E2E suite covers reorder approval + credit application flows
- **Depends on**: None

---

### STG-480 — BNPL — No early repayment incentive or standing instructions

- **Status**: PARKED — verified in reiteration, tag `stg-480-2026-03-14`
- **Priority**: P3
- **Source**: Deep audit Area 7 — BNPL payment flow
- **Problem**: No discount for early BNPL repayment. No auto-debit or recurring mandate option. Manual UTR entry required every time.
- **Impact**: No incentive for retailers to pay early. Manual process increases friction.
- **Fix**: Phase 1 — In bnpl.ts payment endpoint (lines 73-78 where `interest = principal * rate / 100`): (1) Calculate `daysRemaining = due_date - payment_date`. If `daysRemaining > 0` (early payment): `earlyDiscount = interest * (daysRemaining / totalTenureDays) * 0.5` (50% of remaining interest waived). (2) Show discount in BnplDuesScreen repayment modal: "Pay now and save ₹X (early payment discount)". (3) Store `early_payment_discount_minor` in payment record. Phase 2 (future): UPI mandate via `POST /bnpl/:drawdownId/mandate` using NPCI recurring mandate API — separate ticket when UPI mandate integration is available.
- **Migration**: None
- **Test**: Pay 5 days early on 7-day term → interest reduced by proportional amount
- **Depends on**: None

---

<!-- NEW TICKETS BELOW THIS LINE — next ticket: STG-552 -->

## Comprehensive Audit Tickets (STG-493 — STG-551)

> Generated from 6-layer comprehensive audit on 2026-03-15.
> Covers: UI/UX, API/Middleware, DB/Migrations, Cross-Portal, Business Logic, GCP Parity.
> 59 findings → 59 tickets. Ordered by severity: CRITICAL → HIGH → MEDIUM → LOW.

### Summary Table

| # | Title | Priority | Status |
|---|-------|----------|--------|
| STG-493 | Apply migration 188 (consent_records) to staging DB | P0 | PARKED (ops task — run migrate-prod.js on staging DB) |
| STG-494 | Apply migration 189 (khata_void_column) to staging DB | P0 | PARKED (ops task — run migrate-prod.js on staging DB, after STG-493) |
| STG-495 | Add ROLLBACK comments to 192 migrations missing them | P0 | PARKED (192 files exceed 15-file gate) |
| STG-496 | Payment double-tap — set submittingRef before API call | P0 | PARKED (already fixed in AUD-055-A, lines 965-967) |
| STG-497 | GRN duplicate submission — add idempotency key to receiveGoods | P0 | PARKED (bb389f28, stg-497-2026-03-15) |
| STG-498 | Cart lock expiry — validate lock before payment submission | P0 | PARKED (74b6d685, stg-498-2026-03-15) |
| STG-499 | Health endpoint timing attack — use crypto.timingSafeEqual | P1 | PARKED (bced9d26, stg-499-2026-03-15) |
| STG-500 | Webhook idempotency race — atomic Redis SET NX EX | P1 | PARKED (74cc8695, stg-500-2026-03-15) |
| STG-501 | Enrollment rate limiters — share state between burst and sustained | P1 | PARKED (ed7a3303, stg-501-2026-03-16) |
| STG-502 | Device token plaintext fallback — warn when SecureStore unavailable | P1 | PARKED (539a60ee, stg-502-2026-03-15) |
| STG-503 | Zero-amount checkout — block totalMinor <= 0 | P1 | PARKED (already fixed in STG-401, line 272: totalMinor <= 0 → cartValid=false) |
| STG-504 | Hardcoded WhatsApp color #25D366 — use theme token | P1 | PARKED (47feb961, stg-504-2026-03-15) |
| STG-505 | AIInsightsScreen error classification — use error codes not string matching | P1 | PARKED (d641c4f7, stg-505-2026-03-15) |
| STG-506 | Migration 128 UNIQUE INDEX — add IF NOT EXISTS guard | P1 | PARKED (1fdb9d2e, stg-506-2026-03-15) |
| STG-507 | PENDING_UPI crash recovery — prevent stock deduction replay | P1 | PARKED (already fixed by STG-504, WhatsApp theme token covers all screens) |
| STG-508 | GRN negative quantity — validate >= 0 at input with error message | P2 | PARKED (7d7f6210, stg-508-2026-03-15) |
| STG-509 | GRN excess quantity — backend reject qty > ordered + 10% tolerance | P2 | PARKED (e99ffa48, stg-509-2026-03-15) |
| STG-510 | Duplicate scan window — track per-barcode, not single lastScan | P2 | PARKED (16bc9320, stg-510-2026-03-15) |
| STG-511 | Offline stock cache — merge entries for multi-barcode products | P2 | PARKED (e9f397e6, stg-511-2026-03-16) |
| STG-512 | Credit score calculation — wrap in transaction for consistency | P2 | PARKED (d6d8f1b7, stg-512-2026-03-15) |
| STG-513 | Large amount silent cap — show error instead of truncating to 10M | P2 | PARKED (b9e97ac7, stg-513-2026-03-15) |
| STG-514 | Sync batch retry — add exponential backoff between batches | P2 | PARKED (4cc79890, stg-514-2026-03-15) |
| STG-515 | Date conversion timezone — ensure created_at uses TIMESTAMPTZ consistently | P2 | PARKED (accd2478, stg-515-2026-03-16) |
| STG-516 | Search cache — add invalidation on product add/price change | P2 | PARKED (a4b62444, stg-516-2026-03-16) |
| STG-517 | Supplier price cache — reduce 5-min TTL or add invalidation trigger | P2 | PARKED (fc210091, stg-517-2026-03-16) |
| STG-518 | HTTPS enforcement — add to supplier-portal and superadmin (like retailer-admin) | P2 | PARKED (0cbcf979, stg-518-2026-03-15) |
| STG-519 | CORS_ALLOWED_ORIGINS — set explicitly in Cloud Run env vars | P2 | PARKED (8a39e292, stg-519-2026-03-16) |
| STG-520 | Admin API key lookup — add timing-safe response for missing keys | P2 | PARKED (01a1818e, stg-520-2026-03-15) |
| STG-521 | Webhook signature format — validate header format before HMAC | P2 | PARKED (d71bf6c2, stg-521-2026-03-15) |
| STG-522 | Error handler — stop leaking DB constraint names in non-production | P2 | PARKED (49ab164a, stg-522-2026-03-15) |
| STG-523 | Store isolation enforceStoreBinding — log warning when no storeId sent | P2 | PARKED (0548b19c, stg-523-2026-03-15) |
| STG-524 | AIInsightsScreen tab labels — replace hardcoded English with i18n t() | P2 | PARKED (173424eb, stg-524-2026-03-15) |
| STG-525 | AIInsightsScreen retry/empty text — add i18n keys for "Tap to retry" etc | P2 | PARKED (173424eb, stg-525-2026-03-15, NOTE: shares commit with STG-524) |
| STG-526 | BuyScreen — add explicit empty state for zero products | P2 | PARKED (64be73fc, stg-526-2026-03-16) |
| STG-527 | ChatListScreen — add explicit empty/error state handling | P2 | PARKED (already fixed by STG-101/STG-528, ChatListScreen has error/empty states) |
| STG-528 | CustomerListScreen — show error state when error is set | P2 | PARKED (3dda7a5a, stg-528-2026-03-15) |
| STG-529 | PaymentSetupScreen BackHandler — add handleSkip to useEffect deps | P2 | PARKED (dd86dff5, stg-529-2026-03-15) |
| STG-530 | CreditScreen consent — show consent request UI instead of empty screen | P2 | PARKED (19f80a90, stg-530-2026-03-16) |
| STG-531 | KhataScreen modal scroll — wrap modal content in ScrollView for small screens | P2 | PARKED (108ff5b8, stg-531-2026-03-16) |
| STG-532 | Accessibility — add accessibilityLabel to MenuScreen interactive icons | P2 | PARKED (4e266b51, stg-532-2026-03-16) |
| STG-533 | Accessibility — add accessibilityLabel to CustomerListScreen form inputs | P2 | PARKED (814634bd, stg-533-2026-03-16) |
| STG-534 | Khata negative balance — add explicit handling/display for overpayment | P2 | PARKED (2a3d6cdb, stg-534-2026-03-15) |
| STG-535 | POS dev config port 3001 vs portals 3000 — document in .env.example | P3 | PARKED (d8ce1fa1, stg-535-2026-03-15, BUNDLED with 538/539/548) |
| STG-536 | Response format inconsistency — standardize error JSON across all routes | P3 | PARKED (7df7f9d8, stg-536-2026-03-16) |
| STG-537 | Demo endpoint — add explicit enableDemo flag in request body | P3 | PARKED (b1c002ae, stg-537-2026-03-15) |
| STG-538 | Document nullable store_id rationale in audit/chat tables | P3 | PARKED (d8ce1fa1, stg-538-2026-03-15, BUNDLED with 535/539/548) |
| STG-539 | Document placeholder migrations 115-117, 158 purpose | P3 | PARKED (d8ce1fa1, stg-539-2026-03-15, BUNDLED with 535/538/548) |
| STG-540 | Barcode validation — reject 2-char inputs | P2 | PARKED (0974b94d, stg-540-2026-03-15) |
| STG-541 | Search minimum query — allow 1-char search for short product names | P3 | PARKED (8907049e, stg-541-2026-03-15) |
| STG-542 | Negative total cap — show validation error instead of silent Math.max(0) | P3 | PARKED (d85e2bb8, stg-542-2026-03-15) |
| STG-543 | formatMoney — show .00 consistently for round amounts | P3 | PARKED (3ab21a04, stg-543-2026-03-15) |
| STG-544 | Currency fallback — use currency code consistently when Intl unavailable | P3 | PARKED (05e8a1bd, stg-544-2026-03-15) |
| STG-545 | Relative time format — handle UTC vs IST in formatRelativeTime | P3 | PARKED (8df183a9, stg-545-2026-03-15) |
| STG-546 | Sync duplicate_ignored — verify local-to-server mapping before clearing | P3 | PARKED (a29a5959, stg-546-2026-03-15) |
| STG-547 | Device session cache — handle mid-operation token expiry gracefully | P3 | PARKED (ffe82ff0, stg-547-2026-03-16) |
| STG-548 | Redundant store isolation — document deviceToken as primary, storeIsolation as secondary | P3 | PARKED (d8ce1fa1, stg-548-2026-03-15, BUNDLED with 535/538/539) |
| STG-549 | ForceUpdateScreen hardcoded WhatsApp icon color #25D366 | P3 | PARKED (already fixed by STG-504, ForceUpdateScreen WhatsApp color themed) |
| STG-550 | CustomerManagementScreen hardcoded WhatsApp color instances | P3 | PARKED (already fixed by STG-504, CustomerManagementScreen WhatsApp color themed) |
| STG-551 | ReturnScreen post-refund navigation — verify success flow exists | P3 | PARKED (already fixed by STG-101, ReturnScreen post-refund navigation exists) |

---

### STG-493 — CRITICAL: Apply migration 188 (consent_records) to staging DB

- **Status**: OPEN
- **Priority**: P0
- **Source**: Comprehensive audit 2026-03-15 — GCP Parity Layer (C-1)
- **Problem**: Migration 188 (`188_consent_records.sql`) creates `platform.consent_records` table for DPDP compliance. Code on HEAD (04f84e84) has consent endpoints that query this table, but staging DB only has 187 migrations applied. Deploying HEAD without this migration causes 500 errors on POST /api/v1/consent/record, GET /api/v1/consent/check, POST /api/v1/consent/revoke.
- **Fix**: Run `node backend/scripts/migrate-prod.js dry-run` to preview, then apply migration 188 to staging Cloud SQL. Verify table exists: `SELECT * FROM platform.consent_records LIMIT 1`.
- **Migration**: 188_consent_records.sql (already exists in codebase)
- **Test**: After migration, call GET /api/v1/consent/check with valid device token — should return 200, not 500.
- **Depends on**: Cloud SQL proxy access

---

### STG-494 — CRITICAL: Apply migration 189 (khata_void_column) to staging DB

- **Status**: OPEN
- **Priority**: P0
- **Source**: Comprehensive audit 2026-03-15 — GCP Parity Layer (C-2)
- **Problem**: Migration 189 (`189_khata_void_column.sql`) adds `voided_at TIMESTAMPTZ` and `voided_by UUID` columns to `orders.khata_entries`. The khata void endpoint (POST /api/v1/pos/khata/entries/:id/void) references these columns. Without migration, endpoint returns 500 (column doesn't exist).
- **Fix**: Apply migration 189 after 188. Verify: `SELECT column_name FROM information_schema.columns WHERE table_name = 'khata_entries' AND column_name IN ('voided_at', 'voided_by')`.
- **Migration**: 189_khata_void_column.sql (already exists in codebase)
- **Test**: After migration, call POST void endpoint — should return proper response, not 500.
- **Depends on**: STG-493 (sequential migration order)

---

### STG-495 — CRITICAL: Add ROLLBACK comments to 192 migrations

- **Status**: OPEN
- **Priority**: P0
- **Source**: Comprehensive audit 2026-03-15 — DB Layer (C-3)
- **Problem**: Only 2 of 194 migrations (188, 189) have `-- ROLLBACK:` comments. During an incident, if a migration needs reversal, there is no documented rollback SQL. This violates Gate 5 (migration rollback requirement) and makes incident response dangerous.
- **Fix**: Add `-- ROLLBACK: <reverse SQL>` comment to top of each migration file. For CREATE TABLE: `DROP TABLE IF EXISTS <table> CASCADE`. For ALTER TABLE ADD COLUMN: `ALTER TABLE <table> DROP COLUMN IF EXISTS <col>`. For CREATE INDEX: `DROP INDEX IF EXISTS <index>`. Start with critical migrations: 001, 004, 005, 006, 018, 028, 040, 049, 068, 069, 070, 080, 136, 139, 149.
- **Migration**: None (comments only)
- **Test**: Grep for `-- ROLLBACK:` — count should equal total migration files.
- **Depends on**: None

---

### STG-496 — CRITICAL: Payment double-tap — set submittingRef before API call

- **Status**: OPEN
- **Priority**: P0
- **Source**: Comprehensive audit 2026-03-15 — Business Logic Layer (H-4)
- **File**: `src/screens/PaymentScreen.tsx:878-955`
- **Problem**: `handleCompletePayment` sets `submittingRef.current = true` AFTER calling `setSubmitting(true)` (React state, async). During the re-render gap, a second tap can invoke handleCompletePayment before submittingRef is set, sending two payment requests to backend. Backend has idempotency but frontend doesn't prevent the duplicate request.
- **Fix**: (1) Set `submittingRef.current = true` as FIRST LINE of handleCompletePayment, before any async ops. (2) Add early return: `if (submittingRef.current) return;`. (3) Disable the Complete button via `disabled={submitting}` prop. (4) Clear submittingRef in finally block.
- **Migration**: None
- **Test**: Rapid double-tap Complete button — only one API call should fire. Verify with network inspector or backend logs.
- **Depends on**: None

---

### STG-497 — CRITICAL: GRN duplicate submission — add idempotency key

- **Status**: OPEN
- **Priority**: P0
- **Source**: Comprehensive audit 2026-03-15 — Business Logic Layer (H-5, 4.3)
- **File**: `src/screens/GRNScreen.tsx:306-402` (frontend), `backend/src/routes/v1/orders.ts` (backend)
- **Problem**: GRN submit sends `orderApi.receiveGoods()` to backend. If network response is lost, user retries, backend processes same GRN again — doubling inventory. No idempotency key prevents this.
- **Fix**: (1) Frontend: Generate idempotency key = `sha256(orderId + JSON.stringify(sortedItems) + quantities)` before submit. Send as `X-Idempotency-Key` header. (2) Backend: Check `idempotency.webhook_events` table for key. If exists, return cached response. If not, process GRN and store key. (3) Frontend: Set `submittingRef.current = true` before API call to prevent double-tap.
- **Migration**: None (reuse existing idempotency table)
- **Test**: Submit GRN → success. Submit same GRN again with same idempotency key → returns cached result, stock unchanged.
- **Depends on**: None

---

### STG-498 — CRITICAL: Cart lock expiry — validate before payment

- **Status**: OPEN
- **Priority**: P0
- **Source**: Comprehensive audit 2026-03-15 — Business Logic Layer (H-6)
- **File**: `src/screens/PaymentScreen.tsx:308-322`
- **Problem**: Cart lock expires after 5 minutes (CART_LOCK_TIMEOUT_MS). If user leaves PaymentScreen open past expiry, lock releases. Another POS device can modify the cart. Original device still shows stale payment screen. Tapping "Complete" pays for a potentially empty or modified cart.
- **Fix**: (1) Before `handleCompletePayment`, check `Date.now() - lockAcquiredAt > CART_LOCK_TIMEOUT_MS`. (2) If expired, show Alert: "Cart session expired. Please review your cart and try again." (3) Navigate back to cart screen. (4) Optionally: auto-refresh cart from server before completing payment.
- **Migration**: None
- **Test**: Open payment screen. Wait 6 minutes. Tap Complete → should show expiry alert, not submit payment.
- **Depends on**: None

---

### STG-499 — HIGH: Health endpoint timing attack

- **Status**: OPEN
- **Priority**: P1
- **Source**: Comprehensive audit 2026-03-15 — API Layer (H-1)
- **File**: `backend/src/routes/v1/admin/health.ts:26`
- **Problem**: `if (!token || token !== ADMIN_TOKEN)` uses direct string comparison, vulnerable to timing attacks that can guess ADMIN_TOKEN character-by-character.
- **Fix**: Replace with `crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ADMIN_TOKEN))`. Add length check first: `if (!token || token.length !== ADMIN_TOKEN.length)`.
- **Migration**: None
- **Test**: Health endpoint still accepts valid token, rejects invalid.
- **Depends on**: None

---

### STG-500 — HIGH: Webhook idempotency race condition

- **Status**: OPEN
- **Priority**: P1
- **Source**: Comprehensive audit 2026-03-15 — API Layer (H-2)
- **File**: `backend/src/routes/v1/webhooks.ts:285-298`
- **Problem**: TOCTOU race between `isWebhookEventProcessed()` check and `markWebhookEventProcessed()` set. Concurrent webhook delivery can process same event twice (double payment credit).
- **Fix**: Replace check+set with atomic Redis operation: `SET idempotency:<key> 1 NX EX 86400`. If SET returns null (key already exists), skip processing. This is atomic — no race window.
- **Migration**: None
- **Test**: Send same webhook event concurrently (10 parallel requests) — only one should be processed. Verify payment credited once.
- **Depends on**: None

---

### STG-501 — HIGH: Enrollment rate limiters share state

- **Status**: OPEN
- **Priority**: P1
- **Source**: Comprehensive audit 2026-03-15 — API Layer (H-3)
- **File**: `backend/src/routes/v1/pos/enroll.ts:20-34`
- **Problem**: Two independent rate limiters (3/min burst + 10/15min sustained) don't share state. Attacker can distribute requests to bypass burst limiter.
- **Fix**: Use single sliding-window rate limiter with two thresholds, or make burst limiter count towards sustained limiter's quota.
- **Migration**: None
- **Test**: Send 3 requests in 1 minute (burst limit). Send 4th → rejected. Send 10 over 15 min → rejected after 10th.
- **Depends on**: None

---

### STG-502 — HIGH: Device token plaintext fallback warning

- **Status**: OPEN
- **Priority**: P1
- **Source**: Comprehensive audit 2026-03-15 — Business Logic Layer (H-7)
- **File**: `src/services/deviceSession.ts:88-90`
- **Problem**: If SecureStore is unavailable, device token falls back to AsyncStorage (plaintext). Token is sensitive auth credential — plaintext storage allows theft on compromised devices.
- **Fix**: (1) Log warning when fallback triggers. (2) Show one-time Alert to user: "Your device doesn't support secure storage. Authentication data stored with reduced security." (3) Consider refusing to store token without SecureStore on Android API 23+.
- **Migration**: None
- **Test**: Mock SecureStore failure → warning shown. Token still stored (graceful degradation).
- **Depends on**: None

---

### STG-503 — HIGH: Block zero-amount checkout

- **Status**: OPEN
- **Priority**: P1
- **Source**: Comprehensive audit 2026-03-15 — Business Logic Layer (H-1 Biz)
- **File**: `src/screens/PaymentScreen.tsx:132-149, 878-955`
- **Problem**: 100% discount produces totalMinor = 0. Payment screen allows checkout with ₹0 amount. Backend processes zero-rupee sale. This is a business logic violation — sales must have positive total.
- **Fix**: Add guard in `handleCompletePayment`: `if (totalMinor <= 0) { Alert.alert("Invalid Amount", "Sale total must be greater than zero."); return; }`. Also disable Complete button when totalMinor <= 0.
- **Migration**: None
- **Test**: Apply 100% discount → Complete button disabled. Force call → rejected with error.
- **Depends on**: None

---

### STG-504 — HIGH: Replace hardcoded WhatsApp color with theme token

- **Status**: OPEN
- **Priority**: P1
- **Source**: Comprehensive audit 2026-03-15 — UI Layer (H-8)
- **Files**: `src/screens/EnrollDeviceScreen.tsx:673`, `src/screens/ForceUpdateScreen.tsx:389`, `src/screens/CustomerManagementScreen.tsx`
- **Problem**: WhatsApp green `#25D366` hardcoded in 3+ screens. Breaks dark mode consistency.
- **Fix**: Add `whatsapp: '#25D366'` to theme color tokens in `src/theme/colors.ts`. Replace all hardcoded instances with `colors.whatsapp`.
- **Migration**: None
- **Test**: Toggle dark mode — WhatsApp buttons use theme-consistent colors.
- **Depends on**: None

---

### STG-505 — HIGH: AIInsightsScreen — use error codes not string matching

- **Status**: OPEN
- **Priority**: P1
- **Source**: Comprehensive audit 2026-03-15 — UI Layer (H-9)
- **File**: `src/screens/AIInsightsScreen.tsx:73-79`
- **Problem**: Error classification uses `msg.includes('404')`, `msg.includes('network')` — fragile string matching. Different backends or locales may produce different error messages, breaking classification.
- **Fix**: Use HTTP status codes from API response: `if (err.response?.status === 404)` for not-found, `if (!err.response)` for network errors. Fall back to generic error for unknown statuses.
- **Migration**: None
- **Test**: Mock 404 response → shows "not available" message. Mock network error → shows "check connection" message.
- **Depends on**: None

---

### STG-506 — HIGH: Migration 128 — add IF NOT EXISTS to UNIQUE INDEX

- **Status**: OPEN
- **Priority**: P1
- **Source**: Comprehensive audit 2026-03-15 — DB Layer (H-10)
- **File**: `backend/migrations/128_t001_relax_gstin_draft_uniqueness.sql:25`
- **Problem**: CREATE UNIQUE INDEX without IF NOT EXISTS. If migration is re-run (e.g., during recovery), it fails with "index already exists" error, blocking subsequent migrations.
- **Fix**: Change to `CREATE UNIQUE INDEX IF NOT EXISTS ...`.
- **Migration**: Edit existing migration file (safe — adds defensive guard only)
- **Test**: Run migration twice — second run should be no-op, not error.
- **Depends on**: None

---

### STG-507 — HIGH: PENDING_UPI crash recovery — prevent stock deduction replay

- **Status**: PARKED (already fixed by STG-101)
- **Priority**: P1
- **Source**: Comprehensive audit 2026-03-15 — Business Logic Layer (3.4)
- **File**: `src/screens/PaymentScreen.tsx:323-385`
- **Problem**: If app crashes after payment confirmed (status=PAID) but before stock deduction (applyBulkDeductions), recovery clears PENDING_UPI but sale shows PAID. Stock deduction replays on next sync — double deduction.
- **Resolution**: Already fixed by STG-101. Frontend does NOT deduct stock — backend handles stock deduction atomically inside the payment endpoints (applyBulkDeductions). `checkoutService.ts:78-81` explicitly documents this. PENDING_UPI recovery only shows an alert, never re-triggers checkout/deduction. No code change needed.
- **Depends on**: STG-496

---

### STG-508 — MEDIUM: GRN negative quantity validation

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Business Logic (4.1)
- **File**: `src/screens/GRNScreen.tsx:122-131`
- **Problem**: `handleReceiveQuantityChange` accepts negative numbers. Filter at line 311 silently skips qty <= 0 — user thinks item included but it isn't.
- **Fix**: Add validation in handleReceiveQuantityChange: `if (quantity < 0) { setError('Quantity cannot be negative'); return; }`. Show inline error below input field.
- **Depends on**: None

---

### STG-509 — MEDIUM: GRN excess quantity backend validation

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Business Logic (4.2)
- **File**: `backend/src/routes/v1/orders.ts`
- **Problem**: Backend accepts qty received > qty ordered without limit. Causes inventory overage and supplier invoice mismatch.
- **Fix**: Backend: reject if `received_qty > ordered_qty * 1.1` (10% tolerance). Return 400 with `EXCESS_QUANTITY` error code. Frontend: show warning before submit if any item exceeds ordered qty.
- **Depends on**: None

---

### STG-510 — MEDIUM: Duplicate scan window per-barcode tracking

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Business Logic (1.1)
- **File**: `src/services/scan/handleScan.ts:68-72, 112-122`
- **Problem**: Single `lastScan` variable causes false duplicate rejection when scanning different items within 1000ms.
- **Fix**: Replace single `lastScan` with `Map<string, number>` keyed by barcode. Check duplicate per-barcode, not globally. Clean up entries older than DUPLICATE_WINDOW_MS.
- **Depends on**: None

---

### STG-511 — MEDIUM: Offline stock cache multi-barcode merge

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Business Logic (1.3)
- **File**: `src/services/scan/handleScan.ts:490-493`
- **Problem**: Same product with two barcodes creates two cache entries. Stock updates from one barcode not reflected when scanning other barcode.
- **Fix**: Cache by globalProductId (primary key), not barcode. Create barcode→productId lookup map. Stock lookup resolves barcode → productId → cached stock.
- **Depends on**: None

---

### STG-512 — MEDIUM: Credit score calculation transaction

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Business Logic (7.1)
- **File**: `backend/src/routes/v1/pos/credit.ts:153-250`
- **Problem**: Multiple aggregation queries (sales count, BNPL repayment rate, disputes) not in transaction. Data can change between queries producing inconsistent score.
- **Fix**: Wrap all credit score queries in `BEGIN...COMMIT` with `READ COMMITTED` or `REPEATABLE READ` isolation level.
- **Depends on**: None

---

### STG-513 — MEDIUM: Large amount error instead of silent cap

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Business Logic (8.2)
- **File**: `src/utils/money.ts:44-45`
- **Problem**: Amounts exceeding MAX_AMOUNT_MINOR (₹10M) are silently capped. User sees ₹10M instead of actual entered amount.
- **Fix**: Throw error or show Alert when amount exceeds MAX_AMOUNT_MINOR: "Amount exceeds maximum allowed (₹1,00,00,000). Please check the entered value."
- **Depends on**: None

---

### STG-514 — MEDIUM: Sync batch exponential backoff

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Business Logic (9.2)
- **File**: `src/services/offline/sync.ts:149-184`
- **Problem**: 100 batch retries with no delay between failures causes battery drain and CPU waste when network is down.
- **Fix**: Add exponential backoff: 1s, 2s, 4s, 8s (capped at 30s) between failed batch attempts. Reset backoff on success.
- **Depends on**: None

---

### STG-515 — MEDIUM: Timestamp timezone consistency

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Business Logic (11.1)
- **File**: `backend/src/routes/v1/pos/sales.ts:733, 793`
- **Problem**: `new Date(row.created_at).toISOString()` assumes UTC. If DB stores timestamps without timezone, conversion is off by 5.5 hours (IST).
- **Fix**: Verify all TIMESTAMPTZ columns store UTC. Add explicit `AT TIME ZONE 'UTC'` cast in SQL queries returning timestamps. Frontend: parse ISO strings and convert to local for display.
- **Depends on**: None

---

### STG-516 — MEDIUM: Search cache invalidation

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Cross-Portal (2.2)
- **File**: `backend/services/catalog-service/src/services/searchService.ts:88-103`
- **Problem**: Search results cached with TTL but not invalidated when products are added or prices change.
- **Fix**: On product create/update, invalidate search cache keys containing the affected product's name/SKU. Use Redis `DEL` on matching pattern or reduce TTL to 60s.
- **Depends on**: None

---

### STG-517 — MEDIUM: Supplier price cache TTL

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Cross-Portal (Finding 4)
- **File**: `src/services/api/catalogApi.ts:169-192`
- **Problem**: 5-minute supplier cache TTL means price changes don't appear in POS for up to 5 minutes.
- **Fix**: Reduce TTL to 60s or add push-based invalidation (WebSocket event from backend when supplier updates price → POS invalidates cache).
- **Depends on**: None

---

### STG-518 — MEDIUM: HTTPS enforcement for supplier-portal and superadmin

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Cross-Portal (Finding 18)
- **Files**: `supplier-portal/src/lib/api.ts`, `supermandi-superadmin/src/lib/api.ts`
- **Problem**: Only retailer-admin enforces HTTPS in production. Supplier-portal and superadmin don't validate URL scheme.
- **Fix**: Add same check as retailer-admin: `if (import.meta.env.PROD && baseUrl.startsWith('http://')) throw new Error('HTTPS required in production')`.
- **Depends on**: None

---

### STG-519 — MEDIUM: Set CORS_ALLOWED_ORIGINS in Cloud Run

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — GCP Parity
- **Problem**: CORS_ALLOWED_ORIGINS env var may not be set in Cloud Run. If missing, empty array → no CORS allowed (or in dev: wildcard with warning).
- **Fix**: Set `CORS_ALLOWED_ORIGINS=https://staging.supermandi.tech` in Cloud Run env config for api-gateway service. For production: set to production domain.
- **Depends on**: GCP access

---

### STG-520 — MEDIUM: Admin API key timing-safe response

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — API Layer (M-1)
- **File**: `backend/src/routes/v1/admin/adminAuth.ts:78-83`
- **Fix**: When DB lookup returns 0 rows, hash a dummy value before returning to normalize response time.
- **Depends on**: None

---

### STG-521 — MEDIUM: Webhook signature format validation

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — API Layer (M-2)
- **File**: `backend/src/routes/v1/webhooks/refundWebhook.ts:42-44`
- **Fix**: Add: `if (!signature || typeof signature !== 'string' || signature.length < 64) return res.status(400).json({ error: 'Invalid signature format' })`.
- **Depends on**: None

---

### STG-522 — MEDIUM: Error handler — stop leaking DB details

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — API Layer (M-3)
- **File**: `backend/src/middleware/errorHandler.ts:45-58`
- **Fix**: Always return generic "Internal server error" to client in all environments. Log full details to structured logs only.
- **Depends on**: None

---

### STG-523 — MEDIUM: Store isolation — log warning on missing storeId

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — API Layer (M-4)
- **File**: `backend/src/middleware/deviceToken.ts:63-68`
- **Fix**: When `candidates.length === 0`, add `logger.warn('POS request without client storeId', { deviceId, path: req.path })`. Still allow request (storeId from token is authoritative).
- **Depends on**: None

---

### STG-524 — MEDIUM: AIInsightsScreen i18n tab labels

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — UI Layer
- **File**: `src/screens/AIInsightsScreen.tsx:100-106`
- **Fix**: Replace hardcoded `label: 'Alerts'` etc with `label: t('insights.tabAlerts')`. Add keys to en.json and hi.json.
- **Depends on**: None

---

### STG-525 — MEDIUM: AIInsightsScreen i18n retry/empty text

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — UI Layer
- **File**: `src/screens/AIInsightsScreen.tsx:293, 313`
- **Fix**: Replace "Tap to retry" and empty state message with t() keys.
- **Depends on**: None

---

### STG-526 — MEDIUM: BuyScreen explicit empty state

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — UI Layer (UX 4-state)
- **File**: `src/screens/BuyScreen.tsx:103-107`
- **Fix**: After loading completes with empty array, show empty state: icon + "No products available. Add products from your supplier catalog."
- **Depends on**: None

---

### STG-527 — MEDIUM: ChatListScreen empty/error states

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — UI Layer (UX 4-state)
- **File**: `src/screens/ChatListScreen.tsx:90-93`
- **Fix**: Add explicit empty state (no conversations) and error state (retry button) handling.
- **Depends on**: None

---

### STG-528 — MEDIUM: CustomerListScreen error state display

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — UI Layer (UX 4-state)
- **File**: `src/screens/CustomerListScreen.tsx:61-70`
- **Fix**: When `error` state is set, show error UI with retry button instead of silently ignoring.
- **Depends on**: None

---

### STG-529 — MEDIUM: PaymentSetupScreen BackHandler deps

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — UI Layer
- **File**: `src/screens/PaymentSetupScreen.tsx:73-77`
- **Fix**: Add `handleSkip` to useEffect dependency array, or wrap handleSkip in useCallback.
- **Depends on**: None

---

### STG-530 — MEDIUM: CreditScreen consent UI

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — UI Layer
- **File**: `src/screens/CreditScreen.tsx:82-84`
- **Fix**: When `consentRequired` is true, show consent request modal explaining why phone consent is needed, with Accept/Decline buttons. On accept, call POST /api/v1/consent/record.
- **Depends on**: STG-493 (consent table must exist)

---

### STG-531 — MEDIUM: KhataScreen modal scroll

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — UI Layer
- **File**: `src/screens/KhataScreen.tsx`
- **Fix**: Wrap modal content in ScrollView to handle overflow on small screens (< 5 inch).
- **Depends on**: None

---

### STG-532 — MEDIUM: MenuScreen accessibility labels

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — UI Layer
- **File**: `src/screens/MenuScreen.tsx`
- **Fix**: Add `accessibilityLabel` to all Pressable/TouchableOpacity elements with icons.
- **Depends on**: None

---

### STG-533 — MEDIUM: CustomerListScreen form accessibility

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — UI Layer
- **File**: `src/screens/CustomerListScreen.tsx`
- **Fix**: Add `accessibilityLabel` to search input and filter controls.
- **Depends on**: None

---

### STG-534 — MEDIUM: Khata negative balance handling

- **Status**: OPEN
- **Priority**: P2
- **Source**: Comprehensive audit 2026-03-15 — Business Logic (7.2)
- **File**: `backend/src/routes/v1/pos/khata.ts`
- **Fix**: When balance goes negative (customer overpaid), display as "Store owes ₹X" instead of negative number. Add visual indicator (green for credit to customer).
- **Depends on**: None

---

### STG-535 to STG-551 — LOW PRIORITY (P3)

Remaining 17 P3 tickets cover: port documentation, response format standardization, demo endpoint safety, migration documentation, barcode validation edge cases, search minimum query, discount validation UX, currency formatting, timezone display, sync dedup verification, session cache handling, store isolation documentation, WhatsApp color in ForceUpdate/CustomerManagement screens, and ReturnScreen navigation verification. Each ticket in the summary table above has its one-line scope. Detailed specs will be written at implementation time.

## GUARD Tickets (STG-481 — STG-492)

> These tickets were generated by the Loophole Guard Protocol (LGP) audit on 2026-03-14.
> Each is a P0 prerequisite that MUST be completed before the layer that depends on it.

---

### STG-481 — GUARD: i18n validation script — en/hi key parity check

- **Status**: PARKED — verified in reiteration, tag `stg-481-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-010
- **Layer**: 2-PREREQ (must complete before Layer 2 i18n tickets)
- **Problem**: No build-time validation that `en.json` and `hi.json` have matching keys. Tickets STG-257–279 add i18n keys to screens, but if a key is added to `en.json` and missed in `hi.json`, Hindi users see raw key strings. No automated catch.
- **Impact**: Silent i18n regression — Hindi-speaking retailers see `sellScan.searchPlaceholder` instead of translated text.
- **Fix**: Create `scripts/i18n-validate.js` that: (1) Reads `src/i18n/en.json` and `src/i18n/hi.json`. (2) Computes symmetric difference of flattened key sets. (3) Reports missing keys in either file. (4) Exits with code 1 if any mismatch. Add `"i18n:validate": "node scripts/i18n-validate.js"` to root `package.json` scripts. Wire into pre-commit hook via `fix-guard.js` or `lint-staged`.
- **Migration**: None
- **Test**: Add a key to `en.json` only → run script → expect exit 1 with clear error. Add matching key to `hi.json` → run script → expect exit 0.
- **Depends on**: None

---

### STG-482 — GUARD: i18n key naming convention document

- **Status**: PARKED — verified in reiteration, tag `stg-482-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-011
- **Layer**: 2-PREREQ (must complete before Layer 2 i18n tickets)
- **Problem**: No defined convention for i18n key naming. Different tickets may use `sell.search`, `sellScan.search`, `screens.sell.search` — causing key collisions and inconsistency.
- **Impact**: Merge conflicts between parallel i18n tickets. Inconsistent key paths make maintenance difficult.
- **Fix**: Create `src/i18n/NAMING.md` defining: (1) `common.*` = truly generic strings shared across screens ("Loading", "Error", "Retry", "Cancel", "Save"). (2) `{screenName}.*` = screen-specific strings using camelCase screen name ("sellScan.searchPlaceholder", "payment.completeButton"). (3) `components.*` = shared component strings ("cartItem.quantity", "sellTile.outOfStock"). (4) Flat keys within namespace — no deeper than 2 levels. (5) **RULE**: Every STG-257–279 ticket MUST follow this convention. Add validation to STG-481 script to check key depth ≤ 2.
- **Migration**: None
- **Test**: Review convention doc for completeness. Verify STG-481 script enforces max depth.
- **Depends on**: None

---

### STG-483 — GUARD: Refactor SellTile.formatPrice() → use formatMoney()

- **Status**: PARKED — verified in reiteration, tag `stg-483-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-007
- **Layer**: 1 (must complete before Layer 4 SellTile tickets)
- **Problem**: `SellTile.tsx` has a local `formatPrice()` function that duplicates `src/utils/money.ts:formatMoney()`. When STG-116 updates `formatMoney()` to use Indian lakh formatting, `SellTile.formatPrice()` won't get the update — prices on sell tiles will display differently from everywhere else.
- **Impact**: Inconsistent price display between sell tiles and cart/payment/receipt.
- **Fix**: In `src/components/SellTile.tsx`: (1) Remove the local `formatPrice()` function. (2) Import `formatMoney` from `src/utils/money`. (3) Replace all `formatPrice(x)` calls with `formatMoney(x)`. Verify no behavioral difference (both should produce `₹X.XX` format currently).
- **Migration**: None
- **Test**: Typecheck passes. Sell tile prices render identically before and after. Snapshot test if available.
- **Depends on**: None

---

### STG-484 — GUARD: Refactor CartItem + SupplierRow → useThemeColors() hook

- **Status**: PARKED — verified in reiteration, tag `stg-484-2026-03-14`
- **Priority**: P1
- **Source**: LGP audit — LH-013, LH-014
- **Layer**: 4-PREREQ (must complete before Layer 4 theme-dependent tickets)
- **Problem**: `CartItem.tsx` and `SupplierRow.tsx` use static `import { theme } from '../theme/colors'` instead of the `useThemeColors()` hook. This means dark mode themes don't apply to these components. Also, `SupplierRow.tsx:120` uses `stockColor + "20"` (string concatenation for opacity) which breaks if color format changes from hex to rgb.
- **Impact**: Cart items and supplier rows don't respond to dark mode toggle. Opacity hack produces invalid colors if theme changes color format.
- **Fix**: In both files: (1) Replace `import { theme }` with `const colors = useThemeColors()`. (2) Update all `theme.xxx` references to `colors.xxx`. (3) In `SupplierRow.tsx:120`, replace `stockColor + "20"` with `{ backgroundColor: stockColor, opacity: 0.12 }` using proper React Native style.
- **Migration**: None
- **Test**: Typecheck passes. Both components render correctly in light mode. If dark mode exists, verify colors switch.
- **Depends on**: None

---

### STG-485 — GUARD: consent_records table + consent API (DPDP)

- **Status**: PARKED — verified in reiteration, tag `stg-485-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-004, LH-029
- **Layer**: 0A (must complete before any DPDP ticket in Layer 0C)
- **Problem**: DPDP Act 2023 requires explicit consent tracking for PII collection (phone, PAN, address). No `consent_records` table exists. No API to record or verify consent. STG-229 (PAN encryption) and STG-230 (phone consent) depend on this infrastructure.
- **Impact**: DPDP non-compliance. No audit trail for consent. Cannot prove when/how consent was obtained.
- **Fix**: (1) Create migration `xxx_create_consent_records.sql`: table `consent_records` with columns `id SERIAL PRIMARY KEY`, `user_id INT NOT NULL`, `consent_type VARCHAR(50) NOT NULL` (e.g., 'phone_collection', 'pan_storage', 'credit_scoring'), `granted BOOLEAN NOT NULL`, `granted_at TIMESTAMPTZ`, `revoked_at TIMESTAMPTZ`, `ip_address INET`, `user_agent TEXT`, `consent_version VARCHAR(20)`. (2) Add `POST /api/v1/consent` endpoint to record consent. (3) Add `GET /api/v1/consent/:userId` to check active consents. (4) Add middleware `requireConsent('pan_storage')` that checks consent before allowing PAN operations.
- **Migration**: Yes — new table `consent_records`
- **Test**: POST consent → GET returns granted. Revoke → GET returns revoked. Middleware blocks without consent.
- **Depends on**: None

---

### STG-486 — GUARD: Encryption key management infra (GCP Secret Manager)

- **Status**: PARKED — verified in reiteration, tag `stg-486-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-005
- **Layer**: 0A (must complete before STG-229 PAN encryption)
- **Problem**: STG-229 requires encrypting PAN numbers at rest, but no encryption key management exists. No key rotation strategy. Hardcoding encryption keys in env vars is insecure and doesn't support rotation.
- **Impact**: Cannot implement PAN encryption without key infrastructure. Plaintext keys in env vars risk exposure.
- **Fix**: (1) Create `backend/src/utils/encryption.ts` with `encrypt(plaintext, purpose)` and `decrypt(ciphertext, purpose)` using AES-256-GCM. (2) Key retrieval from GCP Secret Manager via `@google-cloud/secret-manager`. (3) Key caching with TTL (5 min) to avoid per-request Secret Manager calls. (4) Support key versioning for rotation: `encrypt` always uses latest version, `decrypt` reads version from ciphertext prefix. (5) Add `GCP_KMS_KEY_RING` and `GCP_KMS_CRYPTO_KEY` env vars to `.env.example`.
- **Migration**: None (key management is infrastructure, not schema)
- **Test**: Encrypt → decrypt round-trip. Decrypt with wrong key fails gracefully. Key caching reduces Secret Manager calls.
- **Depends on**: GCP Secret Manager access (operator must create key)

---

### STG-487 — GUARD: Backend staff role + max discount API

- **Status**: PARKED — verified in reiteration, tag `stg-487-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-015
- **Layer**: 7-PREREQ (must complete before STG-102 max discount limit)
- **Problem**: STG-102 (max discount limit + manager approval) assumes backend endpoints exist for: (a) getting the current staff member's role and max discount authority, (b) setting store-level max discount percentage. Neither endpoint exists. Without them, the frontend has no data to enforce limits.
- **Impact**: STG-102 would be dead code — discount limits in UI with no backend enforcement. Staff could bypass limits by editing requests.
- **Fix**: (1) Add `GET /api/v1/pos/staff/me` endpoint returning `{ role, display_name, max_discount_pct }` from JWT + store config. (2) Add `PUT /api/v1/admin/stores/:storeId/config` for superadmin to set `max_discount_pct` (default 10%). (3) Add `max_discount_pct NUMERIC(5,2) DEFAULT 10.00` column to `stores` table. (4) Add server-side validation in checkout: reject if discount > staff's max_discount_pct (unless manager-approved).
- **Migration**: Yes — add `max_discount_pct` column to stores table
- **Test**: Staff with 10% limit tries 15% discount → rejected. Manager approves → accepted. Superadmin updates limit → staff sees new limit.
- **Depends on**: None

---

### STG-488 — GUARD: Backend manager PIN verification endpoint

- **Status**: PARKED — verified in reiteration, tag `stg-488-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-015
- **Layer**: 7-PREREQ (must complete before STG-102 manager approval flow)
- **Problem**: STG-102 requires manager approval for discounts exceeding staff limit. The approval flow needs a PIN verification endpoint so the manager can enter their PIN on the POS device to authorize the override. No such endpoint exists.
- **Impact**: Manager approval modal in STG-102 would have no backend to verify the PIN against. Approval would be client-side only — no audit trail, no security.
- **Fix**: (1) Add `POST /api/v1/pos/staff/verify-pin` endpoint accepting `{ pin, staffId }`. (2) Verify PIN against hashed `manager_pin` in `pos_staff` table. (3) Return `{ verified: true, staffId, role, display_name }` on success. (4) Log verification attempt (success/failure) for audit. (5) Rate limit: max 5 failed attempts per 15 minutes per staff.
- **Migration**: Add `manager_pin_hash VARCHAR(255)` column to `pos_staff` table if not exists
- **Test**: Correct PIN → verified. Wrong PIN → rejected. 6th attempt in 15min → rate limited.
- **Depends on**: None

---

### STG-489 — GUARD: Backend void/refund sale endpoint

- **Status**: PARKED — verified in reiteration, tag `stg-489-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-018
- **Layer**: 8-PREREQ (must complete before STG-383 refund/void mechanism)
- **Problem**: STG-383 adds a post-payment refund/void button, but no backend endpoint exists to void or refund a completed sale. The button would submit to nothing — the sale remains completed, stock isn't restored, and the ledger isn't adjusted.
- **Impact**: Dead refund button. No stock reversal. Ledger imbalance. Customer charged with no recourse on POS.
- **Fix**: (1) Add `POST /api/v1/pos/sales/:saleId/void` endpoint. (2) Validate: sale exists, belongs to store (JWT), not already voided, within void window (configurable, default 24h). (3) Create reversal transaction: negate line items, restore stock quantities, mark original sale as `VOIDED`. (4) For UPI payments: record void but do NOT auto-refund (manual bank refund required — flag for superadmin). (5) For cash payments: mark as refunded, cashier must return cash manually. (6) Audit log entry with staff who voided, reason, timestamp.
- **Migration**: Add `voided_at TIMESTAMPTZ`, `voided_by INT`, `void_reason TEXT` columns to `sales` table
- **Test**: Void cash sale → stock restored, ledger balanced. Void UPI sale → flagged for manual refund. Void after 24h → rejected. Double void → rejected.
- **Depends on**: None

---

### STG-490 — GUARD: Backend credit disbursement endpoint

- **Status**: PARKED — verified in reiteration, tag `stg-490-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-025
- **Layer**: 15-PREREQ (must complete before STG-451 credit disbursement)
- **Problem**: STG-451 wires the credit approval → disbursement flow, but no endpoint exists to actually disburse funds. Approved credit applications would be stuck in `APPROVED` status forever with no path to `DISBURSED`.
- **Impact**: Credit feature is broken end-to-end. Retailers apply, get approved, but never receive funds.
- **Fix**: (1) Create migration for `credit_disbursements` table: `id SERIAL PRIMARY KEY`, `application_id INT REFERENCES credit_applications(id)`, `amount_minor BIGINT NOT NULL`, `disbursement_method VARCHAR(20)` (BANK_TRANSFER, UPI), `bank_reference VARCHAR(100)`, `status VARCHAR(20)` (PENDING, COMPLETED, FAILED), `initiated_at TIMESTAMPTZ`, `completed_at TIMESTAMPTZ`. (2) Add `POST /api/v1/credit/applications/:id/disburse` endpoint. (3) Validate: application status = APPROVED, amount matches approved amount, idempotency key. (4) Create disbursement record, update application status to DISBURSED. (5) Integration point for payment provider (stub for now, real integration in STG-455).
- **Migration**: Yes — new table `credit_disbursements`
- **Test**: Disburse approved application → status changes. Disburse non-approved → rejected. Double disburse (idempotency) → returns existing record.
- **Depends on**: None

---

### STG-491 — GUARD: Backend reorder PO submission endpoint

- **Status**: PARKED — verified in reiteration, tag `stg-491-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-022
- **Layer**: 14-PREREQ (must complete before STG-421 PO submission flow)
- **Problem**: STG-421 wires approved reorders to PO creation, but no endpoint exists to submit the PO to a supplier. Draft POs are created but never reach suppliers — they sit in `DRAFT` status forever.
- **Impact**: Reorder system is broken end-to-end. POs created but never sent. Suppliers never receive orders. Stock never replenished via auto-reorder.
- **Fix**: (1) Add `POST /api/v1/reorder/purchase-orders/:poId/submit` endpoint. (2) Validate: PO exists, status = DRAFT, belongs to store (JWT). (3) Update PO status to SUBMITTED, set `submitted_at`. (4) Create notification for supplier (email/in-app via supplier portal). (5) Return submitted PO with supplier acknowledgment status. (6) Idempotency: re-submit of already-submitted PO returns existing record.
- **Migration**: Add `submitted_at TIMESTAMPTZ`, `supplier_notified BOOLEAN DEFAULT FALSE` columns to `purchase_orders` table if not exists
- **Test**: Submit draft PO → status changes to SUBMITTED. Submit non-draft → rejected. Re-submit → idempotent. Supplier notification created.
- **Depends on**: None

---

### STG-492 — GUARD: Fix PENDING_UPI_KEY write-before-checkout (double-charge)

- **Status**: PARKED — verified in reiteration, tag `stg-492-2026-03-14`
- **Priority**: P0
- **Source**: LGP audit — LH-017
- **Layer**: 0B (must complete in Layer 0 — this is a financial safety bug)
- **Problem**: In `PaymentScreen.tsx:826`, `PENDING_UPI_KEY` is defined as a constant but NEVER written to AsyncStorage before calling `completeCheckout()`. If the app crashes mid-checkout, there is no record of the pending UPI payment. On restart, the user may initiate checkout again — resulting in a double charge.
- **Impact**: CRITICAL financial bug. Retailers can be double-charged on UPI payments if app crashes during checkout.
- **Fix**: (1) Before calling `completeCheckout()`, write `{ paymentId, amount, timestamp, cartHash }` to `AsyncStorage.setItem(PENDING_UPI_KEY, JSON.stringify(...))`. (2) On `PaymentScreen` mount, check `AsyncStorage.getItem(PENDING_UPI_KEY)`. If found: (a) Show recovery modal: "A payment of ₹X was in progress. Check your bank app before retrying." (b) Provide "Payment went through" (clear key, show receipt) and "Payment failed" (clear key, allow retry) buttons. (3) After successful checkout confirmation, remove the key: `AsyncStorage.removeItem(PENDING_UPI_KEY)`. (4) Add `cartHash` comparison — if cart changed since pending, warn user.
- **Migration**: None (AsyncStorage is client-side)
- **Test**: Write pending key → kill app → restart → recovery modal shown. Complete checkout → key removed. Different cart → warning shown.
- **Depends on**: None
