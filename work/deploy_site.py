import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEYRING_CHECK = (
    "gdbus", "call", "--session", "--dest", "org.freedesktop.secrets",
    "--object-path", "/org/freedesktop/secrets/aliases/default",
    "--method", "org.freedesktop.DBus.Properties.Get",
    "org.freedesktop.Secret.Collection", "Locked",
)
UNLOCKED = "(<false>,)"
CF = ROOT / "node_modules" / ".bin" / "cf"


def deploy(run, environment):
    status = run(KEYRING_CHECK, check=True, capture_output=True, text=True)
    if status.stdout.strip() != UNLOCKED:
        raise RuntimeError("The default OS keyring is unavailable or locked")
    env = {**environment, "CLOUDFLARE_AUTH_USE_KEYRING": "true"}
    run([str(CF), "deploy", "outputs/sydney-crime-seo"], cwd=ROOT, env=env, check=True)


if __name__ == "__main__":
    deploy(subprocess.run, os.environ)
