# ROLE-SWITCH-001: Multi-Role User Experience

## Current Behavior (v3.0.9)

Each portal is a **separate application** with its own login flow:

| Portal | URL | Auth Method | Role |
|--------|-----|-------------|------|
| Retailer Admin | `/retailer/` | Firebase Phone OTP | `retailer` |
| Supplier Portal | `/supplier/` | Firebase Phone OTP | `supplier` |
| SuperAdmin | `/admin/` | Email OTP | `super_admin` |
| POS App | Expo Go / APK | Firebase Phone OTP | `retailer` (store-scoped) |

### How a Multi-Role User Logs In Today

A user who is both a retailer and a supplier must:

1. Go to `/retailer/login` → Phone OTP → Lands in Retailer dashboard
2. Open a new tab → `/supplier/login` → Phone OTP → Lands in Supplier dashboard

**No role switching within a single session.** Each portal maintains its own JWT.

### JWT Token Structure

```json
{
  "sub": "<user-id>",
  "role": "retailer",       // Single role per token
  "actor_type": "store",    // Or "supplier"
  "actor_id": "<store-id>", // Scoped entity
  "iss": "supermandi-auth",
  "exp": 1738800000
}
```

The `role` field is single-valued. The backend auth middleware checks `role` for route access.

## Known Constraints

1. **Database**: `auth.users` has `actor_type` + `actor_id` (single role binding)
2. **JWT**: Single `role` claim — no array/multi-role support
3. **Frontend**: Each portal only accepts tokens for its expected role
4. **Firebase**: Phone OTP returns a UID — the backend maps it to a single user record

## Future: Role-Switching Strategy

### Option A: Portal Selector (Recommended for v3.1)

After OTP login, if the phone number maps to multiple roles:

```
Login (Phone OTP)
  └─ Backend detects multiple roles for this phone
     └─ Returns role list: ["retailer", "supplier"]
        └─ Frontend shows: "Select your portal"
           ├─ Retailer Dashboard →
           └─ Supplier Dashboard →
```

**Changes required:**
- Backend: New `GET /api/v1/auth/my-roles` endpoint
- Backend: `POST /api/v1/auth/switch-role` to issue a new JWT with different role
- Frontend: Role selector component (shared)
- Database: Allow multiple `actor_type` bindings per phone number

### Option B: Unified Dashboard (v4.0+)

Single portal at `/dashboard/` that shows all role-specific features in one UI.
Requires significant frontend architecture changes (not recommended for go-live).

## Go-Live Decision

**For go-live (v3.0.9):** No changes. Current single-role-per-portal behavior is acceptable.

**Rationale:**
- Multi-role users are rare in early deployment (<5% expected)
- Two-tab workflow is functional, just not ideal UX
- Role-switching adds complexity and risk to go-live timeline
- Can be added in v3.1 without breaking changes

## Action Items (Post Go-Live)

- [ ] Implement `GET /api/v1/auth/my-roles` endpoint
- [ ] Add role selector to login flow
- [ ] Update `auth.users` schema for multi-role support
- [ ] Add `POST /api/v1/auth/switch-role` endpoint
- [ ] Update frontend to handle role selection
