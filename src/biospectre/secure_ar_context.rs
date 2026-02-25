//! Secure AR & Augmented-Citizen Context for Biospectre / ALN
//!
//! This module is an organic_cpu-compatible biophysical-datashard that:
//! - Models B1/B2/B3/"?" biophysical objects from browser-like telemetry.
//! - Provides policy-driven envelopes for AR virtual objects.
//! - Anchors identity and object lifecycles to ALN / Googolswarm-compatible proofs.
//!
//! No SHA3, no BLAKE, no external hashing crates are used. All proofs rely on
//! small, auditable integer/CRC-like accumulators and hex encodings.

use std::collections::HashMap;
use std::time::{Duration, SystemTime};

/// High-level safety modes for an augmented citizen.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CitizenSafetyMode {
    Public,
    Private,
    Research,
}

/// B1: TelemetryHookSet – analytics & performance hooks active in the surface.
#[derive(Clone, Debug)]
pub struct TelemetryHookSet {
    pub hook_document: bool,
    pub hook_xhr: bool,
    pub hook_fetch: bool,
    pub hook_beacon: bool,
    pub hook_css: bool,
    pub hook_js: bool,
    pub hook_image: bool,
    pub hook_font: bool,
    pub hook_media: bool,
    /// Sample interval in milliseconds (e.g., 10 ms from Datadog config).
    pub sample_interval_ms: u64,
    /// Collection interval in milliseconds (e.g., 60000 ms from Datadog config).
    pub collect_interval_ms: u64,
    /// Minimum profile duration in milliseconds (e.g., 5000 ms).
    pub min_profile_duration_ms: u64,
    /// Minimum number of samples per profile (e.g., 50).
    pub min_samples: u32,
}

impl TelemetryHookSet {
    pub fn is_dense(&self) -> bool {
        self.sample_interval_ms <= 10 && self.min_samples >= 50
    }
}

/// B2: GlobalStateManifold – coarse view of sensory/event surfaces.
#[derive(Clone, Debug)]
pub struct GlobalStateManifold {
    pub has_xr: bool,
    pub has_pointer_events: bool,
    pub has_device_orientation: bool,
    pub has_scroll_events: bool,
    pub has_gamepad: bool,
    pub has_gpu: bool,
    pub user_agent: String,
    pub platform: String,
    pub vendor: String,
    pub max_touch_points: u8,
}

/// B3: IdentityShard – local identity tokens, to be anchored to ALN / chain.
#[derive(Clone, Debug)]
pub struct IdentityShard {
    pub browser_local_id: Option<String>,  // e.g., perplexitysingularcustomuserid
    pub browser_global_id: Option<String>, // e.g., globalsingularid
    pub cookie_summary: Vec<String>,       // e.g., ["psr=...", "ga=...", ...]
    pub bostrom_address: Option<String>,   // e.g., "bostrom18..."
    pub evm_address: Option<String>,       // e.g., "0x519f..."
}

/// ?: CrossOriginAnomaly – blocked cross-origin attempts observed in the surface.
#[derive(Clone, Debug)]
pub struct CrossOriginAnomaly {
    pub source_origin: String,
    pub target_origin: String,
    pub operation: String, // e.g., "read-top-window"
    pub count_blocked: u32,
}

/// CitizenXRProfile – augmented-citizen profile with safety preferences and proofs.
#[derive(Clone, Debug)]
pub struct CitizenXRProfile {
    pub did: String,
    pub safety_mode: CitizenSafetyMode,
    pub allow_high_frequency_sensors: bool,
    pub allow_cross_device_correlation: bool,
    pub allow_ar_ads: bool,
    pub governance_keys: Vec<String>,
    pub audit_trail_refs: Vec<String>, // Googolswarm TX IDs, ALN anchors, etc.
}

impl CitizenXRProfile {
    pub fn can_use_high_freq(&self) -> bool {
        self.allow_high_frequency_sensors
    }

    pub fn mode_label(&self) -> &'static str {
        match self.safety_mode {
            CitizenSafetyMode::Public => "CITIZEN_MODE_PUBLIC",
            CitizenSafetyMode::Private => "CITIZEN_MODE_PRIVATE",
            CitizenSafetyMode::Research => "CITIZEN_MODE_RESEARCH",
        }
    }
}

/// RuntimePolicy – per-domain / per-surface policy.
#[derive(Clone, Debug)]
pub struct RuntimePolicy {
    pub domain: String,
    pub allow_telemetry: bool,
    pub allow_cross_origin_introspection: bool,
    pub allowed_sdks: Vec<String>,
    pub citizen_mode: CitizenSafetyMode,
}

