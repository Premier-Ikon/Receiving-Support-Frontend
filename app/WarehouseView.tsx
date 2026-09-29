"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { API_URL } from "./env";
import type {
  ShopifyProductMatch,
  WarehouseBin,
  WarehouseBinItem,
  WarehouseDepth,
  WarehouseLayout,
} from "./types";

const LOCAL_BINS = "pi-warehouse-bins";

const FALLBACK_LAYOUT: WarehouseLayout = {
  aisles: [
    {
      id: "A",
      label: "Aisle A",
      shelves: [
        { id: "A1", label: "Shelf 1", slots: 5 },
        { id: "A2", label: "Shelf 2", slots: 5 },
        { id: "A3", label: "Shelf 3", slots: 5 },
        { id: "A4", label: "Shelf 4", slots: 5 },
      ],
    },
    {
      id: "B",
      label: "Aisle B",
      shelves: [
        { id: "B1", label: "Shelf 1", slots: 5 },
        { id: "B2", label: "Shelf 2", slots: 5 },
        { id: "B3", label: "Shelf 3", slots: 5 },
        { id: "B4", label: "Shelf 4", slots: 5 },
      ],
    },
  ],
};

const COLOR_SWATCH: Record<string, string> = {
  black: "#1d1d1f",
  white: "#f5f5f7",
  ivory: "#f3ead8",
  cream: "#efe6d2",
  gray: "#8e8e93",
  grey: "#8e8e93",
  charcoal: "#4a4a4a",
  navy: "#1c3d73",
  blue: "#007aff",
  red: "#d70015",
  maroon: "#7a1f2b",
  green: "#248a3d",
  olive: "#6b7c3b",
  yellow: "#e6c229",
  gold: "#c9a227",
  orange: "#ff7a00",
  pink: "#e85aad",
  purple: "#7d5fff",
  brown: "#8b5a2b",
  tan: "#c8a882",
  khaki: "#c4b48a",
  natural: "#ddd0b6",
};

function swatch(color: string) {
  const key = color.toLowerCase();
  if (COLOR_SWATCH[key]) return COLOR_SWATCH[key];
  const hit = Object.keys(COLOR_SWATCH).find((name) => key.includes(name));
  return hit ? COLOR_SWATCH[hit] : "#c7c7cc";
}

function binIdFor(aisleId: string, shelfId: string, slot: number, depth: WarehouseDepth) {
  const shelfNo = String(shelfId).replace(aisleId, "") || "1";
  return `${aisleId}-${shelfNo}-${slot}-${depth}`;
}

function depthLabel(depth: WarehouseDepth) {
  return depth === "F" ? "Front" : "Back";
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" strokeLinecap="round" />
      <path d="M6.5 7 7.4 19.2A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7" />
      <path d="M10 11v5M14 11v5" strokeLinecap="round" />
    </svg>
  );
}

function itemKey(productId: string, color: string, size: string) {
  return `${productId}::${(color || "default").toLowerCase()}::${(size || "").toLowerCase()}`;
}

function looksLikeSize(value: string) {
  return /adult|youth|small|medium|large|x-?large|\b(xxs|xs|s|m|l|xl|\d?x+l|os)\b/i.test(value);
}

function itemSize(item: WarehouseBinItem) {
  if (item.size) return item.size;
  return looksLikeSize(item.color) ? item.color : "";
}

function itemColor(item: WarehouseBinItem) {
  const color = String(item.color || "").trim();
  if (color && color.toLowerCase() !== "default" && !looksLikeSize(color)) return color;
  const title = String(item.productTitle || "").toLowerCase();
  return Object.keys(COLOR_SWATCH).find((name) => title.includes(name)) || "";
}

function itemColors(items: WarehouseBinItem[]) {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const item of items) {
    const color = itemColor(item);
    if (!color) continue;
    const key = color.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(color);
  }
  return colors;
}

function loadLocalBins(): Record<string, WarehouseBin> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_BINS) || "{}") as Record<string, WarehouseBin>;
  } catch {
    return {};
  }
}

