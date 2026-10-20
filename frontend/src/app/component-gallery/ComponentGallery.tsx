import { useEffect, useState } from "react";

import { Badge } from "../../shared/ui/Badge";
import { Button } from "../../shared/ui/Button";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Card } from "../../shared/ui/Card";
import { Checkbox } from "../../shared/ui/Checkbox";
import { EmptyState, ErrorState, LoadingState, ReadOnlyNotice } from "../../shared/ui/feedback";
import { FormField } from "../../shared/ui/FormField";
import { IconButton } from "../../shared/ui/IconButton";
import { MetricCard } from "../../shared/ui/MetricCard";
import { Panel } from "../../shared/ui/Panel";
import { SectionHeader } from "../../shared/ui/SectionHeader";
import { Select } from "../../shared/ui/Select";
import { StatusChip } from "../../shared/ui/StatusChip";
import { Tabs } from "../../shared/ui/Tabs";
import { Textarea } from "../../shared/ui/Textarea";
import { TextInput } from "../../shared/ui/TextInput";
import { PageFrame } from "../../shared/ui/PageFrame";

export function ComponentGallery({ onOpenPalette }: { onOpenPalette: (button: HTMLButtonElement) => void }) {
  const [theme, setTheme] = useState<"dark" | "light">(() => document.documentElement.dataset.theme === "light" ? "light" : "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const setGalleryTheme = (next: "dark" | "light") => setTheme(next);

  return (
    <PageFrame onOpenPalette={onOpenPalette} subtitle="The reusable visual language used by Forge product surfaces." title="Component Gallery">
      <div className="component-gallery">
        <header className="gallery-intro">
          <div>
            <span className="eyebrow accent">UI-RFX-01 / INTERNAL</span>
            <h2>Reusable UI contracts</h2>
            <p>Interactive examples of the actual shared components. This route is available only during local Vite development.</p>
          </div>
          <div aria-label="Theme preview" className="gallery-theme-actions">
            <Button aria-label="Use dark theme" onClick={() => setGalleryTheme("dark")} variant={theme === "dark" ? "primary" : "secondary"}>Dark</Button>
            <Button aria-label="Use light theme" onClick={() => setGalleryTheme("light")} variant={theme === "light" ? "primary" : "secondary"}>Light</Button>
          </div>
        </header>

        <section aria-labelledby="actions-heading" className="gallery-section">
          <SectionHeader title="Actions" count="variants and states" />
          <div className="gallery-grid gallery-grid-actions">
            <Card><h3 id="actions-heading">Buttons</h3><div className="gallery-row"><Button variant="primary">Save changes</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button></div><div className="gallery-row"><Button disabled variant="primary">Disabled</Button><Button loading loadingLabel="Saving…" variant="primary">Save</Button><IconButton aria-label="Close example">×</IconButton></div></Card>
            <Card><h3>Badges and status</h3><div className="gallery-row"><Badge tone="accent">Accent</Badge><Badge tone="success">Success</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Danger</Badge><StatusChip label="Unknown status" status="unknown_status" /></div><p className="gallery-note">Domain status, display label and visual tone remain separate.</p></Card>
          </div>
        </section>

        <section aria-labelledby="presentation-heading" className="gallery-section">
          <SectionHeader title="Presentation" count="surfaces and metrics" />
          <div className="gallery-grid gallery-grid-metrics">
            <MetricCard detail="Local planning records" label="Projects" value="12" />
            <MetricCard detail="No evidence implied" label="Readiness" value="04" />
            <Panel><h3 id="presentation-heading">Panel</h3><p>Panels own layout surface only; feature semantics remain with the consumer.</p></Panel>
          </div>
        </section>

        <section aria-labelledby="forms-heading" className="gallery-section">
          <SectionHeader title="Form primitives" count="native semantics" />
          <Card className="gallery-form-card"><h3 id="forms-heading">Fields</h3><div className="gallery-form-grid"><FormField hint="Required" label="Project name"><TextInput aria-label="Gallery project name" placeholder="Forge planning" /></FormField><FormField label="Status"><Select aria-label="Gallery status" defaultValue="ready"><option value="ready">Ready</option><option value="draft">Draft</option></Select></FormField><FormField className="gallery-wide" label="Description"><Textarea aria-label="Gallery description" placeholder="Explain the planning context." rows={3} /></FormField><label className="gallery-check"><Checkbox aria-label="Include archived projects" /> Include archived projects</label></div></Card>
        </section>

        <section aria-labelledby="navigation-heading" className="gallery-section">
          <SectionHeader title="Navigation" count="context and current state" />
          <Card><h3 id="navigation-heading">Tabs</h3><Tabs aria-label="Gallery sections" items={[{ active: true, label: "Overview", to: "/__component-gallery" }, { label: "Details", to: "/__component-gallery#details" }]} /><Breadcrumbs items={[{ label: "Workspace", to: "/" }, { label: "Gallery", current: true }]} /></Card>
        </section>

        <section aria-labelledby="feedback-heading" className="gallery-section">
          <SectionHeader title="Feedback" count="loading, error, empty, read-only" />
          <div className="gallery-feedback-grid"><div><h3 id="feedback-heading">Loading</h3><LoadingState label="Loading components" /></div><div><h3>Error</h3><ErrorState message="The example request failed safely." onRetry={() => undefined} /></div><div><h3>Empty</h3><EmptyState action={<Button variant="secondary">Create first item</Button>} description="An honest empty state gives the next useful action." title="No components yet" /></div><div><h3>Read only</h3><ReadOnlyNotice>Archived project · read-only.</ReadOnlyNotice></div></div>
        </section>
      </div>
    </PageFrame>
  );
}
