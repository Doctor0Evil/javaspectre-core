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
Field definitions
logicalName
Short, unique name used by tools and agents (e.g. "aln", "biotech").

type
"cosmos" for Cosmos SDK chains, "overlay" for non-value networks like GhostNet.

chainId
Canonical chain-id used by nodes, Keplr, CosmJS.

rpc / rest
Public endpoints or internal ones (if router runs inside the cluster).

denom
Base staking / fee token denom (e.g. "boot", "ualn", "ubio").

bech32Prefix
Address prefix for this chain (e.g. "bostrom", "aln", "bio").

role
One of: "cognitive-governance", "agentic-economy", "neuro-semantic",
"bio-systems", "biophysical-research", "private-messaging" or a new
role you define in the policy engine.

defaultIbcChannels
Map of logicalName -> channelId for frequently used neighbors.

safetyProfile
High-level flags that tell the Neuro-IBC policy engine how strict to be:

biophysicalDomain: true if chain settles biophysical / biotech assets.

cyberneticDomain: true if chain covers neuro/cybernetic assets.

spectralAssetDomain: true if chain is used for spectral / cognitive assets.

Constraints
No chain may set biophysicalDomain: true and bypass human approval in the
global policy; the router will reject such configurations.

Chains must not declare asset domains they do not actually support.

The Neuro-IBC router treats this file as advisory plus auditable input;
enforcement happens in the central policy engine, not here.

text

This spec makes ALN/Biotech self-describing while leaving all hard enforcement in your central policy/policy JSON.[2]

***

## 2) Auto-sync script (pulls from ALN/Biotech repos → `neuroChains.json`)

**File:** `services/neuro-ibc-router/scripts/syncFromRepos.js`  
**Destination path:** `services/neuro-ibc-router/scripts/syncFromRepos.js`

```javascript
// services/neuro-ibc-router/scripts/syncFromRepos.js
// Auto-discovers chain metadata from ALN / Biotech / Organichain repos
// and merges them into agent/config/neuroChains.json in a safe, policy-aware way.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHAINS_CONFIG_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "agent",
  "config",
  "neuroChains.json"
);

// Local clone paths for chain repos (adjust to your layout).
const REPOS = [
  {
    logicalName: "aln",
    repoPath: path.join(__dirname, "..", "..", "..", "..", "ALN-Blockchain"),
    metadataFile: "config/neuro_chain.json"
  },
  {
    logicalName: "biotech",
    repoPath: path.join(__dirname, "..", "..", "..", "..", "Biotech"),
    metadataFile: "config/neuro_chain.json"
  },
  {
    logicalName: "organichain",
    repoPath: path.join(__dirname, "..", "..", "..", "..", "Organichain"),
    metadataFile: "config/neuro_chain.json"
  }
];

function loadJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function validateChainMetadata(meta, logicalName) {
  const requiredFields = [
    "logicalName",
    "type",
    "chainId",
    "rpc",
    "rest",
    "denom",
    "bech32Prefix",
    "role"
  ];

  for (const field of requiredFields) {
    if (!meta[field]) {
      throw new Error(
        `Chain ${logicalName} missing required field '${field}' in neuro_chain.json`
      );
    }
  }

  if (meta.logicalName !== logicalName) {
    throw new Error(
      `Chain logicalName mismatch: expected '${logicalName}', got '${meta.logicalName}'`
    );
  }

  if (meta.type !== "cosmos" && meta.type !== "overlay") {
    throw new Error(
      `Unsupported chain type '${meta.type}' for '${logicalName}'`
    );
  }

  // Safety: biophysicalDomain chains must have role aligned with bio domains.
  const sp = meta.safetyProfile || {};
  if (sp.biophysicalDomain && meta.role !== "biophysical-research" && meta.role !== "bio-systems") {
    throw new Error(
      `Chain '${logicalName}' has biophysicalDomain=true but role='${meta.role}'.`
    );
  }

  return meta;
}

function loadExistingNeuroChains() {
  if (!fs.existsSync(CHAINS_CONFIG_PATH)) {
    return {
      version: "1.0.0",
      chains: []
    };
  }
  const raw = fs.readFileSync(CHAINS_CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

function upsertChain(config, newChain) {
  const idx = config.chains.findIndex(
    (c) => c.logicalName === newChain.logicalName
  );
  if (idx === -1) {
    config.chains.push(newChain);
  } else {
    config.chains[idx] = {
      ...config.chains[idx],
      ...newChain
    };
  }
}

function syncFromRepos() {
  const config = loadExistingNeuroChains();
  let updated = false;

  for (const repo of REPOS) {
    const metaPath = path.join(repo.repoPath, repo.metadataFile);
    const meta = loadJsonSafe(metaPath);

    if (!meta) {
      // eslint-disable-next-line no-console
      console.warn(
        `[syncFromRepos] No neuro_chain.json found for ${repo.logicalName} at ${metaPath}`
      );
      continue;
    }

    try {
      const validated = validateChainMetadata(meta, repo.logicalName);
      upsertChain(config, validated);
      updated = true;
      // eslint-disable-next-line no-console
      console.log(
        `[syncFromRepos] Updated metadata for chain '${repo.logicalName}'`
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[syncFromRepos] Skipping chain '${repo.logicalName}': ${err.message}`
      );
    }
  }

  if (updated) {
    const serialized = JSON.stringify(config, null, 2);
    fs.mkdirSync(path.dirname(CHAINS_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CHAINS_CONFIG_PATH, serialized, "utf8");
    // eslint-disable-next-line no-console
    console.log(
      `[syncFromRepos] Wrote updated neuroChains.json to ${CHAINS_CONFIG_PATH}`
    );
  } else {
    // eslint-disable-next-line no-console
    console.log("[syncFromRepos] No changes to neuroChains.json");
  }
}

if (import.meta.url === `file://${__filename}`) {
  syncFromRepos();
}
This script:

Reads each repo’s config/neuro_chain.json.

Validates the fields and safety flags.

Merges them into agent/config/neuroChains.json in a controlled way.
​

You can run it via node services/neuro-ibc-router/scripts/syncFromRepos.js or wire it into a CI step.
