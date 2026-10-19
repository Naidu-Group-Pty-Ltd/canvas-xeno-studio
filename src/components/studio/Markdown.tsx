import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  parseMarkdown,
  type MdAlign,
  type MdBlock,
  type MdInline,
  type MdListItem,
} from "@/lib/markdown/parse";

interface MarkdownProps {
  text: string;
  className?: string;
  /** The reply is still arriving: half-written fences, emphasis and links render calmly. */
  streaming?: boolean;
  /** Tighter vertical rhythm for dense feeds. */
  compact?: boolean;
}

/**
 * Renders an AI reply written in Markdown. `parseMarkdown` turns the text into a typed tree and
 * this component maps it to React elements only (no dangerouslySetInnerHTML), so model output
 * can never inject HTML; the parser has already dropped links to unsafe URLs.
 */
export function Markdown({ text, className, streaming = false, compact = false }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(text, { streaming }), [text, streaming]);
  return (
    <div
      className={cn(
        compact ? "space-y-1.5" : "space-y-3",
        "text-sm leading-relaxed break-words",
        className,
      )}
    >
      {renderBlocks(blocks, compact)}
    </div>
  );
}

function renderBlocks(blocks: MdBlock[], compact: boolean): ReactNode[] {
  return blocks.map((block, index) => renderBlock(block, index, compact));
}

function renderBlock(block: MdBlock, key: number, compact: boolean): ReactNode {
  switch (block.type) {
    case "heading": {
      // Replies sit inside a page that has its own h1/h2, so headings start at h3.
      const Tag = block.level <= 2 ? "h3" : "h4";
      return (
        <Tag
          key={key}
          className={cn("font-display font-semibold", block.level <= 2 ? "text-base" : "text-sm")}
        >
          {renderInlines(block.children)}
        </Tag>
      );
    }
    case "paragraph":
      return <p key={key}>{renderInlines(block.children)}</p>;
    case "list":
      return <List key={key} list={block} compact={compact} />;
    case "code":
      return <CodeBlock key={key} lang={block.lang} code={block.text} />;
    case "blockquote":
      return (
        <blockquote
          key={key}
          className={cn(
            "border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground",
            compact ? "space-y-1.5" : "space-y-3",
          )}
        >
          {renderBlocks(block.children, compact)}
        </blockquote>
      );
    case "table":
      return <Table key={key} table={block} />;
    case "hr":
      return <hr key={key} className="border-border" />;
  }
}

function List({ list, compact }: { list: Extract<MdBlock, { type: "list" }>; compact: boolean }) {
  const className = cn(
    "pl-5 marker:text-muted-foreground",
    list.ordered ? "list-decimal" : "list-disc",
    list.tight ? (compact ? "space-y-0.5" : "space-y-1") : compact ? "space-y-1" : "space-y-2",
  );
  const items = list.items.map((item, index) => (
    <ListItem key={index} item={item} tight={list.tight} compact={compact} />
  ));
  if (!list.ordered) return <ul className={className}>{items}</ul>;
  return (
    <ol
      className={className}
      start={list.start !== null && list.start !== 1 ? list.start : undefined}
    >
      {items}
    </ol>
  );
}

function ListItem({
  item,
  tight,
  compact,
}: {
  item: MdListItem;
  tight: boolean;
  compact: boolean;
}) {
  const only = item.children.length === 1 ? item.children[0] : undefined;
  // A tight item's lone paragraph renders inline, so the marker lines up with its text.
  const content =
    tight && only?.type === "paragraph"
      ? renderInlines(only.children)
      : renderBlocks(item.children, compact);
  return (
    <li
      className={
        cn(
          item.checked !== null && "relative list-none",
          item.children.length > 1 && (compact ? "space-y-1" : "space-y-1.5"),
        ) || undefined
      }
    >
      {item.checked !== null && <TaskBox checked={item.checked} />}
      {content}
    </li>
  );
}

/** A read-only checkbox look: a span, so it never takes focus or looks clickable. */
function TaskBox({ checked }: { checked: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute top-[0.3em] -left-5 inline-flex size-3.5 items-center justify-center rounded-[4px] border",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/50",
        )}
      >
        {checked && <Check className="size-2.5" strokeWidth={3} />}
      </span>
      <span className="sr-only">{checked ? "Done: " : "To do: "}</span>
    </>
  );
}

function CodeBlock({ lang, code }: { lang: string | null; code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = () => {
    // The clipboard API is missing outside secure contexts (and on the server).
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard) return;
    void clipboard.writeText(code).then(
      () => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 py-1 pr-1.5 pl-3">
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {lang ?? "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scroll-slim overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed [tab-size:4]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const ALIGN: Record<Exclude<MdAlign, null>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function Table({ table }: { table: Extract<MdBlock, { type: "table" }> }) {
  const align = (column: number) => ALIGN[table.align[column] ?? "left"];
  return (
    <div className="scroll-slim overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted/50">
          <tr>
            {table.head.map((cell, column) => (
              <th
                key={column}
                className={cn(
                  "border-b border-border px-3 py-1.5 font-semibold [&:not(:last-child)]:border-r",
                  align(column),
                )}
              >
                {renderInlines(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index} className="border-border [&:not(:last-child)]:border-b">
              {row.map((cell, column) => (
                <td
                  key={column}
                  className={cn(
                    "border-border px-3 py-1.5 align-top [&:not(:last-child)]:border-r",
                    align(column),
                  )}
                >
                  {renderInlines(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LINK =
  "text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary";

function renderInlines(nodes: MdInline[]): ReactNode[] {
  return nodes.map((node, index) => renderInline(node, index));
}

function renderInline(node: MdInline, key: number): ReactNode {
  switch (node.type) {
    case "text":
      return <Fragment key={key}>{node.text}</Fragment>;
    case "strong":
      return (
        <strong key={key} className="font-semibold text-foreground">
          {renderInlines(node.children)}
        </strong>
      );
    case "em":
      return <em key={key}>{renderInlines(node.children)}</em>;
    case "del":
      return (
        <del key={key} className="text-muted-foreground">
          {renderInlines(node.children)}
        </del>
      );
    case "code":
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {node.text}
        </code>
      );
    case "break":
    case "softbreak":
      return <br key={key} />;
    case "link":
      // External links open in a new tab; same-site paths and anchors stay in this one.
      return (
        <a
          key={key}
          href={node.href}
          title={node.title ?? undefined}
          target={node.external ? "_blank" : undefined}
          rel={node.external ? "noopener noreferrer" : undefined}
          className={LINK}
        >
          {renderInlines(node.children)}
        </a>
      );
    case "image":
      // Never loads the image: it becomes a link to it, so a reply can't pull in remote content.
      return (
        <a
          key={key}
          href={node.href}
          title={node.title ?? node.href}
          target={node.external ? "_blank" : undefined}
          rel={node.external ? "noopener noreferrer" : undefined}
          className={cn(LINK, "inline-flex items-center gap-1")}
        >
          <ImageIcon className="size-3.5 shrink-0" aria-hidden />
          {node.alt || "Image"}
        </a>
      );
  }
}
