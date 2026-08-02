const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 2500);
try {
  const response = await fetch("http://127.0.0.1:3000/health/ready", {
    headers: { accept: "application/json" },
    signal: controller.signal,
  });
  if (!response.ok) process.exitCode = 1;
  else {
    const body = await response.json();
    if (body.status !== "READY") process.exitCode = 1;
  }
} catch {
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
