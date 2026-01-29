# GO-LIVE: OpenAI Migration Checklist

**Date:** 2026-01-29
**Migration:** Claude/Anthropic → OpenAI
**Scope:** Voice Order (POS) + SuperMandi AI (Admin)

---

## Pre-Deployment Checklist

### Security (NON-NEGOTIABLE)

| # | Item | Status | Notes |
|---|------|--------|-------|
| S1 | OPENAI_API_KEY stored as env var only (not in repo) | ⬜ | Check `.env` on VM |
| S2 | API key never logged (check console output) | ⬜ | Verify with `docker logs` |
| S3 | Headers/PII never logged | ⬜ | Check audit log format |
| S4 | Rate limiting per device/store active | ⬜ | Test with rapid requests |
| S5 | Rate limiting per IP active | ⬜ | Test from different IPs |
| S6 | Token budget guardrails configured | ⬜ | Check OPENAI_MAX_TOKENS |
| S7 | 503 response when key missing | ⬜ | Test without key |

### Configuration

| # | Item | Status | Notes |
|---|------|--------|-------|
| C1 | OPENAI_API_KEY set in VM .env | ⬜ | `grep OPENAI .env` |
| C2 | OPENAI_MODEL_CHAT=gpt-4o-mini | ⬜ | Or preferred model |
| C3 | OPENAI_MODEL_STT=whisper-1 | ⬜ | |
| C4 | OPENAI_MAX_TOKENS=512 | ⬜ | |
| C5 | OPENAI_TIMEOUT_MS=30000 | ⬜ | |
| C6 | OPENAI_MAX_CONCURRENCY=5 | ⬜ | |

---

## Deployment Steps

```bash
# 1. SSH to VM
ssh claude@34.14.220.171

# 2. Navigate to project
cd ~/supermandi-pos

# 3. Pull latest code
git pull origin main

# 4. Add OPENAI_API_KEY to .env (if not already)
echo "OPENAI_API_KEY=sk-proj-..." >> backend/.env

# 5. Rebuild and restart main-backend
cd backend
docker-compose -f docker-compose.prod.yml build main-backend
docker-compose -f docker-compose.prod.yml up -d main-backend

# 6. Verify health
curl http://localhost:3010/health
curl -H "x-admin-token: $ADMIN_TOKEN" http://localhost:3010/api/v1/admin/ai/health
curl http://localhost:3010/api/v1/voice/health
```

---

## POS Voice Order Tests

### Test Environment
- Store: Demo Store (treated as live)
- Device: Enrolled demo device
- Mode: SELL (default)

### Test Cases

| # | Voice Command | Expected Result | Status |
|---|---------------|-----------------|--------|
| V1 | "Add two Tata Salt and one Surf Excel" | Cart: 2x Tata Salt, 1x Surf Excel | ⬜ |
| V2 | "Remove Surf" | Surf Excel removed from cart | ⬜ |
| V3 | "Change Tata Salt quantity to 3" | Tata Salt quantity → 3 | ⬜ |
| V4 | "Add milk" (ambiguous) | Shows top 3 milk candidates | ⬜ |
| V5 | "2 kilo rice chahiye" (Hindi) | Cart: 2kg rice | ⬜ |
| V6 | "hatao rice" (Hindi) | Rice removed from cart | ⬜ |

### Failure Cases

| # | Scenario | Expected Behavior | Status |
|---|----------|-------------------|--------|
| F1 | No network | "Voice requires internet" message | ⬜ |
| F2 | AI disabled (no key) | 503 with clear message | ⬜ |
| F3 | Rate limit hit | 429 with "wait" message | ⬜ |
| F4 | Timeout | Retry prompt | ⬜ |

---

## Admin AI (SuperMandi AI) Tests

### Test Environment
- Portal: supermandi-superadmin
- User: Admin with valid token

### Test Cases

