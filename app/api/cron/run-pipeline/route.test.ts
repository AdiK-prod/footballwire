import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pipeline/runDailyPipeline", () => ({
  runDailyPipeline: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "./route";

describe("run-pipeline cron route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when CRON_SECRET is set but Authorization is missing", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const response = await GET(new Request("http://localhost/api/cron/run-pipeline"));
    expect(response.status).toBe(401);
  });

  it("returns 401 when bearer token does not match", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const response = await GET(
      new Request("http://localhost/api/cron/run-pipeline", {
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 200 for GET with valid Bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const response = await GET(
      new Request("http://localhost/api/cron/run-pipeline", {
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 200 for POST with valid Bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const response = await POST(
      new Request("http://localhost/api/cron/run-pipeline", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(response.status).toBe(200);
  });
});
