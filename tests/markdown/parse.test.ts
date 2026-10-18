import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../../src/components/studio/Markdown";
import {
  parseInline,
  parseMarkdown,
  safeHref,
  type MdBlock,
  type MdInline,
} from "../../src/lib/markdown/parse";

const t = (text: string): MdInline => ({ type: "text", text });
const strong = (...children: MdInline[]): MdInline => ({ type: "strong", children });
const em = (...children: MdInline[]): MdInline => ({ type: "em", children });
const del = (...children: MdInline[]): MdInline => ({ type: "del", children });
const code = (text: string): MdInline => ({ type: "code", text });
const p = (...children: MdInline[]): MdBlock => ({ type: "paragraph", children });
const link = (
  href: string,
  children: MdInline[],
  title: string | null = null,
  external = true,
): MdInline => ({ type: "link", href, title, external, children });
const url = (href: string, text = href): MdInline => link(href, [t(text)]);

/** A one-line outline of the block tree, so nesting reads at a glance: "ul(li(p(a)))". */
function outline(source: string, streaming = false): string {
  return parseMarkdown(source, { streaming }).map(block).join(" ");
}

function block(node: MdBlock): string {
  switch (node.type) {
    case "heading":
      return `h${node.level}(${words(node.children)})`;
    case "paragraph":
      return `p(${words(node.children)})`;
    case "list": {
      const name = node.ordered ? `ol${node.start === 1 ? "" : node.start}` : "ul";
      const items = node.items.map((item) => {
        const box = item.checked === null ? "" : item.checked ? "[x]" : "[ ]";
        return `li${box}(${item.children.map(block).join(" ")})`;
      });
      return `${node.tight ? "" : "loose "}${name}(${items.join(" ")})`;
    }
    case "code":
      return `code${node.lang ? `:${node.lang}` : ""}(${node.text})`;
    case "blockquote":
      return `quote(${node.children.map(block).join(" ")})`;
    case "table": {
      const rows = [node.head, ...node.rows].map((row) => row.map(words).join("|"));
      return `table(${rows.join(" / ")})`;
    }
    case "hr":
      return "hr";
  }
}

/** Inline content as plain words; line breaks show as "↵". */
function words(nodes: MdInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.text;
        case "image":
          return node.alt;
        case "break":
        case "softbreak":
          return "↵";
        default:
          return words(node.children);
      }
    })
    .join("");
}

describe("headings and paragraphs", () => {
  test("ATX headings at every level, closing hashes trimmed", () => {
    expect(outline("# One\n## Two ##\n### Three\n#### Four\n##### Five\n###### Six #")).toBe(
      "h1(One) h2(Two) h3(Three) h4(Four) h5(Five) h6(Six)",
    );
    expect(parseMarkdown("## **Bold** title")).toEqual([
      { type: "heading", level: 2, children: [strong(t("Bold")), t(" title")] },
    ]);
  });

  test("a hashtag and seven hashes are text; a trailing # without a space is kept", () => {
    expect(outline("#hashtag")).toBe("p(#hashtag)");
    expect(outline("####### seven")).toBe("p(####### seven)");
    expect(outline("## C#")).toBe("h2(C#)");
  });

  test("paragraphs split on blank lines and keep their line breaks", () => {
    expect(parseMarkdown("one\ntwo\n\n\nthree")).toEqual([
      p(t("one"), { type: "softbreak" }, t("two")),
      p(t("three")),
    ]);
  });

  test("hard breaks come from two trailing spaces or a backslash", () => {
    expect(parseMarkdown("one  \ntwo\\\nthree")).toEqual([
      p(t("one"), { type: "break" }, t("two"), { type: "break" }, t("three")),
    ]);
    // At the end of a paragraph they are not breaks.
    expect(parseMarkdown("end\\")).toEqual([p(t("end\\"))]);
    expect(parseMarkdown("end   ")).toEqual([p(t("end"))]);
  });

  test("CRLF, blank input and surrounding blank lines", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("  \n\n\t\n")).toEqual([]);
    expect(outline("\r\n# Title\r\nbody\r\n\r\n")).toBe("h1(Title) p(body)");
  });

  test("thematic breaks", () => {
    expect(outline("---\n***\n___\n- - -\n * * * ")).toBe("hr hr hr hr hr");
    expect(outline("--")).toBe("p(--)");
    // No setext headings: text over "---" stays text, then a break.
    expect(outline("Text\n---")).toBe("p(Text) hr");
  });
});

