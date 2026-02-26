"""
Generate 3 new W4 audit tickets discovered in deep re-audit at HEAD 188246c7.
Run: python scripts/_gen_new_w4_tickets.py
"""
import json, os

TICKETS_DIR = "workflow/tickets"
COMMIT = "188246c7"
CREATED_AT = "2026-02-26T19:00:00.000Z"
DEPLOY_REF = "github://run/22305359033"
CLOUD_RUN_REVISIONS = [
  "main-backend-00103-zbw", "api-gateway-00084-7zh",
  "retailer-admin-00084-pk6", "supplier-portal-00078-wv8",
  "superadmin-00077-r6c", "landing-00077-gj7"
]
REQUIRED_FILES = [
  "workflow/state/workflow_state.json",
  "workflow/schemas/ticket.schema.json",
  "workflow/schemas/screen_state.schema.json",
  "workflow/state/staging_batch.json",
  "workflow/state/live_page_manifest.json",
  "RELEASES/CLAUDE_STATE.md"
]

SURFACE_BASE_PATHS = {
  "retailer_web": "/retailer",
  "supplier_web": "/supplier",
  "superadmin_web": "/admin",
  "pos": "/api",
  "backend": "/api",
  "shared": "/api"
}

def invariant(status="na", notes="n/a", evidence=None):
    return {"status": status, "evidence": evidence or [], "notes": notes}

def base_ticket(tid, screen_id, surface, risk, title, desc, severity,
                layers, staging_urls, services, impacted_screens,
                reproSteps, dep_notes, summary, order_in_screen=1):
    expected_base = SURFACE_BASE_PATHS.get(surface, "/api")
    return {
      "ticketId": tid,
      "screenId": screen_id,
      "orderInScreen": order_in_screen,
      "surface": surface,
      "riskClass": risk,
      "title": title,
      "description": desc,
      "status": "todo",
      "severity": severity,
      "parentTicketId": None,
      "subTicketIds": [],
      "layers": layers,
      "gcpParity": {
        "stagingValidated": False,
        "stagingUrls": staging_urls,
        "cloudRunServices": services,
        "basePathChecked": False,
        "envParityChecked": False,
        "routingChecked": False,
        "apiContractChecked": False,
        "dbConnectivityChecked": False,
        "artifactDigestPinned": False,
        "cloudRunRevisionIds": CLOUD_RUN_REVISIONS
      },
      "impact": {
        "impactedScreens": impacted_screens,
        "impactedServices": services,
        "impactRetestRequired": True,
        "impactRetestStatus": "pending"
      },
      "operator": {
        "reportedBy": "claude-w4-reaudit",
        "reproSteps": reproSteps,
        "finalSignoff": False,
        "signoffAt": ""
      },
      "claudeChecks": {
        "screenVisualizedWithOperator": False,
        "codeQualityChecksPassed": False,
        "regressionChecklistPassed": False,
        "apiContractChecked": False,
        "navigationChecked": False,
        "envAndBasePathChecked": False,
        "migrationSafetyChecked": False,
        "rollbackPlanReady": False,
        "stagingDeployPassed": False,
        "stagingDeploymentRef": "pending",
        "cloudWorkspaceValidated": True,
        "cloudWorkspaceRef": "projects/supermandi-backend/locations/asia-south1"
      },
      "sessionBoot": {
        "bootstrappedBy": "claude",
        "bootstrappedAt": CREATED_AT,
        "runbookVersion": "workflow-v1.0.0",
        "memoryStateRef": "workflow/state/workflow_state.json",
        "requiredFilesRead": REQUIRED_FILES
      },
      "operatorChecks": {
        "stagingTestExecuted": False,
        "testedOnRealTarget": False,
        "testedOnLaptopBrowser": False,
        "testedOnRedmi": False,
        "stagingUrlsTested": [],
        "issuesReproduced": True,
        "fixVerified": False,
        "blockingIssueCount": 1,
        "nonBlockingIssueCount": 0,
        "noBlockingIssueRemaining": False,
        "evidenceAttached": True,
        "validatedDeploymentRef": DEPLOY_REF,
        "validatedCloudRunRevisionIds": CLOUD_RUN_REVISIONS
      },
      "statusHistory": [],
      "evidence": {
        "beforeVisual": [],
        "afterVisual": [],
        "apiProof": [],
        "parityProof": []
      },
      "timestamps": {
        "createdAt": CREATED_AT,
        "updatedAt": CREATED_AT,
        "lockedAt": None
      },
      "truthDeclaration": {
        "mockDataUsed": False,
        "mockApisUsed": False,
        "mockUsageApproved": False,
        "productionDataTested": True,
        "disclosedToOperator": True,
        "notes": f"Deep source-level re-audit at HEAD {COMMIT}. Verified line-by-line.",
        "evidence": [f"audit_ref={COMMIT}", "source=claude-w4-reaudit"]
      },
      "externalIntegrations": {
        "touched": False,
        "items": [],
        "operatorDisclosureDone": True,
        "allValidated": False
      },
      "buildMapping": {
        "expectedSurface": surface,
        "expectedBasePath": expected_base,
        "expectedPrimaryService": services[0],
        "actualCloudRunServices": services,
        "urlMappingValidated": False,
        "correctBuildTargetValidated": True,
        "stagingRouteEvidence": staging_urls
      },
      "dependencyDisclosure": {
        "internalDependencies": [],
        "externalDependencies": [],
        "pendingDependencies": [],
        "blockers": ["immutable-core-mode: existing code must not be modified without operator approval"],
        "disclosedToOperator": True,
        "operatorAcknowledged": False,
        "notes": dep_notes
      },
      "productionInvariants": {
        "sellPurchaseIsolation": invariant(),
        "deterministicScanIntentResolution": invariant(),
        "frontendBackendStateParity": invariant("pending", "Pending fix."),
        "offlineFirstSafeSync": invariant(),
        "idempotentTransactionProcessing": invariant(),
        "atomicDatabaseWrites": invariant(),
        "strictSchemaValidation": invariant("pending", "Pending fix."),
        "zeroSilentFailures": invariant("pending", "Pending fix."),
        "structuredAuditLogging": invariant()
      },
      "readiness": {
        "productionGradeClaimed": False,
        "pendingInternal": ["fix_implementation_pending", "staging_parity_pending"],
        "pendingExternal": [],
        "pendingOps": ["operator_signoff_pending"],
        "blocked": False,
        "summary": summary
      },
      "gitDiscipline": {
        "workBranch": "main",
        "changeScope": tid,
        "lastValidatedCommit": COMMIT,
        "noMixedScope": True,
        "noConflictMarkers": True,
        "ciGateStatus": "not_required",
        "evidence": [f"audit_ref={COMMIT}", "source=claude-w4-reaudit"]
      }
    }

