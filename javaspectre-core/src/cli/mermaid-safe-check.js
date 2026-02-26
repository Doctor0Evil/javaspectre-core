// Safety-budgeted Mermaid checker wired into DiagramTransparencyStore.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { GraphSafetyProfile, MermaidSafetyKernel } from "../core/MermaidSafetyKernel.js";
import DiagramTransparencyStore from "../persistence/DiagramTransparencyStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readFileText(filePath) {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  return fs.readFileSync(abs, "utf8");
}

// Very lightweight parser stub; replace with mermaid-cli or tree-sitter AST later.
async function simpleMermaidParser(source) {
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  return { kind: "raw-mermaid", hash, source };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    // eslint-disable-next-line no-console
    console.error("Usage: node mermaid-safe-check.js <diagram.mmd> [intent]");
    process.exit(1);
  }

  const mermaidPath = args[0];
  const intent = args[1] ?? "mermaid-safety-check";

  const mermaidSource = await readFileText(mermaidPath);

  const profile = new GraphSafetyProfile({
    profileName: "mermaid-default-t1",
    maxNodes: 32,
    maxEdges: 96,
    maxSubgraphs: 4,
    maxDepth: 3,
    maxFanOutPerNode: 12,
    maxFanInPerNode: 12,
    context: {
      role: "citizen",
      deviceClass: "edge-unknown",
      networkTrust: "unknown",
      consentLevel: "minimal",
      locationHint: null,
    },
  });

  const kernel = new MermaidSafetyKernel({
    parser: simpleMermaidParser,
    graphSafetyProfile: profile,
  });

  const runId = crypto
    .createHash("sha256")
    .update(mermaidPath + Date.now().toString())
    .digest("hex")
    .slice(0, 16);

  try {
    const { ast, summary, envelope } = await kernel.validateAndSealDiagram(
      runId,
      mermaidSource,
      {
        intent,
        mode: "diagram-mermaid",
        authorDid: null,
        notes: [`source:${mermaidPath}`],
      }
    );

    const store = new DiagramTransparencyStore();
    await store.saveDiagramEnvelope(envelope);

    const report = {
      runId,
      file: mermaidPath,
      profile: profile.toJSON(),
      summary,
      contentHash: envelope.contentHash,
      astVersion: ast.version,
      kind: ast.kind,
    };

    const outPath = path.join(
      process.cwd(),
      `.javaspectre-mermaid-safe-${runId}.json`
    );
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

    // eslint-disable-next-line no-console
    console.log(`Mermaid diagram OK under profile '${profile.profileName}'.`);
    // eslint-disable-next-line no-console
    console.log(`Report: ${outPath}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Mermaid safety validation FAILED.");
    if (err.violations && Array.isArray(err.violations)) {
      for (const v of err.violations) {
        // eslint-disable-next-line no-console
        console.error(` - ${v}`);
      }
    } else {
      // eslint-disable-next-line no-console
      console.error(err.message);
    }
    process.exit(2);
  }
}

if (import.meta.url === `file://${__filename}`) {
  // eslint-disable-next-line no-floating-promises
  main();
}
