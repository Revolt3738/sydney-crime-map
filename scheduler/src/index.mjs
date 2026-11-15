const WORKFLOW_URL = "https://api.github.com/repos/Revolt3738/sydney-crime-map/actions/workflows/update-crime-data.yml/dispatches";
const BRANCH = "main";

export async function dispatchUpdate({token, request}) {
  if (!token) throw new Error("GITHUB_DISPATCH_TOKEN is not configured");
  const response = await request(WORKFLOW_URL, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "SydneyCrimeMapScheduler",
    },
    body: JSON.stringify({ref: BRANCH}),
  });
  if (!response.ok) throw new Error(`GitHub workflow dispatch failed: HTTP ${response.status}`);
}

export default {
  async scheduled(_controller, env) {
    await dispatchUpdate({token: env.GITHUB_DISPATCH_TOKEN, request: fetch});
  },
};