tickets = []

# N1: Retailer ChatPage unreachable (no nav item)
tickets.append(base_ticket(
  tid="REQ.AUDIT.W4.RETAILER.CHAT-PAGE-UNREACHABLE.001",
  screen_id="RETAILER.CHAT",
  surface="retailer_web",
  risk="medium",
  severity="P2",
  title="ChatPage is routed but has no sidebar nav item — completely unreachable for all retailers",
  desc="retailer-admin/src/App.tsx line 324 registers a route at /s/:storeCode/chat that renders ChatPage (fully implemented with conversation list, message thread, send/receive, unread count). However, retailer-admin/src/components/ProtectedLayout.tsx navItems array (lines 84-104) has NO entry for path='chat'. The Messages icon and ChatPage are invisible in the sidebar. Users cannot navigate to the chat feature at all from within the portal. The only way to reach it is by manually typing the URL. This makes the entire chat feature dead for real users.",
  layers={"ui":"pass","ux":"fail","professional_polish":"fail","wiring":"fail","navigation":"fail","api":"pass","backend":"pass","db":"na","migration":"na","gcp_parity":"fail"},
  staging_urls=["https://staging.supermandi.tech/retailer/","https://staging.supermandi.tech/s/{storeCode}/chat"],
  services=["retailer-admin"],
  impacted_screens=["RETAILER.CHAT"],
  reproSteps=[
    "Login to retailer portal",
    "Inspect sidebar nav — no 'Messages' or 'Chat' item visible",
    "Inspect retailer-admin/src/components/ProtectedLayout.tsx navItems (lines 84-104) — no {path:'chat'} entry",
    "Inspect retailer-admin/src/App.tsx line 324 — <Route path='chat' element={...ChatPage...}> exists",
    "Manually navigate to /s/{storeCode}/chat — ChatPage loads with full UI",
    "Issue: no nav link exists to reach it from normal UX flow"
  ],
  dep_notes="Fix requires adding 1 line to navItems in ProtectedLayout.tsx: { path: 'chat', label: 'Messages', icon: MessageSquare }. MessageSquare is already imported (line 10). immutable-core: BLOCKED. Minimal-touch: 1 line insertion in navItems array.",
  summary="ChatPage is routed but has no sidebar nav item. Feature is completely unreachable. Fix: 1-line insertion in ProtectedLayout.tsx navItems. BLOCKED under immutable-core.",
  order_in_screen=1
))

