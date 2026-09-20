export function formatNaira(kobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(kobo / 100);
}

export function nairaToKobo(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("INVALID_AMOUNT");
  }
  return Math.round(amount * 100);
}

// F5 vendor marketplace: split a gross amount into league commission and vendor net at
// the given basis points. Floors the commission so the two parts always sum to gross.
export function commissionSplitKobo(grossKobo: number, commissionBps: number): { commissionKobo: number; netKobo: number } {
  if (grossKobo <= 0 || commissionBps <= 0) return { commissionKobo: 0, netKobo: Math.max(0, grossKobo) };
  const commissionKobo = Math.floor((grossKobo * Math.min(commissionBps, 10000)) / 10000);
  return { commissionKobo, netKobo: grossKobo - commissionKobo };
}
