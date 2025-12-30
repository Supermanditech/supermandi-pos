#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
ADMIN_TOKEN="${ADMIN_TOKEN:?Set ADMIN_TOKEN env var}"
STORE_ID="${STORE_ID:-store-1}"

FROM="$(python - <<'PY'
import datetime
now = datetime.datetime.utcnow()
start = now - datetime.timedelta(days=7)
start = start.replace(hour=0, minute=0, second=0, microsecond=0)
print(start.isoformat() + "Z")
PY
)"
TO="$(python - <<'PY'
import datetime
now = datetime.datetime.utcnow()
end = now.replace(hour=23, minute=59, second=59, microsecond=999000)
print(end.isoformat() + "Z")
PY
)"

echo "==> Payments analytics"
PAYMENTS_JSON="$(curl -fsS -X GET "${BASE_URL}/api/v1/admin/analytics/payments?storeId=${STORE_ID}&from=${FROM}&to=${TO}" \
  -H "Accept: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN}")"
python - <<PY
import json, sys
data = json.loads(r'''${PAYMENTS_JSON}''')
payments = data.get("payments")
if not payments:
    print("Missing payments payload")
    sys.exit(1)
for key in ("totals", "counts", "byHour"):
    if key not in payments:
        print("Missing payments key:", key)
        sys.exit(1)
for key in ("cash_minor", "upi_minor", "due_minor"):
    if key not in payments["totals"]:
        print("Missing totals key:", key)
        sys.exit(1)
for key in ("cash", "upi", "due"):
    if key not in payments["counts"]:
        print("Missing counts key:", key)
        sys.exit(1)
print("OK: payments analytics keys")
PY

echo "==> Dues analytics"
DUES_JSON="$(curl -fsS -X GET "${BASE_URL}/api/v1/admin/analytics/dues?storeId=${STORE_ID}&from=${FROM}&to=${TO}" \
  -H "Accept: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN}")"
python - <<PY
import json, sys
data = json.loads(r'''${DUES_JSON}''')
dues = data.get("dues")
if not dues:
    print("Missing dues payload")
    sys.exit(1)
for key in ("outstanding_total_minor", "aging", "dues", "total"):
    if key not in dues:
        print("Missing dues key:", key)
        sys.exit(1)
for key in ("d0_1", "d2_7", "d8_30", "d30_plus"):
    if key not in dues["aging"]:
        print("Missing aging key:", key)
        sys.exit(1)
print("OK: dues analytics keys")
PY

echo "==> Activity analytics"
ACTIVITY_JSON="$(curl -fsS -X GET "${BASE_URL}/api/v1/admin/analytics/activity?storeId=${STORE_ID}&from=${FROM}&to=${TO}&groupBy=hour" \
  -H "Accept: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN}")"
python - <<PY
import json, sys
data = json.loads(r'''${ACTIVITY_JSON}''')
activity = data.get("activity")
if not activity:
    print("Missing activity payload")
    sys.exit(1)
for key in ("groupBy", "buckets"):
    if key not in activity:
        print("Missing activity key:", key)
        sys.exit(1)
print("OK: activity analytics keys")
PY

echo "==> Overview (guard check)"
OVERVIEW_JSON="$(curl -fsS -X GET "${BASE_URL}/api/v1/admin/analytics/overview?storeId=${STORE_ID}&from=${FROM}&to=${TO}" \
  -H "Accept: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN}")"
MISSING_PURCHASES="$(python - <<PY
import json
data = json.loads(r'''${OVERVIEW_JSON}''')
overview = data.get("overview", {})
missing = overview.get("profit_missing_fields", []) or []
print("1" if "purchase_items" in missing else "0")
PY
)"

echo "==> AI guard: purchases/profit"
AI_PROFIT_JSON="$(curl -fsS -X POST "${BASE_URL}/api/v1/admin/ai" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN}" \
  -d "{\"question\":\"Show profit for store-1 this week.\"}")"
if [ "${MISSING_PURCHASES}" = "1" ]; then
python - <<PY
import json, sys
data = json.loads(r'''${AI_PROFIT_JSON}''')
answer = data.get("answer", "")
needle = "Purchases/profit are not available yet because Vendor\u2192Retailer integration is not implemented in this phase."
if needle not in answer:
    print("Missing purchases guard note")
    sys.exit(1)
print("OK: purchases guard note")
PY
else
  echo "Purchases data present; guard note not required."
fi

echo "==> AI guard: user-wise limitation"
AI_USER_JSON="$(curl -fsS -X POST "${BASE_URL}/api/v1/admin/ai" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN}" \
  -d "{\"question\":\"Show cashier/user performance for store-1 today.\"}")"
python - <<PY
import json, sys
data = json.loads(r'''${AI_USER_JSON}''')
answer = data.get("answer", "")
needle = "User-wise analytics are not available; reporting is device-wise only."
if needle not in answer:
    print("Missing user-wise guard note")
    sys.exit(1)
print("OK: user-wise guard note")
PY

echo "All AI + analytics smoke tests passed."