impl Default for RuntimePolicy {
    fn default() -> Self {
        Self {
            domain: "unknown".to_string(),
            allow_telemetry: false,
            allow_cross_origin_introspection: false,
            allowed_sdks: Vec::new(),
            citizen_mode: CitizenSafetyMode::Private,
        }
    }
}

/// Registry of per-domain policies.
#[derive(Clone, Debug, Default)]
pub struct RuntimePolicyRegistry {
    policies: HashMap<String, RuntimePolicy>,
}

impl RuntimePolicyRegistry {
    pub fn set_policy(&mut self, domain: &str, policy: RuntimePolicy) {
        self.policies.insert(domain.to_string(), policy);
    }

    pub fn policy_for(&self, domain: &str) -> RuntimePolicy {
        self.policies
            .get(domain)
            .cloned()
            .unwrap_or_else(|| RuntimePolicy {
                domain: domain.to_string(),
                ..RuntimePolicy::default()
            })
    }
}

/// Simple audit event structure, ready to map into Googolswarm proof logs.
#[derive(Clone, Debug)]
pub struct AuditEvent {
    pub kind: String,
    pub timestamp: SystemTime,
    pub details: HashMap<String, String>,
}

/// RuntimeIntrospectionSeal – blocks or audits risky operations.
#[derive(Clone)]
pub struct RuntimeIntrospectionSeal<F>
where
    F: Fn(AuditEvent) + Send + Sync + 'static,
{
    pub policy: RuntimePolicy,
    audit_fn: F,
}

impl<F> RuntimeIntrospectionSeal<F>
where
    F: Fn(AuditEvent) + Send + Sync + 'static,
{
    pub fn new(policy: RuntimePolicy, audit_fn: F) -> Self {
        Self { policy, audit_fn }
    }

    pub fn guard_cross_origin(&self, operation: &str, source: &str, target: &str) -> Result<(), String> {
        if !self.policy.allow_cross_origin_introspection {
            let mut details = HashMap::new();
            details.insert("operation".into(), operation.into());
            details.insert("source_origin".into(), source.into());
            details.insert("target_origin".into(), target.into());

            (self.audit_fn)(AuditEvent {
                kind: "cross-origin-block".into(),
                timestamp: SystemTime::now(),
                details,
            });

            return Err("Cross-origin introspection blocked by policy".into());
        }
        Ok(())
    }

    pub fn guard_telemetry(&self, sdk_name: &str, action: &str) -> bool {
        if !self.policy.allow_telemetry {
            let mut details = HashMap::new();
            details.insert("sdk".into(), sdk_name.into());
            details.insert("action".into(), action.into());

            (self.audit_fn)(AuditEvent {
                kind: "telemetry-block".into(),
                timestamp: SystemTime::now(),
                details,
            });

            return false;
        }

        self.policy.allowed_sdks.iter().any(|s| s == sdk_name)
    }
}

/// Minimal CRC-like hex proof generator for objects (no SHA/BLAKE).
fn crc32ish(bytes: &[u8]) -> u32 {
    let mut acc: u32 = 0xC0DE_B10D;
    for &b in bytes {
        acc = acc.rotate_left(5) ^ (b as u32);
        acc = acc.wrapping_mul(0x1F3D_5B79);
    }
    acc
}

fn to_hex32(v: u32) -> String {
    format!("{:08x}", v)
}

/// ARVirtualType – coarse type taxonomy.
#[derive(Clone, Debug)]
pub enum ARVirtualType {
    Portal,
    Marker,
    Overlay,
    GovernancePanel,
    SafetyBeacon,
}

/// Geometry – normalized spatial representation.
#[derive(Clone, Debug)]
pub struct Geometry {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub roll: f32,
    pub scale: f32,
}

/// LedgerAnchor – ALN / Googolswarm anchor for the object.
#[derive(Clone, Debug)]
pub struct LedgerAnchor {
    pub chain_id: String,   // e.g., "bostrom", "evm-mainnet", "googolswarm-meta"
    pub tx_id: String,      // transaction or proof hash (external)
    pub local_proof_hex: String, // crc32ish of local object summary for sanity.
}

/// ARVirtualObject – main AR-ready virtual object.
#[derive(Clone, Debug)]
pub struct ARVirtualObject {
    pub id: String,         // ALN or DID identifier
    pub owner: String,      // Bostrom or EVM address
    pub vtype: ARVirtualType,
    pub geometry: Geometry,
    pub policy_tags: Vec<String>,
    pub ledger_anchor: Option<LedgerAnchor>,
    pub created_at: SystemTime,
}

