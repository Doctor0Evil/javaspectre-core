export class HexProofInstance {
  constructor({ rawHex, proofKind, chainId, contentHash, meta }) {
    this.rawHex = rawHex;
    this.proofKind = proofKind;
    this.chainId = chainId;
    this.contentHash = contentHash;
    this.meta = meta || {};
  }
}

export class HexProofDefinition {
  constructor({
    kind,
    version,
    validationSchema,
    rustCodecId,
    policyTags,
  }) {
    this.kind = kind;
    this.version = version;
    this.validationSchema = validationSchema;
    this.rustCodecId = rustCodecId;
    this.policyTags = policyTags || [];
  }
}
