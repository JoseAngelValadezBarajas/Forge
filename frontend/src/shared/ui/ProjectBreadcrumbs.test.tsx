import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ProjectBreadcrumbs } from "./ProjectBreadcrumbs";

describe("ProjectBreadcrumbs", () => {
  it("exposes accessible links for the workspace, project and parent planning level", () => {
    render(
      <MemoryRouter>
        <ProjectBreadcrumbs
          current="Workspace planning"
          project={{ id: "project-1", name: "Forge" }}
          workspace={{ id: "workspace-1", name: "Local Workspace" }}
          parent={{ label: "Epics", to: "/projects/project-1/epics" }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Local Workspace" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Forge" })).toHaveAttribute(
      "href",
      "/projects/project-1",
    );
    expect(screen.getByRole("link", { name: "Epics" })).toHaveAttribute(
      "href",
      "/projects/project-1/epics",
    );
    expect(screen.getByText("Workspace planning")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
