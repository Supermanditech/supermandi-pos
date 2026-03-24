#!/bin/bash
# GCP-STG-0604: Verify SSL certificate validity
DOMAIN="${1:-staging.supermandi.tech}"
echo "=== SSL CERTIFICATE CHECK ==="
echo "Domain: $DOMAIN"

# Check certificate expiry
EXPIRY=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$EXPIRY" ]; then
  echo "Expires: $EXPIRY"
  DAYS_LEFT=$(( ($(date -d "$EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$EXPIRY" +%s 2>/dev/null) - $(date +%s)) / 86400 ))
  echo "Days remaining: $DAYS_LEFT"
  [ "$DAYS_LEFT" -gt 30 ] && echo "Certificate valid (>30 days)" || echo "WARNING: Certificate expires in $DAYS_LEFT days"
else
  echo "Could not check certificate — verify manually"
fi

echo ""
echo "GCP managed certificates auto-renew. Verify in:"
echo "  gcloud compute ssl-certificates list"
echo "=== SSL CHECK COMPLETE ==="
