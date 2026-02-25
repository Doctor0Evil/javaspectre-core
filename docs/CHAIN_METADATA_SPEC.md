# Neuro-IBC Chain Metadata Spec

This document defines the minimal, chain-local metadata that ALN, Biotech, Organichain and related Cosmos-style chains must expose so that the Neuro-IBC router can auto-discover and configure them without manual edits or policy violations.

## Purpose

- Provide a **stable, machine-readable format** for chain identity and endpoints.
- Allow a **safety/policy engine** to reason about each chain (role, risk domain).
- Keep IBC routing compatible with Keplr / CosmJS while enforcing ALN, cybernetic, biophysical, and spectral policies.

## Required file in each chain repo

Each chain repository MUST contain a JSON file at:

- `config/neuro_chain.json`

Example folder structure:

- `ALN-Blockchain/config/neuro_chain.json`
- `Biotech/config/neuro_chain.json`
- `Organichain/config/neuro_chain.json`

## JSON schema

```jsonc
{
  "logicalName": "aln",
  "type": "cosmos",                  // "cosmos" | "overlay" | future types
  "chainId": "aln-1",
  "rpc": "https://rpc.aln.yourdomain",
  "rest": "https://rest.aln.yourdomain",
  "denom": "ualn",
  "bech32Prefix": "aln",
  "role": "cognitive-governance",    // chain's role in the Neuro-IBC zone set
  "defaultIbcChannels": {
    "bostrom": "channel-17",
    "fetchhub": "channel-21"
  },
  "safetyProfile": {
    "biophysicalDomain": false,
    "cyberneticDomain": true,
    "spectralAssetDomain": true
  }
}
