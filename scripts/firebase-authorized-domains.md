# Firebase Authorized Domains (GCP-STG-0483)

## Purpose
Firebase Authentication requires domains to be explicitly authorized before
phone auth (reCAPTCHA verification) will work. If a domain is not listed,
Firebase will reject sign-in attempts with an "auth/unauthorized-domain" error.

## How to Configure

1. Go to **Firebase Console** → **Authentication** → **Settings**
2. Click **Authorized domains** tab
3. Add each domain listed below (if not already present)

## Required Domains

| Domain                        | Environment | Purpose                        |
|-------------------------------|-------------|--------------------------------|
| `localhost`                   | Development | Local dev servers              |
| `staging.supermandi.tech`     | Staging     | API gateway + portal hosting   |
| `retailer.supermandi.tech`    | Production  | Retailer admin portal          |
| `supplier.supermandi.tech`    | Production  | Supplier portal                |
| `supermandi.tech`             | Production  | Landing page + superadmin      |
| `admin.supermandi.tech`       | Production  | Superadmin portal (if separate)|

## Notes

- Firebase automatically includes `*.firebaseapp.com` and `*.web.app` domains.
- Removing `localhost` in production projects is recommended for security,
  but it must remain while developers need local Firebase auth testing.
- The POS mobile app does **not** use Firebase phone auth (it uses custom
  backend OTP), so no mobile-specific domain configuration is needed.
- After adding a domain, changes take effect immediately — no propagation delay.
