import {bindings, defineConfig, triggers} from "cf/config";

const WATCHDOG_CRON = "17 3 16 * *";
const FULL_SAMPLING_RATE = 1;

export default defineConfig({
  worker: {
    name: "sydney-crime-update-scheduler",
    entrypoint: "./src/index.mjs",
    compatibilityDate: "2026-11-10",
    workersDev: false,
    observability: {
      enabled: true,
      logs: {enabled: true, headSamplingRate: FULL_SAMPLING_RATE},
      traces: {enabled: true, headSamplingRate: FULL_SAMPLING_RATE},
    },
    env: {GITHUB_DISPATCH_TOKEN: bindings.secret()},
    triggers: [triggers.scheduled({schedule: WATCHDOG_CRON})],
  },
});
