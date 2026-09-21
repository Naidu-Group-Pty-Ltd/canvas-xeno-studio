import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Network, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useWorkflowTemplates } from "@/hooks/useV2Data";

export const Route = createFileRoute("/canvas")({
  head: () => ({
    meta: [
      { title: "Canvas · Xeno Studio" },
      { name: "description", content: "Workflow templates that chain operations into repeatable productions." },
      { property: "og:title", content: "Canvas · Xeno Studio" },
      { property: "og:description", content: "Design reusable multi-step creative workflows." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CanvasPage,
});

const NODE_TYPES = ["generate_image", "generate_video", "edit_video", "human_approval", "quality_review", "render_export"];

function CanvasPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useWorkflowTemplates();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const active = templates?.find((t) => t.id === openId) ?? templates?.[0] ?? null;

  async function createTemplate() {
    if (!user || !name.trim()) return;
    const { error } = await supabase.from("workflow_templates").insert({ name: name.trim(), created_by: user.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    setOpen(false);
    setName("");
    await queryClient.invalidateQueries({ queryKey: ["workflow_templates"] });
    toast.success("Workflow created.");
  }

  async function addNode(type: string) {
    if (!active) return;
    const key = `${type}_${(active.workflow_nodes?.length ?? 0) + 1}`;
    const { error } = await supabase.from("workflow_nodes").insert({
      workflow_template_id: active.id,
      node_key: key,
      node_type: type,
      label: type.replace(/_/g, " "),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["workflow_templates"] });
  }

  /** Duplicating never mutates the original — built-in recipes stay intact. */
  async function duplicateTemplate() {
    if (!active || !user) return;
    const { data: copy, error } = await supabase
      .from("workflow_templates")
      .insert({
        name: `${active.name} (copy)`,
        description: active.description,
        category: active.category,
        created_by: user.id,
        is_system: false,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    const nodes = active.workflow_nodes ?? [];
    if (nodes.length) {
      const { error: nodeError } = await supabase.from("workflow_nodes").insert(
        nodes.map((node) => ({
          workflow_template_id: copy.id,
          node_key: node.node_key,
          node_type: node.node_type,
          label: node.label,
          config: node.config,
          position: node.position,
        })),
      );
      if (nodeError) toast.error(nodeError.message);
    }
    await queryClient.invalidateQueries({ queryKey: ["workflow_templates"] });
    setOpenId(copy.id);
    toast.success("Editable copy created.");
  }

  async function removeNode(id: string) {
    const { error } = await supabase.from("workflow_nodes").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["workflow_templates"] });
  }

  return (
    <AppShell title="Canvas">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <aside className="panel space-y-2 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Workflows</h2>
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label="New workflow">
              <Plus className="size-4" />
            </Button>
          </div>
          {isLoading && <Skeleton className="h-20 w-full" />}
          {(templates ?? []).map((template) => (
            <button
              key={template.id}
              onClick={() => setOpenId(template.id)}
              className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${active?.id === template.id ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {template.name}
            </button>
          ))}
        </aside>

        <section className="panel min-w-0 p-4">
          {!active && (
            <EmptyState
              icon={Network}
              title="No workflows yet"
              description="Chain generation, editing, review and export steps into a reusable production recipe."
              actionLabel="New workflow"
              onAction={() => setOpen(true)}
            />
          )}
          {active && (
            <>
              <header className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">{active.name}</h2>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void duplicateTemplate()}>
                    Duplicate
                  </Button>
                  <span className="text-xs text-muted-foreground">v{active.current_version}</span>
                </div>
              </header>
              {active.is_system && (
                <p className="mb-3 rounded-md border border-border bg-surface-raised p-2 text-xs text-muted-foreground">
                  This is a built-in recipe. Duplicate it to make your own editable copy.
                </p>
              )}
              <div className="mb-4 flex flex-wrap gap-2">
                {!active.is_system && NODE_TYPES.map((type) => (
                  <Button key={type} size="sm" variant="outline" onClick={() => void addNode(type)}>
                    + {type.replace(/_/g, " ")}
                  </Button>
                ))}
              </div>
              <div className="space-y-2">
                {(active.workflow_nodes ?? []).map((node, index) => (
                  <div key={node.id} className="flex items-center gap-3 rounded-md bg-surface-raised p-3 text-sm">
                    <span className="text-xs text-muted-foreground">{index + 1}</span>
                    <span className="font-medium">{node.label ?? node.node_type}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{node.node_key}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${node.label ?? node.node_type}`}
                      onClick={() => void removeNode(node.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                {!active.workflow_nodes?.length && (
                  <p className="text-sm text-muted-foreground">Add steps above to build this workflow.</p>
                )}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Workflows are saved as durable templates. Automatic execution is not enabled yet — open each step in
                Create to run it, so nothing is ever charged without an explicit confirmation.
              </p>
            </>
          )}
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workflow</DialogTitle>
          </DialogHeader>
          <Label htmlFor="wf-name">Name</Label>
          <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={() => void createTemplate()} disabled={!name.trim()}>
            Create
          </Button>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
