# Season Zero Rehearsals and Drills

Training and rehearsal activity must use rehearsal or sandbox data. Training actions must not affect production records.

Draft Operator Training:

- Start event.
- Pause event.
- Reserve allocation.
- Run suspense.
- Reveal.
- Confirm.
- Recover after refresh.
- Correct authorized result.
- Switch to emergency display.

Check-in Training:

- Valid QR.
- Unpaid ticket.
- Duplicate scan.
- Manual entry.
- VIP.
- Media.
- Coach.
- Player.
- Revoked accreditation.

Vendor Training:

- Confirm payment.
- Mark order preparing.
- Mark order ready.
- Collect order.
- Reject invalid QR.
- Manage low stock.

Game Operator Training:

- Start game.
- Pause game.
- Update score.
- Correct score.
- Enter player statistics.
- Finalize game.
- Verify standings.

Full rehearsals:

1. Software Team Rehearsal

- Data integrity.
- Permissions.
- Refresh recovery.
- Error handling.
- Backup.
- Restore.
- Performance.

2. Operations Team Rehearsal

- Draft.
- Check-in.
- Vendors.
- Staff planner.
- Runbooks.
- Incidents.
- Public displays.
- Content generation.

3. Venue Simulation

- Real equipment.
- Real projector.
- Audio.
- Network.
- Power backup.
- QR scanning.
- Multiple operator devices.
- Crowd-flow simulation.
- Vendor collection.
- Emergency procedures.

Every rehearsal record should capture:

- Start time.
- End time.
- Participants.
- Scenarios completed.
- Defects discovered.
- Severity.
- Owner.
- Resolution.
- Retest status.
- Go-live blocker status.

Backup and recovery drill:

1. Create database backup.
2. Verify checksum.
3. Copy backup off-host.
4. Restore into a temporary database.
5. Compare critical counts: users, clubs, athletes, players, draft squads, draft allocations, fixtures, reservations, orders, audit logs.
6. Run the app against restored database.
7. Verify login.
8. Verify public pages.
9. Verify DraftEvent recovery.
10. Record recovery time achieved.

Performance test method:

- Simulate 500 concurrent public users.
- Simulate 200 reservation attempts.
- Simulate 100 scoreboard or public display viewers.
- Simulate 50 simultaneous check-ins.
- Simulate 25 concurrent operator actions.
- Include vendor order processing, content generation, Draft display polling, audit logging, and dashboard refresh.

Measure:

- Response time.
- Error rate.
- Database load.
- Connection usage.
- Memory.
- CPU.
- Slow queries.
- Failed transactions.
- Display update latency.

Correctness, authorization, and audit logging must not be weakened for speed.
