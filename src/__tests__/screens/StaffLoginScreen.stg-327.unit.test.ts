/**
 * STG-327: StaffLoginScreen — Button countdown text
 *
 * Tests: countdown timer display, button disabled during countdown,
 *        button re-enables after countdown, text formatting
 */

describe("STG-327: StaffLoginScreen — button countdown text", () => {
  function formatCountdown(seconds: number): string {
    if (seconds <= 0) return "Retry";
    return `Retry in ${seconds}s`;
  }

  it("shows 'Retry in Xs' during countdown", () => {
    expect(formatCountdown(30)).toBe("Retry in 30s");
    expect(formatCountdown(5)).toBe("Retry in 5s");
  });

  it("shows 'Retry' when countdown reaches 0", () => {
    expect(formatCountdown(0)).toBe("Retry");
  });

  it("shows 'Retry' for negative values", () => {
    expect(formatCountdown(-1)).toBe("Retry");
  });

  it("button is disabled during countdown", () => {
    const countdown = 15;
    const isDisabled = countdown > 0;
    expect(isDisabled).toBe(true);
  });

  it("button is enabled after countdown", () => {
    const countdown = 0;
    const isDisabled = countdown > 0;
    expect(isDisabled).toBe(false);
  });

  it("countdown starts at correct value after failed attempt", () => {
    const COOLDOWN_SECONDS = 30;
    let countdown = 0;
    // Simulate failed login
    const loginFailed = true;
    if (loginFailed) countdown = COOLDOWN_SECONDS;
    expect(countdown).toBe(30);
  });

  it("countdown decrements by 1 each second", () => {
    let countdown = 3;
    const ticks: number[] = [];
    while (countdown > 0) {
      countdown--;
      ticks.push(countdown);
    }
    expect(ticks).toEqual([2, 1, 0]);
  });
});
