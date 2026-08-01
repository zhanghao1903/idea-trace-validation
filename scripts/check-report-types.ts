import { readFile } from "node:fs/promises";

import {
  buildGeneratedReportTypes,
  generatedReportTypePath,
} from "./report-types-support.js";

const expected = await buildGeneratedReportTypes();
const actual = await readFile(generatedReportTypePath, "utf8").catch(
  () => null,
);

if (actual !== expected) {
  throw new Error(
    "Generated structured report types are stale. Run npm run report-types:generate.",
  );
}
