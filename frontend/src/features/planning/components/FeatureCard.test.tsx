import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeatureCard } from "./FeatureCard";

const feature = {
  id: "feature-1",
  key: "FEAT-001",
  readable_id: "FEAT-001",
  project_id: "project-1",
  epic_id: "epic-1",
  title: "Navigation clarity",
  description: null,
  goal: null,
  priority: "high" as const,
  status: "done" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("FeatureCard status control", () => {
  afterEach(() => cleanup());

  it("offers an explicit status selector without wrapping Done to Backlog", () => {
    render(
      <MemoryRouter>
        <FeatureCard
          disabled={false}
          feature={feature}
          onStatusChange={vi.fn().mockResolvedValue(true)}
          epicTitle="Product clarity"
        />
      </MemoryRouter>,
    );

    const selector = screen.getByRole("combobox", { name: "Status for FEAT-001" });
    expect(selector).toHaveValue("done");
    expect(screen.getByText("Product clarity")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move .*Backlog/ })).not.toBeInTheDocument();
  });

  it("persists an explicit selection and reports a failed mutation without changing the value", async () => {
    const onStatusChange = vi.fn().mockResolvedValue(false);
    render(
      <MemoryRouter>
        <FeatureCard
          disabled={false}
          feature={feature}
          onStatusChange={onStatusChange}
          epicTitle="Product clarity"
        />
      </MemoryRouter>,
    );

    const selector = screen.getByRole("combobox", { name: "Status for FEAT-001" });
    fireEvent.change(selector, { target: { value: "verify" } });
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(feature, "verify"));
    expect(selector).toHaveValue("done");
  });
});
