const WORKFLOW_URL = "https://api.github.com/repos/Revolt3738/sydney-crime-map/actions/workflows/update-crime-data.yml";
const BRANCH = "main";
const GITHUB_API_VERSION = "2026-03-10";

async function githubRequest({token, request, method, suffix = "", body}) {
  const response = await request(`${WORKFLOW_URL}${suffix}`, {
    method,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "SydneyCrimeMapScheduler",
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${suffix || "workflow"} failed: HTTP ${response.status}`);
  return response;
}

export async function checkAndRecover({token, request}) {
  if (!token) throw new Error("GITHUB_DISPATCH_TOKEN is not configured");
  const response = await githubRequest({token, request, method: "GET"});
  const workflow = await response.json();
  if (!workflow || typeof workflow.state !== "string") throw new Error("GitHub workflow state is missing or invalid");
  if (workflow.state === "active") return {state: workflow.state, action: "none"};
  if (workflow.state !== "disabled_inactivity") {
    throw new Error(`GitHub workflow state requires manual review: ${JSON.stringify(workflow.state)}`);
  }
  await githubRequest({token, request, method: "PUT", suffix: "/enable"});
  await githubRequest({token, request, method: "POST", suffix: "/dispatches", body: {ref: BRANCH}});
  return {state: workflow.state, action: "enabled_and_dispatched"};
}

export default {
  async scheduled(_controller, env) {
    const result = await checkAndRecover({token: env.GITHUB_DISPATCH_TOKEN, request: fetch});
    console.log(JSON.stringify({event: "github_workflow_watchdog", ...result}));
  },
};
