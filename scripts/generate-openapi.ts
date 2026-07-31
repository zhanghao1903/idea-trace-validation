import { writeFile } from "node:fs/promises";

import { format } from "prettier";

import { generateOpenApi } from "./openapi-support.js";

const outputUrl = new URL("../openapi/lp02.v1.json", import.meta.url);
const document = await generateOpenApi();
await writeFile(
  outputUrl,
  await format(JSON.stringify(document), { parser: "json" }),
  "utf8",
);
process.stdout.write("generated openapi/lp02.v1.json\n");
