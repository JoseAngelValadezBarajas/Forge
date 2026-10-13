import { test } from "@playwright/test";

test("would mutate the backend if an existing server were reused", async ({ request }) => {
  await request.post("/api/workspaces", {
    data: { name: "E2E isolation probe" },
  });
});
