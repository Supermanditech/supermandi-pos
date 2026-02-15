# Staging Testing Tickets — 15 Feb 2026

> Created from operator staging browser testing on `staging.supermandi.tech` (build f61a3b2).
> **Status**: Collecting tickets. Implementation starts next session.
> **Blocker**: Cannot register new retailer due to T-001 (GSTIN saved before approval).

---

## CATEGORY A: BLOCKING BUGS (P0)

| # | Title | Portal | Summary |
|---|-------|--------|---------|
| T-001 | Registration data saved before approval — blocks re-registration | Supplier + Retailer | GSTIN/business data saved to DB immediately during registration flow, not on SuperAdmin approval. If user quits midway and returns, "GSTIN already registered" error. Fix: save data only when SuperAdmin approves and activates registration. |
| T-012 | NEEDS_FIX application stuck — can't approve or reject | SuperAdmin | Application in NEEDS_FIX status: Approve shows "Cannot approve in status NEEDS_FIX", Reject shows "Cannot reject in status NEEDS_FIX". Both require KYC_SUBMITTED or PAYMENTS_SUBMITTED. Application permanently stuck. Fix: allow reject from NEEDS_FIX, or add state transition so resubmitted KYC moves status back to KYC_SUBMITTED. |
| T-014 | KYC document preview — "refused to connect" | SuperAdmin | Documents tab → Review → modal shows "staging.supermandi.tech refused to connect" instead of document preview. 9 pending documents across 2 applications cannot be reviewed. Likely: GCS signed URLs expired, CORS blocking iframe, or document serving endpoint broken. Blocks entire registration approval flow. |

---

## CATEGORY B: FUNCTIONAL BUGS (P1)

| # | Title | Portal | Summary |
|---|-------|--------|---------|
| T-002 | Forgot Password not implemented | Retailer + Supplier | Retailer has `/retailer/forgot-password` but shows "OTP-Only Authentication — Password Not Required" placeholder. Supplier has no forgot-password route. Implement real forgot-password flow for both portals. |
| T-003 | Dual auth UI — password AND OTP login | Retailer + Supplier | Login pages should offer both password-based login and OTP-based login. Currently retailer is OTP-only, supplier has password fields but no OTP option on login. Unify both portals to support both methods. |
| T-004 | Change Password — verify supplier E2E + implement retailer | Supplier + Retailer | Supplier has Change Password UI at `/supplier/profile/` (Current Password, New Password, Confirm New Password). Needs E2E verification (API call, password update in DB, re-login with new password). Then implement same feature in retailer portal. |
| T-005 | Registration page refresh logs out — loses progress | Supplier + Retailer | During multi-step registration, refreshing the page logs the user out. Must re-enter OTP and restart. Persist registration state to sessionStorage or server-side. |
| T-008 | Resume Registration flow — E2E verification | Retailer + Supplier | Login page shows "Your registration is incomplete. Please resume to complete your application." with Resume Registration button. Verify: (a) takes user to correct step, (b) preserves previously entered data, (c) works after GSTIN already saved to DB. |
| T-009 | "Use a different phone number" — clear stuck registration | Retailer + Supplier | Login shows "Use a different phone number" link for incomplete registrations. Verify it properly clears partial registration data from DB (GSTIN, business details) so the phone number is freed and user can start fresh. |
| T-011 | SuperAdmin "Session expired" on every fresh login | SuperAdmin | Immediately after OTP login, dashboard shows red warning: "Backend warning: Events: Session expired or unauthorized. Please log in again. UI will keep retrying every 60 seconds." Appears on every login. Likely Events SSE/polling fails to authenticate with fresh JWT. |

---

## CATEGORY C: CROSS-PORTAL DESIGN SYSTEM (P1)

| # | Title | Scope | Summary |
|---|-------|-------|---------|
| T-016 | Design token standardization | All portals | Create shared design spec: max card width, font sizes, spacing, border-radius, shadow, button sizes. Currently retailer login card is full-width while supplier is compact centered. Define one standard. |
| T-017 | Page layout template — pre-auth pages | Retailer + Supplier | All pre-auth pages (login, register, forgot-password) must use identical centered card layout: max-width 480px, consistent padding, same background gradient, same header (logo + "Portal Name"). |
| T-018 | Page layout template — post-auth pages | Retailer + Supplier | All post-auth pages must use identical sidebar + content layout with consistent header, breadcrumbs, page title position, action button placement. |
| T-019 | Form component standardization | Retailer + Supplier | All form inputs (text, select, phone, OTP), buttons (primary, secondary, destructive), validation messages, loading states must look identical across portals. |
| T-020 | Footer standardization | Retailer + Supplier | Consistent footer: copyright, build hash, deploy timestamp. Supplier has it, retailer doesn't show on all pages. |

---

## CATEGORY D: PRE-AUTH PAGES — RETAILER (P2)

