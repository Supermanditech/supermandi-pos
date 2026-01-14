# Provisioning API Contract
## PROV-002: Admin APIs for Store + User + Device Management

---

## 1. Store Management (platform-service)

### Create Store
```
POST /admin/stores
Authorization: Bearer {superadmin_token}

Request:
{
  "name": "Kirana Store ABC",
  "code": "KS-001",          // unique store code
  "phone": "9876543210",     // optional
  "email": "store@email.com", // optional
  "timezone": "Asia/Kolkata", // default
  "currency": "INR",         // default
  "status": "active"         // active | inactive
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Kirana Store ABC",
    "code": "KS-001",
    "status": "active",
    "createdAt": "2026-01-14T10:00:00Z"
  }
}
```

### List Stores
```
GET /admin/stores?page=1&limit=50&status=active
Authorization: Bearer {superadmin_token}

Response:
{
  "success": true,
  "data": [...stores],
  "pagination": { "page": 1, "limit": 50, "total": 100 }
}
```

---

## 2. User Management (auth-service)

### Create Store User
```
POST /admin/stores/:storeId/users
Authorization: Bearer {superadmin_token}

Request:
{
  "name": "Store Owner",
  "phone": "9876543210",
  "pin": "1234",             // 4-6 digit PIN
  "role": "STORE_ADMIN"      // STORE_ADMIN | STAFF
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Store Owner",
    "phone": "9876543210",
    "role": "STORE_ADMIN",
    "storeId": "store-uuid"
  }
}
```

### List Store Users
```
GET /admin/stores/:storeId/users
Authorization: Bearer {superadmin_token}

Response:
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "...", "phone": "...", "role": "...", "status": "active" }
  ]
}
```

---

## 3. Device Enrollment (enroll-service / platform-service)

### Create Enrollment Code
```
POST /admin/stores/:storeId/device-enrollments
Authorization: Bearer {superadmin_token}

Request:
{
  "expiresInMinutes": 10,    // default 10, max 60
  "label": "Counter-1"       // optional pre-assigned label
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "code": "SM-ABC123",     // 6-8 char alphanumeric
    "storeId": "store-uuid",
    "expiresAt": "2026-01-14T10:10:00Z",
    "qrPayload": "supermandi://enroll?code=SM-ABC123"
  }
}
```

### List Store Devices
```
GET /admin/stores/:storeId/devices
Authorization: Bearer {superadmin_token}

Response:
{
  "success": true,
  "data": [
    {
      "id": "device-id",
      "label": "Counter-1",
      "status": "active",
      "deviceType": "RETAILER_PHONE",
      "lastSeenAt": "2026-01-14T09:30:00Z",
      "enrolledAt": "2026-01-13T14:00:00Z"
    }
  ]
}
```

### Block/Unblock Device
```
POST /admin/devices/:deviceId/block
POST /admin/devices/:deviceId/unblock
Authorization: Bearer {superadmin_token}

Response:
{
  "success": true,
  "data": { "id": "device-id", "status": "blocked" }
}
```

### Revoke Enrollment Code
```
POST /admin/device-enrollments/:id/revoke
Authorization: Bearer {superadmin_token}

Response:
{
  "success": true,
  "data": { "id": "uuid", "revokedAt": "2026-01-14T10:05:00Z" }
}
```

---

## 4. Device Enrollment Flow (POS App)

### Enroll Device
```
POST /api/v1/pos/enroll
No Auth Required (code is auth)

Request:
{
  "code": "SM-ABC123",        // or "enrollmentCode"
  "deviceMeta": {
    "manufacturer": "Samsung",
    "model": "Galaxy A52",
    "androidVersion": "13",
    "appVersion": "1.0.1",
    "label": "Counter-1",
    "deviceType": "RETAILER_PHONE",
    "printingMode": "NONE"
  }
}

Response (Success):
{
  "deviceId": "dev_xyz123",
  "storeId": "store-uuid",
  "deviceToken": "jwt-token-for-device",
  "storeActive": true
}

Response (Error):
{
  "error": "enrollment_invalid" | "enrollment_expired" | "enrollment_used"
}
```

---

## 5. Feature Flags / UI Status

### Get UI Status
```
GET /api/v1/pos/ui-status
x-device-token: {deviceToken}

Response:
{
  "features": {
    "reorderEnabled": false,
    "buyEnabled": true,
    "inventoryEnabled": true,
    "suppliersEnabled": true,
    "ordersEnabled": true,
    "scan_lookup_v2": true
  },
  "version": "3.0.10"
}
```

---

## Security Rules

1. **Enrollment codes**:
   - 6-8 character alphanumeric, uppercase
   - Stored as hash in DB (SHA-256 or bcrypt)
   - Single-use: `used_at` set on first use
   - Time-limited: default 10 min, max 60 min
   - Track which device used the code (`used_device_id`)

2. **Device tokens**:
   - JWT with `deviceId`, `storeId`, `exp`
   - Rotate on re-enrollment
   - Revoke when device is blocked

3. **Rate limiting**:
   - Max 10 enrollment code generations per store per hour
   - Max 5 enrollment attempts per code per minute

4. **Audit logging**:
   - Log all admin actions with user ID, timestamp, IP
   - Log all enrollment attempts (success and failure)

---

## Scale Considerations (10k+ stores)

1. **Indexes**: All queries by store_id should use index
2. **Unique constraints**: store.code, device.label per store
3. **Connection pooling**: Use PgBouncer for high concurrency
4. **Idempotency**: All write operations should be idempotent
5. **Cleanup job**: Expire unused enrollment codes after 24h
