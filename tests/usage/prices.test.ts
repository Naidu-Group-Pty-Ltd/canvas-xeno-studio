import { describe, expect, test } from "bun:test";
import {
  meteredQuoteFor,
  outputImages,
  parseMeteredRates,
  parseUnitPrice,
  unitQuote,
  unitQuoteFor,
} from "../../src/lib/higgsfield/metered";

/** Sunburst's settings: two images a request at most, priced per image. */
const SUNBURST = [
  { key: "resolution", default: "2k" },
  { key: "batch_size", default: 1 },
];

describe("a flat price in a pricing description", () => {
  test("per image, in dollars, however it is written", () => {
    for (const description of [
      "$0.04 per image",
      "US$0.04 per output image",
      "0.04 USD per generated image",
      "Each image costs $0.04.",
      "Every output image is $0.04",
      "Images cost $0.04 each",
      "$0.04/image",
      "$0.04 for each image",
    ])
      expect(parseUnitPrice(description)).toEqual({ unit: "image", usd: 0.04, credits: null });
  });

  test("in credits, at 16 credits to the dollar unless another rate is given", () => {
    expect(parseUnitPrice("6 credits per image")).toEqual({
      unit: "image",
      usd: 0.375,
      credits: 6,
    });
    expect(parseUnitPrice("Each generation costs 10 credits")).toEqual({
      unit: "request",
      usd: 0.625,
      credits: 10,
    });
    expect(parseUnitPrice("8 credits per image", 20)).toMatchObject({ usd: 0.4, credits: 8 });
    // The same price in both: the dollars stand.
    expect(parseUnitPrice("8 credits ($0.50) per image")).toEqual({
      unit: "image",
      usd: 0.5,
      credits: 8,
    });
  });

  test("per request and per second", () => {
    expect(parseUnitPrice("$0.10 per request")).toMatchObject({ unit: "request", usd: 0.1 });
    expect(parseUnitPrice("One run is $1,250.00")).toMatchObject({ unit: "request", usd: 1250 });
    expect(parseUnitPrice("$0.05 per second of video")).toMatchObject({
      unit: "second",
      usd: 0.05,
    });
    expect(parseUnitPrice("4 credits per second")).toMatchObject({ unit: "second", usd: 0.25 });
  });

  test("never guesses: token rates, tiers, ranges and two prices aren't read", () => {
    for (const description of [
      "Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p",
      "Billed by OpenAI's token usage: $5 per 1M text input tokens, $40 per 1M image output tokens",
      "$0.04 per image at 1K, $0.08 per image at 2K",
      "$0.04 per image at 1080p",
      "From $0.04 per image",
      "Up to $0.20 per image",
      "Priced by resolution and quality",
      "$0.04 per image, $0.10 per request",
      "Costs $0.04",
      "$0.04 per minute",
      "Free",
      "",
    ])
      expect(parseUnitPrice(description)).toBeNull();
    expect(parseUnitPrice(null)).toBeNull();
  });

  test("the token form stays the metered parser's", () => {
    const tokens = "Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p";
    expect(parseMeteredRates(tokens)).not.toBeNull();
    expect(parseMeteredRates("$0.04 per image")).toBeNull();
  });
});

describe("what a request costs at a price per unit", () => {
  test("per image: the images it makes, as sent or by the model's default", () => {
    expect(outputImages(SUNBURST, {})).toBe(1);
    expect(outputImages(SUNBURST, { batch_size: 4 })).toBe(4);
    expect(outputImages([{ key: "num_images", default: 2 }], {})).toBe(2);
    expect(outputImages([], { batch_size: "nope" })).toBe(1);
    expect(
      unitQuoteFor({ description: "$0.17 per image", fields: SUNBURST, values: { batch_size: 4 } }),
    ).toEqual({ usd: 0.68, unit: "image", units: 4, unitUsd: 0.17 });
  });

  test("per request: once, whatever it makes", () => {
    expect(unitQuote({ unit: "request", usd: 0.3 }, SUNBURST, { batch_size: 4 })).toEqual({
      usd: 0.3,
      unit: "request",
      units: 1,
      unitUsd: 0.3,
    });
  });

  test("per second: its length as sent, else the default, else the longest allowed", () => {
    const fields = [{ key: "duration", default: 5, max: 10 }];
    expect(unitQuote({ unit: "second", usd: 0.05 }, fields, { duration: 8 })?.usd).toBe(0.4);
    expect(unitQuote({ unit: "second", usd: 0.05 }, fields, {})?.usd).toBe(0.25);
    expect(unitQuote({ unit: "second", usd: 0.05 }, [{ key: "duration", max: 12 }], {})?.usd).toBe(
      0.6,
    );
    expect(unitQuote({ unit: "second", usd: 0.05 }, fields, { duration: "6s" })?.usd).toBe(0.3);
    // An image model has no length: no price per second can be worked out.
    expect(unitQuote({ unit: "second", usd: 0.05 }, SUNBURST, {})).toBeNull();
  });

  test("a description it doesn't follow prices nothing, and the token quote is unchanged", () => {
    expect(
      unitQuoteFor({ description: "Billed by usage", fields: SUNBURST, values: {} }),
    ).toBeNull();
    const quote = meteredQuoteFor({
      description: "Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p",
      fields: [{ key: "duration", max: 15 }],
      values: { resolution: "720p", aspect_ratio: "9:16", duration: 5 },
    });
    expect(quote?.usd).toBe(2.32);
  });
});
