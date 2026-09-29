"use client";

import { useEffect, useState } from "react";
import {
  NOTE_OPTIONS,
  type MondayMatch,
  type ReceiptDetail,
  type ReceiptLine,
} from "./types";

function BoxesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 9.5 9 7l5 2.5v6.5L9 18.5 4 16z" strokeLinejoin="round" />
      <path d="M10 10.2 15 7.8l5 2.4v6.4L15 19l-5-2.4z" strokeLinejoin="round" />
    </svg>
  );
}

function parseCount(value: string) {
  const raw = value.replace(/[^\d]/g, "");
  return raw === "" ? null : Number(raw);
}

function LineRow({
  line,
  hasBoxes,
  onChange,
  onOpenBoxes,
}: {
  line: ReceiptLine;
  hasBoxes: boolean;
  onChange: (received: number | null) => void;
  onOpenBoxes: () => void;
}) {
  return (
    <div className="qty-row">
      <div className="qty-label">
        <strong>{line.label}</strong>
      </div>
      <div className="qty-expected" aria-label={`${line.label} expected`}>
        {line.expected}
      </div>
      <div className="qty-received">
        <input
          aria-label={`${line.label} received`}
          type="tel"
          inputMode="numeric"
          placeholder="—"
          value={line.received === null || line.received === undefined ? "" : String(line.received)}
          onChange={(event) => onChange(parseCount(event.target.value))}
        />
        <button
          type="button"
          className={`boxes-btn${hasBoxes ? " is-on" : ""}`}
          aria-label={`Count ${line.label} in multiple boxes`}
          onClick={onOpenBoxes}
        >
          <BoxesIcon />
        </button>
      </div>
    </div>
  );
}

