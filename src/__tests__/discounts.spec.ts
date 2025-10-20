// src/__tests__/discounts.spec.ts
import {
  fixedAmountCoupon,
  percentCoupon,
  percentOffCategory,
  pointsRedeem,
  thresholdEveryXGetY,
  calculateFinalPrice
} from '../discounts';

type CartItem = Parameters<typeof calculateFinalPrice>[0][number];

// Helper carts from your examples
const cartA: CartItem[] = [
  { sku: 'TS', name: 'T-Shirt', category: 'Clothing',    unitPrice: 350, qty: 1 },
  { sku: 'HAT',name: 'Hat',    category: 'Accessories', unitPrice: 250, qty: 1 }
]; // subtotal 600

const cartB: CartItem[] = [
  { sku: 'TS',    name: 'T-Shirt', category: 'Clothing',    unitPrice: 350, qty: 1 },
  { sku: 'HOOD',  name: 'Hoodie',  category: 'Clothing',    unitPrice: 700, qty: 1 },
  { sku: 'WATCH', name: 'Watch',   category: 'Electronics', unitPrice: 850, qty: 1 },
  { sku: 'BAG',   name: 'Bag',     category: 'Accessories', unitPrice: 640, qty: 1 }
]; // subtotal 2540

const cartC: CartItem[] = [
  { sku: 'TS',   name: 'T-Shirt', category: 'Clothing',    unitPrice: 350, qty: 1 },
  { sku: 'HAT',  name: 'Hat',     category: 'Accessories', unitPrice: 250, qty: 1 },
  { sku: 'BELT', name: 'Belt',    category: 'Accessories', unitPrice: 230, qty: 1 }
]; // subtotal 830

const round2 = (n: number) => Math.round(n * 100) / 100;

describe('Discount engine – single campaigns', () => {
  test('Coupon: fixed amount 50 → final 550 (cartA)', () => {
    const res = calculateFinalPrice(cartA, [fixedAmountCoupon('c1', 50)]);
    expect(res.subtotal).toBe(600);
    expect(res.finalTotal).toBe(550);
    expect(res.lines.map(l => l.kind)).toEqual(['coupon']);
  });

  test('Coupon: 10% → final 540 (cartA)', () => {
    const res = calculateFinalPrice(cartA, [percentCoupon('c2', 10)]);
    expect(res.finalTotal).toBe(540);
  });

  test('On Top: 15% off Clothing → final 2382.5 (cartB)', () => {
    const res = calculateFinalPrice(cartB, [percentOffCategory('cat15', 'Clothing', 15)]);
    expect(res.subtotal).toBe(2540);
    expect(res.finalTotal).toBe(2382.5);
    expect(res.lines[0].amount).toBe(157.5); // 15% of 1050 clothing
    expect(res.lines[0].kind).toBe('onTop');
  });

  test('On Top: points 68, cap 20% → final 762 (cartC)', () => {
    const res = calculateFinalPrice(cartC, [pointsRedeem('p1', 68, 20)]);
    expect(res.subtotal).toBe(830);
    expect(res.finalTotal).toBe(762); // 830 - 68
    expect(res.lines[0].amount).toBe(68);
  });

  test('Seasonal: every 300 get 40 → final 750 (cartC)', () => {
    const res = calculateFinalPrice(cartC, [thresholdEveryXGetY('s1', 300, 40)]);
    expect(res.finalTotal).toBe(750); // floor(830/300)=2 → 80 off
  });
});

describe('Rule: only one campaign per Category (pick the best inside each)', () => {
  test('Among coupons, pick the higher discount (10% vs fixed 50 on cartA)', () => {
    const res = calculateFinalPrice(cartA, [
      fixedAmountCoupon('c-fixed-50', 50),   // 50 off
      percentCoupon('c-10pct', 10)          // 60 off → better
    ]);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].kind).toBe('coupon');
    expect(res.lines[0].amount).toBe(60);
    expect(res.finalTotal).toBe(540);
  });

  test('Among onTop (15% clothing vs points 100), pick larger discount for running total', () => {
    const res = calculateFinalPrice(cartB, [
      percentOffCategory('cat15', 'Clothing', 15), // 157.5 off
      pointsRedeem('pts100', 100, 20)              // 100 off (cap is 508)
    ]);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].kind).toBe('onTop');
    expect(res.lines[0].amount).toBe(157.5);
    expect(res.finalTotal).toBe(round2(2540 - 157.5));
  });
});

describe('Order: Coupon → On Top → Seasonal', () => {
  test('Applies in strict order and uses running totals at each step', () => {
    // For cartA (600):
    // Coupon: 10% = 60 → 540
    // On Top: points 50 (cap 20% of 540 = 108) → 490
    // Seasonal: every 300 get 40 → floor(490/300)=1 → 40 off → 450
    const res = calculateFinalPrice(cartA, [
      percentCoupon('cp10', 10),
      pointsRedeem('pts50', 50, 20),
      thresholdEveryXGetY('s300-40', 300, 40)
    ]);
    expect(res.lines.map(l => l.kind)).toEqual(['coupon', 'onTop', 'seasonal']);
    expect(res.finalTotal).toBe(450);
  });

  test('When multiple exist within a category, pick best THEN continue order', () => {
    const res = calculateFinalPrice(cartC, [
      // Coupons (best is 10% = 83 > fixed 50)
      fixedAmountCoupon('c50', 50),
      percentCoupon('c10', 10),
      // On Top (choose best between category 15% and points 60)
      percentOffCategory('cloth15', 'Clothing', 15), // 52.5 on T-Shirt 350
      pointsRedeem('pts60', 60, 20),                 // cap 20% of post-coupon
      // Seasonal
      thresholdEveryXGetY('s300-40', 300, 40)
    ]);

    // Validate order
    expect(res.lines.map(l => l.kind)).toEqual(['coupon', 'onTop', 'seasonal']);

    // Quick sanity: compute expected
    // subtotal 830; coupon 10% → 747; onTop pick max(52.5, min(60, 20% of 747=149.4)=60) → 687;
    // seasonal floor(687/300)=2 → 80 off → 607
    expect(res.finalTotal).toBe(607);
  });
});

describe('Edge cases & guards', () => {
  test('Fixed coupon cannot exceed running total or go negative', () => {
    const res = calculateFinalPrice(cartA, [fixedAmountCoupon('cBig', 99999)]);
    expect(res.finalTotal).toBe(0);
  });

  test('Seasonal ignores non-positive parameters', () => {
    const res = calculateFinalPrice(cartA, [
      thresholdEveryXGetY('bad1', 0, 40),
      thresholdEveryXGetY('bad2', 300, 0)
    ]);
    expect(res.finalTotal).toBe(600);
    expect(res.lines.length).toBe(0);
  });
});
