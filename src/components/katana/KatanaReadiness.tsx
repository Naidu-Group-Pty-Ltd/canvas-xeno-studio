import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function KatanaReadiness({ problems }: { problems: string[] }) {
  if (!problems.length) return null;
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">Katana isn't ready yet</p>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link to="/settings" hash="katana">
          Open Settings
        </Link>
      </Button>
    </div>
  );
}
