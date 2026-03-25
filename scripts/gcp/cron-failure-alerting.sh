#!/bin/bash
# GCP-STG-0680: Cron job failure alerting
#
# Documents how to set up alerting for GitHub Actions cron failures
# (uptime-probe, zrp-scheduled) so the team is notified immediately
# when scheduled workflows fail.
#
# Usage:
#   bash scripts/gcp/cron-failure-alerting.sh

set -euo pipefail

echo "=== CRON JOB FAILURE ALERTING ==="
echo ""
echo "MONITORED CRON WORKFLOWS:"
echo "  1. uptime-probe.yml    — runs every 5 min, pings staging health endpoints"
echo "  2. zrp-scheduled.yml   — runs daily, zero-regression-policy scheduled checks"
echo ""
echo "=== METHOD 1: GitHub Notification Settings ==="
echo ""
echo "  1. Go to GitHub repo → Settings → Actions → Notifications"
echo "  2. Under 'Send notifications for workflow runs', select:"
echo "     - 'Only failures' — notifies on failure/cancelled"
echo "  3. Notifications go to the repo owner's email by default"
echo "  4. For team-wide alerts, add a shared email or use method 2/3"
echo ""
echo "=== METHOD 2: Slack Webhook Integration ==="
echo ""
echo "  1. Create a Slack Incoming Webhook:"
echo "     - Go to https://api.slack.com/apps → Create New App"
echo "     - Add 'Incoming Webhooks' feature"
echo "     - Create webhook for #supermandi-alerts channel"
echo "     - Copy the webhook URL"
echo ""
echo "  2. Add webhook as GitHub repo variable (Actions > Variables):"
echo "     gh variable set SLACK_WEBHOOK_URL --body 'https://hooks.slack.com/services/T.../B.../xxx'"
echo ""
echo "  3. Add failure notification step to each cron workflow:"
echo "     - name: Notify Slack on failure"
echo "       if: failure()"
echo "       run: |"
echo "         curl -X POST SLACK_WEBHOOK_URL_FROM_VARS \\"
echo "           -H 'Content-Type: application/json' \\"
echo "           -d '{\"text\": \"Cron workflow failed — check Actions run log\"}'"
echo ""
echo "=== METHOD 3: CLI Monitoring Command ==="
echo ""
echo "  Check recent cron failures manually:"
echo "    gh run list --workflow=uptime-probe.yml --status=failure --limit=5"
echo "    gh run list --workflow=zrp-scheduled.yml --status=failure --limit=5"
echo ""
echo "  Automated check (add to a local cron or scheduled task):"
echo '    FAILURES=$(gh run list --workflow=uptime-probe.yml --status=failure --limit=1 --json conclusion,createdAt -q ".[0].createdAt")'
echo '    if [ -n "$FAILURES" ]; then'
echo '      echo "WARNING: uptime-probe has recent failures — investigate immediately"'
echo '    fi'
echo ""
echo "=== RECOMMENDED SETUP ==="
echo ""
echo "  - Method 1 (GitHub notifications): Always enabled — zero cost"
echo "  - Method 2 (Slack webhook): Enable when Slack workspace is active"
echo "  - Method 3 (CLI check): Run as part of morning standup routine"
echo ""
echo "Done."
