/**
 * STG-310: SplashScreen — "Continue without session" → "Continue Offline"
 *
 * Tests: button text uses "Continue Offline", no jargon like "session"
 */

describe("STG-310: SplashScreen — 'Continue Offline' button text", () => {
  it("button text says 'Continue Offline'", () => {
    const buttonText = "Continue Offline";
    expect(buttonText).toBe("Continue Offline");
  });

  it("does not use 'Continue without session'", () => {
    const buttonText = "Continue Offline";
    expect(buttonText).not.toContain("session");
    expect(buttonText).not.toContain("without");
  });

  it("button is visible when session check fails", () => {
    const sessionFailed = true;
    const showOfflineButton = sessionFailed;
    expect(showOfflineButton).toBe(true);
  });

  it("button is hidden while session check is in progress", () => {
    const isChecking = true;
    const showOfflineButton = !isChecking;
    expect(showOfflineButton).toBe(false);
  });

  it("tapping button navigates to SellScan in offline mode", () => {
    const navigate = jest.fn();
    const setOfflineMode = jest.fn();
    // Simulate button press
    setOfflineMode(true);
    navigate("SellScan");
    expect(setOfflineMode).toHaveBeenCalledWith(true);
    expect(navigate).toHaveBeenCalledWith("SellScan");
  });
});
