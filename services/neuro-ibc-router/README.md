# Neuro-IBC Router: Chain Discovery

The Neuro-IBC router discovers ALN / Biotech / Organichain chain metadata using:

1. **Repo-local manifests** (`config/neuro_chain.json` in each chain repo).
2. **Optional live HTTP manifests** (`{restBase}/neuro_chain.json` from running nodes).

Both feed into `agent/config/neuroChains.json`, which is consumed by:

- `neuroIbcRouter.js` (IBC transfers, governance votes).
- The multi-chain **policy engine**, which enforces cybernetic/biophysical/spectral rules.

### Refresh from local repos

```bash
node services/neuro-ibc-router/scripts/syncFromRepos.js