describe("lists", () => {
  test("bullets with -, * or +; a different bullet starts a new list", () => {
    expect(outline("- a\n- b")).toBe("ul(li(p(a)) li(p(b)))");
    expect(outline("* a\n* b")).toBe("ul(li(p(a)) li(p(b)))");
    expect(outline("+ a\n+ b")).toBe("ul(li(p(a)) li(p(b)))");
    expect(outline("- a\n* b")).toBe("ul(li(p(a))) ul(li(p(b)))");
  });

  test("ordered lists with . or ) keep their first number", () => {
    expect(outline("1. a\n2. b")).toBe("ol(li(p(a)) li(p(b)))");
    expect(outline("3) a\n4) b")).toBe("ol3(li(p(a)) li(p(b)))");
    expect(parseMarkdown("1. a\n1) b").map((node) => node.type)).toEqual(["list", "list"]);
  });

  test("items nest by two spaces, four spaces or a tab", () => {
    const nested = "ul(li(p(a) ul(li(p(b) ul(li(p(c)))))) li(p(d)))";
    expect(outline("- a\n  - b\n    - c\n- d")).toBe(nested);
    expect(outline("- a\n    - b\n        - c\n- d")).toBe(nested);
    expect(outline("- a\n\t- b\n\t\t- c\n- d")).toBe(nested);
  });

  test("a bullet list nests under an ordered item indented by two or three spaces", () => {
    const expected = "ol(li(p(Step) ul(li(p(detail)))) li(p(Next)))";
    expect(outline("1. Step\n   - detail\n2. Next")).toBe(expected);
    expect(outline("1. Step\n  - detail\n2. Next")).toBe(expected);
    expect(outline("10. Ten\n    - detail\n11. Eleven")).toBe(
      "ol10(li(p(Ten) ul(li(p(detail)))) li(p(Eleven)))",
    );
  });

  test("task items", () => {
    expect(outline("- [ ] todo\n- [x] done\n- [X] also\n- plain\n- [y] not a task")).toBe(
      "ul(li[ ](p(todo)) li[x](p(done)) li[x](p(also)) li(p(plain)) li(p([y] not a task)))",
    );
    expect(outline("1. [x] ordered task")).toBe("ol(li[x](p(ordered task)))");
    // A link is not a checkbox.
    expect(outline("- [x](https://a.co)")).toBe("ul(li(p(x)))");
  });

  test("blank lines between items make the list loose", () => {
    expect(outline("- a\n\n- b")).toBe("loose ul(li(p(a)) li(p(b)))");
    expect(outline("- a\n\n  more\n- b")).toBe("loose ul(li(p(a) p(more)) li(p(b)))");
    // A blank line inside a nested list loosens only that list.
    expect(outline("- a\n  - b\n\n  - c\n- d")).toBe(
      "ul(li(p(a) loose ul(li(p(b)) li(p(c)))) li(p(d)))",
    );
  });

  test("items hold code blocks, quotes and tables", () => {
    expect(outline("1. Install:\n   ```sh\n   npm i\n   ```\n2. Run")).toBe(
      "ol(li(p(Install:) code:sh(npm i)) li(p(Run)))",
    );
    expect(outline("- > quoted\n- | a | b |\n  |---|---|\n  | 1 | 2 |")).toBe(
      "ul(li(quote(p(quoted))) li(table(a|b / 1|2)))",
    );
  });

  test("an open fence keeps lines a model forgot to indent inside its item", () => {
    expect(outline("1. Add:\n   ```yaml\nitems:\n- a\n```\n2. Next")).toBe(
      "ol(li(p(Add:) code:yaml(items:\n- a)) li(p(Next)))",
    );
  });

  test("indented code is off inside lists, so a deep indent stays prose", () => {
    expect(outline("- a\n\n      still prose")).toBe("loose ul(li(p(a) p(still prose)))");
  });

  test("a lazy line continues the item; a blank line ends the list", () => {
    expect(outline("- a\nlazy\n\nafter")).toBe("ul(li(p(a↵lazy))) p(after)");
  });

  test("only lists starting at 1 interrupt a paragraph", () => {
    expect(outline("Steps:\n1. one\n2. two")).toBe("p(Steps:) ol(li(p(one)) li(p(two)))");
    expect(outline("Options:\n- yes\n- no")).toBe("p(Options:) ul(li(p(yes)) li(p(no)))");
    expect(outline("The total is\n14. Not a list")).toBe("p(The total is↵14. Not a list)");
  });

  test("a thematic break is not a list item", () => {
    expect(outline("- a\n- - -\n- b")).toBe("ul(li(p(a))) hr ul(li(p(b)))");
  });
});

