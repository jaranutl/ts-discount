// run.ts
import {
  fixedAmountCoupon,
  percentCoupon,
  percentOffCategory,
  pointsRedeem,
  thresholdEveryXGetY,
  calculateFinalPrice
} from "./discounts";

const cart = [
  { sku: "TS", name: "T-Shirt", category: "Clothing", unitPrice: 350, qty: 1 },
  { sku: "HAT", name: "Hat", category: "Accessories", unitPrice: 250, qty: 1 },
];

const res = calculateFinalPrice(cart, [
  percentCoupon("c10", 10),
  pointsRedeem("p60", 60, 20),
  thresholdEveryXGetY("s300-40", 300, 40),
]);

console.log("Subtotal:", res.subtotal);
console.log("Lines:", res.lines);
console.log("Final total:", res.finalTotal);
