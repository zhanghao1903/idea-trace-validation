import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const repoRoot = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const state = JSON.parse(
  await readFile(path.join(repoRoot, ".lp04-demo/browser-state.json"), "utf8"),
) as {
  resourceRefs: {
    activeProjectId: string;
    governedProjectId: string;
  };
};

test("real proposer and executor views reconcile IDs, reports and human context", async ({
  page,
}) => {
  await page.goto("/proposer");
  await expect(
    page.getByRole("heading", {
      name: "SYNTHETIC_DEMO_DATA：验证小团队异步决策闭环",
    }),
  ).toBeVisible();
  await page
    .getByRole("heading", {
      name: "SYNTHETIC_DEMO_DATA：验证小团队异步决策闭环",
    })
    .locator("xpath=ancestor::article")
    .getByRole("link", { name: /查看项目详情/u })
    .click();
  await expect(page).toHaveURL(
    `/proposer/projects/${state.resourceRefs.activeProjectId}`,
  );
  await expect(
    page.getByText(state.resourceRefs.activeProjectId).first(),
  ).toBeVisible();
  await expect(
    page.getByText("SYNTHETIC_DEMO_DATA 证据优先验证报告"),
  ).toBeVisible();
  await expect(page.getByText("1 项")).toBeVisible();
  await expect(
    page.getByText(/human-control|HUMAN_CONTROL_TOKEN|Bearer/u),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /确认|批准|完成/u }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: "执行者" }).click();
  await expect(page).toHaveURL(
    `/executor/projects/${state.resourceRefs.activeProjectId}`,
  );
  await expect(
    page.getByText(state.resourceRefs.activeProjectId).first(),
  ).toBeVisible();
  await expect(
    page.getByText("SYNTHETIC_DEMO_DATA 证据优先验证报告"),
  ).toBeVisible();

  await page.goto(`/proposer/projects/${state.resourceRefs.governedProjectId}`);
  await expect(
    page.getByText("SYNTHETIC_DEMO_DATA 时间线优先完成报告"),
  ).toBeVisible();
  await expect(page.locator(".report-block--timeline")).toContainText(
    "开始合成验证",
  );
  await expect(page.locator(".report-block--metrics")).toContainText(
    "合成访谈",
  );
  await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible();
});
