/**
 * Asks the studio's AI to suggest a brand's DNA from the page (see
 * ./dna-stream.server) and waits for it.
 */
import { streamedAnswer } from "../stream-client";
import { dnaOf, type BrandDna } from "./dna";
import type { DnaSuggestEvent, DnaSuggestRequest } from "./dna-request";

export function suggestDna(
  body: DnaSuggestRequest,
): Promise<{ dna: BrandDna; model: string | null; read: string[] }> {
  return streamedAnswer("/api/public/brand-dna", body, {
    signInTo: "read a brand's DNA",
    failed: "The brand couldn't be read",
    lost: "The brand's DNA didn't come back. Try again.",
    answer: (event: DnaSuggestEvent) => {
      if (event.type === "dna")
        return { dna: dnaOf(event.dna), model: event.model, read: event.read };
      throw new Error(event.error);
    },
  });
}
