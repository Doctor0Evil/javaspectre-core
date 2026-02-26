#!/usr/bin/env node
// Multi-line binary blob inspector for Javaspectre.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ExcavationSessionManager from '../core/ExcavationSessionManager.js';
import VirtualObjectScoreEngine from '../core/VirtualObjectScoreEngine.js';
import { BinaryLineReader } from '../binary/BinaryLineReader.js';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

function readText(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  return fs.readFileSync(abs, 'utf8');
}

function printUsage() {
  // eslint-disable-next-line no-console
  console.error(
    [
      'Usage: javaspectre-inspect-binary input.txt',
      '',
      'Scans a text file (logs, chat export, etc) for binary-like strings,',
      'turns them into virtual-objects, scores stability/novelty,',
      'and writes .javaspectre-inspect-binary-report.json.'
    ].join('\n')
  );
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    printUsage();
    process.exit(1);
  }

  const inputFile = args[0];
  let text;
  try {
    text = readText(inputFile);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to read file:', inputFile, String(err));
    process.exit(1);
  }

  const sessionManager = new ExcavationSessionManager({ maxDepth: 1, maxSnapshots: 4 });
  const scorer = new VirtualObjectScoreEngine({ historyWindow: 20 });
  const reader = new BinaryLineReader({});

  const sessionId = `binary-${path.basename(inputFile)}`;
  const session = sessionManager.startSession(sessionId, {
    source: inputFile,
    type: 'binary-text'
  });

  const result = reader.read(text, {
    sourceKind: 'binary-text-file',
    sourceId: inputFile
  });

  const snapshot = sessionManager.addSnapshot(session.id, {
    virtualObjects: result.virtualObjects,
    relationships: result.relationships,
    domSheets: []
  }, 'binary-scan');

  const scores = scorer.scoreSnapshot(snapshot);
  const report = {
    session: sessionManager.getSessionSummary(session.id),
    scores
  };

  const outPath = path.join(process.cwd(), '.javaspectre-inspect-binary-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  // eslint-disable-next-line no-console
  console.log('Binary excavation report written to', outPath);
}

if (import.meta.url === `file://${filename}`) {
  main();
}
