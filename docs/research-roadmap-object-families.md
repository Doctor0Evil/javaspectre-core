# Javaspectre Research Roadmap – Virtual Object Families

This matrix defines priority phase, primary implementation language, mandatory linkage fields, and core research questions for each virtual-object family in the Javaspectre ecosystem.[file:3][file:2][file:1]

---

## Legend

- **Phase**
  - P1 – Sovereignty / identity / safety foundation
  - P2 – Excavation & motif discovery
  - P3 – Neuromorphic / XR & sustainability

- **Primary Language**
  - JS – JavaScript first (modeling, ALN, CLI, catalog)
  - RS – Rust first (performance, safety, anchoring)
  - JS→RS – Prototype in JS, then harden hot paths in Rust

- **Mandatory Linkage Fields (per family)**
  - `run_id` – Unique execution/run identifier
  - `node_id` – Unique node/device identifier
  - `did` – Decentralized identity of subject/controller
  - `bostrom_addr` – Bostrom / CosmWasm address
  - `content_hash` – SHA-256 (or stronger) hash of envelope or object
  - `motif_id` / `family_id` – Identifiers for motifs and motif families
  - `zone_id` – Logical/physical edge zone identifier

---

## P1 – Sovereignty, Identity, Safety, Transparency

### 1. SovereignExcavationProfile

- **Phase:** P1  
- **Primary Language:** RS (core engine), JS (ALN/CLI orchestration)  
- **Mandatory Linkage Fields:**
  - `profile_id`
  - `did`
  - `bostrom_addr`
  - `default_safety_profile_name`
  - `node_id`
- **Core Questions:**
  - How do different roles (citizen, admin, researcher) map to concrete safety budgets and redaction rules?
  - What is the minimal set of parameters that must be fixed (vs dynamic) for a given sovereign profile?
  - How should profile changes be versioned and anchored for auditability?

### 2. ExcavationSafetyProfile / SafetyPolicyShiftEvent

- **Phase:** P1  
- **Primary Language:** RS (budget enforcement), JS (policy modeling)  
- **Mandatory Linkage Fields:**
  - `profile_name`
  - `run_id`
  - `node_id`
  - `context.role`, `context.device_class`, `context.network_trust`
  - For shifts: `from_profile_name`, `to_profile_name`, `trigger_type`, `timestamp`
- **Core Questions:**
  - Which budget/threshold combinations keep edge devices safe while still yielding high-value discoveries?
  - How frequently do ALN-triggered profile shifts occur, and under what conditions should they be constrained?
  - How do confidence and drift thresholds affect the ratio of auto-use vs quarantine objects?

### 3. SovereignConsentLedgerEntry

- **Phase:** P1  
- **Primary Language:** JS→RS (policy in JS, anchoring in Rust)  
- **Mandatory Linkage Fields:**
  - `consent_id`
  - `did`
  - `scope_hash` (domains, data types, modes)
  - `status` (active, revoked, expired)
  - Optional: `anchor_manifest_id`
- **Core Questions:**
  - What scopes are practical for citizens to understand (domain, data category, device type)?
  - How should revocation propagate through existing runs and catalogs?
  - How strongly must consent entries be bound to TransparencyEnvelopes and anchors?

### 4. TransparencyEnvelope / TransparencyAnchorManifest / AnchoredEvidenceBundle

- **Phase:** P1  
- **Primary Language:** RS (hashing, serialization, SQLite), JS (construction and UI)  
- **Mandatory Linkage Fields:**
  - `run_id`
  - `did` (where applicable)
  - `safety_profile_name`
  - `mode`, `intent`
  - `content_hash`
  - For anchors: `chain_id`, `tx_hash`, `anchor_type`
  - For bundles: `bundle_id`, `envelope_ids[]`, `anchor_manifest_ids[]`
- **Core Questions:**
  - What minimal envelope schema supports regulatory, civic, and research audits without leaking unnecessary data?
  - How often should envelopes be anchored (per run, per bundle, per release)?
  - How should multi-ledger anchors be represented to preserve chain-agnostic semantics?

### 5. TrustTierCluster

- **Phase:** P1→P2  
- **Primary Language:** JS (exploratory clustering)  
- **Mandatory Linkage Fields:**
  - `cluster_id`
  - `tier` (auto-use, show-with-warning, quarantine)
  - `member_object_ids[]` (virtual-object ids)
  - `run_ids[]` (provenance)
- **Core Questions:**
  - How do trust tiers correlate with drift and stability metrics over time?
  - Can trust clusters be reused as policy primitives for ALN (“only use auto-use objects from cluster X”)?
  - How frequently do objects migrate between tiers, and what are the triggers?

---

## P2 – Excavation, Stability, Motifs, Atlases

### 6. DOMStabilitySignature

- **Phase:** P2  
- **Primary Language:** JS→RS (heuristics in JS, heavy DOM stream processing in Rust)  
- **Mandatory Linkage Fields:**
  - `dom_signature_hash`
  - `run_id`
  - `node_id`
  - `normalized_selector`
  - `stability_score`, `drift_score`
- **Core Questions:**
  - Which selector features (tag, role, data-* attributes) produce the most stable signatures?
  - How quickly do DOM signatures drift on real sites, and what patterns are most brittle?
  - How can stability metrics feed into reusable extraction modules and monitoring?

### 7. TraceStateMachineMotif

- **Phase:** P2  
- **Primary Language:** RS (FSM extraction from traces), JS (visualization and ALN)  
- **Mandatory Linkage Fields:**
  - `motif_id`
  - `fsm_hash`
  - `run_ids[]`
  - `service_name` / `system_domain`
