import { describe, expect, test } from "bun:test";
import { promptWarnings } from "../../src/lib/media/prompt-warnings";

const codes = (prompt: string) => promptWarnings(prompt).map((warning) => warning.code);

/** The approved 9:16 stage brief for the Briefing Room thumbnails: light, air and floor only. */
const STAGE_BRIEF =
  '{"task":"The stage for a 9:16 cover image of \'The Aurixa Operating System\', an Aurixa Systems video: a cinematic, premium, cutting-edge SaaS launch stage, the kind of light a flagship product is revealed in.","brand_kit":{"authority":"This kit governs the look and wins any conflict.","look":"In Aurixa Systems\'s brand look: Cinematic photographic-style enterprise interiors at night, deep navy and blue-black surfaces with metallic gold and selective cyan accents, low-key screen light and warm architectural rim lighting, focused professionals and dimensional analytical tools, structured wide views or oblique close-ups, reflective glass and metal, cool high-contrast grading and a controlled premium mood; colour palette of rich gold, deep cyan, soft gold and deep navy blue.","palette":["rich gold #c89b3c","deep cyan #00a8b5","deep navy blue #081629","blue black #040b16","dark slate blue #10233d","light cyan #5edde8","soft gold #d7b35f","white #ffffff","slate grey #9ca7b8","pale slate grey #aeb7c6"],"always":["Build scenes around deep navy and blue-black, with selective gold and cyan highlights."],"never":["lettering, signatures or fake interface text on papers and screens, pastel palettes, bright flat lighting, cartoon mascots, exaggerated neon effects, camera-facing stock-photo poses, chaotic layouts, unrelated science-fiction spectacle","Let luminous accents overwhelm the restrained palette."],"scope":"This image is the stage layer only. The finished cover places the product\'s real Command Centre, its five portals and all type over it, so the kit\'s subjects (professionals, analytical tools, panels, city settings) are supplied there and are not drawn here."},"layer":{"is":"An empty stage of light, air and floor.","so":"Draw no screens, panels, devices, furniture, architecture, city, people, emblems or shapes of any kind."},"layout":{"aspect_ratio":"9:16","key_light":"The source of the light sits on the horizon at 50% across and 72% down: a broad, soft burst of warm gold, as if from a powerful unseen source, its edges cooling into a fine cyan haze.","shafts":"A few soft volumetric light shafts fanning up and outward from that point, reaching about 40% down, very restrained.","floor":"A dark polished black-glass floor from 72% down, its far edge a thin, soft horizon line of gold at the centre fading to cyan at both sides, the light reflected in it as a long soft vertical gleam down the centre to the bottom edge.","top_third":"The top 36% stays deep, calm navy, darkening to near blue-black at the top edge: no light, flare or particles there.","air":"Faint haze from 40% to 72% down catching the light, with a sparse drift of fine gold and cyan dust motes near the source only.","edges":"A gentle vignette at the corners."},"stage":{"mood":"Hushed anticipation the moment before a reveal: deep, expensive, controlled.","light":"Low-key; one key light only, warm gold at its core, cyan at its rim; inky blue-black shadows everywhere else.","finish":"Photographic and cinematic: large-format camera, anamorphic softness, fine film grain, no banding, a cool high-contrast grade. Not illustration, not CGI plastic, not neon."},"text":"None anywhere: no letters, numbers, words, logos or symbols."}';

describe("what a prompt asks that a model gets wrong", () => {
  test("lettering: a quoted phrase, a headline or a logo", () => {
    const [warning] = promptWarnings('A billboard reading "Your business, your decision" at dusk.');
    expect(warning?.code).toBe("lettering");
    expect(warning?.found).toContain("Your business, your decision");
    expect(codes("A poster with a bold headline and the company logo.")).toEqual(["lettering"]);
    expect(promptWarnings("A poster with a bold headline and the company logo.")[0]?.found).toEqual(
      ["headline", "logo"],
    );
  });

  test("screens and documents come out lettered with gibberish", () => {
    expect(codes("An adviser at a laptop showing a dashboard with charts.")).toEqual(["screens"]);
    expect(promptWarnings("A sleek SaaS UI on a monitor.")[0]?.found).toEqual(["monitor", "UI"]);
  });

  test("naming an overlay draws it, even as a zone to leave empty or a thing not to draw", () => {
    // The Briefing Room stage brief that drew a play button.
    expect(codes('{"layout":{"play_button_zone":"keep the centre empty"}}')).toEqual(["overlay"]);
    expect(codes("Leave a clear space for the badge at the bottom.")).toEqual(["overlay"]);
    expect(codes("Soft light, and no play button.")).toEqual(["overlay"]);
  });

  test("a clause that already says no is not lettering or a screen asked for", () => {
    expect(
      codes(
        "An empty stage. Draw no screens, panels, devices or people; no text, letters, words or logos.",
      ),
    ).toEqual([]);
    expect(codes("A quiet harbour at dawn, without signs or lettering.")).toEqual([]);
  });

  test("the approved stage brief raises nothing", () => {
    expect(promptWarnings(STAGE_BRIEF)).toEqual([]);
  });

  test("an ordinary prompt raises nothing", () => {
    expect(
      codes("A calm harbour terrace at golden hour, a man in his thirties in black, cinematic."),
    ).toEqual([]);
    expect(promptWarnings("")).toEqual([]);
    // "apple", "headphones" and "uniform" are not apps, phones or a UI.
    expect(codes("An apple on a desk beside headphones; a guard in uniform.")).toEqual([]);
  });

  test("each warning names what raised it once, as written", () => {
    const [warning] = promptWarnings("A dashboard, another Dashboard and a third dashboard.");
    expect(warning?.found).toEqual(["dashboard"]);
  });
});
