import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "work"))

from deploy_site import CF, deploy


class DeploySiteTests(unittest.TestCase):
    def test_deploy_requires_keyring_and_sets_cloudflare_flag(self):
        calls = []

        def run(command, **options):
            calls.append((command, options))
            return SimpleNamespace(stdout="(<false>,)\n")

        deploy(run, {})
        self.assertEqual(calls[1][0], [str(CF), "deploy", "outputs/sydney-crime-seo"])
        self.assertEqual(calls[1][1]["env"]["CLOUDFLARE_AUTH_USE_KEYRING"], "true")

    def test_locked_keyring_stops_before_deploy(self):
        calls = []

        def run(command, **options):
            calls.append(command)
            return SimpleNamespace(stdout="(<true>,)\n")

        with self.assertRaisesRegex(RuntimeError, "keyring is unavailable or locked"):
            deploy(run, {})
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
