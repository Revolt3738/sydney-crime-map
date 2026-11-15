export default {
  worker: {
    name: "sydney-crime-map",
    compatibilityDate: "2026-11-10",
    workersDev: false,
    previewUrls: false,
    domains: ["sydcrime.xdxo.top"],
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        headSamplingRate: 1,
      },
      traces: {
        enabled: true,
        headSamplingRate: 0.01,
      },
    },
  },
};
