const FALLBACK_AVATAR_COLOR = "#16F2B3";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "UB";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function PersonAvatar({
  className = "h-24 w-24",
  name,
  photoUrl,
}: {
  className?: string;
  name: string;
  photoUrl?: string | null;
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={name} className={`${className} rounded-2xl object-cover`} src={photoUrl} />;
  }
  return (
    <div
      className={`${className} grid place-items-center rounded-2xl border text-lg font-black`}
      style={{ borderColor: `${FALLBACK_AVATAR_COLOR}55`, background: `${FALLBACK_AVATAR_COLOR}15`, color: FALLBACK_AVATAR_COLOR }}
      title={`${name} - no photo on file`}
    >
      {initials(name)}
    </div>
  );
}
