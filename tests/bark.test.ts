import test from "node:test";
import assert from "node:assert/strict";
import { Transaction, payments, networks } from "bitcoinjs-lib";
import { BarkAdapter } from "../server/payments.ts";
import type { Contribution } from "../shared/model.ts";
const c = (
  method: Contribution["method"],
  destination: string,
  id = method,
): Contribution => ({
  id,
  method,
  destination,
  uri: destination,
  amount: 5000,
  name: "",
  created: 1,
  expires: null,
  status: "pending",
  received: 0,
});
function mock(data: Record<string, unknown>) {
  return (async (input: any) => {
    const p = new URL(String(input)).pathname.replace("/api/v1", "");
    if (p === "/api-docs/openapi.json")
      return new Response(JSON.stringify({ info: { version: "0.7.1" } }));
    if (p === "/wallet")
      return new Response(JSON.stringify({ fingerprint: "test" }));
    if (p === "/wallet/ark-info")
      return new Response(JSON.stringify({ network: "signet" }));
    if (!(p in data)) throw Error("Unexpected path " + p);
    return new Response(JSON.stringify(data[p]), {
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}
const movement = (
  id: number,
  type: string,
  value: string,
  status = "successful",
  amount = 5000,
) => ({
  id,
  status,
  effective_balance_sat: amount,
  received_on: [{ destination: { type, value }, amount_sat: amount }],
});
test("settlement state, receipt attribution, net amounts and unrelated wallet operations", async () => {
  const data = {
    "/history": [
      movement(1, "invoice", "ln-test", "successful", 4900),
      movement(2, "ark", "ark-test"),
      movement(3, "ark", "other"),
      movement(4, "ark", "ark-test", "pending"),
      movement(5, "ark", "ark-test", "successful", -200),
    ],
    "/lightning/receives/ln-test": { state: "preimage-revealed" },
  };
  const bark = new BarkAdapter(
    "http://127.0.0.1:3001",
    "secret",
    "signet",
    mock(data),
  );
  let r = await bark.reconcile([
    c("lightning", "ln-test"),
    c("ark", "ark-test"),
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].amount, 5000);
  data["/lightning/receives/ln-test"] = { state: "settled" };
  r = await bark.reconcile([c("lightning", "ln-test"), c("ark", "ark-test")]);
  assert.equal(r.length, 2);
  assert.equal(r[0].amount, 4900);
  assert.equal(r[0].key, "bark:movement:1");
});
test("confirmed onchain output attribution, multiple receipts and late payments", async () => {
  const p = payments.p2wpkh({
    hash: Buffer.alloc(20, 3),
    network: networks.testnet,
  });
  const tx = new Transaction();
  tx.addInput(Buffer.alloc(32, 1), 0);
  tx.addOutput(p.output!, 3000n);
  tx.addOutput(p.output!, 4000n);
  const data = {
    "/onchain/transactions": [
      {
        txid: tx.getId(),
        tx: tx.toHex(),
        confirmation: null as null | { height: number },
      },
    ],
  };
  const bark = new BarkAdapter(
    "http://127.0.0.1:3001",
    "secret",
    "signet",
    mock(data),
  );
  assert.equal((await bark.reconcile([c("bitcoin", p.address!)])).length, 0);
  data["/onchain/transactions"][0].confirmation = { height: 10 };
  const r = await bark.reconcile([c("bitcoin", p.address!)]);
  assert.deepEqual(
    r.map((x) => x.amount),
    [3000, 4000],
  );
  assert.notEqual(r[0].key, r[1].key);
});
test("addresses are issued through exact versioned endpoints", async () => {
  const bark = new BarkAdapter(
    "http://localhost:3001",
    "secret",
    "signet",
    mock({
      "/wallet/addresses/next": { address: "ark-test" },
      "/onchain/addresses/next": { address: "tb-test" },
    }),
  );
  assert.equal((await bark.create(5000, "", "ark")).destination, "ark-test");
  assert.match(
    (await bark.create(5000, "", "bitcoin")).uri,
    /amount=0.00005000/,
  );
});
test("Bark unavailable fails closed and remote daemons are rejected", async () => {
  const b = new BarkAdapter(
    "http://localhost:3001",
    "secret",
    "signet",
    async () => new Response("{}", { status: 503 }),
  );
  await assert.rejects(() => b.reconcile([c("ark", "ark-test")]));
  assert.throws(
    () => new BarkAdapter("http://evil.example", "secret", "mainnet"),
  );
});

test("signet Lightning invoices decode their expiry and never count as paid on creation", async () => {
  const bolt11 = (await import("bolt11")).default;
  const invoice = bolt11.sign(
    bolt11.encode({
      network: {
        bech32: "tbs",
        pubKeyHash: 111,
        scriptHash: 196,
        validWitnessVersions: [0, 1],
      },
      timestamp: 1700000000,
      satoshis: 5000,
      tags: [
        { tagName: "payment_hash", data: "11".repeat(32) },
        { tagName: "description", data: "Test invoice" },
        { tagName: "expire_time", data: 600 },
      ],
    }),
    "22".repeat(32),
  ).paymentRequest!;
  const b = new BarkAdapter(
    "http://localhost:3001",
    "secret",
    "signet",
    mock({ "/lightning/receives/invoice": { invoice } }),
  );
  const request = await b.create(5000, "", "lightning");
  assert.equal(request.expires, 1700000600000);
  assert.equal(request.status, "pending");
  assert.equal(request.received, 0);
});

test("wrong-network wallet health fails before a payment request can be issued", async () => {
  const b = new BarkAdapter(
    "http://localhost:3001",
    "secret",
    "mainnet",
    mock({}),
  );
  await assert.rejects(
    () => b.create(5000, "", "bitcoin"),
    /network does not match/,
  );
});

test("pending actual outputs are independent, replacements need a competing spend, outages preserve pending", async () => {
  const p = payments.p2wpkh({
    hash: Buffer.alloc(20, 4),
    network: networks.testnet,
  });
  const tx = new Transaction();
  tx.addInput(Buffer.alloc(32, 6), 1);
  tx.addOutput(p.output!, 13n);
  tx.addOutput(p.output!, 17n);
  const data = {
    "/onchain/transactions": [
      { txid: tx.getId(), tx: tx.toHex(), confirmation: null },
    ],
  };
  const offline = new BarkAdapter(
    "http://127.0.0.1:3001",
    "secret",
    "signet",
    mock(data),
    (async () => {
      throw Error("offline");
    }) as typeof fetch,
  );
  assert.deepEqual(
    (await offline.inspect([c("bitcoin", p.address!)])).map((o) => o.status),
    ["pending", "pending"],
  );
  const replacement = "a".repeat(64);
  const replacing = new BarkAdapter(
    "http://127.0.0.1:3001",
    "secret",
    "signet",
    mock(data),
    (async () =>
      new Response(
        JSON.stringify({
          spent: true,
          txid: replacement,
          status: { confirmed: false },
        }),
      )) as typeof fetch,
  );
  const observations = await replacing.inspect([c("bitcoin", p.address!)]);
  assert.equal(observations.length, 2);
  assert.equal(observations[0].status, "replaced");
  assert.equal(observations[0].replacement, replacement);
  assert.notEqual(observations[0].key, observations[1].key);
});

test("real Bark mainnet Taproot output is pending then confirmed without an ECC signing module", async () => {
  const destination =
    "bc1p0fzzsmctyzd343r6wqaew746z722x230vk7g6j6lnm4h8plpqllqrqjyrg";
  const raw =
    "0200000000010142075b99f37d5e1ccf23e63a6d47a1eae4ad0d3f8b1b672098a0206fb1b703c90100000000fdffffff0310270000000000002251207a44286f0b209b1ac47a703b977aba1794a32a2f65bc8d4b5f9eeb7387e107fe4a0100000000000022512024a8bf24bd4c14b51099fb5e9976378396233aed746c8fbcb58f4447ab667f92d1ad0f000000000022512063c808458bb71e83df88937a99ca38ce73efdcecff1676a62c2a612f046441fd014070f33fa3f92653f03ab1c01ba9f67328d3430a4515de6ce5fea897966de1899c93ab037abefa8444e3c52991f2bc402e9c6052635382290f6d325d936b147caa5ecb0e00";
  const txid =
    "e12939384c571a9f17a1036c710a5dc2a0a8a30e97f5ec526e4251afc8b17a55";
  const tx = { txid, tx: raw, confirmation: null as null | { height: number } };
  const bark = new BarkAdapter(
    "http://localhost:3001",
    "test-secret",
    "mainnet",
    mock({ "/onchain/transactions": [tx] }),
  );
  const request = c("bitcoin", destination);
  assert.equal((await bark.inspect([request]))[0].status, "pending");
  assert.equal((await bark.reconcile([request])).length, 0);
  tx.confirmation = { height: 969568 };
  const output = (await bark.inspect([request]))[0];
  assert.equal(output.status, "confirmed");
  assert.equal(output.amount, 10000);
  assert.deepEqual(await bark.reconcile([request]), [
    { key: `bitcoin:${txid}:0`, requestId: request.id, amount: 10000 },
  ]);
  await assert.rejects(
    bark.inspect([{ ...request, destination: destination.slice(0, -1) + "a" }]),
  );
  const wrongNetwork = new BarkAdapter(
    "http://localhost:3001",
    "test-secret",
    "signet",
    mock({ "/onchain/transactions": [tx] }),
  );
  await assert.rejects(wrongNetwork.inspect([request]));
});
