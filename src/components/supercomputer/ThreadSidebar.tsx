import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  FileText,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBriefs, useThreads } from "@/hooks/useSupercomputerData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props {
  activeThreadId: string | null;
  activeBriefId: string | null;
  enabled: boolean;
  onSelectThread: (id: string | null) => void;
  onOpenBrief: (id: string) => void;
  onImportBrief: () => void;
  /** Conversations can be pinned (migration 0022). */
  pinsEnabled?: boolean;
  /** The conversation an answer is being written in, from this page. */
  streamingThreadId?: string | null;
}

const BRIEF_DOT: Record<string, string> = {
  draft: "bg-muted-foreground",
  analysing: "bg-info animate-pulse",
  ready: "bg-success",
  failed: "bg-primary",
};

export function ThreadSidebar({
  activeThreadId,
  activeBriefId,
  enabled,
  onSelectThread,
  onOpenBrief,
  onImportBrief,
  pinsEnabled = false,
  streamingThreadId = null,
}: Props) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [term, setTerm] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const { data: threads = [], isLoading } = useThreads(scope, enabled, pinsEnabled);
  const { data: briefs = [] } = useBriefs(enabled);

  const filtered = threads.filter((thread) =>
    thread.title.toLowerCase().includes(term.trim().toLowerCase()),
  );

  async function rename(id: string) {
    const title = draftTitle.trim().slice(0, 200);
    setRenaming(null);
    if (!title) return;
    const { error } = await supabase.from("supercomputer_threads").update({ title }).eq("id", id);
    if (error) toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["supercomputer_threads"] });
  }

  async function pin(id: string, pinned: boolean) {
    const { error } = await supabase.from("supercomputer_threads").update({ pinned }).eq("id", id);
    if (error) toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["supercomputer_threads"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("supercomputer_threads").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (id === activeThreadId) onSelectThread(null);
    await queryClient.invalidateQueries({ queryKey: ["supercomputer_threads"] });
    toast.success("Conversation deleted. Generated assets stay in the library.");
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <Button variant="outline" className="justify-start" onClick={() => onSelectThread(null)}>
        <Plus className="mr-2 size-4" /> New chat
      </Button>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search chats"
          className="h-8 pl-8 text-xs"
        />
      </div>

      <div
        className="grid grid-cols-2 gap-1 rounded-md border border-border p-0.5 text-[11px]"
        role="tablist"
      >
        {(["mine", "team"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={scope === value}
            onClick={() => setScope(value)}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              scope === value
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "mine" ? "My chats" : "Team"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto scroll-slim">
        {isLoading && enabled && <Skeleton className="h-24 w-full" />}
        {!isLoading && !filtered.length && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {term ? "No chats match." : "No conversations yet."}
          </p>
        )}
        {filtered.map((thread) => {
          const canEdit = thread.created_by === user?.id || isAdmin;
          return (
            <div
              key={thread.id}
              className={cn(
                "group flex items-center gap-1 rounded-md pr-1 transition-colors",
                thread.id === activeThreadId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
              )}
            >
              {renaming === thread.id ? (
                <Input
                  autoFocus
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={() => void rename(thread.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void rename(thread.id);
                    if (event.key === "Escape") setRenaming(null);
                  }}
                  className="h-7 text-xs"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectThread(thread.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left"
                >
                  {thread.id === streamingThreadId ? (
                    <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
                  ) : thread.pinned ? (
                    <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  ) : thread.brief_id ? (
                    <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-xs",
                        thread.id === activeThreadId ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {thread.title}
                    </span>
                    <span className="block text-[10px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}
                    </span>
                  </span>
                </button>
              )}
              {canEdit && renaming !== thread.id && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Conversation options"
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {pinsEnabled && (
                      <DropdownMenuItem onClick={() => void pin(thread.id, !thread.pinned)}>
                        {thread.pinned ? (
                          <>
                            <PinOff className="mr-2 size-3.5" /> Unpin
                          </>
                        ) : (
                          <>
                            <Pin className="mr-2 size-3.5" /> Pin to the top
                          </>
                        )}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        setDraftTitle(thread.title);
                        setRenaming(thread.id);
                      }}
                    >
                      <Pencil className="mr-2 size-3.5" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-primary"
                      onClick={() => void remove(thread.id)}
                    >
                      <Trash2 className="mr-2 size-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1 border-t border-sidebar-border pt-3">
        <div className="flex items-center justify-between px-1">
          <span className="label-eyebrow">Briefs</span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onImportBrief}>
            <Plus className="mr-1 size-3.5" /> Import
          </Button>
        </div>
        <div className="max-h-48 space-y-0.5 overflow-y-auto scroll-slim">
          {!briefs.length && (
            <button
              type="button"
              onClick={onImportBrief}
              className="w-full rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground hover:text-foreground"
            >
              Import a PDF, Word or PowerPoint brief
            </button>
          )}
          {briefs.map((brief) => (
            <button
              key={brief.id}
              type="button"
              onClick={() => onOpenBrief(brief.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                brief.id === activeBriefId
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  BRIEF_DOT[brief.status] ?? "bg-muted-foreground",
                )}
              />
              <span className="truncate">{brief.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