| # | Title | Page | Summary |
|---|-------|------|---------|
| T-021 | Retailer Login — layout + sizing | `/retailer/login` | Card too wide, phone input oversized. Match supplier's compact centered card. Add "Forgot Password?" link. Button text: "Send OTP" (not "Continue"). |
| T-022 | Retailer Register — Step 1 phone verification | `/retailer/register` | Card too wide. Match compact layout. Consistent "Send OTP" button style. Same stepper design as supplier. |
| T-023 | Retailer Register — Step 2 business details | `/retailer/register` | Form field alignment, label consistency, GSTIN format hint, dropdown styling, address layout. Match supplier's business details form. |
| T-024 | Retailer Register — Step 3 KYC documents | `/retailer/register` | Document upload UI, file type indicators, upload progress, max size hints. Match supplier's KYC step. |
| T-025 | Retailer Forgot Password page | `/retailer/forgot-password` | Currently shows "OTP-Only" placeholder. Implement real flow or redirect properly. |

---

## CATEGORY E: PRE-AUTH PAGES — SUPPLIER (P2)

| # | Title | Page | Summary |
|---|-------|------|---------|
| T-026 | Supplier Login — add Forgot Password link | `/supplier/login/` | No "Forgot Password?" link exists. Add below "Don't have an account? Register". |
| T-027 | Supplier Register — Step 1 phone OTP | `/supplier/register/` | Verify layout matches retailer. Consistent OTP field, timer, resend link. |
| T-028 | Supplier Register — Step 2 business details | `/supplier/register/` | Match retailer form field order, labels, validation messages. |
| T-029 | Supplier Register — Step 3 KYC documents | `/supplier/register/` | Match retailer upload UI. Same file types, same progress indicators. |
| T-030 | Supplier Pending Approval page | `/supplier/pending-approval` | Polish waiting state UI. Show application status, expected timeline, contact info. |

---

## CATEGORY F: POST-AUTH RETAILER PAGES (P2)

| # | Title | Page | Summary |
|---|-------|------|---------|
| T-031 | Retailer Dashboard polish | `/s/:code/` | Dashboard cards, stats layout, search bar, quick-add menu — professional styling for store owners. |
| T-032 | Retailer Products page | `/s/:code/products` | Product list table, filters, add/edit modal, pagination — clean professional table layout. |
| T-033 | Retailer Import (CSV bulk) page | `/s/:code/import` | 4-step import wizard styling (upload → validate → review → commit). Progress indicators, error display. |
| T-034 | Retailer Inventory page | `/s/:code/inventory` | Ledger table, transaction history, filters — professional data table. |
| T-035 | Retailer Suppliers page | `/s/:code/suppliers` | Supplier list, search, verification status badges — consistent with other tables. |
| T-036 | Retailer Supplier Catalog page | `/s/:code/supplier-catalog` | Browse + add products from suppliers. Card/list view, filters, add-to-store action. |
| T-037 | Retailer Compliance page | `/s/:code/compliance` | Document management UI (GSTIN, FSSAI, licenses). Upload, status, expiry display. |
| T-038 | Retailer Settings page | `/s/:code/settings` | Store config form (UPI, tax, hours, receipt). Clean sectioned layout. |
| T-039 | Retailer Payments page | `/s/:code/settings/payments` | Payment setup (UPI VPA, bank account, IFSC). Match supplier earnings/profile style. |
| T-040 | Retailer Device Activation page | `/s/:code/devices` | Activation code entry, device list. Clean simple UI for non-technical users. |

---

## CATEGORY G: POST-AUTH SUPPLIER PAGES (P2)

| # | Title | Page | Summary |
|---|-------|------|---------|
| T-041 | Supplier Dashboard polish | `/dashboard` | Stats cards, quick actions, recent orders table — match retailer dashboard layout pattern. |
| T-042 | Supplier Products page | `/products` | Product list, status filter, add/edit — match retailer products table style. |
| T-043 | Supplier Orders page | `/orders` | Order list, status tracking, shipment, notes — professional order management UI. |
| T-044 | Supplier Upload (CSV) page | `/upload` | Drag-drop import interface — match retailer import wizard style. |
| T-045 | Supplier KYC page | `/kyc` | Document management, bank verification, IFSC lookup — match retailer compliance page. |
| T-046 | Supplier Earnings page | `/earnings` | Payout history, summary stats, order breakdown — clean financial dashboard. |
| T-047 | Supplier Profile page | `/profile` | Personal details, password change, bank info — match retailer settings pattern. |

---

## CATEGORY H: SUPERADMIN PORTAL (P1-P2)

