// Session versioning: changing your password signs out every other device.
//
// Each issued JWT carries the user's sessionVersion at sign-in time. On every page load the session
// callback re-reads the row and accepts the token only if the versions still match. A password
// change bumps the row, so every other device's token stops matching and that session is treated
// as signed out. Tokens minted before the column existed carry no version claim and are treated as
// version 0 - the migration backfills every row to 0, so nobody is signed out by the upgrade itself.

export type VersionedToken = { sessionVersion?: unknown };

export function tokenSessionVersion(token: VersionedToken): number {
  return typeof token.sessionVersion === "number" && Number.isInteger(token.sessionVersion)
    ? token.sessionVersion
    : 0;
}

export function sessionVersionMatches(token: VersionedToken, dbVersion: number): boolean {
  return tokenSessionVersion(token) === dbVersion;
}
