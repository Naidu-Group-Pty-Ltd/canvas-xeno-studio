import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ingestGenerationOutputs } from "@/lib/generation.functions";
import { cn } from "@/lib/utils";

/** Copying a completed generation's output into the library: in progress, or failed with a retry. */
export function SaveStatus({
  generation,
  className,
}: {
  generation: { id: string; status: string; ingest_status: string };
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  if (generation.status !== "completed") return null;

  if (generation.ingest_status === "pending" || generation.ingest_status === "processing")
    return (
      <span className={cn("inline-flex items-center gap-1 text-muted-foreground", className)}>
        <Loader2 className="size-3 animate-spin" /> Saving to library…
      </span>
    );
  if (generation.ingest_status !== "failed") return null;

  async function retry() {
    setRetrying(true);
    try {
      const result = await ingestGenerationOutputs({ data: { generationId: generation.id } });
      if (result.ingestStatus === "completed") toast.success("Saved to the library");
      else if (result.ingestStatus === "failed")
        toast.error("The output still could not be saved. Try again in a few minutes.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retry the save");
    } finally {
      setRetrying(false);
      await queryClient.invalidateQueries({ queryKey: ["generations"] });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-primary", className)}>
      Couldn't save to the library
      <button
        type="button"
        onClick={() => void retry()}
        disabled={retrying}
        className="inline-flex items-center gap-1 underline underline-offset-2 disabled:opacity-50"
      >
        {retrying ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
        Retry
      </button>
    </span>
  );
}
