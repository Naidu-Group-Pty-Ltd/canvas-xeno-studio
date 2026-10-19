/**
 * A DNA suggestion, streamed (POST /api/public/brand-dna): keep-alives while
 * the studio's AI reads the brand, then the DNA it read (see
 * ../event-stream.server). Reading a brand's site can take longer than the
 * gateway in front of the studio waits for a quiet request.
 */
import { z } from "zod";
import { AppError } from "../higgsfield/errors";
import { eventStreamResponse, refusedRequest } from "../event-stream.server";
import { signedInUser } from "../request-user.server";
import { dnaSuggestRequest, type DnaSuggestEvent } from "./dna-request";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "The brand's DNA couldn't be read";

export async function handleBrandDnaRequest(request: Request): Promise<Response> {
  let userId: string;
  let input: z.infer<typeof dnaSuggestRequest>;
  try {
    userId = await signedInUser(request, "read a brand's DNA");
    input = dnaSuggestRequest.parse(await request.json());
  } catch (error) {
    return refusedRequest(
      error instanceof z.ZodError ? "That request couldn't be read" : message(error),
      error instanceof AppError && error.code === "NOT_AUTHORIZED",
    );
  }

  return eventStreamResponse<DnaSuggestEvent>(async (send) => {
    try {
      const { activeMember } = await import("./kits.server");
      await activeMember(userId);
      const { suggestBrandDna } = await import("./dna-suggest.server");
      const read = await suggestBrandDna(input);
      send({
        type: "dna",
        dna: read.dna as unknown as Record<string, unknown>,
        model: read.model,
        read: read.read,
      });
    } catch (error) {
      send({ type: "error", error: message(error) });
    }
  });
}
