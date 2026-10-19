/**
 * Asks the Director for a plan, or a revision of one, and waits for it (see
 * ./director-stream.server).
 */
import { streamedAnswer } from "./stream-client";
import type { DirectorEvent, DirectorPlanResult, DirectorRequest } from "./director-request";

export function askDirector(body: DirectorRequest): Promise<DirectorPlanResult> {
  const planning = body.action === "plan";
  return streamedAnswer("/api/public/director-plan", body, {
    signInTo: "plan with the Director",
    failed: planning ? "Director could not build a plan" : "Revision failed",
    lost: planning
      ? "The plan didn't come back. It may still appear under Recent plans in a moment."
      : "The revision didn't come back. It may still appear in a moment.",
    answer: (event: DirectorEvent) => {
      if (event.type === "plan") {
        const { type: _type, ...result } = event;
        return result;
      }
      throw new Error(event.error);
    },
  });
}