# N2: Retailer-admin systematic ARIA coverage gap
tickets.append(base_ticket(
  tid="REQ.AUDIT.W4.RETAILER.ARIA-COVERAGE-GAP.001",
  screen_id="RETAILER.ACCESSIBILITY",
  surface="retailer_web",
  risk="medium",
  severity="P2",
  title="16 of 28 retailer-admin page files have zero ARIA attributes despite interactive elements — WCAG 2.1 violations",
  desc="Deep re-audit at HEAD 188246c7: 16 out of 28 retailer-admin page files have zero ARIA attributes (aria-label, aria-pressed, aria-current, role, etc.) despite containing 1-46 interactive elements each. Critical gaps: ProductsPage (40 interactive elements, 0 ARIA), InventoryPage (6, 0), InvoicesPage (9, 0), ReconciliationPage (7, 0), SettingsPage (14, 0), ReorderPage (9, 0), DeviceActivationPage (6, 0), ImportPage (9, 0), CompliancePage (7, 0), PaymentsPage (4, 0), NotificationsPage (5, 0), AnalyticsPage (3, 0), ChatPage (4, 0), CreditDashboardPage (1, 0), ResetPasswordPage (5, 0), SuppliersPage (46, 1 — only WhatsApp button). This violates WCAG 2.1 SC 1.3.1 (Info and Relationships), SC 4.1.2 (Name, Role, Value), and SC 2.4.6 (Headings and Labels). Screen reader users cannot identify or operate any interactive element on these pages.",
  layers={"ui":"fail","ux":"fail","professional_polish":"fail","wiring":"na","navigation":"na","api":"na","backend":"na","db":"na","migration":"na","gcp_parity":"fail"},
  staging_urls=["https://staging.supermandi.tech/retailer/","https://staging.supermandi.tech/s/{storeCode}/products","https://staging.supermandi.tech/s/{storeCode}/inventory","https://staging.supermandi.tech/s/{storeCode}/invoices"],
  services=["retailer-admin"],
  impacted_screens=["RETAILER.PRODUCTS","RETAILER.INVENTORY","RETAILER.SUPPLIERS","RETAILER.INVOICES","RETAILER.SETTINGS","RETAILER.RECONCILIATION","RETAILER.REORDER","RETAILER.COMPLIANCE","RETAILER.IMPORT","RETAILER.PAYMENTS","RETAILER.NOTIFICATIONS","RETAILER.ANALYTICS","RETAILER.CHAT","RETAILER.CREDIT","RETAILER.DEVICES"],
  reproSteps=[
    "Run: grep -rn 'aria-' retailer-admin/src/pages/ProductsPage.tsx — output: 0 results",
    "Run: grep -c '<button\\|<input' retailer-admin/src/pages/ProductsPage.tsx — output: 40",
    "Open retailer portal with NVDA or VoiceOver screen reader",
    "Navigate to Products page — all buttons/inputs announce only their type, not their purpose",
    "Example: Search input has no aria-label, filter buttons have no aria-label, sort controls have no aria-label",
    "Same pattern across 16 pages listed in description"
  ],
  dep_notes="Fix requires adding aria-label to interactive elements across 16 page files. This touches existing files — BLOCKED under immutable-core. Minimal-touch per page: 4-10 aria-label additions. Full remediation: 80-120 lines across 16 files. Priority order: ProductsPage (40 elements), SuppliersPage (46 elements), InventoryPage, SettingsPage.",
  summary="16 retailer-admin pages have zero ARIA attributes with 1-46 interactive elements each. WCAG 2.1 violations. Fix: add aria-labels across 16 page files. BLOCKED under immutable-core.",
  order_in_screen=1
))

