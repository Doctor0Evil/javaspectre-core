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