| # | Question | Expected | Status |
|---|----------|----------|--------|
| A1 | "What is the total sales today?" | Summary + Key Numbers | ⬜ |
| A2 | "Why would /api/v1/admin/* return 404?" | Gateway/proxy guidance (no secrets) | ⬜ |
| A3 | "Show me top products" | Product list from analytics | ⬜ |
| A4 | "Which device is inactive?" | Device status summary | ⬜ |

### Security Verification

| # | Item | Status |
|---|------|--------|
| AS1 | AI doesn't reveal API keys | ⬜ |
| AS2 | AI doesn't reveal database credentials | ⬜ |
| AS3 | AI doesn't reveal internal IPs | ⬜ |
| AS4 | Audit log created for each request | ⬜ |

---

## Smoke Test Commands

```bash
# Run automated smoke tests
ADMIN_TOKEN=your-token ./scripts/smoke-test-openai.sh

# Manual curl tests

# 1. Health check
curl -k https://34.14.220.171.nip.io/health

# 2. Voice health
curl -k https://34.14.220.171.nip.io/api/v1/voice/health

# 3. AI health (requires admin token)
curl -k -H "x-admin-token: YOUR_TOKEN" \
  https://34.14.220.171.nip.io/api/v1/admin/ai/health

# 4. AI chat (requires admin token)
curl -k -X POST \
  -H "x-admin-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the total sales today?"}' \
  https://34.14.220.171.nip.io/api/v1/admin/ai

# 5. Voice parse (requires device token)
curl -k -X POST \
  -H "x-device-token: YOUR_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"transcript":"2 kilo rice chahiye","storeId":"demo-store","mode":"SELL"}' \
  https://34.14.220.171.nip.io/api/v1/voice/parse

# 6. Audit logs (requires admin token)
curl -k -H "x-admin-token: YOUR_TOKEN" \
  https://34.14.220.171.nip.io/api/v1/admin/ai/audit?limit=10
```

---

## GO-LIVE Sign-off

### Verification Matrix

| Component | Tested By | Date | PASS/FAIL |
|-----------|-----------|------|-----------|
| OpenAI Provider Module | | | |
| Admin AI Endpoints | | | |
| Voice Order Endpoints | | | |
| Rate Limiting | | | |
| Security Controls | | | |
| Docker Deployment | | | |

### Final Sign-off

- [ ] All smoke tests pass
- [ ] POS voice order works end-to-end
- [ ] Admin AI chat works end-to-end
- [ ] No API keys in logs
- [ ] Rate limiting active
- [ ] Audit logs created

**Approved By:** _________________________ **Date:** _____________

---

## Rollback Plan

If issues occur after deployment:

```bash
# 1. SSH to VM
ssh claude@34.14.220.171

# 2. Revert to previous commit
cd ~/supermandi-pos
git checkout HEAD~1

# 3. Rebuild and restart
cd backend
docker-compose -f docker-compose.prod.yml build main-backend
docker-compose -f docker-compose.prod.yml up -d main-backend

# 4. Verify rollback
curl http://localhost:3010/health
```

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/services/ai/openaiProvider.ts` | New: OpenAI client with security |
| `backend/src/services/ai/askSuperMandiAI.ts` | Updated: Use OpenAI |
| `backend/src/services/ai/voiceOrderService.ts` | New: Voice order processing |
| `backend/src/routes/v1/admin/ai.ts` | Updated: OpenAI health check |
| `backend/src/routes/v1/pos/voice.ts` | New: Voice routes |
| `backend/src/routes/v1/index.ts` | Updated: Added voice router |
| `backend/.env.example` | Updated: OpenAI config |
| `backend/docker-compose.prod.yml` | Updated: OPENAI vars |
| `scripts/deploy-openai-migration.sh` | New: Deployment script |
| `scripts/smoke-test-openai.sh` | New: Smoke tests |

---

## Contact

For issues during deployment:
- Check Docker logs: `docker logs supermandi-main-backend`
- Check audit logs: `curl .../api/v1/admin/ai/audit`
- Review OpenAI status: https://status.openai.com/
