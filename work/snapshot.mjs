import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {existsSync} from "node:fs";

export async function readSnapshot(directory) {
  const journal = new URL(".crime-update-pending.json", directory);
  const files = ["crime_data.json", "crime_period.json"].map(name => new URL(name, directory));
  assert.ok(!existsSync(journal), "Crime data update is incomplete; rerun the updater to recover");
  const first = await Promise.all(files.map(file => fs.readFile(file, "utf8")));
  const second = await Promise.all(files.map(file => fs.readFile(file, "utf8")));
  assert.ok(!existsSync(journal), "Crime data update is incomplete; rerun the updater to recover");
  assert.deepEqual(first, second, "Crime data changed during the build; rerun the build");
  return first;
}
