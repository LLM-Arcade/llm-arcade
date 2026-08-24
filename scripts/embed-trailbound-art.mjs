import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const HTML = new URL("public/games/trailbound.html", ROOT);
const ASSETS = new URL("public/assets/games/trailbound/", ROOT);

const dataUri = (file) => {
  const bytes = readFileSync(new URL(file, ASSETS));
  return `data:image/png;base64,${bytes.toString("base64")}`;
};

const regionFiles = [
  "region-prairie.png",
  "region-riverlands.png",
  "region-mountain-pass.png",
  "region-golden-valley.png",
];
const eventFiles = {
  fort: "event-fort.png",
  river: "event-river-crossing.png",
  hunt: "event-hunt.png",
  storm: "event-storm.png",
  arrival: "event-arrival.png",
  camp: "event-camp.png",
  illness: "event-illness.png",
  brokenAxle: "event-broken-axle.png",
};
const publicAsset = (file) => `/assets/games/trailbound/${file}`;

const block = [
  `const REGION_SRCS = ${JSON.stringify(regionFiles.map(publicAsset))};`,
  `const EVENT_SRCS = ${JSON.stringify(Object.fromEntries(Object.entries(eventFiles).map(([key, file]) => [key, publicAsset(file)])))};`,
  `const WAGON_SHEET_SRC = ${JSON.stringify(dataUri("wagon-motion.png"))};`,
].join("\n");

const html = readFileSync(HTML, "utf8");
const sourceBlock = /const (?:PANO_SRC|REGION_SRCS) = [\s\S]*?;\r?\nconst (?:WAGON_SRC|WAGON_SHEET_SRC) = [^\r\n]+;/;
if (!sourceBlock.test(html)) {
  throw new Error("Trailbound art source block was not found");
}

writeFileSync(HTML, html.replace(sourceBlock, block));
