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

export type DecisionRevision = Decision & { decision_id: string };

export type DecisionCreatePayload = {
  title: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives_considered?: string;
  tradeoffs?: string;
};
