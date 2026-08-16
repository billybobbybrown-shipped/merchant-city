// Panels organise their own content into pages. One strip, used inside a
// panel to switch between that panel's sections — never between panels.

export interface Tab {
  key: string;
  label: string;
}

export function tabStrip(tabs: Tab[], active: string): string {
  return `<div class="pg-nav">${tabs
    .map(
      (t) => `<button class="pg-tab${t.key === active ? " active" : ""}" data-tab="${t.key}">${t.label}</button>`
    )
    .join("")}</div>`;
}

export function wireTabs(root: HTMLElement, onSelect: (key: string) => void): void {
  root.querySelectorAll<HTMLElement>(".pg-tab").forEach((b) =>
    b.addEventListener("click", () => onSelect(b.dataset.tab!))
  );
}
