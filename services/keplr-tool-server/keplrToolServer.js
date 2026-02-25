// Javaspectre-style Keplr tool server: exposes minimal HTTP tools that your Rust/ALN agent can call.

import http from "http";
import { URL } from "url";
import {
  SigningStargateClient,
  assertIsDeliverTxSuccess,
} from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";

// In a browser dApp this signer would come from window.keplr; here we keep a server-side wallet
// for demonstration. In production, you replace this with Keplr's offline signer bridged via
// a browser session or injected signing service.
const CHAIN_CONFIG = {
  rpcEndpoint: "https://rpc-cosmoshub.keplr.app", // replace with your chain RPC
  prefix: "cosmos",
};

const SERVER_CONFIG = {
  host: "0.0.0.0",
  port: 8787,
};

async function createLocalWalletFromMnemonic(mnemonic) {
  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: CHAIN_CONFIG.prefix,
  });
}

async function initSigningClient(mnemonic) {
  const wallet = await createLocalWalletFromMnemonic(mnemonic);
  const [account] = await wallet.getAccounts();
  const client = await SigningStargateClient.connectWithSigner(
    CHAIN_CONFIG.rpcEndpoint,
    wallet,
  );
  return { client, accountAddress: account.address };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: "Method not allowed" });
}

async function handleHealth(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  sendJson(res, 200, { status: "ok", chain: CHAIN_CONFIG.rpcEndpoint });
}

async function handleGetAddress(req, res, state) {
  if (req.method !== "GET") return methodNotAllowed(res);
  sendJson(res, 200, { address: state.accountAddress });
}

async function handleSendTokens(req, res, state) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = await readJsonBody(req);
  const { toAddress, amount, denom, memo = "" } = body;

  if (!toAddress || !amount || !denom) {
    return sendJson(res, 400, {
      error: "Missing toAddress, amount, or denom",
    });
  }

  try {
    const result = await state.client.sendTokens(
      state.accountAddress,
      toAddress,
      [{ amount: String(amount), denom }],
      "auto",
      memo,
    );
    assertIsDeliverTxSuccess(result);
    sendJson(res, 200, {
      txHash: result.transactionHash,
      height: result.height,
    });
  } catch (err) {
    sendJson(res, 500, { error: err.message || "sendTokens failed" });
  }
}

async function handleDelegate(req, res, state) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = await readJsonBody(req);
  const { validatorAddress, amount, denom } = body;

  if (!validatorAddress || !amount || !denom) {
    return sendJson(res, 400, {
      error: "Missing validatorAddress, amount, or denom",
    });
  }

  try {
    const result = await state.client.delegateTokens(
      state.accountAddress,
      validatorAddress,
      { amount: String(amount), denom },
      "auto",
      "",
    );
    assertIsDeliverTxSuccess(result);
    sendJson(res, 200, {
      txHash: result.transactionHash,
      height: result.height,
    });
  } catch (err) {
    sendJson(res, 500, { error: err.message || "delegate failed" });
  }
}

async function createServer(state) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === "/health") {
      return handleHealth(req, res, state);
    }
    if (path === "/address") {
      return handleGetAddress(req, res, state);
    }
    if (path === "/send_tokens") {
      return handleSendTokens(req, res, state);
    }
    if (path === "/delegate") {
      return handleDelegate(req, res, state);
    }

    return notFound(res);
  });

  server.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
    console.log(
      `Keplr tool server listening on http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`,
    );
  });
}

async function main() {
  const mnemonic = process.env.COSMOS_MNEMONIC;
  if (!mnemonic) {
    console.error("COSMOS_MNEMONIC env var is required");
    process.exit(1);
  }

  const state = await initSigningClient(mnemonic);
  await createServer(state);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
