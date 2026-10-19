/**
 * A brand import's long part, streamed (POST /api/public/brand-import): the
 * import's id at once, a keep-alive every ten seconds, then how it ended.
 * The gateway in front of the studio gives up on a request that has sent
 * nothing for thirty seconds, and reading a brand takes about a minute; the
 * page follows the import's row for its stages, so a dropped stream loses
 * nothing, and the work carries on if the page goes.
 */
import { z } from "zod";
import { AppError } from "../higgsfield/errors";
import { encodeStreamEvent, KEEP_ALIVE } from "../event-stream";
import { signedInUser } from "../request-user.server";
import { brandImportRequest, type BrandImportEvent } from "./import-request";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "The import couldn't finish";

const KEEP_ALIVE_MS = 10_000;

export async function handleBrandImportRequest(request: Request): Promise<Response> {
  let userId: string;
  let input: z.infer<typeof brandImportRequest>;
  try {
    userId = await signedInUser(request, "import a brand");
    input = brandImportRequest.parse(await request.json());
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
      const send = (event: BrandImportEvent) => write(encodeStreamEvent(event));
      const beat = setInterval(() => write(KEEP_ALIVE), KEEP_ALIVE_MS);
      try {
        const { activeMember } = await import("./kits.server");
        const imports = await import("./imports.server");
        const { role } = await activeMember(userId);
        if (input.action === "website") {
          const url = imports.siteUrlOf(input.url);
          if (!url) throw new AppError("INVALID_PARAMETERS", "That isn't a website address");
          const importId = await imports.createImport({
            userId,
            kind: "url",
            sourceUrl: url,
            sourceTitle: null,
          });
          send({ type: "import", importId });
          try {
            await imports.scanWebsite(importId, url);
            send({ type: "done", importId, ok: true, error: null });
          } catch (error) {
            // The import records why; the review shows it.
            send({ type: "done", importId, ok: false, error: message(error) });
          }
        } else {
          const row = await imports.loadImport(input.importId);
          if (!row) throw new AppError("INVALID_PARAMETERS", "That import no longer exists");
          if (row.created_by !== userId && role !== "admin")
            throw new AppError(
              "NOT_AUTHORIZED",
              "Only whoever started this import, or an admin, can change it",
            );
          if (row.kind !== "document" || row.status !== "scanning")
            throw new AppError("INVALID_PARAMETERS", "That import isn't waiting for a document");
          send({ type: "import", importId: input.importId });
          try {
            await imports.readDocument(input.importId, {
              title: row.source_title ?? "Brand guidelines",
              text: input.text,
              pageCount: input.pageCount,
              pictures: input.pictures,
            });
            send({ type: "done", importId: input.importId, ok: true, error: null });
          } catch (error) {
            send({ type: "done", importId: input.importId, ok: false, error: message(error) });
          }
        }
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
    // A page that goes doesn't stop the import: its row keeps the result.
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