function BoxesModal({
  label,
  counts,
  onChange,
  onAdd,
  onRemove,
  onClose,
  onSave,
}: {
  label: string;
  counts: Array<number | null>;
  onChange: (index: number, value: number | null) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const filled = counts.filter((count) => count !== null);
  const total = filled.reduce((sum, count) => sum + Number(count || 0), 0);
  return (
    <div className="refresh-modal" role="dialog" aria-modal="true" aria-labelledby="boxes-title">
      <div className="boxes-card">
        <h2 id="boxes-title">{label} boxes</h2>
        <p>Enter how many pieces are in each box. Save count adds the total to received.</p>
        <div className="box-rows">
          {counts.map((count, index) => (
            <div className="box-row" key={`box-${index}`}>
              <span>Box {index + 1}</span>
              <input
                aria-label={`${label} box ${index + 1}`}
                type="tel"
                inputMode="numeric"
                placeholder="—"
                value={count === null ? "" : String(count)}
                onChange={(event) => onChange(index, parseCount(event.target.value))}
              />
              {counts.length > 1 ? (
                <button type="button" className="box-remove" onClick={() => onRemove(index)}>
                  Remove
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        <button type="button" className="ghost-btn box-add" onClick={onAdd}>
          Add box
        </button>
        <p className="box-total">Total {total} in {filled.length} box{filled.length === 1 ? "" : "es"}</p>
        <div className="box-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" type="button" disabled={!filled.length} onClick={onSave}>
            Save count
          </button>
        </div>
      </div>
    </div>
  );
}

function countedTotal(receipt: ReceiptDetail) {
  return receipt.lines.reduce((sum, line) => sum + Number(line.received || 0), 0);
}

function canSave(receipt: ReceiptDetail, initials: string) {
  if (String(initials || "").replace(/[^A-Za-z]/g, "").length < 2) return false;
  return receipt.lines
    .filter((line) => Number(line.expected || 0) > 0)
    .every((line) => line.received !== null && line.received !== undefined);
}

export function RefreshModal({
  note,
  seconds,
  onRefreshNow,
}: {
  note: string;
  seconds: number;
  onRefreshNow: () => void;
}) {
  return (
    <div className="refresh-modal" role="dialog" aria-modal="true" aria-labelledby="refresh-title">
      <div className="refresh-card">
        <div className="refresh-check" aria-hidden="true">
          ✓
        </div>
        <h2 id="refresh-title">Received</h2>
        <p>{note || "Scanned rec form saved."}</p>
        <div className="refresh-count" aria-live="polite">
          {seconds}
        </div>
        <p className="refresh-copy">Refreshing in {seconds} second{seconds === 1 ? "" : "s"}</p>
        <button className="primary-btn" type="button" onClick={onRefreshNow}>
          Refresh now
        </button>
      </div>
    </div>
  );
}

export default function ReceiveView({
  matches,
  receipt,
  initials,
  selectedNotes,
  extraNotes,
  busy,
  savedNote,
  onNew,
  onOpen,
  onInitials,
  onLineChange,
  onToggleNote,
  onExtraNotes,
  onBoxCount,
  onSave,
}: {
  matches: MondayMatch[] | null;
  receipt: ReceiptDetail | null;
  initials: string;
  selectedNotes: string[];
  extraNotes: string;
  busy: boolean;
  savedNote: string;
  onNew: () => void;
  onOpen: (item: MondayMatch) => void;
  onInitials: (value: string) => void;
  onLineChange: (id: string, received: number | null) => void;
  onToggleNote: (id: string) => void;
  onExtraNotes: (value: string) => void;
  onBoxCount: (id: string, label: string, counts: Array<number | null>) => void;
  onSave: () => void;
}) {
  const [boxLineId, setBoxLineId] = useState<string | null>(null);
  const [boxDraft, setBoxDraft] = useState<Array<number | null>>([null, null]);
  const [savedBoxes, setSavedBoxes] = useState<Record<string, Array<number | null>>>({});

  useEffect(() => {
    setBoxLineId(null);
    setBoxDraft([null, null]);
    setSavedBoxes({});
  }, [receipt?.id]);

  if (receipt) {
    const totalReceived = countedTotal(receipt);
    const ready = canSave(receipt, initials);
    const boxLine = receipt.lines.find((line) => line.id === boxLineId) || null;
    return (
      <div className="app-shell">
        <header className="list-header">
          <div className="list-toolbar">
            <button type="button" onClick={onNew}>
              New search
            </button>
            <span />
          </div>
          <h1>{receipt.name}</h1>
          <p className="progress-copy">
            {receipt.client || "Client"} · {receipt.productType || "Item"} · PO {receipt.po || "—"}
          </p>
        </header>

        <section className="meta-card">
          <div>
            <span>Invoice</span>
            <strong>{receipt.invoice || "—"}</strong>
          </div>
          <div>
            <span>Vendor</span>
            <strong>{receipt.vendor || "—"}</strong>
          </div>
          <div>
            <span>ETA</span>
            <strong>{receipt.eta || "—"}</strong>
          </div>
        </section>

        <section className="item-list">
          <div className="qty-head">
            <span>Size</span>
            <span>Expected</span>
            <span>Received</span>
          </div>
          {receipt.lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              hasBoxes={Boolean(savedBoxes[line.id]?.some((count) => count !== null))}
              onChange={(received) => onLineChange(line.id, received)}
              onOpenBoxes={() => {
                const existing = savedBoxes[line.id];
                setBoxDraft(existing?.length ? existing : [null, null]);
                setBoxLineId(line.id);
              }}
            />
          ))}
        </section>

        <section className="notes-card">
          <label>Notes</label>
          <div className="note-chips">
            {NOTE_OPTIONS.map((option) => {
              const on = selectedNotes.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`note-chip${on ? " is-on" : ""}`}
                  aria-pressed={on}
                  onClick={() => onToggleNote(option.id)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <textarea
            aria-label="Notes"
            rows={7}
            enterKeyHint="enter"
            autoComplete="off"
            value={extraNotes}
            onChange={(event) => onExtraNotes(event.target.value)}
            placeholder={"S:\nM:\nL:"}
          />
        </section>

        <section className="receive-footer">
          <label htmlFor="initials">Initials</label>
          <input
            id="initials"
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            value={initials}
            onChange={(event) => onInitials(event.target.value.toUpperCase())}
            placeholder="DG"
          />
          <p>
            Receiving {totalReceived} of {receipt.totalExpected}
            {initials ? ` · ${initials}` : ""}
          </p>
          {!ready && !savedNote ? (
            <p>Type received qty for each expected size, then save to generate the scanned rec form.</p>
          ) : null}
          <button className="primary-btn" type="button" disabled={busy || !ready || Boolean(savedNote)} onClick={onSave}>
            {busy ? "Saving form..." : savedNote ? "Received" : "Mark received"}
          </button>
        </section>
        {boxLine ? (
          <BoxesModal
            label={boxLine.label}
            counts={boxDraft}
            onChange={(index, value) =>
              setBoxDraft((current) => {
                const next = current.map((count, entry) => (entry === index ? value : count));
                if (value !== null && index === next.length - 1 && next.length < 20) {
                  return [...next, null];
                }
                return next;
              })
            }
            onAdd={() => setBoxDraft((current) => [...current, null])}
            onRemove={(index) =>
              setBoxDraft((current) => (current.length <= 1 ? current : current.filter((_, entry) => entry !== index)))
            }
            onClose={() => setBoxLineId(null)}
            onSave={() => {
              setSavedBoxes((current) => ({ ...current, [boxLine.id]: boxDraft }));
              onBoxCount(boxLine.id, boxLine.label, boxDraft);
              setBoxLineId(null);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="list-header">
        <div className="list-toolbar">
          <button type="button" onClick={onNew}>
            New search
          </button>
          <span />
        </div>
        <h1>PENDING LABELS/FORMS</h1>
        <p className="progress-copy">
          {matches?.length ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "No matching tasks"}
        </p>
      </header>
      {matches?.length ? (
        <section className="item-list">
          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              className="match-row"
              onClick={() => onOpen(item)}
            >
              <div className="item-copy">
                <h3>{item.name}</h3>
                <p>
                  {item.client || "Client"} · {item.productType || "Type"} · PO {item.po || "—"} · Qty {item.qty || 0}
                </p>
              </div>
            </button>
          ))}
        </section>
      ) : (
        <section className="list-card empty-state">
          No tasks matched in PENDING LABELS/FORMS. Try part of the task name or PO number.
        </section>
      )}
    </div>
  );
}
