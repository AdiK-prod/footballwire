import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("validate-source route", () => {
  it("rejects general sources because they bypass validation", async () => {
    const request = new Request("http://localhost/api/validate-source", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com/feed.xml",
        teamId: null,
        sourceType: "general",
        submittedBy: "qa@test.local",
      }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("bypass");
  });
});
