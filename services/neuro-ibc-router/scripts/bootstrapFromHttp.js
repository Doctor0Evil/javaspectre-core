// Optional: fetches chain metadata over HTTP from running nodes and updates neuroChains.json.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

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

// Chains that can publish metadata at {restBase}/neuro_chain.json
const HTTP_TARGETS = [
  {
    logicalName: "aln",
    restBase: "https://rest.aln.yourdomain"
  },
  {
    logicalName: "biotech",
    restBase: "https://rest.biotech.yourdomain"
  },
  {
    logicalName: "organichain",
    restBase: "https://rest.organichain.yourdomain"
  }
];

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (res) => {
        const { statusCode } = res;
        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`Request failed with status ${statusCode}`));
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const raw = Buffer.concat(chunks).toString("utf8");
            const json = JSON.parse(raw);
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", (err) => reject(err));
  });
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

async function bootstrapFromHttp() {
  const config = loadExistingNeuroChains();
  let changed = false;

  for (const target of HTTP_TARGETS) {
    const url = `${target.restBase.replace(/\/+$/, "")}/neuro_chain.json`;
    try {
      const meta = await httpGetJson(url);
      if (meta.logicalName !== target.logicalName) {
        throw new Error(
          `logicalName mismatch for ${target.logicalName} at ${url}`
        );
      }
      upsertChain(config, meta);
      changed = true;
      // eslint-disable-next-line no-console
      console.log(
        `[bootstrapFromHttp] Updated chain '${target.logicalName}' from ${url}`
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[bootstrapFromHttp] Skipping '${target.logicalName}': ${err.message}`
      );
    }
  }

  if (changed) {
    const serialized = JSON.stringify(config, null, 2);
    fs.mkdirSync(path.dirname(CHAINS_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CHAINS_CONFIG_PATH, serialized, "utf8");
    // eslint-disable-next-line no-console
    console.log(
      `[bootstrapFromHttp] Wrote updated neuroChains.json to ${CHAINS_CONFIG_PATH}`
    );
  } else {
    // eslint-disable-next-line no-console
    console.log("[bootstrapFromHttp] No changes to neuroChains.json");
  }
}

if (import.meta.url === `file://${__filename}`) {
  bootstrapFromHttp().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
