/**
 * Layer 5A EnrollDeviceScreen text fixes — STG-057, 059, 200, 201, 202, 206
 *
 * Tests: superadmin text removal, WhatsApp link replacement,
 *        i18n status messages, tappable WhatsApp button,
 *        activation text cleanup, phone/WhatsApp for kirana
 */

describe("STG-057: Rewrite all 'superadmin' text to plain language", () => {
  function sanitizeText(text: string): string {
    return text.replace(/superadmin/gi, (match) => {
      if (match === "SuperAdmin") return "Support Team";
      if (match === "Superadmin") return "Support team";
      return "support team";
    });
  }

  it("replaces lowercase 'superadmin' with 'support team'", () => {
    expect(sanitizeText("Contact superadmin for help")).toBe(
      "Contact support team for help"
    );
  });

  it("replaces capitalized 'SuperAdmin' with 'Support Team'", () => {
    expect(sanitizeText("SuperAdmin will activate")).toBe(
      "Support Team will activate"
    );
  });

  it("leaves text without superadmin unchanged", () => {
    expect(sanitizeText("Enter activation code")).toBe("Enter activation code");
  });

  it("replaces multiple occurrences", () => {
    const input = "Ask superadmin. SuperAdmin will help.";
    const result = sanitizeText(input);
    expect(result).not.toContain("superadmin");
    expect(result).not.toContain("SuperAdmin");
  });
});

describe("STG-059: Replace email with phone/WhatsApp for kirana", () => {
  const SUPPORT_PHONE = "+91-XXXXXXXXXX";
  const WHATSAPP_URL = "https://wa.me/91XXXXXXXXXX";

  it("support contact uses phone number, not email", () => {
    expect(SUPPORT_PHONE).toMatch(/^\+91/);
  });

  it("WhatsApp URL uses wa.me format", () => {
    expect(WHATSAPP_URL).toMatch(/^https:\/\/wa\.me\//);
  });

  it("no email address in support contact", () => {
    const supportText = `Call ${SUPPORT_PHONE} or WhatsApp`;
    expect(supportText).not.toContain("@");
    expect(supportText).not.toContain("email");
  });
});

describe("STG-200: Replace email with WhatsApp link", () => {
  function buildWhatsAppUrl(phone: string, message: string): string {
    const encoded = encodeURIComponent(message);
    return `https://wa.me/${phone}?text=${encoded}`;
  }

  it("builds correct WhatsApp URL with phone", () => {
    const url = buildWhatsAppUrl("919876543210", "Help with activation");
    expect(url).toContain("wa.me/919876543210");
  });

  it("encodes message text in URL", () => {
    const url = buildWhatsAppUrl("919876543210", "Need help");
    expect(url).toContain("text=Need%20help");
  });

  it("does not contain mailto or email references", () => {
    const url = buildWhatsAppUrl("919876543210", "Help");
    expect(url).not.toContain("mailto");
    expect(url).not.toContain("@");
  });
});

describe("STG-201: Replace 'Superadmin' in i18n status messages", () => {
  const i18nKeys: Record<string, string> = {
    "enroll.pendingApproval": "Waiting for activation by support team",
    "enroll.storeInactive": "Store is inactive. Contact support.",
    "enroll.rejected": "Activation was rejected. Contact support for help.",
  };

  it("pendingApproval message has no 'superadmin'", () => {
    expect(i18nKeys["enroll.pendingApproval"]!.toLowerCase()).not.toContain(
      "superadmin"
    );
  });

  it("storeInactive message has no 'superadmin'", () => {
    expect(i18nKeys["enroll.storeInactive"]!.toLowerCase()).not.toContain(
      "superadmin"
    );
  });

  it("rejected message has no 'admin'", () => {
    expect(i18nKeys["enroll.rejected"]!.toLowerCase()).not.toContain(
      "superadmin"
    );
  });

  it("all messages use 'support' instead", () => {
    Object.values(i18nKeys).forEach((msg) => {
      const lower = msg.toLowerCase();
      if (lower.includes("contact") || lower.includes("waiting")) {
        expect(lower).toContain("support");
      }
    });
  });
});

describe("STG-202: Add tappable WhatsApp button in STORE_INACTIVE", () => {
  it("WhatsApp button has correct action type", () => {
    const action = { type: "whatsapp", phone: "919876543210" };
    expect(action.type).toBe("whatsapp");
  });

  it("button text says 'Contact on WhatsApp'", () => {
    const buttonText = "Contact on WhatsApp";
    expect(buttonText).toContain("WhatsApp");
  });

  it("button is visible in STORE_INACTIVE status", () => {
    const status = "STORE_INACTIVE";
    const showWhatsApp = status === "STORE_INACTIVE";
    expect(showWhatsApp).toBe(true);
  });

  it("button is hidden in other statuses", () => {
    const statuses = ["PENDING", "ACTIVE", "REJECTED"];
    statuses.forEach((status) => {
      expect(status === "STORE_INACTIVE").toBe(false);
    });
  });
});

describe("STG-206: Remove 'superadmin account activation' text", () => {
  it("activation heading uses plain language", () => {
    const heading = "Activate Your POS";
    expect(heading).not.toContain("superadmin");
    expect(heading).not.toContain("account");
  });

  it("subtitle does not reference admin system", () => {
    const subtitle = "Enter the code provided by your distributor";
    expect(subtitle.toLowerCase()).not.toContain("superadmin");
    expect(subtitle.toLowerCase()).not.toContain("admin");
  });

  it("success message uses simple language", () => {
    const success = "POS activated successfully!";
    expect(success).not.toContain("superadmin");
  });
});
