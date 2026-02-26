export const HexProofInstanceVO = {
  voKind: "HexProofInstance",
  shape: {
    rawHex: "string",
    proofKind: "string",      // e.g. "SleepFormula", "TxOwnership", "ALNAnchor"
    chainId: "string",        // e.g. "bostrom"
    contentHash: "string",
    meta: "Record<string, any>"
  },
  lifecycle: [
    "A.RawHexIngest",
    "B.RustHexCore",
    "C.HexProofNormalizer",
    "D.HexProofInstanceSurface"
  ]
};

export const HexProofDefinitionVO = {
  voKind: "HexProofDefinition",
  shape: {
    kind: "string",
    version: "string",
    validationSchema: "JSONSchema",   // applies to HexProofInstance.meta + base fields
    rustCodecId: "string",            // selects codec inside Rust core
    policyTags: "string[]"            // e.g. ["edge-safe","requires-governance"]
  },
  lifecycle: [
    "E.HexProofDefinitionAuthor",
    "F.HexProofDefinitionLoader",
    "G.QpuDatashardAnchor",
    "H.GovernanceApproval",
    "I.HexProofRegistry",
    "B2.RustHexCoreRuntimeView"
  ]
};

export const HexProofGraphNodes = [
  { id: "A", role: "RawHexIngest" },
  { id: "B", role: "RustHexCore" },
  { id: "C", role: "HexProofNormalizer" },
  { id: "D", role: "HexProofInstanceSurface", vo: "HexProofInstance" },
  { id: "E", role: "HexProofDefinitionAuthor", vo: "HexProofDefinition" },
  { id: "F", role: "HexProofDefinitionLoader" },
  { id: "G", role: "QpuDatashardAnchor" },
  { id: "H", role: "GovernanceApproval" },
  { id: "I", role: "HexProofRegistry" },
  { id: "B2", role: "RustHexCoreRuntimeView" }
];

export const HexProofGraphEdges = [
  { from: "A", to: "B",   kind: "flow", label: "submitRawHex" },
  { from: "B", to: "C",   kind: "flow", label: "decodeAndRoute" },
  { from: "C", to: "D",   kind: "flow", label: "emitHexProofInstance" },
  { from: "E", to: "F",   kind: "flow", label: "proposeDefinition" },
  { from: "F", to: "G",   kind: "flow", label: "anchorDefinition" },
  { from: "G", to: "H",   kind: "flow", label: "submitForGovernance" },
  { from: "H", to: "I",   kind: "flow", label: "approveAndRegister" },
  { from: "I", to: "B2",  kind: "flow", label: "loadDefinitionTable" },
  { from: "B2", to: "C",  kind: "flow", label: "selectDefinitionForProofKind" }
];
