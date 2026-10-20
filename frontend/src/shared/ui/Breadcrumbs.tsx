import { Fragment } from "react";
import { Link } from "react-router-dom";

export type BreadcrumbItem = { current?: boolean; label: string; to?: string };

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="project-breadcrumbs">
      <ol>
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && <li aria-hidden="true">/</li>}
            <li aria-current={item.current ? "page" : undefined}>
              {item.current || !item.to ? <span aria-current={item.current ? "page" : undefined}>{item.label}</span> : <Link to={item.to}>{item.label}</Link>}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
