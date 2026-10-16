export function MultiSelect({
  label,
  items,
  selected,
  onChange,
  getId,
  getLabel,
}: {
  label: string;
  items: { id: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  getId?: (item: { id: string }) => string;
  getLabel: (item: { id: string }) => string;
}) {
  const id = getId ?? ((item: { id: string }) => item.id);
  return (
    <fieldset className="fnd06-multi">
      <legend>{label}</legend>
      {items.length ? (
        items.map((item) => {
          const value = id(item);
          return (
            <label className="fnd06-option" key={value}>
              <input
                checked={selected.includes(value)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, value]
                      : selected.filter((entry) => entry !== value),
                  )
                }
                type="checkbox"
              />
              <span>{getLabel(item)}</span>
            </label>
          );
        })
      ) : (
        <p className="muted-copy">No saved records available.</p>
      )}
    </fieldset>
  );
}
