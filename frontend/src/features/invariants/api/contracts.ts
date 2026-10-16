export type InvariantStatus = "active" | "retired";

export type Invariant = {
  id: string;
  project_id: string;
  feature_id: string | null;
  title: string;
  statement: string;
  rationale: string;
  status: InvariantStatus;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type ApplicableInvariant = Invariant & {
  acknowledged_revision: number | null;
  acknowledged_at: string | null;
  needs_acknowledgement: boolean;
};

export type InvariantRevision = {
  id: string;
  invariant_id: string;
  revision: number;
  title: string;
  statement: string;
  rationale: string;
  status: InvariantStatus;
  feature_id: string | null;
  created_at: string;
};

export type InvariantAcknowledgement = {
  id: string;
  feature_id: string;
  invariant_id: string;
  acknowledged_revision: number;
  acknowledged_at: string;
};

export type InvariantCreatePayload = {
  title: string;
  statement: string;
  rationale: string;
  feature_id?: string;
};

export type InvariantUpdatePayload = Partial<Omit<InvariantCreatePayload, "feature_id">>;
