# Runbook: Broadcast Consumer Recovery

G.20, Part XXXVII, XXXIX-XL, LIII. What happens to a broadcast consumer (a browser source, a
public API poller) when something interrupts it, and what was actually tested vs. reasoned about.

## Browser sources (OBS/vMix)

**Page reload**: full recovery, always — every route re-derives its content fresh from
Postgres/SystemSetting on load (`force-dynamic`, no cache). Nothing to lose.

**Service restart**: full recovery within one poll cycle (3-5s). Program state lives in the
`SystemSetting` table, not in memory — proven directly in the G.19 rehearsal and re-confirmed in
the G.20 multi-consumer rehearsal with diagnostics and public API pollers active simultaneously
(see `FULL_PRODUCTION_REHEARSAL.md`).

**Brief network interruption at the consumer**: the browser source simply fails one poll and
retries on the next `GraphicRefresher` interval — it keeps showing its last successfully-fetched
state (no fake zero values, per Part XXXIX's own instruction), then recovers to authoritative
state on the next successful poll. See "What was actually tested" below for how this was
verified in this environment.

## Public API consumers (`/api/v1/*`)

Same recovery story: every request is independent and stateless. A consumer that loses
connectivity mid-poll simply retries; there is no session or connection state on the server side
to desynchronize. `generatedAt`/`dataUpdatedAt` on every response let a consumer detect and
display its own staleness if it wants to.

## What was actually tested vs. reasoned about (Part XXXVII, honest disclosure)

This track's environment cannot literally sever network access to one specific consumer process
without affecting the tooling running the rehearsal itself (no sandboxed network namespace or
proxy-level fault injection is available here). What **was** tested directly, against the real
deployed server:

- A real service restart (`systemctl restart ultraos-web.service`) while Program state was set
  and public API pollers were mid-poll — confirmed all state returned correctly afterward (see
  `FULL_PRODUCTION_REHEARSAL.md`).
- A deliberately invalid Program state (referencing a REHEARSAL fixture) — confirmed
  `/api/broadcast/program` refuses to serve it rather than crashing or leaking it.

What was **reasoned about, not literally simulated**: a consumer-side network drop. The
reasoning: every route is stateless and force-dynamic, so a dropped request has zero server-side
consequence by construction — there is no in-flight transaction, subscription, or session for a
network blip to corrupt. This is a structural guarantee (statelessness), not something that
needs a live fault-injection test to become true, but it has not been proven with an actual
packet-loss experiment. Documented honestly here rather than claimed as tested.
