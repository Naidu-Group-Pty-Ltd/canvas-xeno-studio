/**
 * Asks the studio's AI to write a library formula for a brand (see
 * ./formula-adapt-stream.server) and waits for it.
 */
import { streamedAnswer } from "../stream-client";
import type { BrandFormula } from "./formulas";
import type { FormulaAdaptEvent, FormulaAdaptRequest } from "./formula-adapt-request";
import { ownFormulaOf } from "./own-formulas";

export function writeFormulaForBrand(
  body: FormulaAdaptRequest,
): Promise<{ formula: BrandFormula; model: string | null }> {
  return streamedAnswer("/api/public/brand-formula", body, {
    signInTo: "write a formula for a brand",
    failed: "The formula couldn't be written",
    lost: "The formula didn't come back. Try again.",
    answer: (event: FormulaAdaptEvent) => {
      if (event.type === "error") throw new Error(event.error);
      const formula = ownFormulaOf(event.formula);
      if (!formula) throw new Error("The formula that came back didn't hold together");
      return { formula, model: event.model };
    },
  });
}
