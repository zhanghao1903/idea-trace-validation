import { Navigate, createBrowserRouter } from "react-router-dom";

import { AppLayout } from "./layout.js";
import { ConfirmationPage } from "../pages/confirmation-page.js";
import { OverviewPage } from "../pages/overview-page.js";
import { ProjectDetailPage } from "../pages/project-detail-page.js";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Navigate to="/proposer" replace /> },
      { path: "/proposer", element: <OverviewPage role="proposer" /> },
      { path: "/executor", element: <OverviewPage role="executor" /> },
      {
        path: "/proposer/projects/:projectId",
        element: <ProjectDetailPage role="proposer" />,
      },
      {
        path: "/executor/projects/:projectId",
        element: <ProjectDetailPage role="executor" />,
      },
      { path: "/confirmations/:confirmationId", element: <ConfirmationPage /> },
      {
        path: "*",
        element: (
          <section className="page-wrap state-panel">
            <h1>404</h1>
            <p>这个页面不存在。</p>
            <a href="/proposer">返回总览</a>
          </section>
        ),
      },
    ],
  },
]);
