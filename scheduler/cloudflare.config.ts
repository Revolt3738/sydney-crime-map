import {bindings, defineConfig, triggers} from "cf/config";

export default defineConfig({
  worker: {
    name: "sydney-crime-update-scheduler",
    entrypoint: "./src/index.mjs",
    compatibilityDate: "2026-11-10",
    workersDev: false,
    env: {GITHUB_DISPATCH_TOKEN: bindings.secret()},
    triggers: [triggers.scheduled({schedule: "17 2 15 * *"})],
  },
});
