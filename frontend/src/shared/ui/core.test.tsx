import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Badge } from "./Badge";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { EmptyState, ErrorState, LoadingState, ReadOnlyNotice } from "./feedback";
import { FormField } from "./FormField";
import { IconButton } from "./IconButton";
import { Panel } from "./Panel";
import { SectionHeader } from "./SectionHeader";
import { Select } from "./Select";
import { Tabs } from "./Tabs";
import { Textarea } from "./Textarea";
import { TextInput } from "./TextInput";

describe("shared UI core contracts", () => {
  afterEach(() => cleanup());

  it("renders Button variants and exposes loading as a disabled control", () => {
    render(<Button loading variant="primary">Save</Button>);
    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button).toHaveClass("button", "primary");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("keeps IconButton accessible without imposing an icon meaning", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton aria-label="Close panel" onClick={onClick}>×</IconButton>);
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("associates form field help and errors with the supplied control", () => {
    render(
      <FormField error="Name is required." hint="Required" label="Name" id="name">
        <TextInput aria-label="Project name" />
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: "Project name" });
    expect(input).toHaveAttribute("aria-describedby", "name-hint name-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required.");
  });

  it("supports native field variants without hiding their semantics", () => {
    render(
      <>
        <Textarea aria-label="Description" />
        <Select aria-label="Status"><option>Ready</option></Select>
        <Checkbox aria-label="Include archived" />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Description" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include archived" })).toBeInTheDocument();
  });

  it("renders presentation and navigation variants with current-state semantics", () => {
    render(
      <BrowserRouter>
        <>
        <Panel><Badge tone="accent">Preview</Badge></Panel>
        <SectionHeader count="3" title="Projects" />
        <Tabs aria-label="Project sections" items={[{ label: "Overview", to: "/", active: true }, { label: "Board", to: "/board" }]} />
        <Breadcrumbs items={[{ label: "Workspace", to: "/" }, { label: "Project", current: true }]} />
        </>
      </BrowserRouter>,
    );
    expect(screen.getByText("Preview")).toHaveClass("badge", "accent");
    expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Project sections" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });

  it("provides feedback states with stable accessible roles", () => {
    const onRetry = vi.fn();
    render(
      <>
        <LoadingState label="Loading library" />
        <ErrorState message="Try again" onRetry={onRetry} />
        <EmptyState action={<Button onClick={() => undefined}>Create</Button>} description="Nothing here" title="Empty" />
        <ReadOnlyNotice>Archived project · read-only.</ReadOnlyNotice>
      </>,
    );
    expect(screen.getByRole("status", { name: "Loading library" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Try again");
    expect(screen.getByRole("heading", { name: "Empty" })).toBeInTheDocument();
    expect(screen.getByText("Archived project · read-only.")).toHaveAttribute("role", "status");
  });
});
