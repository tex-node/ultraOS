# Database Backup and Restore

## Event-day manual backup

Run this before doors open and before any bulk operational change:

```powershell
$env:DATABASE_URL = "postgresql://..."
npm run db:backup
```

The command writes a compressed PostgreSQL custom-format dump and a SHA-256
checksum. Copy both files to storage outside the application VPS.

## Nightly backup

Install `ops/ultraos-backup.service` and `ops/ultraos-backup.timer`, create
`/var/backups/ultraleagueos`, and grant it to the `ultraos` service account.
Enable the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ultraos-backup.timer
sudo systemctl list-timers ultraos-backup.timer
```

Production retains 14 daily backups by default. Replicate the dump and checksum
files off-host after each successful run.

## Restore drill

1. Put the application in maintenance mode and stop application writers.
2. Take one final backup of the current database.
3. Provision a clean PostgreSQL database when possible.
4. Verify and restore:

```powershell
$env:DATABASE_URL = "postgresql://.../ultraleagueos_restore"
npm run db:restore -- -BackupPath C:\backups\ultraos-YYYYMMDD-HHMMSS.dump -Confirm RESTORE -Clean
```

5. Run `npx prisma migrate status`.
6. Start the application against the restored database.
7. Verify login, clubs, fixtures, the latest game, audit records, and standings.
8. Record the restore time and outcome in the operations log.

Never test a restore for the first time against the only production database.