describe("code blocks", () => {
  test("fenced code keeps its language and its text verbatim", () => {
    expect(parseMarkdown('```ts title="a.ts"\nconst a = <b>**1**</b>;\n\tindented\n```')).toEqual([
      { type: "code", lang: "ts", text: "const a = <b>**1**</b>;\n\tindented" },
    ]);
    expect(parseMarkdown("~~~\nplain\n~~~")).toEqual([{ type: "code", lang: null, text: "plain" }]);
  });

  test("a longer fence wraps a shorter one; ```inline``` is not a fence", () => {
    expect(parseMarkdown("````md\n```js\nx\n```\n````")).toEqual([
      { type: "code", lang: "md", text: "```js\nx\n```" },
    ]);
    expect(parseMarkdown("```js``` here")).toEqual([p(code("js"), t(" here"))]);
  });

  test("an unclosed fence still shows the rest of the reply as code", () => {
    expect(parseMarkdown("Intro\n\n```py\nprint(1)\n\nmore\n\n")).toEqual([
      p(t("Intro")),
      { type: "code", lang: "py", text: "print(1)\n\nmore" },
    ]);
  });

  test("indented code: four spaces, outside lists, never interrupting a paragraph", () => {
    expect(parseMarkdown("    a\n      b\n\n    c\n\nafter")).toEqual([
      { type: "code", lang: null, text: "a\n  b\n\nc" },
      p(t("after")),
    ]);
    expect(outline("para\n    still para")).toBe("p(para↵still para)");
  });
});

describe("blockquotes", () => {
  test("quotes nest, and a lazy line continues the innermost paragraph", () => {
    expect(outline("> outer\n> > inner\nlazy")).toBe("quote(p(outer) quote(p(inner↵lazy)))");
  });

  test("quotes hold any blocks", () => {
    expect(outline("> # Title\n> - a\n> - b\n>\n> ```js\n> x\n> ```")).toBe(
      "quote(h1(Title) ul(li(p(a)) li(p(b))) code:js(x))",
    );
  });

  test("a blank line ends a quote", () => {
    expect(outline("> a\n\n> b")).toBe("quote(p(a)) quote(p(b))");
    expect(outline("> a\n- b")).toBe("quote(p(a)) ul(li(p(b)))");
  });
});

describe("tables", () => {
  test("header, alignment and body rows", () => {
    expect(
      parseMarkdown("| Name | Qty | Note |\n| :--- | ---: | :-: |\n| a | 1 | **x** |"),
    ).toEqual([
      {
        type: "table",
        align: ["left", "right", "center"],
        head: [[t("Name")], [t("Qty")], [t("Note")]],
        rows: [[[t("a")], [t("1")], [strong(t("x"))]]],
      },
    ]);
    expect(parseMarkdown("| a |\n| --- |")).toEqual([
      { type: "table", align: [null], head: [[t("a")]], rows: [] },
    ]);
  });

  test("escaped pipes stay in their cell, inline code included", () => {
    expect(parseMarkdown("| a | b |\n|---|---|\n| x \\| y | `p\\|q` |")[0]).toMatchObject({
      rows: [[[t("x | y")], [code("p|q")]]],
    });
  });

  test("ragged rows are padded or cut to the header's width", () => {
    expect(parseMarkdown("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |")[0]).toMatchObject({
      rows: [
        [[t("1")], []],
        [[t("1")], [t("2")]],
      ],
    });
  });

  test("outer pipes are optional", () => {
    expect(outline("a | b\n--- | ---\n1 | 2")).toBe("table(a|b / 1|2)");
  });

  test("a table may follow a paragraph line directly and ends at a blank line", () => {
    expect(outline("Intro\n| a | b |\n|---|---|\n| 1 | 2 |\n\nafter")).toBe(
      "p(Intro) table(a|b / 1|2) p(after)",
    );
  });

  test("rows without a matching delimiter row are a paragraph", () => {
    expect(outline("| a | b |\n| c | d |")).toBe("p(| a | b |↵| c | d |)");
    expect(outline("| a | b |\n|---|")).toBe("p(| a | b |↵|---|)");
  });
});

