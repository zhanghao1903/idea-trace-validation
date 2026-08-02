export interface PublishedPort {
  service: string;
  hostIp: string;
  published: number;
  target: number;
}

export const verifyPublishedPorts = (
  ports: readonly PublishedPort[],
  mode: "LOCAL" | "EXTERNAL",
): void => {
  if (
    ports.some(
      (port) =>
        port.service !== "caddy" ||
        ![80, 443, 18080, 18443].includes(port.published),
    )
  )
    throw new Error("NETWORK_EXPOSURE");
  if (mode === "LOCAL" && ports.some((port) => port.hostIp !== "127.0.0.1"))
    throw new Error("NETWORK_LOCAL_BIND");
  if (
    mode === "EXTERNAL" &&
    new Set(ports.map((port) => port.published)).size !== 2
  )
    throw new Error("NETWORK_EXTERNAL_PORTS");
};
