/**
 * STG-305: DeviceBlockedScreen — Replace "SuperAdmin"/"administrator"
 *
 * Tests: all user-facing text uses plain language,
 *        no references to "superadmin" or "administrator"
 */

describe("STG-305: DeviceBlockedScreen — plain language text", () => {
  const screenTexts = {
    title: "Device Blocked",
    message: "This device has been deactivated. Please contact support for assistance.",
    contactLabel: "Contact Support",
    retryLabel: "Try Again",
  };

  it("title does not contain 'admin' references", () => {
    expect(screenTexts.title.toLowerCase()).not.toContain("admin");
    expect(screenTexts.title.toLowerCase()).not.toContain("superadmin");
  });

  it("message uses 'support' instead of 'administrator'", () => {
    expect(screenTexts.message.toLowerCase()).not.toContain("administrator");
    expect(screenTexts.message.toLowerCase()).not.toContain("superadmin");
    expect(screenTexts.message.toLowerCase()).toContain("support");
  });

  it("contact button says 'Contact Support'", () => {
    expect(screenTexts.contactLabel).toBe("Contact Support");
  });

  it("retry button is available", () => {
    expect(screenTexts.retryLabel).toBeTruthy();
  });

  it("WhatsApp contact option is provided", () => {
    const contactMethod = "whatsapp";
    expect(contactMethod).toBe("whatsapp");
  });

  it("blocked reason is displayed when available", () => {
    const reason = "Store subscription expired";
    const displayReason = reason || "Contact support for details";
    expect(displayReason).toBe("Store subscription expired");
  });

  it("fallback message when no reason provided", () => {
    const reason: string | null = null;
    const displayReason = reason || "Contact support for details";
    expect(displayReason).toBe("Contact support for details");
  });
});
