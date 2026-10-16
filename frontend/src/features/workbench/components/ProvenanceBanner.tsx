export function ProvenanceBanner({
  children = "Reported manually · observed and verified evidence are not available in FND-05.",
}: {
  children?: string;
}) {
  return (
    <aside className="fnd05-provenance">
      <span className="eyebrow accent">REPORTING BOUNDARY</span>
      <p>{children}</p>
    </aside>
  );
}
