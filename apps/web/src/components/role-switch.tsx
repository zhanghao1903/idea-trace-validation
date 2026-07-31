import { NavLink, useLocation } from "react-router-dom";

const destination = (
  pathname: string,
  target: "proposer" | "executor",
): string => {
  const match = pathname.match(
    /^\/(?:proposer|executor)\/projects\/(proj_[^/]+)$/u,
  );
  return match?.[1] === undefined
    ? `/${target}`
    : `/${target}/projects/${match[1]}`;
};

export const RoleSwitch = () => {
  const { pathname } = useLocation();
  return (
    <nav className="role-switch" aria-label="切换信息视图">
      <span className="role-switch__label">查看方式</span>
      <NavLink to={destination(pathname, "proposer")}>提议者</NavLink>
      <NavLink to={destination(pathname, "executor")}>执行者</NavLink>
    </nav>
  );
};
