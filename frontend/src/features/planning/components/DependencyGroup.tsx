import { type FeatureDependency } from "../../../api";

export function DependencyGroup({
  labelText,
  items,
  resolve,
  onRemove,
  empty,
  disabled,
}: {
  labelText: string;
  items: FeatureDependency[];
  resolve: (id: string) => string;
  onRemove: (id: string) => Promise<boolean>;
  empty: string;
  disabled: boolean;
}) {
  return (
    <section className="dependency-group">
      <div className="section-heading">
        <h3>{labelText}</h3>
        <span>{items.length}</span>
      </div>
      {items.length ? (
        <ul className="dependency-list">
          {items.map((dependency) => (
            <li key={dependency.id}>
              <span>
                {resolve(
                  labelText === "Blocked by"
                    ? dependency.blocking_feature_id
                    : dependency.blocked_feature_id,
                )}
              </span>
              <button
                className="button ghost"
                disabled={disabled}
                onClick={() => void onRemove(dependency.id)}
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="quiet-empty-row">{empty}</div>
      )}
    </section>
  );
}
