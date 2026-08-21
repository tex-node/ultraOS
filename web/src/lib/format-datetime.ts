const LAGOS_TIME_ZONE = "Africa/Lagos";

// The server's own system clock is not necessarily in Lagos time, and .toLocaleString()
// with no timeZone silently renders in whatever zone the process happens to be running in.
// Every game/event is played in Lagos, so display always pins to that zone explicitly.
export function formatLagosDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "numeric",
    timeZone: LAGOS_TIME_ZONE,
    year: "numeric",
  }).format(date);
}

export function formatLagosDate(date: Date) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "numeric",
    timeZone: LAGOS_TIME_ZONE,
    year: "numeric",
  }).format(date);
}

export function formatLagosTime(date: Date) {
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: LAGOS_TIME_ZONE,
  }).format(date);
}
