/**
 * A formula written for a brand, streamed (POST /api/public/brand-formula):
 * keep-alives while the studio's AI writes it, then the formula (see
 * ./formula-adapt.server and ../event-stream.server).
 */
import { z } from "zod";
import { AppError } from "../higgsfield/errors";
import { eventStreamResponse, refusedRequest } from "../event-stream.server";
import { signedInUser } from "../request-user.server";
import { formulaAdaptRequest, type FormulaAdaptEvent } from "./formula-adapt-request";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "The formula couldn't be written";

export async function handleBrandFormulaRequest(request: Request): Promise<Response> {
  let userId: string;
  let input: z.infer<typeof formulaAdaptRequest>;
  try {
    userId = await signedInUser(request, "write a formula for a brand");
    input = formulaAdaptRequest.parse(await request.json());
  } catch (error) {
    return refusedRequest(
      error instanceof z.ZodError ? "That request couldn't be read" : message(error),
      error instanceof AppError && error.code === "NOT_AUTHORIZED",
    );
  }

  return eventStreamResponse<FormulaAdaptEvent>(async (send) => {
    try {
      const { activeMember } = await import("./kits.server");
      await activeMember(userId);
      const { adaptFormulaForBrand } = await import("./formula-adapt.server");
      const written = await adaptFormulaForBrand(input);
      send({
        type: "formula",
        formula: written.formula as unknown as Record<string, unknown>,
        model: written.model,
      });
    } catch (error) {
      send({ type: "error", error: message(error) });
    }
  });
}
