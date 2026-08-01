import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { router } from "./app/router.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("WEB_ROOT_MISSING");
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
