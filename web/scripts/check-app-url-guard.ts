// Guard check for src/lib/app-url.ts: with only a loopback URL configured, publicBaseUrl() must refuse by name.
// Run with the failing env in place; prints one line.
import { PublicBaseUrlRequiredError, publicBaseUrl } from "../src/lib/app-url";

try {
  const url = publicBaseUrl();
  console.log(`  NOT REFUSED - it would have sent ${url} to the provider`);
  process.exitCode = 1;
} catch (error) {
  if (error instanceof PublicBaseUrlRequiredError) {
    console.log(`  refused with PublicBaseUrlRequiredError: ${error.message.slice(0, 160)}`);
  } else {
    console.log(`  refused with a different error: ${(error as Error).message.slice(0, 160)}`);
    process.exitCode = 1;
  }
}
