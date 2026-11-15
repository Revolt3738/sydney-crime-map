import assert from "node:assert/strict";

const LEADER_COUNT = 10;
const EXISTING_PLACES = Object.freeze(["Chatswood", "Blacktown", "Kingsford", "Gosford"]);

function toPlace(row) {
  assert.ok(row.source && row.pop > 0);
  const slug = row.source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  return {slug, source: row.source, population: row.pop};
}

export function selectPlaces(rows) {
  const sorted = [...rows].sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0) || a.name.localeCompare(b.name, "en"));
  const leaders = sorted.slice(0, LEADER_COUNT).map(toPlace);
  const sources = new Set(leaders.map(place => place.source));
  const extras = EXISTING_PLACES.filter(source => !sources.has(source)).map(source => {
    const matches = rows.filter(row => row.source === source);
    assert.equal(matches.length, 1, `Expected one suburb named ${source}`);
    return toPlace(matches[0]);
  });
  const all = [...leaders, ...extras];
  assert.equal(new Set(all.map(place => place.slug)).size, all.length);
  return {leaders, extras, all};
}
