import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "update-crime-data.yml"
COMMIT_STEP = "      - name: Commit changed data\n        run: |\n"
SCRIPT_INDENT = "          "
TIMEOUT_SECONDS = 60


def execute(command, *, cwd, env):
    result = subprocess.run(command, cwd=cwd, env=env, text=True, encoding="utf-8", capture_output=True,
                            timeout=TIMEOUT_SECONDS)
    if result.returncode:
        raise RuntimeError(f"{command[0]} failed ({result.returncode}):\n{result.stdout}\n{result.stderr}")
    return result.stdout.strip()


def workflow_script():
    text = WORKFLOW.read_text(encoding="utf-8")
    if text.count(COMMIT_STEP) != 1:
        raise ValueError("Expected exactly one workflow commit step")
    lines = text.split(COMMIT_STEP, 1)[1].splitlines()
    if any(line and not line.startswith(SCRIPT_INDENT) for line in lines):
        raise ValueError("Unexpected content after the workflow commit step")
    return "\n".join(line.removeprefix(SCRIPT_INDENT) for line in lines)


def seed_repository(directory, env):
    repo = directory / "repo"
    remote = directory / "remote.git"
    repo.mkdir()
    (repo / "work").mkdir()
    (repo / "outputs" / "sydney-crime-seo").mkdir(parents=True)
    (repo / "work" / "crime_data.json").write_text("initial", encoding="utf-8")
    (repo / "work" / "crime_period.json").write_text("initial", encoding="utf-8")
    (repo / "outputs" / "sydney-crime-seo" / "index.html").write_text("initial", encoding="utf-8")
    for command in (["git", "init", "-b", "main"], ["git", "config", "user.name", "Test"],
                    ["git", "config", "user.email", "test@example.invalid"],
                    ["git", "add", "."], ["git", "commit", "-m", "Initial snapshot"]):
        execute(command, cwd=repo, env=env)
    execute(["git", "init", "--bare", "-b", "main", str(remote)], cwd=directory, env=env)
    execute(["git", "remote", "add", "origin", str(remote)], cwd=repo, env=env)
    execute(["git", "push", "origin", "HEAD:main"], cwd=repo, env=env)
    return repo, remote


class WorkflowCommitTests(unittest.TestCase):
    @unittest.skipIf(os.name == "nt", "The GitHub commit step runs on an Ubuntu runner")
    def test_workflow_pushes_changed_data_and_skips_unchanged_data(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            env = {**os.environ, "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull}
            repo, remote = seed_repository(Path(directory), env)
            before = execute(["git", "rev-parse", "HEAD"], cwd=repo, env=env)
            script = ["bash", "--noprofile", "--norc", "-eo", "pipefail",
                      "-c", workflow_script()]
            output = execute(script, cwd=repo, env=env)
            self.assertIn("The official data has not changed.", output)
            self.assertEqual(execute(["git", "rev-parse", "HEAD"], cwd=repo, env=env), before)
            (repo / "work" / "crime_data.json").write_text("updated", encoding="utf-8")
            (repo / "work" / "crime_period.json").write_text("new period", encoding="utf-8")
            (repo / "outputs" / "sydney-crime-seo" / "index.html").write_text("new site", encoding="utf-8")
            execute(script, cwd=repo, env=env)
            remote_data = execute(["git", "--git-dir", str(remote), "show", "main:work/crime_data.json"],
                                  cwd=repo, env=env)
            remote_site = execute(["git", "--git-dir", str(remote), "show", "main:outputs/sydney-crime-seo/index.html"],
                                  cwd=repo, env=env)
            self.assertEqual(remote_data, "updated")
            self.assertEqual(remote_site, "new site")
            self.assertNotEqual(execute(["git", "rev-parse", "HEAD"], cwd=repo, env=env), before)


if __name__ == "__main__":
    unittest.main()
