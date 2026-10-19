/**
 * A DNA suggestion, streamed (POST /api/public/brand-dna): keep-alives every
 * ten seconds while the studio's AI reads the brand, then the DNA it read.
 * The gateway in front of the studio gives up on a request that has sent
 * nothing for thirty seconds, and reading a brand's site can take longer.
 */
import { z } from "zod";
import { AppError } from "../higgsfield/errors";
import { encodeStreamEvent, KEEP_ALIVE } from "../event-stream";
import { signedInUser } from "../request-user.server";
import { dnaSuggestRequest, type DnaSuggestEvent } from "./dna-request";

const KEEP_ALIVE_MS = 10_000;

const message = (error: unknown) =>
  error instanceof Error ? error.message : "The brand's DNA couldn't be read";

export async function handleBrandDnaRequest(request: Request): Promise<Response> {
  let userId: string;
  let input: z.infer<typeof dnaSuggestRequest>;
  try {
    userId = await signedInUser(request, "read a brand's DNA");
    input = dnaSuggestRequest.parse(await request.json());
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof z.ZodError ? "That request couldn't be read" : message(error),
      }),
      {
        status: error instanceof AppError && error.code === "NOT_AUTHORIZED" ? 401 : 400,
        headers: { "content-type": "application/json" },
      },
    );
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          open = false;
        }
      };
      const send = (event: DnaSuggestEvent) => write(encodeStreamEvent(event));
      const beat = setInterval(() => write(KEEP_ALIVE), KEEP_ALIVE_MS);
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
      } finally {
        clearInterval(beat);
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed by the page.
        }
      }
    },
    cancel() {},
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