describe("HTML is never interpreted", () => {
  test("block-level tags are literal text", () => {
    const soft: MdInline = { type: "softbreak" };
    expect(parseMarkdown("<div>\n<script>alert(1)</script>\n</div>")).toEqual([
      p(t("<div>"), soft, t("<script>alert(1)</script>"), soft, t("</div>")),
    ]);
  });

  test("inline tags, attributes and comments are literal text", () => {
    const source = 'a <b onclick="x()">bold</b> <!-- note --> <img src=x onerror=alert(1)>';
    expect(parseInline(source)).toEqual([t(source)]);
  });
});

describe("inline formatting", () => {
  test("strong and emphasis with asterisks or underscores", () => {
    expect(parseInline("**b** __b__ *i* _i_")).toEqual([
      strong(t("b")),
      t(" "),
      strong(t("b")),
      t(" "),
      em(t("i")),
      t(" "),
      em(t("i")),
    ]);
    expect(parseInline("***both***")).toEqual([em(strong(t("both")))]);
    expect(parseInline("*foo**bar**baz*")).toEqual([em(t("foo"), strong(t("bar")), t("baz"))]);
  });

  test("underscores inside words are not emphasis", () => {
    expect(parseInline("snake_case_name and foo_bar_baz_")).toEqual([
      t("snake_case_name and foo_bar_baz_"),
    ]);
    expect(parseInline("my__dunder__name")).toEqual([t("my__dunder__name")]);
    expect(parseInline("_snake_case_")).toEqual([em(t("snake_case"))]);
  });

  test("asterisks do work inside words", () => {
    expect(parseInline("un*frigging*believable")).toEqual([
      t("un"),
      em(t("frigging")),
      t("believable"),
    ]);
  });

  test("strikethrough needs exactly two tildes", () => {
    expect(parseInline("~~gone~~ and ~5 min and ~~~x~~~")).toEqual([
      del(t("gone")),
      t(" and ~5 min and ~~~x~~~"),
    ]);
  });

  test("code spans: any number of backticks, padding trimmed, nothing parsed inside", () => {
    expect(parseInline("`a` ``b ` c`` ` **d** `")).toEqual([
      code("a"),
      t(" "),
      code("b ` c"),
      t(" "),
      code("**d**"),
    ]);
    expect(parseInline("`unclosed and ``mismatched")).toEqual([t("`unclosed and ``mismatched")]);
  });

  test("backslash escapes", () => {
    expect(parseInline("\\*not em\\* \\_ \\` \\[x\\](y) \\\\ \\a")).toEqual([
      t("*not em* _ ` [x](y) \\ \\a"),
    ]);
  });

  test("links with titles, balanced parentheses and formatted text", () => {
    expect(parseInline('[**Docs**](https://x.co/a_(b) "The docs")')).toEqual([
      link("https://x.co/a_(b)", [strong(t("Docs"))], "The docs"),
    ]);
    expect(parseInline("*see [here](/help#top)*")).toEqual([
      em(t("see "), link("/help#top", [t("here")], null, false)),
    ]);
    expect(parseInline("[a](</docs/my page> 'T')")).toEqual([
      link("/docs/my page", [t("a")], "T", false),
    ]);
  });

  test("images become image nodes and never nest inside links", () => {
    expect(parseInline('![A *chart*](https://x.co/c.png "Q3")')).toEqual([
      { type: "image", href: "https://x.co/c.png", alt: "A chart", title: "Q3", external: true },
    ]);
    expect(parseInline("[![badge](/b.svg)](https://ci.co)")).toEqual([
      link("https://ci.co", [t("badge")]),
    ]);
  });

  test("autolinks in angle brackets", () => {
    expect(parseInline("<https://x.co/a?b=1> <mailto:me@x.co> <me@x.co>")).toEqual([
      url("https://x.co/a?b=1"),
      t(" "),
      url("mailto:me@x.co"),
      t(" "),
      url("mailto:me@x.co", "me@x.co"),
    ]);
  });

  test("bare URLs drop trailing punctuation and keep balanced parentheses", () => {
    expect(parseInline("Visit https://x.co/docs.")).toEqual([
      t("Visit "),
      url("https://x.co/docs"),
      t("."),
    ]);
    expect(parseInline("(see https://x.co/a), then")).toEqual([
      t("(see "),
      url("https://x.co/a"),
      t("), then"),
    ]);
    expect(parseInline("https://en.wikipedia.org/wiki/Foo_(bar), ok")).toEqual([
      url("https://en.wikipedia.org/wiki/Foo_(bar)"),
      t(", ok"),
    ]);
    expect(parseInline("Is it https://x.co?! Or http://y.co/a;")).toEqual([
      t("Is it "),
      url("https://x.co"),
      t("?! Or "),
      url("http://y.co/a"),
      t(";"),
    ]);
    expect(parseInline('go to www.x.co: "https://y.co"')).toEqual([
      t("go to "),
      url("https://www.x.co", "www.x.co"),
      t(': "'),
      url("https://y.co"),
      t('"'),
    ]);
    expect(parseInline("**https://x.co/a_b**")).toEqual([strong(url("https://x.co/a_b"))]);
  });

  test("bare URLs need a boundary and don't nest inside links", () => {
    expect(parseInline("xhttps://x.co and www.")).toEqual([t("xhttps://x.co and www.")]);
    expect(parseInline("[https://x.co](https://y.co)")).toEqual([
      link("https://y.co", [t("https://x.co")]),
    ]);
  });

  test("unmatched brackets and delimiters stay literal", () => {
    expect(parseInline("a * b ** c [d] (e) ]f[ 2*3")).toEqual([t("a * b ** c [d] (e) ]f[ 2*3")]);
  });
});