| # | Title | Scope | Summary |
|---|-------|-------|---------|
| T-006 | Register/Login UI inconsistency between portals | Supplier + Retailer | Registration and login UI design differs between portals. Standardize. |
| T-007 | Sign In link navigation — URL and UI parity | Supplier + Retailer | Cross-links between register/login pages — verify on both portals. |
| T-010 | SuperAdmin OTP banner unreadable | SuperAdmin Login | "OTP sent to..." banner has dark text on dark background — unreadable. |
| T-013 | Events filter bar bleeds into all tabs | SuperAdmin | Tab switching doesn't isolate content. Events filters show on every tab. |
| T-015 | Full navigation reorganization | SuperAdmin | Replace 15+ flat tabs with grouped sidebar (Operations, Onboarding, Commerce, Monitoring, Platform). |
| T-048 | SuperAdmin Applications tab — approval flow redesign | SuperAdmin | Fix NEEDS_FIX state, improve application card layout, clear action buttons per state. |
| T-049 | SuperAdmin Documents tab — document viewer fix + redesign | SuperAdmin | Fix preview (T-014), improve review modal, batch approve/reject. |
| T-050 | SuperAdmin Analytics — 8 sub-tab polish | SuperAdmin | Overview, Devices, Products, Payments, Purchases, Consumer, Activity, Dues — consistent chart/table styling. |
| T-051 | SuperAdmin Stores tab polish | SuperAdmin | Store list, create flow, UPI activation, feature flags — clean admin table. |
| T-052 | SuperAdmin Suppliers tab polish | SuperAdmin | Approval flow, product edit modal, bank detail verification UI. |
| T-053 | SuperAdmin Devices/Staff/Users/Audit tabs | SuperAdmin | Consistent table design, pagination, filters across all admin data tables. |

---

## Summary

| Category | Count | Priority |
|----------|-------|----------|
| A: Blocking Bugs | 3 | P0 |
| B: Functional Bugs | 7 | P1 |
| C: Cross-Portal Design System | 5 | P1 |
| D: Pre-Auth Retailer | 5 | P2 |
| E: Pre-Auth Supplier | 5 | P2 |
| F: Post-Auth Retailer | 10 | P2 |
| G: Post-Auth Supplier | 7 | P2 |
| H: SuperAdmin | 11 | P1-P2 |
| **TOTAL** | **53** | |

## Implementation Order (Recommended)

1. **T-001** (P0) — Fix registration data persistence (unblocks operator testing)
2. **T-012** (P0) — Fix NEEDS_FIX state machine (unblocks application approval)
3. **T-014** (P0) — Fix document preview (unblocks KYC review)
4. **T-011** (P1) — Fix SuperAdmin session error
5. **T-016-T-020** (P1) — Cross-portal design system (foundation for all UI work)
6. **Category D+E** — Pre-auth pages (login/register polish)
7. **Category B** — Remaining functional bugs
8. **Category F+G** — Post-auth page polish
9. **Category H** — SuperAdmin reorganization

---

## Retailer Portal Pages (Reference)

| Route | Component | Description |
|-------|-----------|-------------|
| `/retailer/login` | LoginPage | Phone OTP authentication |
| `/retailer/register` | RegisterPage | 5-step registration (phone → OTP → business → KYC → pending) |
| `/retailer/forgot-password` | ForgotPasswordPage | OTP-based password reset (placeholder) |
| `/s/:storeCode` | DashboardPage | Main dashboard |
| `/s/:storeCode/products` | ProductsPage | Product catalog |
| `/s/:storeCode/import` | ImportPage | Bulk CSV import (4-step) |
| `/s/:storeCode/inventory` | InventoryPage | Inventory ledger |
| `/s/:storeCode/suppliers` | SuppliersPage | Supplier management |
| `/s/:storeCode/supplier-catalog` | SupplierCatalogPage | Browse supplier products |
| `/s/:storeCode/compliance` | CompliancePage | Compliance documents |
| `/s/:storeCode/settings` | SettingsPage | Store configuration |
| `/s/:storeCode/settings/payments` | PaymentsPage | Payment setup |
| `/s/:storeCode/devices` | DeviceActivationPage | POS device activation |

## Supplier Portal Pages (Reference)

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | LoginPage | Phone OTP login |
| `/register` | RegisterPage | 3-step registration (phone → business → KYC) |
| `/pending-approval` | PendingApprovalPage | Awaiting admin approval |
| `/forgot-password` | ForgotPasswordPage | Placeholder redirect |
| `/dashboard` | DashboardPage | Main dashboard |
| `/products` | ProductsPage | Product catalog |
| `/orders` | OrdersPage | Order management (SSE real-time) |
| `/upload` | UploadPage | CSV bulk import |
| `/kyc` | KYCPage | Document management + bank verification |
| `/earnings` | EarningsPage | Payout history |
| `/profile` | ProfilePage | Profile + password change |

## SuperAdmin Tabs (Reference)

Events, Devices, Stores, Suppliers, Applications, Analytics (8 sub-tabs), Payments, Users, Settings, Documents, Audit Logs, Registrations, Staff, GRN Alerts
