import assert from "node:assert/strict";
import {test} from "node:test";
import {checkAndRecover} from "../scheduler/src/index.mjs";

const TEST_TOKEN = "test-placeholder";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

function makeClient({state = "active", failMethod} = {}) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({url, options});
    const failed = options.method === failMethod;
    return {ok: !failed, status: failed ? HTTP_FORBIDDEN : HTTP_OK, json: async () => ({state})};
  };
  return {calls, request};
}

test("an active workflow is checked without dispatching another update", async () => {
  const client = makeClient();
  const result = await checkAndRecover({token: TEST_TOKEN, request: client.request});
  assert.deepEqual(result, {state: "active", action: "none"});
  assert.deepEqual(client.calls.map(call => call.options.method), ["GET"]);
  assert.match(client.calls[0].url, /\/Revolt3738\/sydney-crime-map\/actions\/workflows\/update-crime-data\.yml$/);
  assert.equal(client.calls[0].options.headers.Authorization, `Bearer ${TEST_TOKEN}`);
});

test("an inactivity-disabled workflow is enabled and dispatched on main", async () => {
  const client = makeClient({state: "disabled_inactivity"});
  const result = await checkAndRecover({token: TEST_TOKEN, request: client.request});
  assert.deepEqual(result, {state: "disabled_inactivity", action: "enabled_and_dispatched"});
  assert.deepEqual(client.calls.map(call => call.options.method), ["GET", "PUT", "POST"]);
  assert.match(client.calls[1].url, /\/update-crime-data\.yml\/enable$/);
  assert.match(client.calls[2].url, /\/update-crime-data\.yml\/dispatches$/);
  assert.equal(JSON.parse(client.calls[2].options.body).ref, "main");
});

for (const state of ["disabled_manually", "disabled_fork", "deleted"]) {
  test(`workflow state ${state} does not trigger automatic recovery`, async () => {
    const client = makeClient({state});
    await assert.rejects(checkAndRecover({token: TEST_TOKEN, request: client.request}), /manual review/);
    assert.deepEqual(client.calls.map(call => call.options.method), ["GET"]);
  });
}

test("a missing workflow state fails explicitly", async () => {
  const client = makeClient({state: null});
  await assert.rejects(checkAndRecover({token: TEST_TOKEN, request: client.request}), /state is missing or invalid/);
});

test("a missing token fails before contacting GitHub", async () => {
  const client = makeClient();
  await assert.rejects(checkAndRecover({token: "", request: client.request}), /not configured/);
  assert.equal(client.calls.length, 0);
});

test("network failures are reported", async () => {
  const request = async () => { throw new Error("connection failed"); };
  await assert.rejects(checkAndRecover({token: TEST_TOKEN, request}), /connection failed/);
});

for (const method of ["GET", "PUT", "POST"]) {
  test(`a failed ${method} request is reported and stops recovery`, async () => {
    const client = makeClient({state: "disabled_inactivity", failMethod: method});
    await assert.rejects(checkAndRecover({token: TEST_TOKEN, request: client.request}), /HTTP 403/);
    assert.equal(client.calls.at(-1).options.method, method);
  });
}
