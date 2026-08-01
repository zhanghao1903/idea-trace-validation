import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ConfirmationPage } from "./confirmation-page.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const route = "/confirmations/confirm_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route
          path="/confirmations/:confirmationId"
          element={<ConfirmationPage />}
        />
      </Routes>
    </MemoryRouter>,
  );

describe("scoped confirmation page", () => {
  it("does not expose write controls when the scoped capability is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: "HUMAN_CONTROL_REQUIRED",
                message: "Capability required",
                retryable: false,
              },
              meta: { requestId: "req_test" },
            }),
            { status: 401, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "无法访问该确认" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "批准" })).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("submits only the frozen decision fields and relies on same-origin cookie transport", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST")
          return new Response(
            JSON.stringify({
              ok: true,
              data: {},
              meta: { requestId: "req_write", idempotentReplay: false },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              confirmation: {
                id: "confirm_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                projectId: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                operation: "CONFIRM_CONCLUSION",
                conclusionId: "conc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                terminalTransitionId: null,
                payloadSummary: {
                  schemaVersion: 1,
                  projectId: "proj_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                  projectVersion: 4,
                  projectStatus: "IN_PROGRESS",
                  projectPhase: "VALIDATING",
                  operation: "CONFIRM_CONCLUSION",
                  conclusion: {
                    id: "conc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                    sequence: 1,
                    statusAtRequest: "DRAFT",
                    evidenceSummary: "Evidence",
                    evidenceIds: [],
                    limitations: [],
                    uncertainties: [],
                    recommendation: "CONTINUE",
                    recommendationNote: "Continue",
                    supplementalNote: null,
                  },
                  targetConclusionStatus: "CONFIRMED",
                },
                expectedProjectVersion: 4,
                expiresAt: "2026-08-01T10:00:00.000Z",
                decision: "PENDING",
                usability: "ACTIVE",
                decidedBy: null,
                decidedAt: null,
                decisionNote: null,
                resultingProjectVersion: null,
                createdAt: "2026-07-31T10:00:00.000Z",
              },
            },
            meta: { requestId: "req_read" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText("你的显示名称"), "Founder");
    await user.type(screen.getByLabelText("决定说明"), "我确认该证据结论");
    await user.click(screen.getByRole("button", { name: "批准" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const post = fetchMock.mock.calls.find(
      (call) => call[1]?.method === "POST",
    );
    expect(post?.[1]?.credentials).toBe("same-origin");
    expect(String(post?.[0])).not.toContain("token");
    const body = JSON.parse(String(post?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      expectedVersion: 4,
      decision: "APPROVE",
      decisionNote: "我确认该证据结论",
      actor: { actorType: "HUMAN", role: "PROPOSER", displayName: "Founder" },
    });
    expect(body).not.toHaveProperty("capability");
  });
});
