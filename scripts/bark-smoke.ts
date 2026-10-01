import "dotenv/config";
import { BarkAdapter } from "../server/payments.ts";
const network = process.env.PAYMENT_MODE;
if (network !== "signet")
  throw Error("This receive smoke test runs only with PAYMENT_MODE=signet");
if (!process.env.BARK_TOKEN)
  throw Error("Set BARK_TOKEN for the local signet wallet");
const bark = new BarkAdapter(
  process.env.BARK_URL ?? "http://127.0.0.1:3001",
  process.env.BARK_TOKEN,
  network,
);
await bark.health();
for (const method of ["lightning", "bitcoin", "ark"] as const) {
  const c = await bark.create(5000, "Smoke test", method);
  if (!c.destination || !c.uri)
    throw Error("Missing " + method + " destination");
  console.log(
    method +
      ": receive request created" +
      (c.expires ? " with decoded invoice expiry" : ""),
  );
}
console.log(
  "Receiving API smoke test passed. This does not test settlement; send test sats through /donate next.",
);
