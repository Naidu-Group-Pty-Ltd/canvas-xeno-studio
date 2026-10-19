import { describe, expect, test } from "bun:test";
import { decodeEntities, scanHtml } from "../../src/lib/brand/scan-html";

const HOME = `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <title>Aurixa Systems &mdash; Your business. Your decision.</title>
  <meta name="description" content="Aurixa builds AI agents for Australian small businesses &amp; their teams.">
  <meta property="og:site_name" content="Aurixa Systems">
  <meta property="og:image" content="/images/og-card.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:image" content="https://cdn.aurixa.example/twitter-card.png">
  <meta name="theme-color" content="#1E40AF" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0b1020" media="(prefers-color-scheme: dark)">
  <meta name="msapplication-TileColor" content="#1e40af">
  <base href="https://aurixa.example/au/">
  <link rel="icon" href="/favicon-32.png" sizes="32x32">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&amp;family=Playfair+Display:ital,wght@0,700;1,700&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto+Slab:400,700|Open%20Sans">
  <link rel="stylesheet" href="assets/site.css">
  <link rel="stylesheet" href="assets/site.css">
  <link rel="preload" as="style" href="/assets/print.css">
  <link rel="alternate stylesheet" href="/assets/contrast.css">
  <link rel="stylesheet" href="https://use.typekit.net/abc1234.css">
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500");
    :root { --brand: #1e40af; }
  </style>
  <style media="(prefers-color-scheme: dark)">:root { --brand: #93c5fd }</style>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@graph":[
    {"@type":"WebSite","name":"Aurixa Website","url":"https://aurixa.example/"},
    {"@type":["Organization","Corporation"],"name":"Aurixa Systems","slogan":"Your business. Your decision.",
     "logo":{"@type":"ImageObject","url":"https://aurixa.example/brand/aurixa-logo.png"},
     "sameAs":["https://www.linkedin.com/company/aurixa","https://x.com/aurixa","not a url"]}
  ]}
  </script>
  <script>window.dataLayer = []; document.write("<h1>Not a heading</h1>");</script>
</head>
<body>
  <header class="site-header">
    <a href="/" class="navbar-brand"><img src="/brand/aurixa-logo.png" srcset="/brand/aurixa-logo.png 1x, /brand/aurixa-logo@2x.png 2x" alt="Aurixa Systems" width="160" height="40"></a>
    <nav>
      <a href="/au/" aria-label="Home"><svg viewBox="0 0 100 24" aria-hidden="true"><title>Aurixa</title><path d="M0 0h10v24H0z" fill="#1e40af"/></svg></a>
      <button class="menu-toggle" aria-label="Menu"><svg class="icon-menu" width="24" height="24"><path d="M0 0h24v2H0z"/></svg></button>
      <a href="/pricing">Pricing</a>
      <a href="/start" class="btn btn-primary">Start your 14-day trial</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <h1>AI agents that work <em>for</em> your business</h1>
      <p>Aurixa answers calls, books jobs &amp; follows up&nbsp;leads.</p>
      <picture>
        <source srcset="/img/hero-800.webp 800w, /img/hero-1600.webp 1600w" type="image/webp">
        <img src="/img/hero-800.jpg" alt="A tradie on the phone" width="1600" height="900">
      </picture>
      <button type="button">Book a demo</button>
      <div role="button">Watch the video</div>
      <a class="cta-link" href="/contact">  Talk   to sales  </a>
      <input type="submit" value="Get started">
    </section>
    <section>
      <h2>How it works</h2>
      <div style="background-image: url('/img/feature-bg.jpg'); color: #f97316">Feature</div>
      <img src="https://px.ads.example/pixel.gif" width="1" height="1" alt="">
      <img src="/img/team.jpg" alt="Our team">
      <img src="/img/icon-tiny.png" width="24" height="24" alt="tiny">
      <img src="/sprites.svg#check" alt="check">
      <div hidden><h3>Hidden heading</h3>Secret text</div>
      <h3>Pricing &amp; plans</h3>
      <template><h2>Template heading</h2></template>
      <noscript><img src="/img/noscript.jpg"></noscript>
      <iframe src="https://www.youtube.com/embed/x"><h2>iframe text</h2></iframe>
    </section>
    <section class="client-logos">
      <img src="/clients/acme-logo.png" alt="Acme logo">
    </section>
  </main>
  <footer>
    <img src="/brand/aurixa-logo-white.svg" alt="Aurixa logo" width="120" height="30">
    <p>&copy; 2026 Aurixa Systems &#8212; All rights reserved &#x2764;</p>
  </footer>
</body>
</html>`;

