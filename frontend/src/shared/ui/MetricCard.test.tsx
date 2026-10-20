import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricCard } from "./MetricCard";

describe("MetricCard", () => {
  it("preserves the metric-card contract for a div", () => {
    render(<MetricCard detail="Available locally" label="Workspaces" value="2" />);

    const card = screen.getByText("Workspaces").closest("div");
    expect(card).toHaveClass("metric-card");
    expect(card).toContainElement(screen.getByText("2", { selector: "strong" }));
    expect(card).toHaveTextContent("Available locally");
  });

  it("preserves article semantics when requested", () => {
    render(
      <MetricCard
        as="article"
        detail="Human-reported"
        label="Recorded runs"
        value={8}
      />,
    );

    expect(screen.getByText("Recorded runs").closest("article")).toHaveClass(
      "metric-card",
    );
  });
});
