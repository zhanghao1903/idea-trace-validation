import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { RoleSwitch } from "../components/role-switch.js";
import { OverviewPage } from "./overview-page.js";

const envelope = (data: unknown) =>
  new Response(
    JSON.stringify({ ok: true, data, meta: { requestId: "req_test" } }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("role overviews", () => {
  it("renders server-owned proposer categories and public empty facts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        envelope({
          items: [
            {
              ideaId: "idea_01ARZ3NDEKTSV4RRFFQ69G5FAV",
              ideaVersion: 2,
              intentSummary: "验证更清晰的客户问题",
              intakeStatus: "IDEA",
              category: "IN_PROGRESS",
              updatedAt: "2026-07-31T10:00:00.000Z",
              project: {
                id: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                version: 7,
                status: "IN_PROGRESS",
                phase: "VALIDATING",
                updatedAt: "2026-07-31T10:00:00.000Z",
              },
              latestProgress: null,
              currentNextStep: null,
              waitingForProposer: [],
              latestConfirmedConclusion: null,
              collectionPaths: {
                project: "/api/project",
                progressUpdates: "/api/progress",
                attentionItems: "/api/attention",
                evidence: "/api/evidence",
                conclusions: "/api/conclusions",
                confirmations: "/api/confirmations",
                history: "/api/history",
              },
            },
          ],
          page: { limit: 12, nextCursor: null },
        }),
      ),
    );
    render(
      <MemoryRouter initialEntries={["/proposer"]}>
        <Routes>
          <Route path="/proposer" element={<OverviewPage role="proposer" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "验证更清晰的客户问题" }),
    ).toBeVisible();
    expect(screen.getAllByText("执行中").length).toBeGreaterThan(0);
    expect(screen.getByText("尚无进展记录")).toBeVisible();
    expect(screen.getByText("尚未设定")).toBeVisible();
    expect(screen.getByText("尚无结论")).toBeVisible();
  });

  it("keeps URL-owned filters, pagination loading and executor priority signals", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
      void _input;
      return envelope({
        items: [
          {
            projectId: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAW",
            ideaId: "idea_01ARZ3NDEKTSV4RRFFQ69G5FAW",
            version: 4,
            status: "PAUSED",
            phase: "BUILDING",
            group: "OPEN",
            goal: "验证执行工作台",
            currentNextStep: "解决数据访问",
            updatedAt: "2026-07-31T10:00:00.000Z",
            latestProgress: null,
            blockers: [
              {
                id: "attn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                type: "BLOCKER",
                title: "数据受阻",
                status: "OPEN",
                waitingForRole: "EXECUTOR",
                detailPath: "/api/attention",
              },
            ],
            pendingConfirmations: 2,
            supportRequests: [],
            latestConclusion: null,
            collectionPaths: {
              project: "/api/project",
              progressUpdates: "/api/progress",
              attentionItems: "/api/attention",
              evidence: "/api/evidence",
              conclusions: "/api/conclusions",
              confirmations: "/api/confirmations",
              history: "/api/history",
            },
          },
        ],
        page: { limit: 12, nextCursor: null },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/executor?group=OPEN"]}>
        <Routes>
          <Route path="/executor" element={<OverviewPage role="executor" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "验证执行工作台" }),
    ).toBeVisible();
    expect(screen.getByText("解决数据访问")).toBeVisible();
    expect(screen.getByText("2", { selector: "strong" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "已完成" }));
    await waitFor(() =>
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
        "group=COMPLETED",
      ),
    );
  });

  it("preserves the project ID when switching role paths", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={["/proposer/projects/proj_01ARZ3NDEKTSV4RRFFQ69G5FAX"]}
      >
        <Routes>
          <Route
            path="/proposer/projects/:projectId"
            element={
              <>
                <RoleSwitch />
                <p>proposer</p>
              </>
            }
          />
          <Route
            path="/executor/projects/:projectId"
            element={
              <>
                <RoleSwitch />
                <p>executor</p>
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("link", { name: "执行者" }));
    expect(screen.getByText("executor")).toBeVisible();
  });
});