describe("a home page", () => {
  const signals = scanHtml(HOME, "https://aurixa.example/");

  test("its name, words and language", () => {
    expect(signals.url).toBe("https://aurixa.example/");
    expect(signals.title).toBe("Aurixa Systems — Your business. Your decision.");
    expect(signals.siteName).toBe("Aurixa Systems");
    expect(signals.description).toBe(
      "Aurixa builds AI agents for Australian small businesses & their teams.",
    );
    expect(signals.lang).toBe("en-AU");
  });

  test("theme colours from every source, once each", () => {
    expect(signals.themeColours).toEqual(["#1e40af", "#0b1020", "#5bbad5"]);
  });

  test("icons and the manifest, resolved (root-relative paths ignore <base>'s folder)", () => {
    expect(signals.icons).toEqual([
      { url: "https://aurixa.example/favicon-32.png", rel: "icon", sizes: "32x32", type: null },
      {
        url: "https://aurixa.example/favicon.svg",
        rel: "icon",
        sizes: null,
        type: "image/svg+xml",
      },
      {
        url: "https://aurixa.example/apple-touch-icon.png",
        rel: "apple-touch-icon",
        sizes: "180x180",
        type: null,
      },
      {
        url: "https://aurixa.example/safari-pinned-tab.svg",
        rel: "mask-icon",
        sizes: null,
        type: null,
      },
    ]);
    expect(signals.manifestUrl).toBe("https://aurixa.example/site.webmanifest");
    expect(signals.ogImage).toBe("https://aurixa.example/images/og-card.jpg");
  });

  test("the header logo leads, agreeing with JSON-LD; the inline home-link SVG follows", () => {
    const [first, second] = signals.logos;
    expect(first).toEqual({
      url: "https://aurixa.example/brand/aurixa-logo@2x.png",
      svg: null,
      alt: "Aurixa Systems",
      source: "img",
      score: 5 + 3 + 3 + 2 + 4,
    });
    expect(second!.source).toBe("svg");
    expect(second!.alt).toBe("Aurixa");
    expect(second!.svg!.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox')).toBe(true);
    expect(second!.svg!.endsWith("</svg>")).toBe(true);
    // The menu icon isn't a logo; partner logos and the footer's rank low; at most 8.
    expect(signals.logos.some((logo) => logo.svg?.includes("icon-menu"))).toBe(false);
    expect(signals.logos.length).toBeLessThanOrEqual(8);
    const sources = signals.logos.map((logo) => logo.source);
    expect(sources).toContain("icon");
    expect(sources).toContain("og");
    const client = signals.logos.find((logo) => logo.url?.includes("acme-logo"));
    expect(client === undefined || client.score < second!.score).toBe(true);
    expect(
      signals.logos.every((logo, index, all) => index === 0 || all[index - 1]!.score >= logo.score),
    ).toBe(true);
  });

  test("content images, best first, without logos, pixels, sprites or tiny icons", () => {
    expect(signals.images).toEqual([
      { url: "https://aurixa.example/images/og-card.jpg", alt: null, width: 1200, height: 630 },
      {
        url: "https://aurixa.example/img/hero-800.jpg",
        alt: "A tradie on the phone",
        width: 1600,
        height: 900,
      },
      { url: "https://cdn.aurixa.example/twitter-card.png", alt: null, width: null, height: null },
      { url: "https://aurixa.example/img/hero-1600.webp", alt: null, width: null, height: null },
      { url: "https://aurixa.example/img/feature-bg.jpg", alt: null, width: null, height: null },
      { url: "https://aurixa.example/img/team.jpg", alt: "Our team", width: null, height: null },
    ]);
  });

  test("stylesheets and fonts", () => {
    expect(signals.stylesheets).toEqual([
      "https://aurixa.example/au/assets/site.css",
      "https://aurixa.example/assets/print.css",
    ]);
    expect(signals.googleFonts).toEqual([
      "Inter",
      "Playfair Display",
      "Roboto Slab",
      "Open Sans",
      "Space Grotesk",
    ]);
    expect(signals.adobeFonts).toBe(true);
    expect(signals.inlineCss).toContain(":root { --brand: #1e40af; }");
    expect(signals.inlineCss).toContain(
      "@media (prefers-color-scheme: dark){:root { --brand: #93c5fd }}",
    );
    expect(signals.inlineCss).toContain(
      "div[style]{background-image: url('/img/feature-bg.jpg'); color: #f97316}",
    );
  });

  test("JSON-LD: the organisation over the website", () => {
    expect(signals.jsonLd).toEqual({
      name: "Aurixa Systems",
      logo: "https://aurixa.example/brand/aurixa-logo.png",
      slogan: "Your business. Your decision.",
      sameAs: ["https://www.linkedin.com/company/aurixa", "https://x.com/aurixa"],
    });
  });

  test("headings and calls to action as a visitor sees them", () => {
    expect(signals.headings).toEqual([
      "AI agents that work for your business",
      "How it works",
      "Pricing & plans",
    ]);
    expect(signals.ctas).toEqual([
      "Start your 14-day trial",
      "Book a demo",
      "Watch the video",
      "Talk to sales",
      "Get started",
    ]);
  });

  test("visible text only, a line per block", () => {
    const lines = signals.text.split("\n");
    expect(lines).toContain("AI agents that work for your business");
    expect(lines).toContain("Aurixa answers calls, books jobs & follows up leads.");
    expect(lines).toContain("© 2026 Aurixa Systems — All rights reserved ❤");
    for (const hidden of [
      "Secret text",
      "Not a heading",
      "Template heading",
      "iframe text",
      "Your decision.",
      "dataLayer",
    ])
      expect(signals.text).not.toContain(hidden);
  });
});

describe("whatever HTML it's given", () => {
  const svg = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
  const BROKEN = `<html><head><title>Broken & <b>bold</b></title>
<body><header><a href="https://www.example.com/"><img src=logo.png alt="Fish &amp; Chips" class=logo></a>
<h1>Unclosed heading <span>with span
<p>Para one<p>Para two
<img src="javascript:alert(1)" alt="logo">
<img src='data:image/svg+xml;base64,${btoa(svg)}' alt="Brand mark">
<img src="data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%204%204%22%3E%3Ccircle%20r%3D%222%22%2F%3E%3C%2Fsvg%3E" class="brand">
<svg class="logo"><rect width="10" height="10"/>
<a href="javascript:void(0)" class=btn>Go!</a>
<script>unterminated`;

  test("is read the way a browser forgives it", () => {
    const signals = scanHtml(BROKEN, "https://www.example.com/shop/");
    expect(signals.title).toBe("Broken & <b>bold</b>");
    expect(signals.headings[0]!.startsWith("Unclosed heading with span")).toBe(true);
    const logos = signals.logos;
    expect(logos[0]).toMatchObject({
      url: "https://www.example.com/shop/logo.png",
      alt: "Fish & Chips",
      source: "img",
    });
    // No javascript: anything; SVG data URLs become markup, never addresses.
    expect(logos.some((logo) => logo.url?.startsWith("javascript"))).toBe(false);
    const marks = logos.filter((logo) => logo.svg);
    expect(marks.map((logo) => logo.svg)).toEqual([
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><circle r="2"/></svg>',
    ]);
    expect(marks.every((logo) => logo.url === null)).toBe(true);
    expect(signals.text).toContain("Para two");
  });

  test("never throws, whatever it's given", () => {
    for (const html of [
      "",
      "<",
      "<<<>>>",
      "<!--",
      "<![CDATA[",
      "<div class='unterminated",
      "</div></div></p>",
      "<img src=>",
      "<a href='&#xFFFFFFF;'>x</a>",
      "<svg><svg><svg>",
      "<script type=application/ld+json>{not json}</script>",
      "<script type=application/ld+json>[[[[[[[[[[[[[[[[[[[]]]]]]]]]]]]]]]]]]]</script>",
      "<div>".repeat(5000) + "deep" + "</div>".repeat(5000),
      "x".repeat(3_000_000),
      undefined as unknown as string,
    ])
      expect(() => scanHtml(html, "https://example.com/")).not.toThrow();
    expect(scanHtml("<p>hi</p>", "not a url").text).toBe("hi");
    expect(scanHtml("<img src='/a.png' class=logo>", "not a url").logos).toEqual([]);
  });

  test("a big page is read quickly", () => {
    const card = (index: number) =>
      `<div class="card"><h3>Card ${index}</h3><img src="/img/${index}.jpg" width="400" height="300"><a class="btn" href="/p/${index}">Buy ${index % 20}</a><p>Some &amp; text</p></div>`;
    const html = `<html><body>${Array.from({ length: 12_000 }, (_, index) => card(index)).join("")}</body></html>`;
    const started = Date.now();
    const signals = scanHtml(html, "https://example.com/");
    expect(Date.now() - started).toBeLessThan(5000);
    expect(signals.headings).toHaveLength(12);
    expect(signals.ctas).toHaveLength(16);
    expect(signals.images).toHaveLength(12);
    expect(signals.text.length).toBeLessThanOrEqual(8000);
  });

  test("entities decode, numeric and named", () => {
    expect(
      decodeEntities("A &amp; B &lt;3 &#39;x&#x27; &apos;&nbsp;&hellip;&ndash;&bogus; &#0;"),
    ).toBe("A & B <3 'x' ' …–&bogus; �");
  });
});

describe("a site that keeps every picture in a brand folder", () => {
  // As aurixasystems.com.au does: the lockup in the home link, the symbol
  // labelled a logo, and content pictures that merely live under /brand/.
  const page = scanHtml(
    `<!doctype html><html><head><title>Aurixa Systems</title></head><body>
<header><a aria-label="Aurixa Systems home" href="/"><img src="/brand/aurixa-lockup.webp" alt="Aurixa Systems" width="480" height="160"></a></header>
<main>
  <section><img src="/brand/layer-01-operational-intelligence.webp" alt="Operational Intelligence" loading="lazy"></section>
  <section><img src="/brand/layer-02-strategic-intelligence.webp" alt="Strategic Intelligence" loading="lazy"></section>
  <div class="cta"><img src="/brand/aurixa-symbol-192.webp" alt="Aurixa Systems logo" width="96" height="96"></div>
  <img src="/assets/partner-wordmark.svg" alt="Partner" width="200" height="60">
</main></body></html>`,
    "https://aurixasystems.com.au/",
  );

  test("its pictures are imagery, not logos", () => {
    const images = page.images.map((image) => image.url);
    expect(images).toContain(
      "https://aurixasystems.com.au/brand/layer-01-operational-intelligence.webp",
    );
    expect(images).toContain(
      "https://aurixasystems.com.au/brand/layer-02-strategic-intelligence.webp",
    );
    expect(page.logos.some((logo) => logo.url?.includes("layer-0"))).toBe(false);
  });

  test("its logos are the ones the page marks as logos", () => {
    const logos = page.logos.map((logo) => logo.url);
    expect(logos[0]).toBe("https://aurixasystems.com.au/brand/aurixa-lockup.webp");
    expect(logos).toContain("https://aurixasystems.com.au/brand/aurixa-symbol-192.webp");
    // A file named as a wordmark counts too.
    expect(logos).toContain("https://aurixasystems.com.au/assets/partner-wordmark.svg");
  });
});
