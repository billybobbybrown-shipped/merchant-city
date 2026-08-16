// Native <select> renders with the operating system's own menu, which looks
// nothing like the rest of the game. This upgrades every select into a styled
// control WITHOUT changing any call site: the real <select> stays in the DOM
// as the source of truth, so `.value` reads and `change` listeners keep
// working exactly as before.

let openMenu: HTMLElement | null = null;

function closeOpen() {
  openMenu?.classList.remove("open");
  openMenu = null;
}

document.addEventListener("click", (ev) => {
  if (openMenu && !openMenu.contains(ev.target as Node)) closeOpen();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") closeOpen();
});

function enhance(sel: HTMLSelectElement) {
  if (sel.dataset.dd || !sel.parentNode) return;
  sel.dataset.dd = "1";

  // the wrapper takes the select's classes so existing layout rules (flex
  // sizing, widths) apply to the visible control
  const wrap = document.createElement("div");
  wrap.className = `dd ${sel.className}`.trim();
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dd-btn";
  const menu = document.createElement("div");
  menu.className = "dd-menu";
  wrap.append(btn, menu);

  const label = () => sel.options[sel.selectedIndex]?.text ?? "";
  const paint = () => {
    btn.innerHTML = `<span class="dd-label"></span><span class="dd-caret"></span>`;
    btn.querySelector(".dd-label")!.textContent = label();
    btn.disabled = sel.disabled;
  };

  const build = () => {
    menu.replaceChildren();
    [...sel.options].forEach((o, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `dd-item${i === sel.selectedIndex ? " active" : ""}`;
      item.textContent = o.text;
      item.addEventListener("click", (ev) => {
        ev.stopPropagation();
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        paint();
        closeOpen();
      });
      menu.appendChild(item);
    });
  };

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (sel.disabled) return;
    const wasOpen = wrap.classList.contains("open");
    closeOpen();
    if (wasOpen) return;
    build();
    // open upward when there isn't room below
    const room = window.innerHeight - wrap.getBoundingClientRect().bottom;
    wrap.classList.toggle("up", room < Math.min(240, sel.options.length * 32 + 8));
    wrap.classList.add("open");
    openMenu = wrap;
  });

  // keyboard: arrows step through values without opening the menu
  btn.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    ev.preventDefault();
    const next = sel.selectedIndex + (ev.key === "ArrowDown" ? 1 : -1);
    if (next < 0 || next >= sel.options.length) return;
    sel.selectedIndex = next;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    paint();
  });

  sel.addEventListener("change", paint);
  paint();
}

// panels re-render by replacing innerHTML, so watch for new selects rather
// than asking every panel to remember to call this
export function watchSelects(root: HTMLElement) {
  const sweep = (node: ParentNode) =>
    node.querySelectorAll?.("select:not([data-dd])").forEach((s) => enhance(s as HTMLSelectElement));
  sweep(root);
  new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.tagName === "SELECT") enhance(n as HTMLSelectElement);
        else sweep(n);
      }
  }).observe(root, { childList: true, subtree: true });
}
