import { expect, test } from "@playwright/test";

import {
  fulfillJson,
  ids,
  installProjectRoutes,
  paths,
  reportCurrent,
  success,
} from "./fixtures.js";

test("proposer and executor URLs keep one authority object through filter, pagination and history", async ({
  page,
}) => {
  await page.route("**/api/v1/experience/proposer/ideas**", async (route) => {
    const url = new URL(route.request().url());
    const completed = url.searchParams.get("category") === "COMPLETED";
    const secondPage = url.searchParams.get("cursor") !== null;
    const item = {
      ideaId: ids.idea,
      ideaVersion: 3,
      intentSummary: completed
        ? "已完成的定价验证"
        : secondPage
          ? "第二页的市场想法"
          : "验证两周内的创始人决策闭环",
      intakeStatus: "IDEA",
      category: completed ? "COMPLETED" : secondPage ? "IDEA" : "IN_PROGRESS",
      updatedAt: "2026-07-31T08:00:00.000Z",
      project: secondPage
        ? null
        : {
            id: ids.project,
            version: 8,
            status: completed ? "COMPLETED" : "IN_PROGRESS",
            phase: "VALIDATING",
            updatedAt: "2026-07-31T08:00:00.000Z",
          },
      latestProgress: null,
      currentNextStep: secondPage ? null : "完成五次付费意愿访谈",
      waitingForProposer: [],
      latestConfirmedConclusion: null,
      collectionPaths: secondPage ? null : paths,
    };
    await fulfillJson(
      route,
      success({
        items: [item],
        page: {
          limit: 12,
          nextCursor: secondPage || completed ? null : "cursor-page-2",
        },
      }),
    );
  });
  await page.route("**/api/v1/experience/executor/projects**", (route) =>
    fulfillJson(
      route,
      success({
        items: [
          {
            projectId: ids.project,
            ideaId: ids.idea,
            version: 8,
            status: "IN_PROGRESS",
            phase: "VALIDATING",
            group: "OPEN",
            goal: "验证两周内的创始人决策闭环",
            currentNextStep: "完成五次付费意愿访谈",
            updatedAt: "2026-07-31T08:00:00.000Z",
            latestProgress: null,
            blockers: [],
            pendingConfirmations: 1,
            supportRequests: [],
            latestConclusion: null,
            collectionPaths: paths,
          },
        ],
        page: { limit: 12, nextCursor: null },
      }),
    ),
  );
  await installProjectRoutes(page);

  await page.goto("/proposer");
  await expect(
    page.getByRole("heading", { name: "验证两周内的创始人决策闭环" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page).toHaveURL(/cursor=cursor-page-2/u);
  await expect(
    page.getByRole("heading", { name: "第二页的市场想法" }),
  ).toBeVisible();
  await page.goBack();
  await page.getByRole("button", { name: "已完成" }).click();
  await expect(page).toHaveURL(/category=COMPLETED/u);
  await expect(
    page.getByRole("heading", { name: "已完成的定价验证" }),
  ).toBeVisible();
  await page.goto(`/proposer/projects/${ids.project}`);
  await expect(page.getByText("权威版本 v8")).toBeVisible();
  await page.getByRole("link", { name: "执行者" }).click();
  await expect(page).toHaveURL(`/executor/projects/${ids.project}`);
  await page.reload();
  await expect(page.getByText("权威版本 v8")).toBeVisible();
});

test("seven fixed report blocks render safely and runtime exceptions use only the supplied fallback", async ({
  page,
}) => {
  await installProjectRoutes(page);
  await page.goto(`/proposer/projects/${ids.project}`);
  await expect(page.getByText("访谈证据已安全编译为文本。")).toBeVisible();
  await expect(page.locator(".report-region script")).toHaveCount(0);
  await expect(page.locator(".report-block--metrics")).toContainText("访谈");
  await expect(page.locator(".report-block--metrics")).toContainText("5");
  await expect(
    page.getByRole("table", { name: "结构化报告表格" }),
  ).toBeVisible();
  await expect(page.locator(".report-block--timeline")).toContainText(
    "首轮访谈",
  );
  await expect(page.getByText("访谈记录")).toBeVisible();
  await expect(page.getByText("是否扩大样本").last()).toBeVisible();

  const broken = structuredClone(reportCurrent);
  if (broken.primary === null) throw new Error("PRIMARY_FIXTURE_MISSING");
  broken.primary.renderModel.sections[0]!.blocks[0] = {
    id: "bad",
    type: "unsupported",
  } as never;
  await page.unroute("**/api/v1/projects/*/reports/current");
  await page.route("**/api/v1/projects/*/reports/current", (route) =>
    fulfillJson(route, success(broken)),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "REPORT_RENDER_RUNTIME_FAILED",
  );
  await expect(
    page.getByRole("heading", { name: "历史安全报告" }),
  ).toBeVisible();
  await expect(page.getByText("权威版本 v8")).toBeVisible();

  const serverFallback = structuredClone(reportCurrent);
  serverFallback.displayMode = "FALLBACK";
  serverFallback.compatibilityCode = "REPORT_COMPILER_UNSUPPORTED";
  if (serverFallback.primary === null)
    throw new Error("SERVER_FALLBACK_FIXTURE_MISSING");
  serverFallback.primary.renderModel.sections[0]!.blocks[0] = {
    id: "bad",
    type: "unsupported",
  } as never;
  await page.unroute("**/api/v1/projects/*/reports/current");
  await page.route("**/api/v1/projects/*/reports/current", (route) =>
    fulfillJson(route, success(serverFallback)),
  );
  await page.reload();
  await expect(page.getByText(/REPORT_COMPILER_UNSUPPORTED/u)).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "独立补全的回退 revision 1",
  );

  broken.runtimeFallback = null;
  await page.unroute("**/api/v1/projects/*/reports/current");
  await page.route("**/api/v1/projects/*/reports/current", (route) =>
    fulfillJson(route, success(broken)),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "没有可安全显示的历史汇报",
  );
  await expect(page.getByText("权威版本 v8")).toBeVisible();
});

test("keyboard and narrow viewport keep core role controls and content reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/experience/proposer/ideas**", (route) =>
    fulfillJson(
      route,
      success({ items: [], page: { limit: 12, nextCursor: null } }),
    ),
  );
  await page.route("**/api/v1/experience/executor/projects**", (route) =>
    fulfillJson(
      route,
      success({ items: [], page: { limit: 12, nextCursor: null } }),
    ),
  );
  await page.goto("/proposer");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/executor");
  await expect(
    page.getByRole("heading", { name: "今日执行态势" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("API failure is distinct from empty and retry safely recovers", async ({
  page,
}) => {
  let failuresRemaining = 2;
  await page.route("**/api/v1/experience/proposer/ideas**", async (route) => {
    if (failuresRemaining > 0) {
      failuresRemaining -= 1;
      await fulfillJson(
        route,
        {
          ok: false,
          error: {
            code: "SERVICE_NOT_READY",
            message: "Not ready",
            retryable: true,
          },
          meta: { requestId: "req_fail" },
        },
        503,
      );
      return;
    }
    await fulfillJson(
      route,
      success({ items: [], page: { limit: 12, nextCursor: null } }),
    );
  });
  await page.goto("/proposer");
  await expect(page.getByRole("alert")).toContainText(
    "服务暂时不可用或尚未就绪",
  );
  await page.getByRole("button", { name: "重试" }).click();
  await expect(
    page.getByRole("heading", { name: "这个筛选下还没有内容" }),
  ).toBeVisible();
});

test("detail 404 and pagination failure remain distinct from empty content", async ({
  page,
}) => {
  await page.route("**/api/v1/projects/*/reports/current", (route) =>
    fulfillJson(
      route,
      success({
        projectId: ids.project,
        reportId: null,
        displayMode: "EMPTY",
        accepted: null,
        primary: null,
        runtimeFallback: null,
        compatibilityCode: null,
      }),
    ),
  );
  await page.route("**/api/v1/experience/projects/**", (route) =>
    fulfillJson(
      route,
      {
        ok: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: "PROJECT was not found.",
          retryable: false,
        },
        meta: { requestId: "req_missing" },
      },
      404,
    ),
  );
  await page.goto(`/executor/projects/${ids.project}`);
  await expect(
    page.getByRole("heading", { name: "项目无法打开" }),
  ).toBeVisible();

  await page.unroute("**/api/v1/experience/projects/**");
  await page.route("**/api/v1/experience/proposer/ideas**", async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    if (cursor !== null) {
      await fulfillJson(
        route,
        {
          ok: false,
          error: {
            code: "SERVICE_NOT_READY",
            message: "Not ready",
            retryable: true,
          },
          meta: { requestId: "req_page_fail" },
        },
        503,
      );
      return;
    }
    await fulfillJson(
      route,
      success({
        items: [
          {
            ideaId: ids.idea,
            ideaVersion: 2,
            intentSummary: "分页前的权威想法",
            intakeStatus: "IDEA",
            category: "IDEA",
            updatedAt: "2026-07-31T08:00:00.000Z",
            project: null,
            latestProgress: null,
            currentNextStep: null,
            waitingForProposer: [],
            latestConfirmedConclusion: null,
            collectionPaths: null,
          },
        ],
        page: { limit: 12, nextCursor: "cursor-fails" },
      }),
    );
  });
  await page.goto("/proposer");
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText(/上次成功读取的数据/u)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "分页前的权威想法" }),
  ).toBeVisible();
});
