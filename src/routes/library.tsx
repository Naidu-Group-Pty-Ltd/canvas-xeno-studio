import { createFileRoute, redirect } from "@tanstack/react-router";

/** V2 alias: the Library is the V1 Assets library; bookmarks to /assets keep working. */
export const Route = createFileRoute("/library")({
  beforeLoad: () => {
    throw redirect({ to: "/assets" });
  },
});
