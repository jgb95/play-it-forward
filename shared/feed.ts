import type { Method, StoryEvent } from "./model";

export type FeedEntry = {
  key: string;
  firstId: number;
  created: number;
  name: string;
  amount: number;
  method?: Method;
  status: "pending" | "confirmed" | "replaced" | "dropped";
  express: boolean;
  txid?: string;
};
export type FeedPage = {
  eventKey: string;
  cutoff: number;
  before: number;
  more: boolean;
  entries: FeedEntry[];
};
// A display projection only. The receipt ledger remains the accounting source.
export class ContributionFeed {
  private entries = new Map<string, FeedEntry>();
  private acceleration = new Map<string, boolean>();
  constructor(rows: FeedEntry[] = []) {
    for (const row of rows) this.entries.set(row.key, { ...row });
  }
  apply(event: StoryEvent) {
    const p = event.payload;
    if (event.kind === "reset") {
      this.entries.clear();
      this.acceleration.clear();
      return;
    }
    if (event.kind === "acceleration") {
      if (p.status !== "accepted" && p.status !== "failed") return;
      this.acceleration.set(p.txid, p.status === "accepted");
      for (const row of this.entries.values())
        if (row.txid === p.txid) row.express = p.status === "accepted";
      return;
    }
    if (event.kind !== "donation" && event.kind !== "onchain") return;
    if (!Number.isSafeInteger(p.amount) || p.amount < 1) return;
    const key = String(p.receiptKey ?? p.key ?? `legacy:${event.id}`);
    const old = this.entries.get(key);
    const txid =
      p.txid ?? (key.startsWith("bitcoin:") ? key.split(":")[1] : undefined);
    const status =
      event.kind === "donation" || old?.status === "confirmed"
        ? "confirmed"
        : ["replaced", "dropped"].includes(p.status)
          ? p.status
          : "pending";
    this.entries.set(key, {
      key,
      firstId: old?.firstId ?? event.id,
      created: old?.created ?? event.created,
      name: typeof p.name === "string" ? p.name.slice(0, 32) : "",
      amount:
        event.kind === "onchain" && old?.status === "confirmed"
          ? old.amount
          : p.amount,
      method:
        event.kind === "onchain"
          ? "bitcoin"
          : ["bitcoin", "lightning", "ark"].includes(p.method)
            ? p.method
            : old?.method,
      status,
      express: this.acceleration.has(txid)
        ? this.acceleration.get(txid) === true
        : p.acceleration === "failed"
          ? false
          : p.acceleration === "accepted" || old?.express === true,
      ...(txid ? { txid } : {}),
    });
  }
  rows(before = Number.MAX_SAFE_INTEGER, limit = 100) {
    return [...this.entries.values()]
      .filter((e) => e.firstId < before)
      .sort((a, b) => b.firstId - a.firstId)
      .slice(0, limit)
      .map((e) => ({
        ...e,
        name: e.status === "confirmed" || e.express ? e.name : "",
      }));
  }
}
