import { useState } from "react";
import { type ContextPackage } from "../../../api";
import { contextSections, type ContextSectionId } from "./types";
import { asRecord, asRecords } from "./format";
import { ContextSectionContent } from "./ContextSectionContent";

export function PackagePreview({
  packageData,
  downloadBase,
}: {
  packageData: ContextPackage;
  downloadBase: (packageId: string, format: "json" | "markdown") => string;
}) {
  const [activeSection, setActiveSection] =
    useState<ContextSectionId>("overview");
  const payload = asRecord(packageData.payload);
  const readiness = payload.readiness ? asRecord(payload.readiness) : null;
  const observations = asRecords(payload.git_observations);
  const feature = asRecord(payload.feature);
  const saved = packageData.id !== null;
  return (
    <div aria-label="Context package preview" className="context-preview-shell">
      <div className="context-preview-header">
        <div>
          <span className="mono-label">{packageData.schema_version}</span>
          <h3>Feature context overview</h3>
          <div className="context-preview-tags">
            <span className="status-chip neutral">PLANNING DATA</span>
            <span className="status-chip neutral">
              {observations.length ? "GIT METADATA" : "NO GIT OBSERVATION"}
            </span>
            {readiness && (
              <span
                className={`status-chip ${readiness.outcome === "READY_TO_START" ? "active" : "archived"}`}
              >
                {String(readiness.outcome)}
              </span>
            )}
          </div>
        </div>
        <div className="context-preview-actions">
          {saved ? (
            <>
              <a
                className="button ghost"
                href={downloadBase(packageData.id!, "json")}
              >
                Download JSON
              </a>
              <a
                className="button ghost"
                href={downloadBase(packageData.id!, "markdown")}
              >
                Download Markdown
              </a>
            </>
          ) : (
            <span className="planning-disclaimer">
              Preview only · save to enable downloads
            </span>
          )}
          <code title={packageData.fingerprint}>
            SHA-256 {packageData.fingerprint.slice(0, 16)}…
          </code>
        </div>
      </div>
      <div className="context-preview-layout">
        <nav
          aria-label="Context package sections"
          className="context-preview-nav"
        >
          <span className="mono-label">CONTENTS</span>
          {contextSections.map((item) => (
            <button
              aria-current={activeSection === item.id ? "page" : undefined}
              className={activeSection === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <section
          aria-labelledby="context-preview-section-title"
          className="context-preview-content"
        >
          <div className="context-preview-content-heading">
            <div>
              <span className="mono-label">
                {String(feature.key ?? "FEATURE")} /{" "}
                {contextSections
                  .find((item) => item.id === activeSection)
                  ?.label.toUpperCase()}
              </span>
              <h4 id="context-preview-section-title">
                {
                  contextSections.find((item) => item.id === activeSection)
                    ?.label
                }
              </h4>
            </div>
            <span className="context-fingerprint">
              {packageData.fingerprint.slice(0, 12)}…
            </span>
          </div>
          <ContextSectionContent payload={payload} section={activeSection} />
        </section>
      </div>
      <p className="context-preview-footnote">
        Preview does not create history. Local paths and source content are
        excluded.
      </p>
    </div>
  );
}
