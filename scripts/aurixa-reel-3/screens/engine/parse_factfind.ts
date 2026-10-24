// The product's own parser (src/lib/client-fact-find/excelImport.ts, what "Parse Excel Sheet" runs) on Jordan's
// workbook, and the records "Create Client" then writes through manage-client-data
// (src/lib/client-fact-find/viewClientMapping.ts, mapAdvancedToViewClient).
//   bun parse_factfind.ts <workbook.xlsx> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { parseAdvancedClientWorkbook } from "@/lib/client-fact-find/excelImport";
import { mapAdvancedToViewClient } from "@/lib/client-fact-find/viewClientMapping";
import { advancedClientCreationSchema } from "@/lib/client-fact-find/schema";

const [file, out] = process.argv.slice(2);
const bytes = readFileSync(file);
const parsed = await parseAdvancedClientWorkbook(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
);
if (parsed.fatalErrors.length) throw new Error(parsed.fatalErrors.join(" "));
const valid = advancedClientCreationSchema.safeParse(parsed.payload);
const mapped = mapAdvancedToViewClient(parsed.payload);
writeFileSync(
  out,
  JSON.stringify(
    {
      summary: parsed.summary,
      warnings: parsed.warnings,
      valid: valid.success,
      issues: valid.success
        ? []
        : valid.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      payload: parsed.payload,
      mapped,
    },
    null,
    1,
  ),
);
console.log(
  JSON.stringify(
    {
      summary: parsed.summary,
      warnings: parsed.warnings,
      valid: valid.success,
      totals: parsed.payload.calculatedTotals,
    },
    null,
    1,
  ),
);
