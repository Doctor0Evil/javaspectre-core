use regex::Regex;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct ExcavationSafetyProfile {
    pub profile_name: String,

    // Hard resource limits per excavation run
    pub node_budget: u64,              // max DOM nodes processed
    pub trace_span_budget: u64,        // max OpenTelemetry-style spans
    pub deep_pass_budget: u64,         // max objects allowed into deep-pass analysis
    pub max_run_duration: Duration,    // soft max execution time per run

    // Confidence & drift thresholds (0.0–1.0)
    pub min_confidence_for_auto_use: f32,
    pub min_confidence_for_display: f32,
    pub max_drift_for_auto_use: f32,
    pub max_drift_for_citizen_ui: f32,

    // Compiled redaction patterns (lazy init possible in real usage)
    redact_patterns: Vec<Regex>,
}

impl Default for ExcavationSafetyProfile {
    fn default() -> Self {
        Self::new("default")
    }
}

impl ExcavationSafetyProfile {
    pub fn new(profile_name: &str) -> Self {
        let redact_patterns = vec![
            // US SSN-like: ###-##-####
            Regex::new(r"\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b").unwrap(),
            // 16-digit card-ish numbers
            Regex::new(r"\b[0-9]{16}\b").unwrap(),
            // Email addresses (case-insensitive)
            Regex::new(r"(?i)\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b").unwrap(),
        ];

        Self {
            profile_name: profile_name.to_string(),
            node_budget: 20_000,
            trace_span_budget: 50_000,
            deep_pass_budget: 2_000,
            max_run_duration: Duration::from_secs(15),
            min_confidence_for_auto_use: 0.85,
            min_confidence_for_display: 0.40,
            max_drift_for_auto_use: 0.20,
            max_drift_for_citizen_ui: 0.60,
            redact_patterns,
        }
    }

    /// Determines whether an object should enter the deep-pass stage.
    /// Uses a simple value-minus-cost heuristic.
    pub fn should_enter_deep_pass(&self, estimated_value_score: f32, cost_score: f32) -> bool {
        if self.deep_pass_budget == 0 {
            return false;
        }
        let decision_score = estimated_value_score - cost_score;
        decision_score >= 0.25
    }

    /// Classifies an object based on confidence and drift scores.
    /// Returns one of: "auto-use", "show-with-warning", "quarantine"
    pub fn classify_object(&self, confidence: f32, drift: f32) -> &'static str {
        if confidence >= self.min_confidence_for_auto_use && drift <= self.max_drift_for_auto_use {
            return "auto-use";
        }
        if confidence >= self.min_confidence_for_display && drift <= self.max_drift_for_citizen_ui {
            return "show-with-warning";
        }
        "quarantine"
    }

    /// Checks whether current usage statistics violate any hard/soft budgets.
    /// Returns `Ok(())` if within limits, or `Err(Vec<&str>)` listing violated budget names.
    pub fn enforce_budgets(
        &self,
        nodes: u64,
        spans: u64,
        deep_candidates: u64,
        run_duration: Duration,
    ) -> Result<(), Vec<&'static str>> {
        let mut violations = Vec::new();

        if nodes > self.node_budget {
            violations.push("nodeBudget");
        }
        if spans > self.trace_span_budget {
            violations.push("traceSpanBudget");
        }
        if deep_candidates > self.deep_pass_budget {
            violations.push("deepPassBudget");
        }
        if run_duration > self.max_run_duration {
            violations.push("maxRunSeconds");
        }

        if violations.is_empty() {
            Ok(())
        } else {
            Err(violations)
        }
    }

    /// Applies all redaction rules to the input text (in-place replacement).
    pub fn redact_text(&self, text: &str) -> String {
        let mut sanitized = text.to_string();
        for pattern in &self.redact_patterns {
            sanitized = pattern.replace_all(&sanitized, "[REDACTED]").to_string();
        }
        sanitized
    }
}

// Optional: convenience method for stats struct users
#[derive(Debug)]
pub struct ExcavationStats {
    pub nodes: u64,
    pub spans: u64,
    pub deep_candidates: u64,
    pub run_duration: Duration,
}

impl ExcavationSafetyProfile {
    pub fn check_stats(&self, stats: &ExcavationStats) -> Result<(), Vec<&'static str>> {
        self.enforce_budgets(
            stats.nodes,
            stats.spans,
            stats.deep_candidates,
            stats.run_duration,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redact_email_and_ssn() {
        let profile = ExcavationSafetyProfile::default();
        let input = "Contact user42@example.com or ssn 123-45-6789 and card 4111111111111111";
        let redacted = profile.redact_text(input);
        assert!(!redacted.contains("user42@example.com"));
        assert!(!redacted.contains("123-45-6789"));
        assert!(!redacted.contains("4111111111111111"));
        assert!(redacted.contains("[REDACTED]"));
    }

    #[test]
    fn test_deep_pass_decision() {
        let profile = ExcavationSafetyProfile::default();
        assert!(profile.should_enter_deep_pass(0.80, 0.40));   // 0.40 >= 0.25
        assert!(!profile.should_enter_deep_pass(0.60, 0.50));  // 0.10 < 0.25
        assert!(!profile.should_enter_deep_pass(0.90, 0.70));  // 0.20 < 0.25
    }

    #[test]
    fn test_classification() {
        let profile = ExcavationSafetyProfile::default();
        assert_eq!(profile.classify_object(0.90, 0.10), "auto-use");
        assert_eq!(profile.classify_object(0.70, 0.30), "show-with-warning");
        assert_eq!(profile.classify_object(0.50, 0.70), "quarantine");
    }
}
