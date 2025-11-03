type Money = number;
type Category = "Clothing" | "Accessories" | "Electronics" | string;

interface CartItem {
    sku: string;
    name: string;
    category: Category;
    unitPrice: Money;
    qty: number;
}

type CampaignKind = "coupon" | "onTop" | "seasonal";

interface ApplyContext {
    items: CartItem[];
    runningTotal: Money;
}

interface DiscountLine {
    id: string;
    label: string;
    amount: Money;
    kind: CampaignKind;
}
interface ApplyResult {
    newTotal: Money;
    line?: DiscountLine;
}
interface Campaign {
    id: string;
    kind: CampaignKind;
    label: string;
    apply(ctx: ApplyContext): ApplyResult;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const subtotal = (items: CartItem[]) =>
    round2(sum(items.map(i => i.unitPrice * i.qty)));


//Coupon: Fixed amount
export function fixedAmountCoupon(id: string, amount: Money, label?: string): Campaign {
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
export function percentCoupon(id: string, percent: number, label?: string): Campaign {
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

export function percentOffCategory(
    id: string,
    category: Category,
    percent: number,
    label?: string
): Campaign {
    return{
        id,
        kind: "onTop",
        label: label ?? `${percent}% off ${category}`,
        apply: ({items, runningTotal}) =>{
            const base = sum(items.filter(i=> i.category === category).map(i=>i.unitPrice* i.qty));
            const discount = round2(base * (percent / 100));
            return {
                newTotal : round2(Math.max(0, runningTotal -discount)),
                line: {id, kind: "onTop", label: label?? `Category ${category} ${percent}%`, amount: discount}
            };
        }
    };
}

// On top: Points redeem (1pt = 1 THB) 20% capped
export function pointsRedeem(
    id: string,
    points: number,
    capPercent = 20,
    label?: string
): Campaign {
    return{
        id,
        kind: "onTop",
        label: label ?? `Redeem ${points} pts (cap ${capPercent}%)`,
        apply: ({ runningTotal})=>{
            const cap = round2((capPercent /100)* runningTotal);
            const discount = round2(Math.min(points, cap, runningTotal));
            return{
                newTotal: round2(runningTotal - discount),
                line: {id, kind: "onTop", label: label?? "Points redeem", amount: discount}
            };
        }
    };
}

//Seasonal: every X THB - Y THB
export function thresholdEveryXGetY(
    id: string,
    everyX: Money,
    minusY: Money,
    label?: string
): Campaign {
    return{
        id,
        kind: "seasonal",
        label: label ?? `Every ${everyX} get ${minusY} off`,
        apply: ({runningTotal}) =>{
            if (everyX <= 0 || minusY <= 0 ) return { newTotal: runningTotal};
            const buckets = Math.floor(runningTotal / everyX);
            const discount = round2(buckets * minusY);
            return {
                newTotal: round2(Math.max(0, runningTotal - discount)),
                line: {id, kind: "seasonal", label: label?? "Seasonal threshold", amount: discount}
            };
        }
    };
}

export interface CalcResult {
    subtotal: Money;
    finalTotal: Money;
    lines: DiscountLine[];
}

export function calculateFinalPrice(items: CartItem[], campaigns: Campaign[]): CalcResult{
    const sub = subtotal(items);
    let running = sub;
    const lines: DiscountLine[] = [];

    const couponPool = campaigns.filter(c=> c.kind === "coupon");
    const onTopPool = campaigns.filter(c=> c.kind === "onTop");
    const seasonalPool = campaigns.filter(c=>c.kind === "seasonal");

    const pickBest = (pool: Campaign[])=>{
        let best: {c?: Campaign; res?: ApplyResult; discount: number} = {discount: 0};
        for (const c of pool){
            const res = c.apply({items, runningTotal:running});
            const discount = res.line?.amount ?? 0;
            if (discount > best.discount) best = { c, res, discount};
        }
        return best.c && best.res ? best : undefined;
    };

    const bestCoupon = pickBest(couponPool);
    if (bestCoupon && bestCoupon.discount > 0){
        running = bestCoupon.res!.newTotal;
        lines.push(bestCoupon.res!.line!);
    }

    const bestOnTop = pickBest(onTopPool);
    if (bestOnTop && bestOnTop.discount > 0){
        running = bestOnTop.res!.newTotal;
        lines.push(bestOnTop.res!.line!);
    }

    const bestSeasonal = pickBest(seasonalPool);
    if (bestSeasonal && bestSeasonal.discount>0){
        running = bestSeasonal.res!.newTotal;
        lines.push(bestSeasonal.res!.line!);
    }

    return {subtotal: sub, finalTotal: round2(running), lines};
}