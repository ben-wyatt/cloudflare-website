// The Equal Earth map projection (Šavrič, Patterson and Jenny, 2018), sized to the Liner Notes
// world map. scripts/build-world-map.mjs draws the country outlines with it, and the Passport
// stamps slide places its pins with it, so the two always line up.
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;

// The map is 1000 units wide; Antarctica (below 60°S) is cut off.
export const MAP_WIDTH = 1000;
const SCALE = MAP_WIDTH / (2 * 2.7064737);
const TOP_LATITUDE = 84;
const BOTTOM_LATITUDE = -60;

function raw(lon, lat) {
  const lambda = (lon * Math.PI) / 180;
  const theta = Math.asin(M * Math.sin((lat * Math.PI) / 180));
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  return [
    (lambda * Math.cos(theta)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))),
    theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)),
  ];
}

const TOP = raw(0, TOP_LATITUDE)[1];
export const MAP_HEIGHT = Math.round((TOP - raw(0, BOTTOM_LATITUDE)[1]) * SCALE);

// Longitude and latitude in degrees to map units, with 0,0 at the top left.
export function project(lon, lat) {
  const [x, y] = raw(lon, Math.max(BOTTOM_LATITUDE, Math.min(TOP_LATITUDE, lat)));
  return [MAP_WIDTH / 2 + x * SCALE, (TOP - y) * SCALE];
}
