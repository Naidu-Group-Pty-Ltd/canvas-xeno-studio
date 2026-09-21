import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data } = useQuery({
    queryKey: ["global-search", term],
    enabled: open && term.trim().length > 1,
    queryFn: async () => {
      const like = `%${term.trim()}%`;
      const [projects, assets, generations] = await Promise.all([
        supabase.from("projects").select("id,name").ilike("name", like).limit(5),
        supabase.from("assets").select("id,title,project_id").is("deleted_at", null).ilike("title", like).limit(5),
        supabase.from("generations").select("id,prompt").ilike("prompt", like).limit(5),
      ]);
      return {
        projects: projects.data ?? [],
        assets: assets.data ?? [],
        generations: generations.data ?? [],
      };
    },
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden gap-2 text-muted-foreground lg:inline-flex"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" />
        Search
        <kbd className="ml-2 rounded border border-border px-1 text-[10px]">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search projects, assets and prompts…" value={term} onValueChange={setTerm} />
        <CommandList>
          <CommandEmpty>No matches yet.</CommandEmpty>
          {!!data?.projects.length && (
            <CommandGroup heading="Projects">
              {data.projects.map((project) => (
                <CommandItem
                  key={project.id}
                  onSelect={() => {
                    setOpen(false);
                    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
                  }}
                >
                  {project.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!data?.assets.length && (
            <CommandGroup heading="Assets">
              {data.assets.map((asset) => (
                <CommandItem
                  key={asset.id}
                  onSelect={() => {
                    setOpen(false);
                    navigate({ to: "/assets", search: { asset: asset.id } });
                  }}
                >
                  {asset.title ?? "Untitled asset"}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!data?.generations.length && (
            <CommandGroup heading="Prompts">
              {data.generations.map((generation) => (
                <CommandItem
                  key={generation.id}
                  onSelect={() => {
                    setOpen(false);
                    navigate({ to: "/activity", search: { generation: generation.id } });
                  }}
                >
                  <span className="truncate">{generation.prompt ?? "Untitled generation"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