impl ARVirtualObject {
    pub fn local_proof(&self) -> String {
        let mut buf = Vec::new();
        buf.extend_from_slice(self.id.as_bytes());
        buf.extend_from_slice(self.owner.as_bytes());
        buf.extend_from_slice(format!("{:?}", self.vtype).as_bytes());
        buf.extend_from_slice(&self.geometry.x.to_le_bytes());
        buf.extend_from_slice(&self.geometry.y.to_le_bytes());
        buf.extend_from_slice(&self.geometry.z.to_le_bytes());
        to_hex32(crc32ish(&buf))
    }
}

/// SecureArContext – top-level biophysical datashard for AR/augmented-citizen.
pub struct SecureArContext<F>
where
    F: Fn(AuditEvent) + Send + Sync + 'static,
{
    pub domain: String,
    pub telemetry: TelemetryHookSet,   // B1
    pub manifold: GlobalStateManifold, // B2
    pub identity: IdentityShard,       // B3
    pub anomaly: Option<CrossOriginAnomaly>, // ?
    pub policy: RuntimePolicy,
    pub citizen_profile: CitizenXRProfile,
    pub seal: RuntimeIntrospectionSeal<F>,
}

impl<F> SecureArContext<F>
where
    F: Fn(AuditEvent) + Send + Sync + 'static,
{
    pub fn new(
        domain: &str,
        telemetry: TelemetryHookSet,
        manifold: GlobalStateManifold,
        identity: IdentityShard,
        anomaly: Option<CrossOriginAnomaly>,
        policy_registry: &RuntimePolicyRegistry,
        citizen_profile: CitizenXRProfile,
        audit_fn: F,
    ) -> Self {
        let policy = policy_registry.policy_for(domain);
        let seal = RuntimeIntrospectionSeal::new(policy.clone(), audit_fn);
        Self {
            domain: domain.to_string(),
            telemetry,
            manifold,
            identity,
            anomaly,
            policy,
            citizen_profile,
            seal,
        }
    }

    /// Whether high-frequency sensors like XR / pointer tracking are allowed.
    pub fn high_freq_allowed(&self) -> bool {
        self.citizen_profile.can_use_high_freq()
    }

    /// Create a virtual object if policy and citizen mode allow it.
    pub fn create_ar_object(
        &self,
        id: String,
        owner: String,
        vtype: ARVirtualType,
        geometry: Geometry,
        policy_tags: Vec<String>,
    ) -> Result<ARVirtualObject, String> {
        // Example: block AR overlays in PUBLIC mode if they aren't non-invasive.
        if let CitizenSafetyMode::Public = self.citizen_profile.safety_mode {
            let safe = policy_tags
                .iter()
                .any(|t| t == "safety:noninvasive" || t == "privacy:local-only");
            if !safe {
                return Err("Citizen mode PUBLIC requires noninvasive/local-only policy tags".into());
            }
        }

        let obj = ARVirtualObject {
            id,
            owner,
            vtype,
            geometry,
            policy_tags,
            ledger_anchor: None,
            created_at: SystemTime::now(),
        };

        (self.seal.audit_fn)(AuditEvent {
            kind: "ar-object-created".into(),
            timestamp: SystemTime::now(),
            details: {
                let mut d = HashMap::new();
                d.insert("id".into(), obj.id.clone());
                d.insert("owner".into(), obj.owner.clone());
                d.insert("mode".into(), self.citizen_profile.mode_label().into());
                d
            },
        });

        Ok(obj)
    }

    /// Attach an external ALN / Googolswarm anchor to an AR object.
    pub fn attach_anchor(&self, obj: &mut ARVirtualObject, chain_id: &str, tx_id: &str) {
        let local_hex = obj.local_proof();
        obj.ledger_anchor = Some(LedgerAnchor {
            chain_id: chain_id.to_string(),
            tx_id: tx_id.to_string(),
            local_proof_hex: local_hex,
        });
    }

    /// Generate a compact hex "session proof" for this context.
    ///
    /// This encodes:
    /// - domain
    /// - citizen mode
    /// - whether telemetry is dense
    /// - whether XR is present
    pub fn session_proof_hex(&self) -> String {
        let mut buf = Vec::new();
        buf.extend_from_slice(self.domain.as_bytes());
        buf.extend_from_slice(self.citizen_profile.mode_label().as_bytes());
        buf.push(if self.telemetry.is_dense() { 1 } else { 0 });
        buf.push(if self.manifold.has_xr { 1 } else { 0 });
        to_hex32(crc32ish(&buf))
    }
}
