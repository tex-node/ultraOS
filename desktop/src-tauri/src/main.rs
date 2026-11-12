// UltraOS Scoring — the binary.
//
// Everything meaningful is in `lib.rs` so the shell can be linked as a library (Cargo's `[lib]` target) and so a future mobile
// or test harness can drive the same `run()`.
//
// Run: `npm run desktop:dev` from this directory, or `cargo run` for a build-only check.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ultraos_desktop_lib::run()
}
