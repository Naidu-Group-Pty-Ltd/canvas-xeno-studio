import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Brain,
  Copy,
  Download,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { AssetRow } from "@/hooks/useStudioData";
import { addAgentMemory, deleteAgentMemory } from "@/lib/supercomputer-agent.functions";
import { Markdown } from "@/components/studio/Markdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { GenerationResult } from "./AgentTranscript";

export interface AgentArtifacts {
  documents: { title: string; markdown: string }[];
  generations: { generationId: string; prompt: string | null }[];
}

/** A document's words without a first heading that only repeats its title (shown above it). */
function withoutTitle(markdown: string, title: string): string {
  const [first, ...rest] = markdown.trimStart().split("\n");
  return first?.replace(/^#\s+/, "").trim() === title.trim() && /^#\s/.test(first)
    ? rest.join("\n").trimStart()
    : markdown;
}

function download(title: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[^\w.-]+/g, "_").slice(0, 80) || "document"}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * What the agent made in a conversation, beside it: the documents it wrote
 * (to read, copy or download) and the pictures and videos it generated.
 */
export function ArtifactsPanel({
  open,
  onOpenChange,
  artifacts,
  focus,
  onOpenAsset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifacts: AgentArtifacts;
  /** The document to show first. */
  focus: string | null;
  onOpenAsset: (asset: AssetRow) => void;
}) {
  // A document picked here, until another is asked for from the conversation.
  const [chosen, setChosen] = useState<{ title: string; over: string | null } | null>(null);
  const shown =
    (chosen && chosen.over === focus ? chosen.title : null) ??
    focus ??
    artifacts.documents.at(-1)?.title ??
    null;
  const document_ =
    [...artifacts.documents].reverse().find((entry) => entry.title === shown) ?? null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Made in this conversation
          </SheetTitle>
        </SheetHeader>
        {artifacts.documents.length > 0 && (
          <section className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {artifacts.documents.map((entry, index) => (
                <button
                  key={`${entry.title}-${index}`}
                  type="button"
                  onClick={() => setChosen({ title: entry.title, over: focus })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                    entry.title === shown
                      ? "border-primary/60 bg-primary/10"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <FileText className="size-3.5" /> {entry.title}
                </button>
              ))}
            </div>
            {document_ && (
              <article className="space-y-3 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate font-display text-base font-semibold">
                    {document_.title}
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => {
                      void navigator.clipboard?.writeText(document_.markdown);
                      toast.success("Copied.");
                    }}
                  >
                    <Copy className="mr-1.5 size-3.5" /> Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => download(document_.title, document_.markdown)}
                  >
                    <Download className="mr-1.5 size-3.5" /> .md
                  </Button>
                </div>
                <Markdown text={withoutTitle(document_.markdown, document_.title)} />
              </article>
            )}
          </section>
        )}
        {artifacts.generations.length > 0 && (
          <section className="space-y-3">
            <h4 className="label-eyebrow">Generated</h4>
            <div className="space-y-4">
              {[...artifacts.generations].reverse().map((entry) => (
                <GenerationResult
                  key={entry.generationId}
                  generationId={entry.generationId}
                  prompt={entry.prompt}
                  onOpenAsset={onOpenAsset}
                />
              ))}
            </div>
          </section>
        )}
        {!artifacts.documents.length && !artifacts.generations.length && (
          <p className="text-sm text-muted-foreground">
            Documents the Supercomputer writes and pictures and videos it makes collect here.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface MemoryRow {
  id: string;
  content: string;
  scope: "personal" | "team";
  created_by: string | null;
  created_at: string;
}

/** What the agent keeps between conversations: read, added to and forgotten by hand. */
export function MemoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [team, setTeam] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["supercomputer_memories"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supercomputer_memories")
        .select("id,content,scope,created_by,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MemoryRow[];
    },
  });

  const add = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await addAgentMemory({ data: { content: text.trim(), scope: team ? "team" : "personal" } });
      setText("");
      await queryClient.invalidateQueries({ queryKey: ["supercomputer_memories"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "It couldn't be kept");
    } finally {
      setSaving(false);
    }
  };
  const forget = async (memory: MemoryRow) => {
    try {
      await deleteAgentMemory({ data: { id: memory.id } });
      await queryClient.invalidateQueries({ queryKey: ["supercomputer_memories"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "It couldn't be forgotten");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="size-5 text-primary" /> Memory
          </DialogTitle>
          <DialogDescription>
            What the Supercomputer keeps between conversations: your preferences, and the team's.
            New conversations start knowing these.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={600}
            placeholder="e.g. Social videos are always 9:16 with captions"
          />
          <Button
            type="button"
            variant={team ? "secondary" : "ghost"}
            size="icon"
            className="shrink-0"
            onClick={() => setTeam((value) => !value)}
            aria-label={team ? "For the team" : "Just for you"}
            title={team ? "For the team" : "Just for you"}
          >
            <Users className="size-4" />
          </Button>
          <Button type="submit" disabled={!text.trim() || saving} className="shrink-0">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </Button>
        </form>
        <ul className="space-y-1.5">
          {isLoading && <li className="text-sm text-muted-foreground">Loading…</li>}
          {!isLoading && !memories.length && (
            <li className="text-sm text-muted-foreground">
              Nothing yet. Tell the Supercomputer “remember that…”, or add it here.
            </li>
          )}
          {memories.map((memory) => (
            <li
              key={memory.id}
              className="group flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                {memory.content}
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {memory.scope === "team" ? "Team" : "Yours"} ·{" "}
                  {formatDistanceToNow(new Date(memory.created_at), { addSuffix: true })}
                </span>
              </span>
              {(memory.created_by === user?.id || isAdmin) && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 opacity-60 group-hover:opacity-100"
                  aria-label="Forget"
                  onClick={() => void forget(memory)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
