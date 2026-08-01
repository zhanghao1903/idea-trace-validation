import { expect, test } from "@playwright/test";

import { fulfillJson, ids, success } from "./fixtures.js";

test("a scoped HttpOnly capability can decide only its exact confirmation without entering DOM or URL", async ({
  context,
  page,
}) => {
  const capability = "lp02-secret-capability-never-readable";
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  await context.addCookies([
    {
      name: "lp02_confirmation",
      value: capability,
      domain: "127.0.0.1",
      path: `/api/v1/human-confirmations/${ids.confirmation}`,
      httpOnly: true,
      sameSite: "Strict",
      secure: false,
    },
  ]);
  let submitted: Record<string, unknown> | null = null;
  await page.route(
    `**/api/v1/human-confirmations/${ids.confirmation}`,
    (route) =>
      fulfillJson(
        route,
        success({
          confirmation: {
            id: ids.confirmation,
            projectId: ids.project,
            operation: "CONFIRM_CONCLUSION",
            conclusionId: "conc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            terminalTransitionId: null,
            payloadSummary: {
              schemaVersion: 1,
              projectId: ids.project,
              projectVersion: 8,
              projectStatus: "IN_PROGRESS",
              projectPhase: "VALIDATING",
              operation: "CONFIRM_CONCLUSION",
              conclusion: {
                id: "conc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                sequence: 1,
                statusAtRequest: "DRAFT",
                evidenceSummary: "支持继续",
                evidenceIds: [],
                limitations: [],
                uncertainties: [],
                recommendation: "CONTINUE",
                recommendationNote: "继续",
                supplementalNote: null,
              },
              targetConclusionStatus: "CONFIRMED",
            },
            expectedProjectVersion: 8,
            expiresAt: "2026-08-02T08:00:00.000Z",
            decision: "PENDING",
            usability: "ACTIVE",
            decidedBy: null,
            decidedAt: null,
            decisionNote: null,
            resultingProjectVersion: null,
            createdAt: "2026-07-31T08:00:00.000Z",
          },
        }),
      ),
  );
  await page.route(
    `**/api/v1/human-confirmations/${ids.confirmation}/decisions`,
    async (route) => {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await fulfillJson(route, success({}));
    },
  );
  await page.goto(`/confirmations/${ids.confirmation}`);
  await page.getByLabel("你的显示名称").focus();
  await page.keyboard.type("Founder");
  await page.getByLabel("决定说明").focus();
  await page.keyboard.type("同意当前结论");
  await page.getByRole("button", { name: "批准" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => submitted).not.toBeNull();
  expect(submitted).toMatchObject({
    expectedVersion: 8,
    decision: "APPROVE",
    actor: { role: "PROPOSER" },
  });
  expect(submitted).not.toHaveProperty("capability");
  expect(page.url()).not.toContain(capability);
  expect(await page.locator("body").innerText()).not.toContain(capability);
  expect(await page.evaluate(() => document.cookie)).toBe("");
  expect(consoleMessages.join("\n")).not.toContain(capability);
});

test("missing capability is an explicit non-success state with no decision controls", async ({
  page,
}) => {
  await page.route(
    `**/api/v1/human-confirmations/${ids.confirmation}`,
    (route) =>
      fulfillJson(
        route,
        {
          ok: false,
          error: {
            code: "HUMAN_CONTROL_REQUIRED",
            message: "Capability required",
            retryable: false,
          },
          meta: { requestId: "req_fail" },
        },
        401,
      ),
  );
  await page.goto(`/confirmations/${ids.confirmation}`);
  await expect(
    page.getByRole("heading", { name: "无法访问该确认" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "批准" })).toHaveCount(0);
});
