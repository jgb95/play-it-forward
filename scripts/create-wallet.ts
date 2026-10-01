import "dotenv/config";
import { BarkAdapter } from "../server/payments.ts";
const network = process.env.PAYMENT_MODE;
if (network !== "signet" && network !== "mainnet")
  throw Error("Set PAYMENT_MODE to signet or mainnet");
if (network === "mainnet" && process.argv[2] !== "--mainnet")
  throw Error("Mainnet wallet creation requires --mainnet");
if (!process.env.BARK_TOKEN) throw Error("Set BARK_TOKEN");
const bark = new BarkAdapter(
  process.env.BARK_URL ?? "http://127.0.0.1:3001",
  process.env.BARK_TOKEN,
  network,
);
const arkServer =
  network === "signet"
    ? "https://ark.signet.2nd.dev"
    : "https://ark.second.tech";
const esplora =
  network === "signet"
    ? "https://esplora.signet.2nd.dev"
    : "https://mempool.second.tech/api";
const response = await bark.api<{ fingerprint: string }>("/wallet/create", {
  network,
  ark_server: process.env.ARK_SERVER ?? arkServer,
  chain_source: { esplora: { url: process.env.ESPLORA_URL ?? esplora } },
});
console.log(
  "Organizer wallet created. Fingerprint: " +
    response.fingerprint +
    ". Back up its seed and full data directory before receiving funds.",
);
