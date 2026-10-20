import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  it("renders a normalized status label and semantic class", () => {
    render(<StatusChip status="awaiting_handoff" />);

    const chip = screen.getByText("awaiting handoff");
    expect(chip).toHaveClass("status-chip", "awaiting_handoff");
  });

  it("preserves feature-specific styling hooks without changing the status", () => {
    render(<StatusChip className="fnd05-status" status="completed" />);

    expect(screen.getByText("completed")).toHaveClass(
      "status-chip",
      "fnd05-status",
      "completed",
    );
  });
});
