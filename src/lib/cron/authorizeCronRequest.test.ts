import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeCronRequest } from "./authorizeCronRequest";

describe("authorizeCronRequest", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when CRON_SECRET is not set", () => {
    expect(
      authorizeCronRequest(
        new Request("http://localhost/", {
          headers: { Authorization: "Bearer any" },
        }),
      ),
    ).toBe(false);
  });

  it("returns false when Authorization header is missing", () => {
    vi.stubEnv("CRON_SECRET", "secret");
    expect(authorizeCronRequest(new Request("http://localhost/"))).toBe(false);
  });

  it("returns false when Bearer token does not match", () => {
    vi.stubEnv("CRON_SECRET", "expected");
    expect(
      authorizeCronRequest(
        new Request("http://localhost/", {
          headers: { Authorization: "Bearer wrong" },
        }),
      ),
    ).toBe(false);
  });

  it("returns true when Bearer token matches CRON_SECRET", () => {
    vi.stubEnv("CRON_SECRET", "expected");
    expect(
      authorizeCronRequest(
        new Request("http://localhost/", {
          headers: { Authorization: "Bearer expected" },
        }),
      ),
    ).toBe(true);
  });

  it("accepts VERCEL_CRON_SECRET as alias when CRON_SECRET is unset", () => {
    vi.stubEnv("VERCEL_CRON_SECRET", "from-vercel");
    expect(
      authorizeCronRequest(
        new Request("http://localhost/", {
          headers: { Authorization: "Bearer from-vercel" },
        }),
      ),
    ).toBe(true);
  });
});
