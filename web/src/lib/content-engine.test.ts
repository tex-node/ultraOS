import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, renderTemplate, type GraphicData } from "./content-template";
import {
  renderContentPdf,
  renderGraphicPng,
  renderGraphicSvg,
} from "./content-renderers";

const graphic: GraphicData = {
  type: "RESULT_ANNOUNCEMENT",
  sourceId: "fixture-1",
  title: "Final Score",
  kicker: "Season Zero",
  headline: "Vortex 78-71 Flux",
  subheadline: "Player of the Game: Jane Doe",
  stats: [{ label: "Points", value: "24" }],
};

test("renderTemplate substitutes known values and clears missing values", () => {
  assert.equal(
    renderTemplate("{{club}} selects {{player}} {{missing}}", {
      club: "Vortex",
      player: "Jane Doe",
    }),
    "Vortex selects Jane Doe ",
  );
});

test("HTML template rendering escapes database values", () => {
  assert.equal(
    renderTemplate("<h1>{{title}}</h1>", { title: "<Final & Done>" }, escapeHtml),
    "<h1>&lt;Final &amp; Done&gt;</h1>",
  );
});

test("graphic renderers create valid SVG, PNG, and PDF output", async () => {
  const svg = renderGraphicSvg(graphic);
  assert.match(svg, /Vortex 78-71 Flux/);

  const png = await renderGraphicPng(graphic);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const pdf = await renderContentPdf(graphic.title, graphic.headline);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), "%PDF-");
});
