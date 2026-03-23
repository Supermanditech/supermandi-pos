# Firebase Test Phone Numbers (GCP-STG-0469)

## Purpose
Firebase Authentication allows configuring test phone numbers that bypass
real SMS delivery. This is essential for CI/CD pipelines and automated testing.

## How to Configure

1. Go to **Firebase Console** → **Authentication** → **Sign-in method**
2. Scroll to **Phone numbers for testing**
3. Click **Add phone number**
4. Enter each test number and its fixed OTP code

## Test Numbers to Add

| Phone Number      | OTP Code |
|-------------------|----------|
| +91 1111111111    | 123456   |
| +91 1111111112    | 123456   |
| +91 1111111113    | 123456   |
| +91 1111111114    | 123456   |
| +91 1111111115    | 123456   |
| +91 1111111116    | 123456   |
| +91 1111111117    | 123456   |
| +91 1111111118    | 123456   |
| +91 1111111119    | 123456   |
| +91 1111111110    | 123456   |

## Notes

- Firebase allows up to **10 test phone numbers** per project.
- Test numbers are **not charged** against your SMS quota.
- Test numbers work in both development and production Firebase projects.
- These numbers will always return the fixed OTP code above — no real SMS is sent.
- **Important**: SuperMandi POS uses custom backend OTP (not Firebase phone auth),
  so these test numbers are only relevant to the retailer-admin and supplier-portal
  web portals that use Firebase phone auth directly.
- In CI environments, use these numbers to avoid hitting Firebase rate limits.
