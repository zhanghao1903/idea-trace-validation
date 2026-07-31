import { Outlet } from "react-router-dom";

import { RoleSwitch } from "../components/role-switch.js";

export const AppLayout = () => (
  <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/proposer" aria-label="IdeaTrace 首页">
        <span className="brand__mark" aria-hidden="true">
          IT
        </span>
        <span>
          <strong>IdeaTrace</strong>
          <small>决策证据工作台</small>
        </span>
      </a>
      <RoleSwitch />
      <p className="public-note">公开只读视图 · 角色仅改变信息组织</p>
    </header>
    <main id="main-content">
      <Outlet />
    </main>
    <footer className="site-footer">权威事实与 AI 叙述分区展示 · v0.1</footer>
  </div>
);
