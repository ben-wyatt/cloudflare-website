// Find map coordinates for where each picked album's artist comes from, for the Liner Notes
// "Passport stamps" map, and save them to the remote D1 (record_places).
//   node scripts/geocode-places.mjs            (places not looked up yet)
//   node scripts/geocode-places.mjs --retry    (also places that were not found before)
//   node scripts/geocode-places.mjs --dry-run  (look up and print, save nothing)
// The place is the artist's MusicBrainz begin area and country from record_album_facts
// (run scripts/fetch-album-facts.mjs first). Each country also gets its own row, for
// artists with no begin area. Lookups use OpenStreetMap's Nominatim, which allows one
// request a second; only place names are sent.
import { d1Query, d1Write, sqlNumber, sqlText, wait } from "./lib/remote-d1.mjs";

const retry = process.argv.includes("--retry");
const dryRun = process.argv.includes("--dry-run");

const places = d1Query(`WITH artists AS (
    SELECT DISTINCT
      upper(trim(json_extract(f.facts_json, '$.artist.country'))) AS country,
      trim(coalesce(json_extract(f.facts_json, '$.artist.beginArea'), '')) AS area
    FROM record_album_facts f
    JOIN record_list_items li ON li.spotify_album_id = f.spotify_album_id
  ), wanted AS (
    SELECT country, area FROM artists WHERE country GLOB '[A-Z][A-Z]'
    UNION SELECT country, '' FROM artists WHERE country GLOB '[A-Z][A-Z]'
  )
  SELECT w.country, w.area FROM wanted w
  LEFT JOIN record_places p ON p.country = w.country AND p.area = w.area
  WHERE p.country IS NULL ${retry ? "OR p.lat IS NULL" : ""}
  ORDER BY w.country, w.area`);
console.log(`Looking up ${places.length} places.`);

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

async function search(query, countryCode) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  if (countryCode) url.searchParams.set("countrycodes", countryCode.toLowerCase());
  url.searchParams.set("q", query);
  const response = await fetch(url, {
    headers: { "user-agent": "record-club-places/1.0 (batch geocoder for a small private site)", "accept-language": "en" },
  });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  const [hit] = await response.json();
  // Only towns, regions and countries count: a consulate or a shop that shares the name does not.
  return hit && ["place", "boundary"].includes(hit.category)
    ? { lat: Number(hit.lat), lon: Number(hit.lon), displayName: hit.display_name }
    : null;
}

// MusicBrainz sometimes gives a begin area outside the artist's country (born in Ghana,
// based in Australia), so an area not found inside the country is looked up worldwide.
async function geocode({ country, area }) {
  if (!area) return search(regionNames.of(country) || country, country);
  const inCountry = await search(area, country);
  if (inCountry) return inCountry;
  await wait(1100);
  return search(area);
}

const updates = [];
let found = 0;
for (const place of places) {
  let hit = null;
  try {
    hit = await geocode(place);
  } catch (error) {
    console.warn(`  skipped ${place.area || "(country)"}, ${place.country}: ${error.message}`);
    await wait(1500);
    continue;
  }
  if (hit) found += 1;
  console.log(`  ${hit ? "✓" : "·"} ${place.area || "(country)"}, ${place.country}${hit ? `  ${hit.lat.toFixed(2)}, ${hit.lon.toFixed(2)}  ${hit.displayName}` : "  not found"}`);
  updates.push(`INSERT INTO record_places (country, area, lat, lon, display_name, fetched_at)
    VALUES (${sqlText(place.country)}, ${sqlText(place.area)}, ${hit ? sqlNumber(hit.lat) : "NULL"}, ${hit ? sqlNumber(hit.lon) : "NULL"},
      ${hit ? sqlText(hit.displayName) : "NULL"}, ${sqlText(new Date().toISOString())})
    ON CONFLICT(country, area) DO UPDATE SET lat = excluded.lat, lon = excluded.lon,
      display_name = excluded.display_name, fetched_at = excluded.fetched_at`);
  await wait(1100);
}
if (!dryRun && updates.length) d1Write(updates);
console.log(`Found ${found} of ${places.length}.${dryRun ? " Nothing saved (dry run)." : ""}`);
