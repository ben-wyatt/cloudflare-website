// Draw the country outlines for the Liner Notes world map as one SVG of strokes, which the
// page uses as a CSS mask so the lines take the theme's colour.
//   node scripts/build-world-map.mjs path/to/countries-110m.json
// The input is world-atlas's countries-110m.json (Natural Earth, public domain):
//   https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json
// Writes assets/images/world-outline.svg. Antarctica is left out.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MAP_HEIGHT, MAP_WIDTH, project } from "../functions/_shared/equal-earth.js";

const input = process.argv[2];
if (!input) throw new Error("Give the path to countries-110m.json.");
const topology = JSON.parse(readFileSync(input, "utf8"));
const { scale: [kx, ky], translate: [dx, dy] } = topology.transform;

// TopoJSON arcs are quantized and delta-encoded: undo both to get longitude and latitude.
const arcs = topology.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([stepX, stepY]) => {
    x += stepX;
    y += stepY;
    return [x * kx + dx, y * ky + dy];
  });
});
const ring = (indexes) => indexes.flatMap((index, position) => {
  const points = index >= 0 ? arcs[index] : [...arcs[~index]].reverse();
  return position ? points.slice(1) : points;
});

const paths = [];
for (const geometry of topology.objects.countries.geometries) {
  if (geometry.properties?.name === "Antarctica") continue;
  const polygons = geometry.type === "Polygon" ? [geometry.arcs] : geometry.type === "MultiPolygon" ? geometry.arcs : [];
  for (const polygon of polygons) {
    for (const indexes of polygon) {
      const coordinates = ring(indexes);
      const points = coordinates.map(([lon, lat]) => project(lon, lat));
      // Skip slivers too small to see at this size.
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      if (Math.max(...xs) - Math.min(...xs) < 1.2 && Math.max(...ys) - Math.min(...ys) < 1.2) continue;
      // Russia and Fiji cross the 180° meridian. Only outlines are drawn, so the line simply
      // breaks where it jumps to the other edge of the map, instead of streaking across it.
      const segments = [[]];
      coordinates.forEach(([lon], index) => {
        if (index && Math.abs(lon - coordinates[index - 1][0]) > 180) segments.push([]);
        segments.at(-1).push(points[index]);
      });
      for (const segment of segments) {
        let previous = "";
        const steps = [];
        for (const [x, y] of segment) {
          const step = `${x.toFixed(1)} ${y.toFixed(1)}`;
          if (step !== previous) steps.push(step);
          previous = step;
        }
        if (steps.length > 1) paths.push(`M${steps.join("L")}${segments.length === 1 ? "Z" : ""}`);
      }
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" width="${MAP_WIDTH}" height="${MAP_HEIGHT}">`
  + `<path d="${paths.join("")}" fill="none" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/></svg>\n`;
const output = fileURLToPath(new URL("../assets/images/world-outline.svg", import.meta.url));
writeFileSync(output, svg);
console.log(`Wrote ${output} (${paths.length} outlines, ${Math.round(svg.length / 1024)} KB, ${MAP_WIDTH}×${MAP_HEIGHT}).`);
