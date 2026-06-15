export type PricedLine = {
  subtotalKobo: number;
  discountKobo: number;
};

export function calculateOrderPricing(
  seatSubtotalKobo: number,
  lines: PricedLine[],
  promoDiscountBps: number,
) {
  const productSubtotalKobo = lines.reduce(
    (sum, line) => sum + line.subtotalKobo,
    0,
  );
  const lineDiscountKobo = lines.reduce(
    (sum, line) => sum + line.discountKobo,
    0,
  );
  const subtotalKobo = seatSubtotalKobo + productSubtotalKobo;
  const afterLineDiscountKobo = Math.max(
    0,
    subtotalKobo - lineDiscountKobo,
  );
  const promoDiscountKobo = Math.floor(
    (afterLineDiscountKobo * promoDiscountBps) / 10000,
  );
  const discountKobo = lineDiscountKobo + promoDiscountKobo;
  return {
    subtotalKobo,
    discountKobo,
    totalKobo: Math.max(0, subtotalKobo - discountKobo),
  };
}

export function remainingInventory(stock: number, reserved: number, sold: number) {
  return Math.max(0, stock - reserved - sold);
}