function optionGroups(product: ShopifyProductMatch) {
  const sizes = product.sizes || [];
  const colors = product.colors || [];
  if (sizes.length) return { colors, sizes };
  const sizeLike = colors.filter((entry) => looksLikeSize(entry.color));
  const colorLike = colors.filter((entry) => !looksLikeSize(entry.color));
  return {
    colors: colorLike,
    sizes: sizeLike.map((entry) => ({ size: entry.color, image: entry.image })),
  };
}

function persistLocalBins(bins: Record<string, WarehouseBin>) {
  window.localStorage.setItem(LOCAL_BINS, JSON.stringify(bins));
}

async function api(body: Record<string, unknown>) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    success?: boolean;
    error?: string;
    layout?: WarehouseLayout;
    bins?: Record<string, WarehouseBin>;
    products?: ShopifyProductMatch[];
    bin?: WarehouseBin;
  };
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Could not talk to warehouse API.");
  }
  return payload;
}

export default function WarehouseView() {
  const [layout, setLayout] = useState<WarehouseLayout | null>(null);
  const [bins, setBins] = useState<Record<string, WarehouseBin>>({});
  const [aisleId, setAisleId] = useState("A");
  const [find, setFind] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WarehouseBinItem[]>([]);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<ShopifyProductMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ShopifyProductMatch | null>(null);
  const [pickedColors, setPickedColors] = useState<string[]>([]);
  const [pickedSizes, setPickedSizes] = useState<string[]>([]);
  const [pickedQty, setPickedQty] = useState("1");
  const [editing, setEditing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [snapshot, setSnapshot] = useState<WarehouseBinItem[]>([]);
  const [mixConfirm, setMixConfirm] = useState<{ existing: string; incoming: string } | null>(null);

  const aisle = layout?.aisles.find((entry) => entry.id === aisleId) || layout?.aisles[0];
  const activeMeta = useMemo(() => {
    if (!activeId || !layout) return null;
    for (const nextAisle of layout.aisles) {
      for (const shelf of nextAisle.shelves) {
        for (let slot = 1; slot <= shelf.slots; slot += 1) {
          for (const depth of ["F", "B"] as WarehouseDepth[]) {
            if (binIdFor(nextAisle.id, shelf.id, slot, depth) === activeId) {
              return { aisle: nextAisle, shelf, slot, depth };
            }
          }
        }
      }
    }
    return null;
  }, [activeId, layout]);

  const findValue = find.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api({ action: "getWarehouse" })
      .then((payload) => {
        if (cancelled) return;
        setLayout(payload.layout || FALLBACK_LAYOUT);
        setBins(payload.bins || {});
        setAisleId(payload.layout?.aisles?.[0]?.id || "A");
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setLayout(FALLBACK_LAYOUT);
        setBins({});
        setError(err instanceof Error ? err.message : "Could not load warehouse from the server.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function openBin(id: string) {
    const items = bins[id]?.items || [];
    setActiveId(id);
    setDraft(items);
    setSearch("");
    setProducts([]);
    setPicked(null);
    setPickedColors([]);
    setPickedSizes([]);
    setPickedQty("1");
    setMixConfirm(null);
    setConfirmClear(false);
    setSnapshot(items);
    setEditing(!items.length);
    setError("");
  }

  function startEdit() {
    setSnapshot(draft);
    setEditing(true);
    setSearch("");
    setProducts([]);
    setPicked(null);
    setMixConfirm(null);
  }

  function cancelEdit() {
    setDraft(snapshot);
    setEditing(false);
    setSearch("");
    setProducts([]);
    setPicked(null);
    setMixConfirm(null);
    if (!snapshot.length) setActiveId(null);
  }

  async function searchProducts(event?: FormEvent) {
    event?.preventDefault();
    const query = search.trim();
    if (query.length < 2) return;
    setSearching(true);
    setError("");
    try {
      const payload = await api({ action: "searchProducts", query });
      setProducts(payload.products || []);
      setPicked(null);
      setPickedColors([]);
      setPickedSizes([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Product search failed.");
    } finally {
      setSearching(false);
    }
  }

  function pendingEntries() {
    if (!picked) return [];
    const groups = optionGroups(picked);
    const colors = groups.colors.length ? pickedColors : ["Default"];
    const sizes = groups.sizes.length ? pickedSizes : [""];
    const entries: WarehouseBinItem[] = [];
    for (const color of colors) {
      for (const size of sizes) {
        const colorway = groups.colors.find((entry) => entry.color === color);
        const sizeway = groups.sizes.find((entry) => entry.size === size);
        entries.push({
          id: itemKey(picked.id, color, size),
          productId: picked.id,
          productTitle: picked.title,
          image: colorway?.image || sizeway?.image || picked.image,
          color,
          size,
          qty: Number(pickedQty.replace(/[^\d]/g, "")) || 1,
        });
      }
    }
    return entries;
  }

  function canAdd() {
    if (!picked) return false;
    const groups = optionGroups(picked);
    if (groups.colors.length && !pickedColors.length) return false;
    if (groups.sizes.length && !pickedSizes.length) return false;
    return groups.colors.length + groups.sizes.length > 0;
  }

  function uniqueSizes(items: WarehouseBinItem[]) {
    return [...new Set(items.map(itemSize).filter(Boolean))];
  }

  function commitAdd() {
    const entries = pendingEntries();
    setDraft((current) => {
      const next = [...current];
      for (const entry of entries) {
        if (next.some((item) => item.id === entry.id)) continue;
        next.push(entry);
      }
      return next;
    });
    setPicked(null);
    setPickedColors([]);
    setPickedSizes([]);
    setPickedQty("1");
    setMixConfirm(null);
  }

  function addPickedToDraft() {
    if (!canAdd()) return;
    const incoming = uniqueSizes(pendingEntries());
    const existing = uniqueSizes(draft);
    const mixedIncoming = incoming.length > 1;
    const mismatch = incoming.find(
      (size) => existing.length > 0 && !existing.some((entry) => entry.toLowerCase() === size.toLowerCase())
    );
    if (mixedIncoming || mismatch) {
      setMixConfirm({ existing: existing.join(", "), incoming: incoming.join(", ") });
      return;
    }
    commitAdd();
  }

  async function saveActive() {
    if (!activeId) return;
    setSaving(true);
    setError("");
    try {
      const payload = await api({ action: "saveBin", binId: activeId, items: draft });
      if (payload.bin) {
        setBins((current) => {
          const next = { ...current };
          if (!payload.bin?.items.length) delete next[activeId];
          else next[activeId] = payload.bin;
          persistLocalBins(next);
          return next;
        });
      }
      setActiveId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this space.");
    } finally {
      setSaving(false);
    }
  }

  async function clearActive() {
    if (!activeId) return;
    setSaving(true);
    setError("");
    try {
      await api({ action: "clearBin", binId: activeId });
      setBins((current) => {
        const next = { ...current };
        delete next[activeId];
        persistLocalBins(next);
        return next;
      });
      setDraft([]);
      setPicked(null);
      setProducts([]);
      setSearch("");
      setEditing(false);
      setActiveId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear bin.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell warehouse-shell">
      <header className="list-header">
        <h1>Warehouse</h1>
        <p className="progress-copy">Each space has a front box and a back box. Tap one to assign styles and colors.</p>
        <input
          className="warehouse-find"
          value={find}
          onChange={(event) => setFind(event.target.value)}
          placeholder="Find a style on the shelves"
        />
        {layout ? (
          <div className="aisle-switch" role="tablist" aria-label="Aisles">
            {layout.aisles.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={entry.id === aisle?.id ? "is-on" : ""}
                onClick={() => setAisleId(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {loading ? <section className="list-card empty-state">Loading shelves…</section> : null}
      {!loading && error && !layout ? <section className="list-card empty-state">{error}</section> : null}

      {aisle ? (
        <div className="shelf-stack">
          {aisle.shelves.map((shelf) => (
            <section key={shelf.id} className="shelf-card">
              <div className="shelf-label">
                <strong>{shelf.label}</strong>
                <span>
                  {aisle.label} · {shelf.slots} spaces · front / back
                </span>
              </div>
              <div className="shelf-rail" style={{ gridTemplateColumns: `repeat(${shelf.slots}, minmax(0, 1fr))` }}>
                {Array.from({ length: shelf.slots }, (_, index) => {
                  const slot = index + 1;
                  return (
                    <div key={`${shelf.id}-${slot}`} className="shelf-spot">
                      <span className="spot-no">{slot}</span>
                      {(["F", "B"] as WarehouseDepth[]).map((depth) => {
                        const id = binIdFor(aisle.id, shelf.id, slot, depth);
                        const items = bins[id]?.items || [];
                        const hit =
                          findValue &&
                          items.some(
                            (item) =>
                              item.productTitle.toLowerCase().includes(findValue) ||
                              item.color.toLowerCase().includes(findValue)
                          );
                        return (
                          <button
                            key={id}
                            type="button"
                            className={`wh-bin is-${depth === "F" ? "front" : "back"}${items.length ? " is-filled" : ""}${
                              hit ? " is-hit" : ""
                            }${findValue && items.length && !hit ? " is-dim" : ""}`}
                            onClick={() => openBin(id)}
                          >
                            <span className="wh-depth">{depthLabel(depth)}</span>
                            {items.length ? (
                              <>
                                <span className="wh-bin-title">{items[0].productTitle}</span>
                                {itemColors(items).length ? (
                                  <span className="wh-bin-colors">
                                    {itemColors(items).slice(0, 5).map((color) => (
                                      <i key={color} style={{ background: swatch(color) }} title={color} />
                                    ))}
                                  </span>
                                ) : (
                                  <span className="wh-bin-meta">{itemSize(items[0]) || "Saved"}</span>
                                )}
                              </>
                            ) : (
                              <span className="wh-bin-empty">Empty</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {error && layout ? <div className="error-banner">{error}</div> : null}

      {activeId && activeMeta ? (
        <div className="refresh-modal" role="dialog" aria-modal="true" aria-labelledby="bin-title">
          <div className={`bin-card${draft.length && !editing ? " is-wide" : ""}`}>
            {draft.length ? (
              <button
                type="button"
                className="bin-trash"
                aria-label="Clear this space"
                disabled={saving}
                onClick={() => setConfirmClear(true)}
              >
                <TrashIcon />
              </button>
            ) : null}
            <h2 id="bin-title">
              {activeMeta.aisle.id}-{String(activeMeta.shelf.id).replace(activeMeta.aisle.id, "")}-{activeMeta.slot}{" "}
              {depthLabel(activeMeta.depth)}
            </h2>
            <p>
              {activeMeta.aisle.label} · {activeMeta.shelf.label} · space {activeMeta.slot} · {depthLabel(activeMeta.depth).toLowerCase()} box
            </p>

            {draft.length ? (
              <ul className="bin-review">
                {draft.map((item) => {
                  const color = itemColor(item);
                  const name =
                    color && !item.productTitle.toLowerCase().includes(color.toLowerCase())
                      ? `${color} ${item.productTitle}`
                      : item.productTitle;
                  return (
                    <li key={item.id}>
                      {item.image ? <img src={item.image} alt="" /> : <span className="bin-mockup" />}
                      <div>
                        <strong>{name}</strong>
                        {editing ? (
                          <div className="edit-qty">
                            <span>{itemSize(item) || "Size —"}</span>
                            <label>
                              Qty
                              <input
                                inputMode="numeric"
                                value={item.qty ? String(item.qty) : ""}
                                onChange={(event) => {
                                  const qty = Number(event.target.value.replace(/[^\d]/g, "")) || null;
                                  setDraft((current) =>
                                    current.map((entry) => (entry.id === item.id ? { ...entry, qty } : entry))
                                  );
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => setDraft((current) => current.filter((entry) => entry.id !== item.id))}
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <span>
                            {itemSize(item) || "Size —"}
                            <br />
                            Qty {item.qty || 1}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="bin-empty-copy">This space is empty. Search Shopify and add styles and colors.</p>
            )}

            {editing || !draft.length ? (
              <>
                <form className="bin-search" onSubmit={searchProducts}>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search Shopify style"
                  />
                  <button className="ghost-btn" type="submit" disabled={searching}>
                    {searching ? "…" : "Search"}
                  </button>
                </form>

                {products.length ? (
                  <div className="product-hits">
                    {products.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className={`product-hit${picked?.id === product.id ? " is-on" : ""}`}
                        onClick={() => {
                          setPicked(product);
                          setPickedColors([]);
                          setPickedSizes([]);
                          setMixConfirm(null);
                        }}
                      >
                        {product.image ? <img src={product.image} alt="" /> : <span className="bin-thumb" />}
                        <span>{product.title}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {picked ? (
                  <div className="color-pick">
                    <strong>{picked.title}</strong>
                    {optionGroups(picked).colors.length ? (
                      <>
                        <p>Color{optionGroups(picked).colors.length === 1 ? "" : "s"}</p>
                        <div className="note-chips">
                          {optionGroups(picked).colors.map((entry) => {
                            const on = pickedColors.includes(entry.color);
                            return (
                              <button
                                key={entry.color}
                                type="button"
                                className={`note-chip${on ? " is-on" : ""}`}
                                onClick={() =>
                                  setPickedColors((current) =>
                                    on ? current.filter((color) => color !== entry.color) : [...current, entry.color]
                                  )
                                }
                              >
                                <i className="chip-swatch" style={{ background: swatch(entry.color) }} />
                                {entry.color}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                    {optionGroups(picked).sizes.length ? (
                      <>
                        <p>{optionGroups(picked).colors.length ? "Size" : "Select a size for this box."}</p>
                        <div className="note-chips">
                          {optionGroups(picked).sizes.map((entry) => {
                            const on = pickedSizes.includes(entry.size);
                            return (
                              <button
                                key={entry.size}
                                type="button"
                                className={`note-chip${on ? " is-on" : ""}`}
                                onClick={() =>
                                  setPickedSizes((current) =>
                                    on ? current.filter((size) => size !== entry.size) : [...current, entry.size]
                                  )
                                }
                              >
                                {entry.size}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                    <label className="qty-field">
                      Qty
                      <input
                        inputMode="numeric"
                        value={pickedQty}
                        onChange={(event) => setPickedQty(event.target.value.replace(/[^\d]/g, ""))}
                      />
                    </label>
                    <button className="ghost-btn bin-add-btn" type="button" disabled={!canAdd()} onClick={addPickedToDraft}>
                      Add to box
                    </button>
                  </div>
                ) : null}

                {mixConfirm ? (
                  <div className="mix-confirm">
                    <strong>Different size</strong>
                    <p>
                      {mixConfirm.existing
                        ? `This box already has ${mixConfirm.existing}. Add ${mixConfirm.incoming} too? Usually we keep one size per box.`
                        : `You're adding ${mixConfirm.incoming}. Usually we keep one size per box.`}
                    </p>
                    <div className="box-actions">
                      <button className="ghost-btn" type="button" onClick={() => setMixConfirm(null)}>
                        Keep one size
                      </button>
                      <button className="primary-btn" type="button" onClick={commitAdd}>
                        Add anyway
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {editing ? (
              <div className="box-actions">
                <button className="ghost-btn" type="button" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
                <button className="primary-btn" type="button" onClick={() => void saveActive()} disabled={saving}>
                  {saving ? "Saving…" : "Save space"}
                </button>
              </div>
            ) : (
              <div className="box-actions">
                <button className="ghost-btn" type="button" onClick={() => setActiveId(null)} disabled={saving}>
                  Close
                </button>
                <button className="primary-btn" type="button" onClick={startEdit} disabled={saving}>
                  Edit space
                </button>
              </div>
            )}
            {confirmClear ? (
              <div className="clear-confirm" role="alertdialog" aria-labelledby="clear-title">
                <strong id="clear-title">Clear this space?</strong>
                <p>This removes everything from {activeId}. You can add product back after.</p>
                <div className="box-actions">
                  <button className="ghost-btn" type="button" onClick={() => setConfirmClear(false)} disabled={saving}>
                    Keep it
                  </button>
                  <button
                    className="primary-btn danger-btn"
                    type="button"
                    disabled={saving}
                    onClick={() => void clearActive()}
                  >
                    {saving ? "Clearing…" : "Clear space"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
