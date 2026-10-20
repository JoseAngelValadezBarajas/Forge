import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComponentGallery } from "./ComponentGallery";

describe("ComponentGallery", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.dataset.theme = "dark";
  });

  it("renders actual library examples and switches the theme", async () => {
    const user = userEvent.setup();
    render(<BrowserRouter><ComponentGallery onOpenPalette={vi.fn()} /></BrowserRouter>);

    expect(screen.getByRole("heading", { name: "Component Gallery" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByText("Unknown status")).toHaveClass("status-chip", "neutral");
    expect(screen.getByRole("heading", { name: "Form primitives" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByRole("button", { name: "Use dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
