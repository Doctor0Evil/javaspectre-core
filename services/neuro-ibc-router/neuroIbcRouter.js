// Central router that:
// - loads chain config (neuroChains.json)
// - loads policy (multichainNeuroIbcPolicy.json)
// - exposes /ibc_transfer and /gov_vote endpoints
// - forwards to per-chain signing/broadcast logic (e.g. Keplr tool server, or direct CosmJS)

import http from "http";
import { URL } from "url";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  SigningStargateClient,
  assertIsDeliverTxSuccess
} from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(
  __dirname,
  "..",
  "..",
  "agent",
  "config",
  "neuroChains.json"
);

const POLICY_PATH = path.join(
  __dirname,
  "..",
  "..",
  "agent",
  "policy",
  "multichainNeuroIbcPolicy.json"
);

const SERVER_CONFIG = {
  host: "0.0.0.0",
  port: 8788
};

function loadJson(pathname) {
  const raw = fs.readFileSync(pathname, "utf8");
  return JSON.parse(raw);
}

const chainConfig = loadJson(CONFIG_PATH);
const policy = loadJson(POLICY_PATH);

function getChainConfig(logicalName) {
  const entry = chainConfig.chains.find(
    (c) => c.logicalName === logicalName
  );
  if (!entry) {
    throw new Error(`Unknown chain logicalName: ${logicalName}`);
  }
  return entry;
}

function getChainPolicy(logicalName) {
  const entry = policy.chains[logicalName];
  if (!entry) {
    throw new Error(`No policy entry for chain: ${logicalName}`);
  }
  return entry;
}

async function createWalletFromMnemonic(mnemonic, prefix) {
  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
}

async function initSigningClientForChain(mnemonic, chainCfg) {
  const wallet = await createWalletFromMnemonic(
    mnemonic,
    chainCfg.bech32Prefix
  );
  const [account] = await wallet.getAccounts();
  const client = await SigningStargateClient.connectWithSigner(
    chainCfg.rpc,
    wallet
  );
  return { client, accountAddress: account.address };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function checkTransferPolicy(input) {
  const {
    sourceChain,
    destinationChain,
    amount,
    denom,
    biophysicalAsset = false,
    cyberneticAsset = false,
    humanApproved = false
  } = input;

  const global = policy.global || {};
  const srcPolicy = getChainPolicy(sourceChain);
  const dstPolicy = getChainPolicy(destinationChain);

  if (!srcPolicy.allowIbc) {
    throw new Error(`IBC not allowed from source chain: ${sourceChain}`);
  }
  if (
    srcPolicy.allowedCounterparties &&
    !srcPolicy.allowedCounterparties.includes(destinationChain)
  ) {
    throw new Error(
      `Destination chain ${destinationChain} not allowed from ${sourceChain}`
    );
  }

  if (
    srcPolicy.allowedDenoms &&
    !srcPolicy.allowedDenoms.includes(denom)
  ) {
    throw new Error(
      `Denom ${denom} not allowed on source chain ${sourceChain}`
    );
  }

  // Biophysical / cybernetic asset restrictions
  if (biophysicalAsset) {
    if (srcPolicy.forbidSecondaryMarketTradingOfBioAssets) {
      throw new Error(
        "Secondary market trading of biophysical assets forbidden by policy"
      );
    }
    if (srcPolicy.requireInstitutionalKYCForAnyBioAssetTx && !humanApproved) {
      throw new Error(
        "Biophysical asset transfer requires institutional KYC / human approval"
      );
    }
  }

  if (cyberneticAsset) {
    if (global.forbidSyntheticExposureToBiophysicalAssets) {
      // Placeholder hook for additional screening if needed.
    }
  }

  // Simple single-transfer threshold check
  if (global.maxSingleTransferAmount) {
    const max = BigInt(global.maxSingleTransferAmount);
    const amt = BigInt(amount);
    if (amt > max && !humanApproved) {
      throw new Error(
        "Transfer amount exceeds maxSingleTransferAmount and is not human-approved"
      );
    }
  }
}

async function handleIbcTransfer(req, res, stateMap) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = await readJsonBody(req);

  try {
    checkTransferPolicy(body);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message });
  }

  const {
    sourceChain,
    destinationChain,
    sourceChannel,
    toAddress,
    amount,
    denom,
    timeoutSeconds = 600,
    memo = ""
  } = body;

  const srcCfg = getChainConfig(sourceChain);

  try {
    let state = stateMap.get(sourceChain);
    if (!state) {
      const mnemonicEnvName = `COSMOS_MNEMONIC_${sourceChain.toUpperCase()}`;
      const mnemonic = process.env[mnemonicEnvName];
      if (!mnemonic) {
        throw new Error(
          `Missing mnemonic env var ${mnemonicEnvName} for chain ${sourceChain}`
        );
      }
      state = await initSigningClientForChain(mnemonic, srcCfg);
      stateMap.set(sourceChain, state);
    }

    const timeoutTimestampNanoseconds =
      BigInt(Date.now() + timeoutSeconds * 1000) * 1000000n;

    const result = await state.client.sendIbcTokens(
      state.accountAddress,
      toAddress,
      { amount: String(amount), denom },
      sourceChannel,
      "transfer",
      timeoutTimestampNanoseconds,
      "auto",
      memo
    );
    assertIsDeliverTxSuccess(result);
    return sendJson(res, 200, {
      ok: true,
      txHash: result.transactionHash,
      height: result.height
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: err.message || "IBC transfer failed"
    });
  }
}

async function handleGovVote(req, res, stateMap) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = await readJsonBody(req);
  const { chain, proposalId, voteOption, memo = "" } = body;

  try {
    const chainPol = getChainPolicy(chain);
    if (chainPol.role === "biophysical-research" && body.tags) {
      // Example: enforce special checks on biotech proposals tagged as high risk.
      if (body.tags.includes("high-biophysical-impact")) {
        if (body.requiresHumanApproval !== true) {
          throw new Error(
            "High biophysical impact proposals require explicit human approval"
          );
        }
      }
    }
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message });
  }

  const cfg = getChainConfig(chain);

  try {
    let state = stateMap.get(chain);
    if (!state) {
      const mnemonicEnvName = `COSMOS_MNEMONIC_${chain.toUpperCase()}`;
      const mnemonic = process.env[mnemonicEnvName];
      if (!mnemonic) {
        throw new Error(
          `Missing mnemonic env var ${mnemonicEnvName} for chain ${chain}`
        );
      }
      state = await initSigningClientForChain(mnemonic, cfg);
      stateMap.set(chain, state);
    }

    // Minimal example using governance MsgVote; your actual implementation can
    // use the protobuf message types from cosmjs/gov.
    const msg = {
      typeUrl: "/cosmos.gov.v1beta1.MsgVote",
      value: {
        proposalId: BigInt(proposalId),
        voter: state.accountAddress,
        option: voteOption
      }
    };

    const result = await state.client.signAndBroadcast(
      state.accountAddress,
      [msg],
      "auto",
      memo
    );
    assertIsDeliverTxSuccess(result);

    return sendJson(res, 200, {
      ok: true,
      txHash: result.transactionHash,
      height: result.height
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: err.message || "Governance vote failed"
    });
  }
}

async function createServer() {
  const stateMap = new Map();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === "/ibc_transfer") {
      return handleIbcTransfer(req, res, stateMap);
    }
    if (path === "/gov_vote") {
      return handleGovVote(req, res, stateMap);
    }

    return sendJson(res, 404, { error: "Not found" });
  });

  server.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
    console.log(
      `Neuro-IBC router listening on http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`
    );
  });
}

createServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
