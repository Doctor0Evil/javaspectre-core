-- Stores MermaidDiagramEnvelope records keyed by runId + timestamp.

CREATE TABLE IF NOT EXISTS diagram_envelopes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  runid            TEXT NOT NULL,
  timestamp        TEXT NOT NULL,
  mode             TEXT NOT NULL,
  intent           TEXT,
  profilename      TEXT NOT NULL,
  maxnodes         INTEGER NOT NULL,
  maxedges         INTEGER NOT NULL,
  maxsubgraphs     INTEGER NOT NULL,
  maxdepth         INTEGER NOT NULL,
  maxfanout        INTEGER NOT NULL,
  maxfanin         INTEGER NOT NULL,
  nodecount        INTEGER NOT NULL,
  edgecount        INTEGER NOT NULL,
  subgraphcount    INTEGER NOT NULL,
  diagrammaxdepth  INTEGER NOT NULL,
  tiers            TEXT NOT NULL,
  contenthash      TEXT NOT NULL,
  envelopejson     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diagram_envelopes_runid
  ON diagram_envelopes (runid);

CREATE INDEX IF NOT EXISTS idx_diagram_envelopes_timestamp
  ON diagram_envelopes (timestamp);
