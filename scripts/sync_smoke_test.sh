#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
ADMIN_TOKEN="${ADMIN_TOKEN:?Set ADMIN_TOKEN env var}"
STORE_ID="${STORE_ID:-store-1}"

echo "==> Create enrollment code"
ENROLL_JSON="$(curl -sS -X POST "${BASE_URL}/api/v1/admin/stores/${STORE_ID}/device-enrollments" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN}")"
CODE="$(python - <<PY
import json
data = json.loads(r'''${ENROLL_JSON}''')
print(data.get("code", ""))
PY
)"
if [ -z "${CODE}" ]; then
  echo "Enrollment code missing"
  exit 1
fi
echo "Enrollment code: ${CODE}"

echo "==> Enroll device"
ENROLL_DEVICE_JSON="$(curl -sS -X POST "${BASE_URL}/api/v1/pos/enroll" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"${CODE}\",\"deviceMeta\":{\"model\":\"smoke-test\",\"appVersion\":\"script\",\"label\":\"Smoke-Test-1\",\"deviceType\":\"RETAILER_PHONE\",\"printingMode\":\"NONE\"}}")"
DEVICE_TOKEN="$(python - <<PY
import json
data = json.loads(r'''${ENROLL_DEVICE_JSON}''')
print(data.get("deviceToken", ""))
PY
)"
DEVICE_ID="$(python - <<PY
import json
data = json.loads(r'''${ENROLL_DEVICE_JSON}''')
print(data.get("deviceId", ""))
PY
)"
if [ -z "${DEVICE_TOKEN}" ] || [ -z "${DEVICE_ID}" ]; then
  echo "Device enrollment failed"
  exit 1
fi
echo "Device enrolled: ${DEVICE_ID}"

EVENT_ID="$(python - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
BARCODE="OFFLINE-TEST-${EVENT_ID:0:8}"
CREATED_AT="$(python - <<'PY'
import datetime
print(datetime.datetime.utcnow().isoformat() + "Z")
PY
)"

PAYLOAD="$(python - <<PY
import json
payload = {
  "pendingOutboxCount": 1,
  "events": [
    {
      "eventId": "${EVENT_ID}",
      "type": "PRODUCT_UPSERT",
      "payload": {
        "barcode": "${BARCODE}",
        "name": "Offline Test Item",
        "currency": "INR",
        "origin": "DIGITISE"
      },
      "createdAt": "${CREATED_AT}"
    }
  ]
}
print(json.dumps(payload))
PY
)"

echo "==> Sync run #1 (expect applied)"
RESP1="$(curl -sS -X POST "${BASE_URL}/api/v1/pos/sync" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "x-device-token: ${DEVICE_TOKEN}" \
  -d "${PAYLOAD}")"
python - <<PY
import json, sys
data = json.loads(r'''${RESP1}''')
results = data.get("results", [])
if not results:
    print("No results in response")
    sys.exit(1)
bad = [r for r in results if r.get("status") != "applied"]
if bad:
    print("Unexpected statuses:", bad)
    sys.exit(1)
print("OK: applied")
PY

echo "==> Sync run #2 (expect duplicate_ignored)"
RESP2="$(curl -sS -X POST "${BASE_URL}/api/v1/pos/sync" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "x-device-token: ${DEVICE_TOKEN}" \
  -d "${PAYLOAD}")"
python - <<PY
import json, sys
data = json.loads(r'''${RESP2}''')
results = data.get("results", [])
if not results:
    print("No results in response")
    sys.exit(1)
bad = [r for r in results if r.get("status") != "duplicate_ignored"]
if bad:
    print("Unexpected statuses:", bad)
    sys.exit(1)
print("OK: duplicate_ignored")
PY

echo "==> Devices API"
DEVICES="$(curl -sS -X GET "${BASE_URL}/api/v1/admin/devices?storeId=${STORE_ID}" \
  -H "Accept: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN}")"
python - <<PY
import json, sys
data = json.loads(r'''${DEVICES}''')
devices = data.get("devices", [])
if not devices:
    print("No devices returned")
    sys.exit(1)
device = next((d for d in devices if d.get("id") == "${DEVICE_ID}"), devices[0])
missing = [k for k in ("last_seen_online", "last_sync_at", "pending_outbox_count") if k not in device]
if missing:
    print("Missing device fields:", missing)
    sys.exit(1)
if not device.get("last_seen_online") or not device.get("last_sync_at"):
    print("Device timestamps not set:", device)
    sys.exit(1)
print("OK: devices fields present")
PY

echo "All sync smoke tests passed."
