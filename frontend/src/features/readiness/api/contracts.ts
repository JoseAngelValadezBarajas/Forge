export type ReadinessReference = { kind: string; id: string; label?: string };

export type ReadinessBlocker = { code: string; message: string; references: ReadinessReference[] };

export type ReadinessRuleResult = {
  rule_id: string;
  rule_version: string;
  result: "passed" | "failed";
  explanation: string;
  blockers: ReadinessBlocker[];
  references: ReadinessReference[];
};

export type ReadinessEvaluation = {
  evaluation_id: string | null;
  feature_id: string;
  evaluated_at: string;
  rule_set_version: string;
  input_fingerprint: string;
  outcome: "READY_TO_START" | "NOT_READY";
  passed_checks: string[];
  failed_checks: string[];
  blockers: ReadinessBlocker[];
  results: ReadinessRuleResult[];
  stale: boolean;
};
