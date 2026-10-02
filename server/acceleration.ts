import { randomUUID, randomBytes } from "node:crypto";
import bolt11 from "bolt11";
import type {
  AccelerationQuote,
  AccelerationAttempt,
} from "../shared/model.ts";
export interface Accelerator {
  quote(txid: string, requestId: string): Promise<AccelerationQuote>;
  invoice(quote: AccelerationQuote): Promise<AccelerationAttempt>;
  status(attempt: AccelerationAttempt): Promise<AccelerationAttempt["status"]>;
}
const whole = (value: unknown) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw Error("Invalid accelerator price");
  return value;
};
export function verifyAccelerationInvoice(invoice: string, total: number) {
  const decoded = bolt11.decode(invoice);
  if (
    !/^lnbc(?:[0-9]+[munp]?)?1/.test(invoice) ||
    !Number.isSafeInteger(total * 1000) ||
    Number(decoded.millisatoshis) !== total * 1000
  )
    throw Error("Acceleration invoice does not match the approved price");
  const expires = (decoded.timeExpireDate ?? 0) * 1000;
  if (expires <= Date.now()) throw Error("Acceleration invoice has expired");
  return expires;
}
export class MempoolAccelerator implements Accelerator {
  constructor(private request: typeof fetch = fetch) {}
  private async api(path: string, body?: unknown) {
    const res = await this.request(
      "https://mempool.space/api/v1/services" + path,
      {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (res.status === 404 && body === undefined) return null;
    if (!res.ok)
      throw Error(
        "Mempool Express is unavailable (" +
          res.status +
          "); your donation still confirms normally",
      );
    return res.json();
  }
  async quote(txid: string, requestId: string) {
    const e = await this.api("/accelerator/estimate", { txInput: txid });
    if (
      !e ||
      e.unavailable ||
      e.availablePaymentMethods?.bitcoin?.enabled === false ||
      !e.options?.length
    )
      throw Error(
        "This transaction is not eligible for Lightning-paid Express",
      );
    const boostSats = Math.min(
      ...e.options.map((o: { fee: number }) => whole(o.fee)),
    );
    const serviceSats = whole(e.mempoolBaseFee) + whole(e.vsizeFee);
    const totalSats = whole(boostSats + serviceSats);
    if (
      !totalSats ||
      totalSats < (e.availablePaymentMethods?.bitcoin?.min ?? 0) ||
      totalSats >
        (e.availablePaymentMethods?.bitcoin?.max ?? Number.MAX_SAFE_INTEGER)
    )
      throw Error("Express is unavailable at this price");
    return {
      id: randomUUID(),
      txid,
      requestId,
      totalSats,
      boostSats,
      serviceSats,
      expires: Date.now() + 60000,
    };
  }
  async invoice(q: AccelerationQuote) {
    if (q.expires <= Date.now())
      throw Error("Express quote expired; request a new price");
    const fresh = await this.quote(q.txid, q.requestId);
    if (fresh.totalSats !== q.totalSats || fresh.boostSats !== q.boostSats)
      throw Error("Express price changed; request a new quote");
    const r = await this.api("/accelerator/invoice", {
      txid: q.txid,
      maxBidBoost: q.boostSats,
    });
    if (typeof r?.btcpayInvoiceId !== "string")
      throw Error("Unexpected accelerator invoice response");
    let invoice = r.addresses?.BTC_LightningLike;
    if (!invoice) {
      const details = await this.api(
        "/payments/bitcoin/invoice?id=" + encodeURIComponent(r.btcpayInvoiceId),
      );
      invoice = details?.addresses?.BTC_LightningLike;
    }
    if (typeof invoice !== "string")
      throw Error("Mempool did not return a Lightning invoice");
    const expires = verifyAccelerationInvoice(invoice, q.totalSats);
    return {
      txid: q.txid,
      invoiceId: r.btcpayInvoiceId,
      invoice,
      totalSats: q.totalSats,
      expires,
      status: "invoice" as const,
    };
  }
  async status(a: AccelerationAttempt) {
    if (a.status === "confirmed" || a.status === "failed") return a.status;
    const r = await this.api("/accelerator/accelerations/" + a.txid);
    if (!r || r.txid !== a.txid) return a.status;
    if (["failed", "canceled", "cancelled"].includes(r.status)) return "failed";
    if (["mined", "completed"].includes(r.status)) return "accepted"; // Bark alone credits confirmation.
    if (
      r.txid === a.txid &&
      (r.added ||
        r.pools?.length ||
        ["requested", "accelerating"].includes(r.status))
    )
      return "accepted";
    return a.status;
  }
}
export class SimulatedAccelerator implements Accelerator {
  constructor(private goal: number) {}
  async quote(txid: string, requestId: string) {
    const boostSats = Math.max(1, Math.ceil(this.goal / 20000));
    const serviceSats = boostSats;
    return {
      id: randomUUID(),
      txid,
      requestId,
      totalSats: boostSats + serviceSats,
      boostSats,
      serviceSats,
      expires: Date.now() + 60000,
    };
  }
  async invoice(q: AccelerationQuote) {
    if (q.expires <= Date.now()) throw Error("Express quote expired");
    const invoice = bolt11.sign(
      bolt11.encode({
        satoshis: q.totalSats,
        timestamp: Math.floor(Date.now() / 1000),
        tags: [
          { tagName: "payment_hash", data: randomBytes(32).toString("hex") },
          { tagName: "description", data: "SIMULATED Express — do not pay" },
          { tagName: "expire_time", data: 900 },
        ],
      }),
      randomBytes(32).toString("hex"),
    ).paymentRequest!;
    return {
      txid: q.txid,
      invoiceId: "demo:" + randomUUID(),
      invoice,
      totalSats: q.totalSats,
      expires: verifyAccelerationInvoice(invoice, q.totalSats),
      status: "invoice" as const,
    };
  }
  async status(a: AccelerationAttempt) {
    return a.status;
  }
}
