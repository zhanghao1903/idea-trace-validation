import { spawn } from "node:child_process";

const mode = process.argv[2];
if (mode !== "up" && mode !== "down") {
  throw new Error("Usage: tsx scripts/test-db.ts <up|down>");
}

const run = async (
  command: string,
  args: readonly string[],
  capture = false,
): Promise<string> => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  let output = "";
  if (capture && child.stdout !== null) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
  }
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (value, signal) => {
      if (signal !== null) {
        reject(new Error(`${command} terminated by ${signal}`));
        return;
      }
      resolve(value ?? 1);
    });
  });
  if (code !== 0) throw new Error(`${command} exited with ${code}`);
  return output;
};

if (mode === "up") {
  await run("docker", ["compose", "up", "-d", "--wait", "postgres"]);
  const exists = await run(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "idea_validation",
      "-d",
      "idea_validation",
      "-tAc",
      "SELECT 1 FROM pg_database WHERE datname = 'idea_validation_test'",
    ],
    true,
  );
  if (exists.trim() !== "1") {
    await run("docker", [
      "compose",
      "exec",
      "-T",
      "postgres",
      "createdb",
      "-U",
      "idea_validation",
      "idea_validation_test",
    ]);
  }
  process.stdout.write("isolated database idea_validation_test is ready\n");
} else {
  // The exact compose project and its named volume are the only deletion
  // targets. No path, glob or environment-derived target is accepted.
  await run("docker", ["compose", "down", "--volumes"]);
}