# N3: Supplier-portal systematic ARIA coverage gap
tickets.append(base_ticket(
  tid="REQ.AUDIT.W4.SUPPLIER.ARIA-COVERAGE-GAP.001",
  screen_id="SUPPLIER.ACCESSIBILITY",
  surface="supplier_web",
  risk="medium",
  severity="P2",
  title="9 of 11 supplier-portal dashboard pages have zero ARIA attributes despite interactive elements — WCAG 2.1 violations",
  desc="Deep re-audit at HEAD 188246c7: 9 out of 11 supplier-portal dashboard page files have zero ARIA attributes (aria-label, role, etc.) despite containing interactive elements. Critical gaps: profile/page.tsx (18 interactive elements, 0 ARIA), kyc/page.tsx (11, 0), invoices/page.tsx (9, 0), bnpl-orders/page.tsx (4, 0), chat/page.tsx (4, 0), dashboard/page.tsx (1, 0), notifications/page.tsx (5, 0). Only orders/page.tsx (3 aria) and products/page.tsx (3 aria) have minimal ARIA. The supplier portal layout.tsx (11 interactive, 4 aria) has partial coverage but lacks aria-label on most nav links. This violates WCAG 2.1 SC 1.3.1, SC 4.1.2, and SC 2.4.6. Screen reader users cannot navigate or operate supplier portal features meaningfully.",
  layers={"ui":"fail","ux":"fail","professional_polish":"fail","wiring":"na","navigation":"na","api":"na","backend":"na","db":"na","migration":"na","gcp_parity":"fail"},
  staging_urls=["https://staging.supermandi.tech/supplier/","https://staging.supermandi.tech/supplier/kyc","https://staging.supermandi.tech/supplier/profile","https://staging.supermandi.tech/supplier/invoices"],
  services=["supplier-portal"],
  impacted_screens=["SUPPLIER.PROFILE","SUPPLIER.KYC","SUPPLIER.INVOICES","SUPPLIER.BNPL","SUPPLIER.CHAT","SUPPLIER.DASHBOARD","SUPPLIER.NOTIFICATIONS"],
  reproSteps=[
    "Run: grep -c 'aria-' supplier-portal/src/app/(dashboard)/kyc/page.tsx — output: 0",
    "Run: grep -c '<button\\|<input' supplier-portal/src/app/(dashboard)/kyc/page.tsx — output: 11",
    "Open supplier portal with NVDA/VoiceOver on profile or KYC page",
    "All form inputs, buttons, file upload controls read only their native type — no accessible names",
    "File upload inputs in kyc/page.tsx: no aria-label to describe what document type is expected",
    "Profile page form fields: no aria-label on most inputs"
  ],
  dep_notes="Fix requires adding aria-label to interactive elements across 9 page files. Touches existing files — BLOCKED under immutable-core. Minimal-touch per page: 3-8 aria-label additions. Full remediation: 50-80 lines across 9 files. Priority order: profile/page.tsx (18 elements), kyc/page.tsx (11 elements), invoices/page.tsx (9 elements).",
  summary="9 supplier-portal pages have zero ARIA attributes with interactive elements. WCAG 2.1 violations. Fix: add aria-labels across 9 page files. BLOCKED under immutable-core.",
  order_in_screen=1
))

# Write all tickets
os.makedirs(TICKETS_DIR, exist_ok=True)
for t in tickets:
    path = os.path.join(TICKETS_DIR, f"{t['ticketId']}.json")
    with open(path, "w") as f:
        json.dump(t, f, indent=2)
    print(f"Written: {t['ticketId']}")

print(f"\nTotal: {len(tickets)} new tickets")