describe("URL safety", () => {
  const unsafe = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.com/x",
    "/\\evil.com",
    "ftp://x.co/file",
    "docs/page",
  ];
  test.each(unsafe)("%p renders as plain text", (href) => {
    expect(parseInline(`[click](<${href}>)`)).toEqual([t("click")]);
    expect(safeHref(href)).toBeNull();
  });

  test("an unsafe raw destination loses only the link, not the words", () => {
    expect(parseInline("[**click**](javascript:alert(1)) now")).toEqual([
      strong(t("click")),
      t(" now"),
    ]);
  });

  const safe: [string, boolean][] = [
    ["https://x.co", true],
    ["http://x.co/a", true],
    ["mailto:a@b.co", true],
    ["/settings", false],
    ["#section", false],
    ["?tab=2", false],
  ];
  test.each(safe)("%p stays a link (external: %p)", (href, external) => {
    expect(parseInline(`[go](${href})`)).toEqual([link(href, [t("go")], null, external)]);
  });

  test("unsafe images keep only their alt text", () => {
    expect(parseInline("![pic](javascript:alert(1)) ![data](data:image/png;base64,AAAA)")).toEqual([
      t("pic data"),
    ]);
  });

  test("unsafe autolinks stay literal", () => {
    expect(parseInline("<javascript:alert(1)> <file:///etc>")).toEqual([
      t("<javascript:alert(1)> <file:///etc>"),
    ]);
  });

  test("safeHref trims and strips control characters before checking", () => {
    expect(safeHref(" https://x.co ")).toEqual({ href: "https://x.co", external: true });
    expect(safeHref("java\u0000script:alert(1)")).toBeNull();
    expect(safeHref("javascript\n:alert(1)")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref("/ok")).toEqual({ href: "/ok", external: false });
  });
});

