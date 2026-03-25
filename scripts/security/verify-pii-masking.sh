#!/bin/bash
# GCP-STG-0631: Verify no sensitive data in Cloud Run logs
echo "=== PII MASKING VERIFICATION ==="

echo "[1/4] Phone numbers in logs..."
# Check for full phone numbers logged (10+ digits without masking)
PHONE_LOGS=$(grep -rn 'log\.\(info\|warn\|error\).*phone\|log\.\(info\|warn\|error\).*Phone' backend/src/ --include="*.ts" | grep -v '__tests__' | grep -v '.test.' | grep -v 'slice(0, 3)' | grep -v 'mask' | wc -l)
echo "  Phone in log calls: $PHONE_LOGS (verify masking manually)"

echo "[2/4] OTP in logs..."
# GCP-STG-0478 should have removed plaintext OTP logging
OTP_LOGS=$(grep -rn 'log.*otp\|log.*OTP' backend/src/ --include="*.ts" | grep -v '__tests__' | grep -v 'LOG_OTP_PLAINTEXT' | grep -v 'masked' | wc -l)
echo "  OTP in log calls: $OTP_LOGS"

echo "[3/4] Email addresses in logs..."
EMAIL_LOGS=$(grep -rn 'log\.\(info\|warn\|error\).*email' backend/src/ --include="*.ts" | grep -v '__tests__' | grep -v '.test.' | wc -l)
echo "  Email in log calls: $EMAIL_LOGS (admin emails OK, user emails should be masked)"

echo "[4/4] Passwords/tokens in logs..."
SECRET_LOGS=$(grep -rn 'log.*password\|log.*token\|log.*secret' backend/src/ --include="*.ts" | grep -v '__tests__' | grep -v '.test.' | grep -vi 'invalid\|expired\|missing\|required\|check' | wc -l)
echo "  Password/token in log calls: $SECRET_LOGS"

echo ""
echo "Best practices:"
echo "  - Phone: log only first 3 digits + *** (e.g., +91***)"
echo "  - Email: log only domain (e.g., ***@supermandi.tech)"
echo "  - OTP: NEVER log plaintext (GCP-STG-0478)"
echo "  - Tokens: NEVER log values, only existence/expiry"
echo "=== CHECK COMPLETE ==="
