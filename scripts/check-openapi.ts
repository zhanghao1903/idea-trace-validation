import { readFile } from "node:fs/promises";

import { generateOpenApi } from "./openapi-support.js";

const outputUrl = new URL("../openapi/lp01.v1.json", import.meta.url);
const expected = `${JSON.stringify(await generateOpenApi(), null, 2)}\n`;
const current = await readFile(outputUrl, "utf8").catch(() => "");

if (current !== expected) {
  process.stderr.write(
    "openapi/lp01.v1.json is missing or stale; run npm run openapi:generate\n",
  );
  process.exitCode = 1;
} else {
  process.stdout.write("openapi/lp01.v1.json is current\n");
}
