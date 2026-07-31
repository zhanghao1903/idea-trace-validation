import { writeFile } from "node:fs/promises";

import { generateOpenApi } from "./openapi-support.js";

const outputUrl = new URL("../openapi/lp01.v1.json", import.meta.url);
const document = await generateOpenApi();
await writeFile(outputUrl, `${JSON.stringify(document, null, 2)}\n`, "utf8");
process.stdout.write("generated openapi/lp01.v1.json\n");
