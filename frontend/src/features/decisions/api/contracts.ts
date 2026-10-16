export type DecisionStatus = "proposed" | "accepted" | "superseded";

export type Decision = {
  id: string;
  project_id: string;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives_considered: string | null;
  tradeoffs: string | null;
  status: DecisionStatus;
  superseded_by_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type DecisionRevision = {
  id: string;
  decision_id: string;
  revision: number;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives_considered: string | null;
  tradeoffs: string | null;
  status: DecisionStatus;
  superseded_by_id: string | null;
  created_at: string;
};

export type DecisionCreatePayload = {
  title: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives_considered?: string;
  tradeoffs?: string;
};