- **Core Questions:**
  - What shapes of FSM (branching, loops) correlate with errors or instability?
  - How reusable are motifs across services and deployments?
  - How can motifs be linked to safety and sustainability decisions?

### 8. VirtualObjectMotifFamily

- **Phase:** P2  
- **Primary Language:** JS  
- **Mandatory Linkage Fields:**
  - `family_id`
  - `motif_ids[]` (DOM, trace, JSON schema motifs)
  - `domain_category` (login, checkout, dashboard, civic-form, etc.)
- **Core Questions:**
  - How many cross-system motif families emerge in practice (login, checkout, civic benefits, etc.)?
  - How stable are motif families over time and across domains?
  - Can motif families be used as ALN “macros” for system design?

### 9. MotifReuseLedgerEntry

- **Phase:** P2  
- **Primary Language:** JS→RS  
- **Mandatory Linkage Fields:**
  - `reuse_id`
  - `motif_id`
  - `target_repo`
  - `node_id`
  - `run_id`
  - `trust_tier_at_reuse`
- **Core Questions:**
  - Which motifs are most reused across repositories and nodes?
  - Are low-trust motifs being reused despite warnings?
  - How does reuse impact integrity and sustainability over time?

### 10. IntegrityDeviationSnapshot

- **Phase:** P2  
- **Primary Language:** JS (driven by IntegrityEngine), RS optional later  
- **Mandatory Linkage Fields:**
  - `snapshot_id`
  - `repo_id`
  - `run_id`
  - `severity`
  - `issue_types[]`
- **Core Questions:**
  - What integrity issues correlate with motif injection or refactoring?
  - How effective are automatic fixes at reducing long-term maintenance cost?
  - Which repositories maintain spectral purity over time?

---

## P3 – Neuromorphic / XR & Sustainability

### 11. EdgeZoneCognitiveOverlay

- **Phase:** P3  
- **Primary Language:** JS→RS (policy/UX in JS, critical control in Rust)  
- **Mandatory Linkage Fields:**
  - `zone_id`
  - `node_id`
  - `jetson_model` / `device_class`
  - `active_motif_ids[]`
  - `ambience_profile_id`
- **Core Questions:**
  - How should XR/audio overlay intensity adapt to power, safety, and consent constraints?
  - Which motifs are most useful for real-time smart-city guidance?
  - How can overlays remain explainable to citizens?

### 12. ExcavationEnergyProfile

- **Phase:** P3 (but instrumentable early)  
- **Primary Language:** RS (telemetry sampling), JS (reporting)  
- **Mandatory Linkage Fields:**
  - `run_id`
  - `node_id`
  - `device_class`, `jetson_model` (if applicable)
  - `mode` (json, dom, trace, har)
  - `energy_watt_seconds`
  - `bytes_transferred`
- **Core Questions:**
  - What is the energy cost per discovery (per virtual-object or motif)?
  - Which excavation strategies offer best “insight per joule”?
  - How should budgets incorporate energy constraints on edge nodes?

### 13. SustainabilityImpactScenario

- **Phase:** P3  
- **Primary Language:** JS (modeling), RS (numerical backends optional)  
- **Mandatory Linkage Fields:**
  - `scenario_id`
  - `domain` (smart-city, gov, personal)
  - `estimated_users`
  - `co2_delta_estimate`
  - `priority_score`
- **Core Questions:**
  - Which scenarios have the highest projected CO₂ reduction per engineering hour?
  - How do excavation findings change the scenario ranking?
  - How can the simulator guide ALN planning and funding decisions?

### 14. CitizenFacingExplainerPacket

- **Phase:** P3 (but derived from P1 artifacts)  
- **Primary Language:** JS  
- **Mandatory Linkage Fields:**
  - `packet_id`
  - `run_id`
  - `did` (viewer/subject)
  - `risk_level`
  - `actions_suggested[]`
- **Core Questions:**
  - What explanation formats best support comprehension for non-experts?
  - How do citizens respond to different risk and consent summaries?
  - Which packets trigger policy changes or consent updates?

### 15. ModeCanonicalizationMap

- **Phase:** P2→P3  
- **Primary Language:** JS  
- **Mandatory Linkage Fields:**
  - `adapter_name`
  - `adapter_version`
  - `raw_type` (dom, trace, har, json)
  - `canonical_schema_id`
- **Core Questions:**
  - How lossy is each adapter, and how does that affect downstream stability and trust?
  - Which canonical schemas should be considered “standard” across nodes?
  - How frequently do adapter upgrades change canonicalization outcomes?

---

## Implementation Priority Summary

- **Rust-first (engine-critical):**
  - SovereignExcavationProfile
  - ExcavationSafetyProfile / SafetyPolicyShiftEvent
  - TransparencyEnvelope / TransparencyAnchorManifest / AnchoredEvidenceBundle
  - TraceStateMachineMotif extractor
  - ExcavationEnergyProfile

- **JavaScript-first (modeling/ALN/UX):**
  - DOMStabilitySignature
  - VirtualObjectMotifFamily
  - TrustTierCluster
  - MotifReuseLedgerEntry
  - IntegrityDeviationSnapshot
  - EdgeZoneCognitiveOverlay
  - SustainabilityImpactScenario
  - CitizenFacingExplainerPacket
  - ModeCanonicalizationMap

All families must at least support `run_id` and `node_id` where applicable, with DID and ledger anchors mandatory for externally auditable objects.[file:1][file:3][file:2]
