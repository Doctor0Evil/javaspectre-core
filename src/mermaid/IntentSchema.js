export const ExampleIntent = {
  kind: "DiagramIntent",
  profile: "citizen-simple",      // audience profile
  layout: {
    direction: "LR",
    layers: ["Core", "Safety", "Policy"]
  },
  motifs: [
    {
      name: "IngestClassifyGovernRegister",
      params: ["ingestId", "classifyId", "governId", "registerId"]
    }
  ],
  instances: [
    {
      motif: "IngestClassifyGovernRegister",
      args: {
        ingestId: "A",
        classifyId: "B",
        governId: "H",
        registerId: "I"
      },
      layerBindings: {
        A: "Core",
        B: "Core",
        H: "Policy",
        I: "Policy"
      }
    }
  ],
  constraints: {
    maxNodes: 40,
    maxEdges: 60,
    maxDepth: 6
  }
};
