import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Boxes, LayoutGrid, Sparkles } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useModels, useProjects } from "@/hooks/useStudioData";
import { setCreatePrefill } from "@/lib/create-draft";

interface NavEntry {
  to: string;
  label: string;
}

/** Cmd/Ctrl+K — jump to any section, project or model without leaving the keyboard. */
export function CommandPalette({ navItems }: { navItems: readonly NavEntry[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: projects } = useProjects();
  const { data: models } = useModels();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(to: string) {
    setOpen(false);
    void navigate({ to });
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Go to a section, project or model…" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>
        <CommandGroup heading="Sections">
          {navItems.map((item) => (
            <CommandItem key={item.to} value={item.label} onSelect={() => go(item.to)}>
              <Sparkles className="mr-2 size-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {!!projects?.length && (
          <CommandGroup heading="Projects">
            {projects.slice(0, 20).map((project) => (
              <CommandItem
                key={project.id}
                value={`project ${project.name}`}
                onSelect={() => {
                  setOpen(false);
                  void navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
                }}
              >
                <LayoutGrid className="mr-2 size-4" />
                {project.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!models?.length && (
          <CommandGroup heading="Generate with">
            {models.slice(0, 30).map((model) => (
              <CommandItem
                key={model.id}
                value={`model ${model.display_name} ${model.operation}`}
                onSelect={() => {
                  setCreatePrefill({ modelId: model.id, mediaType: model.output_type === "video" ? "video" : "image" });
                  setOpen(false);
                  void navigate({ to: "/" });
                }}
              >
                <Boxes className="mr-2 size-4" />
                {model.display_name}
                <span className="ml-2 text-[11px] text-muted-foreground">{model.operation}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
