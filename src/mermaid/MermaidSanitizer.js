// Normalizes Mermaid graphs and catches common syntax mistakes before rendering.

export class MermaidSanitizer {
  static normalize(raw) {
    if (typeof raw !== "string") {
      throw new Error("MermaidSanitizer.normalize expects a string.");
    }

    // Trim outer whitespace and normalize line endings.
    let text = raw.trim().replace(/\r\n/g, "\n");

    const lines = text.split("\n").map(line => line.trimEnd());

    // Ensure first non-empty line is the directive (e.g., 'flowchart TD').
    const nonEmptyIndex = lines.findIndex(l => l.trim().length > 0);
    if (nonEmptyIndex === -1) {
      throw new Error("MermaidSanitizer: empty diagram.");
    }

    const [firstWord, secondWord, ...rest] = lines[nonEmptyIndex].trim().split(/\s+/);
    if (firstWord !== "flowchart" && firstWord !== "graph") {
      throw new Error(
        `MermaidSanitizer: first non-empty line must start with 'flowchart' or 'graph', got '${firstWord}'.`
      );
    }
    if (!secondWord) {
      throw new Error("MermaidSanitizer: missing direction (e.g., 'TD', 'LR') after flowchart.");
    }
    if (rest.length > 0) {
      // Move any extra tokens to their own line to avoid parse errors like the one you saw.
      lines[nonEmptyIndex] = `${firstWord} ${secondWord}`;
      const restLine = rest.join(" ");
      lines.splice(nonEmptyIndex + 1, 0, restLine);
    }

    return lines.join("\n");
  }

  static quickValidate(normalized) {
    const lines = normalized.split("\n");

    const errors = [];

    if (!/^(flowchart|graph)\s+(TD|LR|BT|RL)\b/.test(lines[0].trim())) {
      errors.push("First line must be 'flowchart TD' or similar.");
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Common mistake: using quotes incorrectly in subgraph titles.
      if (line.startsWith("subgraph")) {
        const match = /^subgraph\s+([A-Za-z0-9_]+)\s+(.+)$/.exec(line);
        if (!match) {
          errors.push(
            `Line ${i + 1}: subgraph should look like 'subgraph ID Title', without extra quotes.`
          );
        }
      }
    }

    return {
      ok: errors.length === 0,
      errors
    };
  }
}

export default MermaidSanitizer;
