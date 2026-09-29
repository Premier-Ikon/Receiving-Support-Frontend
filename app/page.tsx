"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AppTabs from "./AppTabs";
import ReceiveView, { RefreshModal } from "./ReceiveView";
import WarehouseView from "./WarehouseView";
import { API_URL } from "./env";
import { composeBoxSnippet, composeFormNotes, upsertBoxSnippet, type AppTab, type MondayMatch, type ReceiptDetail } from "./types";

const INITIALS_KEY = "pi-receiving-initials";

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M21 8l-9-5-9 5v8l9 5 9-5V8z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.3 7.8L12 12.5l8.7-4.7M12 22V12.5" />
    </svg>
  );
}

function loadInitials() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(INITIALS_KEY) || "";
}

export default function HomePage() {
  const [tab, setTab] = useState<AppTab>("receive");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<MondayMatch[] | null>(null);
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [initials, setInitials] = useState(loadInitials);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [extraNotes, setExtraNotes] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [refreshIn, setRefreshIn] = useState<number | null>(null);

  const searchCopy = useMemo(() => {
    if (tab === "putaway") {
      return {
        title: "Put away",
        body: "After goods are received, assign a warehouse location so the team can find them later.",
        submit: "Open put away",
        label: "Receipt or PO",
        placeholder: "PO-0000",
      };
    }
    if (tab === "warehouse") {
      return {
        title: "Warehouse",
        body: "See backstock on the shelves and assign styles to a space.",
        submit: "Open warehouse",
        label: "Style or bin",
        placeholder: "A-1-3",
      };
    }
    return {
      title: "Receive",
      body: "Search PENDING LABELS/FORMS by task name or PO, then count what came in.",
      submit: loading ? "Searching..." : "Search Monday",
      label: "Task name",
      placeholder: "Rising Sun",
    };
  }, [tab, loading]);

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
      matches?: MondayMatch[];
      receipt?: ReceiptDetail;
    };
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Could not talk to receiving API.");
    }
    return payload;
  }

  async function searchMonday(event: FormEvent) {
    event.preventDefault();
    if (tab !== "receive") return;
    const value = query.trim();
    if (!value) return;
    setLoading(true);
    setError("");
    setSavedNote("");
    try {
      const payload = await api({ action: "search", query: value });
      setMatches(payload.matches || []);
      setReceipt(null);
      setSelectedNotes([]);
      setExtraNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function openMatch(item: MondayMatch) {
    setLoading(true);
    setError("");
    setSavedNote("");
    try {
      const payload = await api({ action: "getReceipt", itemId: item.id });
      setReceipt(payload.receipt || null);
      setSelectedNotes([]);
      setExtraNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load receiving form.");
    } finally {
      setLoading(false);
    }
  }

  async function saveReceipt() {
    if (!receipt) return;
    setLoading(true);
    setError("");
    try {
      window.localStorage.setItem(INITIALS_KEY, initials);
      const payload = await api({
        action: "recordReceipt",
        itemId: receipt.id,
        initials,
        lines: receipt.lines,
        formNotes: composeFormNotes(selectedNotes, extraNotes),
      });
      if (payload.receipt) setReceipt(payload.receipt);
      setSavedNote(payload.receipt?.note || "Received.");
      setRefreshIn(10);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save receipt.");
    } finally {
      setLoading(false);
    }
  }

  function resetReceive() {
    setMatches(null);
    setReceipt(null);
    setSelectedNotes([]);
    setExtraNotes("");
    setSavedNote("");
    setRefreshIn(null);
    setError("");
    setQuery("");
  }

  useEffect(() => {
    if (refreshIn === null) return;
    const timer = window.setTimeout(() => {
      if (refreshIn <= 1) {
        resetReceive();
        return;
      }
      setRefreshIn(refreshIn - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [refreshIn]);

  if (tab === "warehouse") {
    return (
      <main className="app">
        <WarehouseView />
        <AppTabs tab={tab} onChange={setTab} />
      </main>
    );
  }

  if (tab === "receive" && (matches || receipt)) {
    return (
      <main className="app">
        <ReceiveView
          matches={matches}
          receipt={receipt}
          initials={initials}
          selectedNotes={selectedNotes}
          extraNotes={extraNotes}
          busy={loading}
          savedNote={savedNote}
          onNew={resetReceive}
          onOpen={(item) => void openMatch(item)}
          onInitials={setInitials}
          onLineChange={(id, received) => {
            setSavedNote("");
            setReceipt((current) =>
              current
                ? {
                    ...current,
                    lines: current.lines.map((line) =>
                      line.id === id ? { ...line, received } : line
                    ),
                  }
                : current
            );
          }}
          onToggleNote={(id) => {
            setSavedNote("");
            setSelectedNotes((current) =>
              current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
            );
          }}
          onExtraNotes={(value) => {
            setSavedNote("");
            setExtraNotes(value);
          }}
          onBoxCount={(id, label, counts) => {
            const total = counts.reduce((sum, count) => sum + Number(count || 0), 0);
            const note = composeBoxSnippet(label, counts);
            setSavedNote("");
            setReceipt((current) =>
              current
                ? {
                    ...current,
                    lines: current.lines.map((line) =>
                      line.id === id ? { ...line, received: total } : line
                    ),
                  }
                : current
            );
            setExtraNotes((current) => upsertBoxSnippet(current, label, note));
          }}
          onSave={() => void saveReceipt()}
        />
        {error ? <div className="error-banner">{error}</div> : null}
        {refreshIn !== null ? (
          <RefreshModal
            note={savedNote}
            seconds={refreshIn}
            onRefreshNow={resetReceive}
          />
        ) : null}
        <AppTabs tab={tab} onChange={setTab} />
      </main>
    );
  }

  return (
    <main className="app search-mode">
      <div className="app-shell">
        <section className="search-card">
          <div className="brand-mark">
            <BoxIcon />
          </div>
          <h1>{searchCopy.title}</h1>
          <p>{searchCopy.body}</p>
          <form className="search-form" onSubmit={searchMonday}>
            <label htmlFor="reference">{searchCopy.label}</label>
            <input
              id="reference"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchCopy.placeholder}
            />
            <button className="primary-btn" type="submit" disabled={loading}>
              {searchCopy.submit}
            </button>
          </form>
          {error ? <div className="error-banner">{error}</div> : null}
        </section>
      </div>
      {refreshIn !== null ? (
        <RefreshModal
          note={savedNote}
          seconds={refreshIn}
          onRefreshNow={resetReceive}
        />
      ) : null}
      <AppTabs tab={tab} onChange={setTab} />
    </main>
  );
}
