/**
 * The Director, streamed (POST /api/public/director-plan): keep-alives while
 * the studio's AI plans or revises, then the plan (see ./director.server).
 * A plan can take longer than the gateway in front of the studio waits for a
 * quiet request.
 */
import { z } from "zod";
import { AppError } from "./higgsfield/errors";
import { eventStreamResponse, refusedRequest } from "./event-stream.server";
import { signedInUser } from "./request-user.server";
import { directorRequest, type DirectorEvent } from "./director-request";

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export async function handleDirectorRequest(request: Request): Promise<Response> {
  let userId: string;
  let input: z.infer<typeof directorRequest>;
  try {
    userId = await signedInUser(request, "plan with the Director");
    input = directorRequest.parse(await request.json());
  } catch (error) {
    return refusedRequest(
      error instanceof z.ZodError ? "That request couldn't be read" : message(error, "Refused"),
      error instanceof AppError && error.code === "NOT_AUTHORIZED",
    );
  }

  return eventStreamResponse<DirectorEvent>(async (send) => {
    try {
      const director = await import("./director.server");
      const result =
        input.action === "plan"
          ? await director.buildDirectorPlan(userId, input)
          : await director.reviseDirectorPlanFor(userId, input);
      send({ type: "plan", ...result });
    } catch (error) {
      send({
        type: "error",
        error: message(
          error,
          input.action === "plan" ? "Director could not build a plan" : "Revision failed",
        ),
      });
    }
  });
}
