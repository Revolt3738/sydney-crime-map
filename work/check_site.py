import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEST_TIMEOUT_SECONDS = 60


def main():
    tests = [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"]
    subprocess.run(tests, cwd=ROOT, check=True, timeout=TEST_TIMEOUT_SECONDS)
    commands = (["node", "tests/test-scheduler.mjs"], ["node", "tests/test-map-interactions.mjs"],
                ["node", "work/build_suburb_view.mjs"], ["node", "work/build-seo.mjs"],
                ["node", "work/test-seo-language.mjs"], [sys.executable, "work/validate-seo.py"])
    for command in commands:
        subprocess.run(command, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
