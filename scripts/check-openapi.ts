import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { format } from "prettier";

import { generateOpenApi } from "./openapi-support.js";

const lp01Url = new URL("../openapi/lp01.v1.json", import.meta.url);
const lp02Url = new URL("../openapi/lp02.v1.json", import.meta.url);
const lp01Sha256 =
  "528ff0f42a576791a9e370ac80d8b865b1ed0bca456a7d964c2d4743cd566a05";

const lp01 = await readFile(lp01Url);
const currentLp01Sha256 = createHash("sha256").update(lp01).digest("hex");
if (currentLp01Sha256 !== lp01Sha256) {
  process.stderr.write(
    `openapi/lp01.v1.json changed: expected ${lp01Sha256}, received ${currentLp01Sha256}\n`,
  );
  process.exitCode = 1;
}

const expected = await format(JSON.stringify(await generateOpenApi()), {
  parser: "json",
});
const current = await readFile(lp02Url, "utf8").catch(() => "");

if (current !== expected) {
  process.stderr.write(
    "openapi/lp02.v1.json is missing or stale; run npm run openapi:generate\n",
  );
  process.exitCode = 1;
} else {
  if (currentLp01Sha256 === lp01Sha256) {
    process.stdout.write("openapi/lp01.v1.json immutable digest is current\n");
  }
  process.stdout.write("openapi/lp02.v1.json is current\n");
}
