import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildGeneratedReportTypes,
  generatedReportTypePath,
} from "./report-types-support.js";

await mkdir(path.dirname(generatedReportTypePath), { recursive: true });
await writeFile(
  generatedReportTypePath,
  await buildGeneratedReportTypes(),
  "utf8",
);
