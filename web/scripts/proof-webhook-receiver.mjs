#!/usr/bin/env node
// A throwaway webhook receiver for the end-to-end proof (streak v20, Prompt 4).
//
//   node scripts/proof-webhook-receiver.mjs 4599 /tmp/proof-webhooks.jsonl   &
//   npx tsx scripts/final-end-to-end-proof.ts --webhook-url http://127.0.0.1:4599/proof
//
// It exists so "the feed delivered a webhook" is a fact about an HTTP request that arrived, not a fact about a row in an
// outbox. Each delivery is appended as one JSON line: event type, the HMAC signature header, and the parsed body.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const port = Number(process.argv[2] ?? "4599");
const out = process.argv[3] ?? "/tmp/proof-webhooks.jsonl";

const server = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    const record = {
      receivedAt: new Date().toISOString(),
      path: request.url,
      signature: request.headers["x-ultra-signature"] ?? request.headers["x-signature"] ?? request.headers["x-hub-signature-256"] ?? null,
      headers: Object.keys(request.headers),
      eventType: parsed?.type ?? null,
      bytes: body.length,
      parsed,
    };
    appendFileSync(out, `${JSON.stringify(record)}\n`);
    console.log(`received ${record.eventType ?? "(unknown)"} · ${record.bytes} bytes`);
    // The outbox treats a non-2xx as a retry, so answer 200 only when the body parsed: a malformed delivery should be
    // visible as a failure rather than quietly accepted.
    response.writeHead(parsed ? 200 : 400, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: Boolean(parsed) }));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`proof webhook receiver listening on http://127.0.0.1:${port} -> ${out}`);
});
