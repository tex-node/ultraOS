import { Bachs } from "@bachs/sdk";

// Is the sandbox key valid? (streak v24, Prompt 1) - a READ-ONLY call through the SDK, which derives the sandbox host
// from the key prefix. The key itself is never printed: only the environment the SDK chose and the shape of the answer.
async function main() {
  const key = process.env.BACH_IO ?? process.env.BACHS_KEY ?? process.env.BACHS_SANDBOX_KEY ?? "";
  if (!key) {
    console.log("  no key configured");
    process.exitCode = 1;
    return;
  }
  console.log(`  key prefix: ${key.slice(0, 11)}… (${key.length} chars)`);
  const client = new Bachs({ apiKey: key });
  console.log(`  SDK environment: ${client.environment}`);

  try {
    const products = (await client.products.list({ limit: 5 } as never)) as unknown as {
      data?: { id?: string; name?: string }[];
    };
    const list = products.data ?? [];
    console.log(`  products.list -> OK · ${list.length} product(s) visible to this key`);
    for (const product of list.slice(0, 5)) {
      console.log(`    ${product.id ?? "?"} · ${product.name ?? "(unnamed)"}`);
    }
    if (list.length === 0) console.log("  NOTE: the key works, but sandbox has no products - the product ids must be created in the Bachs dashboard");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  products.list -> FAILED: ${message.slice(0, 220)}`);
    process.exitCode = 1;
  }
}
main();