describe("streaming", () => {
  const stream = (source: string) => parseMarkdown(source, { streaming: true });

  test("an unclosed fence is code whether or not the reply is streaming", () => {
    for (const streaming of [false, true]) {
      expect(parseMarkdown("Here:\n```ts\nconst a = 1;\nconst b", { streaming })).toEqual([
        p(t("Here:")),
        { type: "code", lang: "ts", text: "const a = 1;\nconst b" },
      ]);
    }
  });

  test("a closing fence still arriving isn't shown as code", () => {
    expect(stream("```ts\nx\n``")).toEqual([{ type: "code", lang: "ts", text: "x" }]);
    expect(parseMarkdown("```ts\nx\n``")).toEqual([{ type: "code", lang: "ts", text: "x\n``" }]);
  });

  test("a table is a paragraph until its delimiter row has arrived", () => {
    const steps = [
      "| Name | Qty |",
      "| Name | Qty |\n|---",
      "| Name | Qty |\n|---|---|",
      "| Name | Qty |\n|---|---|\n| a",
    ];
    expect(steps.map((source) => stream(source)[0]?.type)).toEqual([
      "paragraph",
      "paragraph",
      "table",
      "table",
    ]);
    expect(stream(steps[3]!)[0]).toMatchObject({ rows: [[[t("a")], []]] });
  });

  test("emphasis, code and links left open at the end render closed", () => {
    expect(stream("Hello **wor")).toEqual([p(t("Hello "), strong(t("wor")))]);
    expect(stream("Hello **wor\n")).toEqual([p(t("Hello "), strong(t("wor")))]);
    expect(stream("Run `npm i")).toEqual([p(t("Run "), code("npm i"))]);
    expect(stream("See [the *docs*](https://x.co/do")).toEqual([p(t("See the "), em(t("docs")))]);
    expect(stream("## A *tit")).toEqual([
      { type: "heading", level: 2, children: [t("A "), em(t("tit"))] },
    ]);
    expect(outline("- one\n- ~~two", true)).toBe("ul(li(p(one)) li(p(two)))");
  });

  test("the same text stays literal once the reply is complete", () => {
    expect(parseMarkdown("Hello **wor")).toEqual([p(t("Hello **wor"))]);
    expect(parseMarkdown("Run `npm i")).toEqual([p(t("Run `npm i"))]);
    expect(parseMarkdown("See [the docs](https://x.co/do")).toEqual([
      p(t("See [the docs]("), url("https://x.co/do")),
    ]);
  });

  test("only the end of the reply is repaired, and only clear openers", () => {
    expect(stream("**early\n\nlate *tail")).toEqual([
      p(t("**early")),
      p(t("late "), em(t("tail"))),
    ]);
    expect(stream("2*3 and a_b and *")).toEqual([p(t("2*3 and a_b and *"))]);
  });
});

/** Walks every inline node, with how deeply it is nested and whether it sits inside a link. */
function eachInline(
  blocks: MdBlock[],
  visit: (node: MdInline, depth: number, inLink: boolean) => void,
): void {
  const walk = (nodes: MdInline[], depth: number, inLink: boolean) => {
    for (const node of nodes) {
      visit(node, depth, inLink);
      if ("children" in node) walk(node.children, depth + 1, inLink || node.type === "link");
    }
  };
  for (const node of blocks) {
    if (node.type === "paragraph" || node.type === "heading") walk(node.children, 0, false);
    if (node.type === "blockquote") eachInline(node.children, visit);
    if (node.type === "list") for (const item of node.items) eachInline(item.children, visit);
    if (node.type === "table") [node.head, ...node.rows].flat().forEach((c) => walk(c, 0, false));
  }
}

