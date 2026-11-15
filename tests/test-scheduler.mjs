import assert from "node:assert/strict";
import {dispatchUpdate} from "../scheduler/src/index.mjs";

let observed;
await dispatchUpdate({
  token: "test-placeholder",
  request: async (url, options) => {
    observed = {url, options};
    return {ok: true};
  },
});
assert.match(observed.url, /\/Revolt3738\/sydney-crime-map\/actions\/workflows\/update-crime-data\.yml\/dispatches$/);
assert.equal(observed.options.method, "POST");
assert.equal(JSON.parse(observed.options.body).ref, "main");
assert.equal(observed.options.headers.Authorization, "Bearer test-placeholder");
await assert.rejects(dispatchUpdate({token: "", request: async () => ({ok: true})}), /not configured/);
await assert.rejects(dispatchUpdate({token: "test-placeholder", request: async () => ({ok: false, status: 403})}), /HTTP 403/);
console.log("Verified scheduler request and explicit failure handling.");
