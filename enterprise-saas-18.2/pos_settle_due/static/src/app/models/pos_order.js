import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { roundPrecision } from "@web/core/utils/numbers";

patch(PosOrder.prototype, {
    getSettleAmount() {
        return this.lines
            .filter((line) => line.isSettleDueLine())
            .reduce((acc, line) => acc + line.getPriceWithTax(), 0);
    },
    getTotalPaid() {
        if (this.lines.filter((line) => line.isSettleDueLine() || line.isDepositLine()).length) {
            // We exclude the negative payment lines from the total paid (otherwise the total paid is 0)
            return roundPrecision(
                this.payment_ids
                    .filter(
                        (paymentLine) =>
                            paymentLine.isDone() &&
                            (paymentLine.getAmount() > 0 ||
                                paymentLine.payment_method_id.type !== "pay_later")
                    )
                    .reduce((sum, paymentLine) => sum + paymentLine.getAmount(), 0),
                this.currency.rounding
            );
        }
        return super.getTotalPaid();
    },
    get taxTotals() {
        if (this.lines.filter((line) => line.isSettleDueLine() || line.isDepositLine()).length) {
            const res = super.taxTotals;
            // Deduce the "pay_later" amount from the order_remaining to get the correct value
            const payLaterAmount = this.payment_ids
                .filter(
                    (paymentLine) =>
                        paymentLine.isDone() && paymentLine.payment_method_id.type === "pay_later"
                )
                .reduce((sum, paymentLine) => sum + paymentLine.getAmount(), 0);

            res.order_remaining += payLaterAmount;
            return res;
        }
        return super.taxTotals;
    },
});