describe("robustness", () => {
  test("200 KB of hostile input parses in linear time", () => {
    const size = 200_000;
    const fill = (unit: string) => unit.repeat(Math.ceil(size / unit.length));
    const inputs = [
      fill("*a"),
      fill("**a_"),
      fill("a**b*"),
      fill("[a]("),
      "[".repeat(size / 2) + "a" + "]".repeat(size / 2),
      fill('[a](b "'),
      fill("![a](<"),
      fill("`a"),
      Array.from({ length: 8000 }, (_, i) => "`".repeat((i % 40) + 1) + "x").join(" "),
      fill("<a"),
      fill("(https://x.co"),
      "https://" + "a".repeat(size),
      fill("\\"),
      fill("~~a"),
      "> ".repeat(size / 2) + "deep",
      "- ".repeat(size / 2) + "deep",
      fill("> a\n"),
      fill("```\n"),
      fill("| a | b |\n"),
      "|a".repeat(size / 4) + "|\n" + "|-".repeat(size / 4) + "|",
      fill("a  \n"),
      fill("- a\n"),
      "*".repeat(size / 2) + "a" + "*".repeat(size / 2),
      Array.from({ length: 5000 }, (_, i) => "  ".repeat(i % 40) + "- item").join("\n"),
    ];
    let total = 0;
    for (const input of inputs) {
      const started = performance.now();
      const blocks = parseMarkdown(input, { streaming: true });
      const elapsed = performance.now() - started;
      total += elapsed;
      expect(blocks.length).toBeGreaterThan(0);
      // Quadratic work on 200 KB would take minutes; linear takes milliseconds.
      expect(elapsed).toBeLessThan(1500);
    }
    expect(total).toBeLessThan(5000);
  });

  test("deep nesting is capped instead of overflowing the stack", () => {
    let quotes = 0;
    let node = parseMarkdown(">".repeat(50_000) + " deep")[0];
    while (node?.type === "blockquote") {
      quotes++;
      node = node.children[0];
    }
    expect(quotes).toBe(12);
    let depth = 0;
    eachInline(parseMarkdown("*".repeat(50_000) + "a" + "*".repeat(50_000)), (_, d) => {
      depth = Math.max(depth, d);
    });
    expect(depth).toBeLessThanOrEqual(32);
  });

  test("random Markdown soup never throws and keeps the tree's promises", () => {
    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pieces = [
      ...["*", "**", "_", "~~", "`", "```", "[", "]", "(", ")", "![", "<", ">", "\\", "|"],
      ...["- ", "1. ", "# ", "\n", "\n\n", " ", "    ", "\t", "a", "word", "[ ] ", "---"],
      ...["https://x.co/a_(b)", "www.y.z", "javascript:x", "//evil", "/ok", '"t"', "\r\n"],
      ...["| a | b |", "|---|---|", "😀", " ", "\u0000"],
    ];
    for (let round = 0; round < 3000; round++) {
      let source = "";
      const length = 1 + Math.floor(random() * 30);
      for (let k = 0; k < length; k++) source += pieces[Math.floor(random() * pieces.length)];
      for (const streaming of [false, true]) {
        const blocks = parseMarkdown(source, { streaming });
        eachInline(blocks, (node, _, inLink) => {
          if (node.type === "text") expect(node.text).not.toBe("");
          if (node.type !== "link" && node.type !== "image") return;
          expect(inLink).toBe(false);
          expect(safeHref(node.href)).toEqual({ href: node.href, external: node.external });
        });
        const tables = blocks.filter((node) => node.type === "table");
        for (const table of tables) {
          for (const row of [table.head, ...table.rows])
            expect(row).toHaveLength(table.align.length);
        }
      }
    }
  });
});

describe("Markdown component", () => {
  const html = (text: string, props: { streaming?: boolean; compact?: boolean } = {}) =>
    renderToStaticMarkup(createElement(Markdown, { text, ...props }));

  test("model output can't inject HTML or unsafe links", () => {
    const out = html('<img src=x onerror="alert(1)"> <script>alert(1)</script> [x](javascript:y)');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("external links open in a new tab; same-site links stay in this one", () => {
    const out = html("[a](https://x.co) [b](/settings)");
    expect(out).toContain('<a href="https://x.co" target="_blank" rel="noopener noreferrer"');
    expect(out).toMatch(/<a href="\/settings" class="[^"]*">b<\/a>/);
  });

  test("code gets a language label and a copy button; images are only links", () => {
    const out = html("```py\nprint(1)\n```\n\n![chart](https://x.co/c.png)");
    expect(out).toContain(">py</span>");
    expect(out).toContain('aria-label="Copy code"');
    expect(out).toContain("<code>print(1)</code>");
    expect(out).toContain('href="https://x.co/c.png"');
    expect(out).not.toContain("<img");
  });

  test("task items render a checkbox look without an input", () => {
    const out = html("- [x] done\n- [ ] todo");
    expect(out).not.toContain("<input");
    expect(out).toContain("Done: </span>done");
    expect(out).toContain("To do: </span>todo");
  });

  test("compact mode tightens the spacing", () => {
    expect(html("a\n\nb", { compact: true })).toStartWith('<div class="space-y-1.5 ');
    expect(html("a\n\nb")).toStartWith('<div class="space-y-3 ');
  });
});
