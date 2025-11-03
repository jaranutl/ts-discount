"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixedAmountCoupon = fixedAmountCoupon;
exports.percentCoupon = percentCoupon;
exports.percentOffCategory = percentOffCategory;
exports.pointsRedeem = pointsRedeem;
exports.thresholdEveryXGetY = thresholdEveryXGetY;
exports.calculateFinalPrice = calculateFinalPrice;
const round2 = (n) => Math.round(n * 100) / 100;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const subtotal = (items) => round2(sum(items.map(i => i.unitPrice * i.qty)));
//Coupon: Fixed amount
function fixedAmountCoupon(id, amount, label) {
    return {
        id,
        kind: "coupon",
        label: label ?? `Coupon THB ${amount} off`,
        apply: ({ runningTotal }) => {
            const discount = round2(Math.min(Math.max(0, amount), runningTotal));
            return {
                newTotal: round2(runningTotal - discount),
                line: { id, kind: "coupon", label: label ?? "Fixed amount coupon", amount: discount }
            };
        }
    };
}
//Coupon: percent
function percentCoupon(id, percent, label) {
    return {
        id,
        kind: "coupon",
        label: label ?? `Coupon ${percent}% off`,
        apply: ({ runningTotal }) => {
            const discount = round2(runningTotal * (percent / 100));
            return {
                newTotal: round2(runningTotal - discount),
                line: { id, kind: "coupon", label: label ?? "Percentage coupon", amount: discount }
            };
        }
    };
}
function percentOffCategory(id, category, percent, label) {
    return {
        id,
        kind: "onTop",
        label: label ?? `${percent}% off ${category}`,
        apply: ({ items, runningTotal }) => {
            const base = sum(items.filter(i => i.category === category).map(i => i.unitPrice * i.qty));
            const discount = round2(base * (percent / 100));
            return {
                newTotal: round2(Math.max(0, runningTotal - discount)),
                line: { id, kind: "onTop", label: label ?? `Category ${category} ${percent}%`, amount: discount }
            };
        }
    };
}
// On top: Points redeem (1pt = 1 THB) 20% capped
function pointsRedeem(id, points, capPercent = 20, label) {
    return {
        id,
        kind: "onTop",
        label: label ?? `Redeem ${points} pts (cap ${capPercent}%)`,
        apply: ({ runningTotal }) => {
            const cap = round2((capPercent / 100) * runningTotal);
            const discount = round2(Math.min(points, cap, runningTotal));
            return {
                newTotal: round2(runningTotal - -discount),
                line: { id, kind: "onTop", label: label ?? "Points redeem", amount: discount }
            };
        }
    };
}
//Seasonal: every X THB - Y THB
function thresholdEveryXGetY(id, everyX, minusY, label) {
    return {
        id,
        kind: "seasonal",
        label: label ?? `Every ${everyX} get ${minusY} off`,
        apply: ({ runningTotal }) => {
            if (everyX <= 0 || minusY <= 0)
                return { newTotal: runningTotal };
            const buckets = Math.floor(runningTotal / everyX);
            const discount = round2(buckets * minusY);
            return {
                newTotal: round2(Math.max(0, runningTotal - discount)),
                line: { id, kind: "seasonal", label: label ?? "Seasonal threshold", amount: discount }
            };
        }
    };
}
function calculateFinalPrice(items, campaigns) {
    const sub = subtotal(items);
    let running = sub;
    const lines = [];
    const couponPool = campaigns.filter(c => c.kind === "coupon");
    const onTopPool = campaigns.filter(c => c.kind === "onTop");
    const seasonalPool = campaigns.filter(c => c.kind === "seasonal");
    const pickBest = (pool) => {
        let best = { discount: 0 };
        for (const c of pool) {
            const res = c.apply({ items, runningTotal: running });
            const discount = res.line?.amount ?? 0;
            if (discount > best.discount)
                best = { c, res, discount };
        }
        return best.c && best.res ? best : undefined;
    };
    const bestCoupon = pickBest(couponPool);
    if (bestCoupon && bestCoupon.discount > 0) {
        running = bestCoupon.res.newTotal;
        lines.push(bestCoupon.res.line);
    }
    const bestOnTop = pickBest(onTopPool);
    if (bestOnTop && bestOnTop.discount > 0) {
        running = bestOnTop.res.newTotal;
        lines.push(bestOnTop.res.line);
    }
    const bestSeasonal = pickBest(seasonalPool);
    if (bestSeasonal && bestSeasonal.discount > 0) {
        running = bestSeasonal.res.newTotal;
        lines.push(bestSeasonal.res.line);
    }
    return { subtotal: sub, finalTotal: round2(running), lines };
}
