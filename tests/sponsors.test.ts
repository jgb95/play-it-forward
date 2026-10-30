import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SponsorReel } from "../src/SponsorReel.tsx";

test("headline logos remain sharp DOM images and reduced motion exposes the entire roster", () => {
  const html = renderToStaticMarkup(
    React.createElement(SponsorReel, {
      sponsors: {
        headline: [
          { name: "HRF", logo: "/sponsors/hrf.svg" },
          { name: "NYDIG", logo: "/sponsors/nydig.svg" },
        ],
        supporting: [{ name: "Workshop one" }, { name: "Workshop two" }],
        seconds: 8,
      },
      reduced: true,
    }),
  );
  assert.match(html, /alt="HRF"/);
  assert.match(html, /alt="NYDIG"/);
  assert.match(html, /Workshop one/);
  assert.match(html, /Workshop two/);
  assert.doesNotMatch(html, /<canvas/);
});
test("events without sponsors produce no empty presentation panel", () => {
  assert.equal(
    renderToStaticMarkup(React.createElement(SponsorReel, { reduced: false })),
    "",
  );
  assert.equal(
    renderToStaticMarkup(
      React.createElement(SponsorReel, {
        sponsors: { headline: [], supporting: [], seconds: 8 },
        reduced: false,
      }),
    ),
    "",
  );
});
