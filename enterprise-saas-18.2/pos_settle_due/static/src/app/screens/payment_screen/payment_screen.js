import { _t } from "@web/core/l10n/translation";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { floatIsZero } from "@web/core/utils/numbers";
import { ask } from "@point_of_sale/app/utils/make_awaitable_dialog";

patch(PaymentScreen, {
    props: {
        ...PaymentScreen.props,
        isDepositOrder: { type: Boolean, optional: true },
    },
});

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        const order = this.currentOrder;
        const settleDueLines = order.lines.filter((line) => line.isSettleDueLine());
        if (settleDueLines.length || this.props.isDepositOrder) {
            this.payment_methods_from_config = this.payment_methods_from_config.filter(
                (pm) => pm.type !== "pay_later"
            );
        }
    },
    get partnerInfos() {
        const order = this.currentOrder;
        return this.pos.getPartnerCredit(order.getPartner());
    },
    get highlightPartnerBtn() {
        const order = this.currentOrder;
        const partner = order.getPartner();
        return (!this.partnerInfos.useLimit && partner) || (!this.partnerInfos.overDue && partner);
    },
    async ensurePartnerSelected(order) {
        let partner = order.getPartner();
        if (!partner) {
            const confirmed = await ask(this.dialog, {
                title: _t("The order is empty"),
                body: _t(
                    "Do you want to deposit money to a specific customer? If so, first select him/her."
                ),
                confirmLabel: _t("Yes"),
            });
            if (!(confirmed && (partner = await this.pos.selectPartner()))) {
                return false;
            }
        }
        return partner;
    },
    async validateOrder(isForceValidate) {
        const order = this.currentOrder;
        const change = order.getChange();
        const settleDueLines = order.lines.filter((line) => line.isSettleDueLine());
        const paylaterPaymentMethod = this.pos.models["pos.payment.method"].find(
            (pm) =>
                this.pos.config.payment_method_ids.some((m) => m.id === pm.id) &&
                pm.type === "pay_later"
        );
        const existingPayLaterPayment = order.payment_ids.find(
            (payment) => payment.payment_method_id.type == "pay_later"
        );

        //If it's a deposit or settle due order
        if (
            ((!floatIsZero(change, this.pos.currency.decimal_places) &&
                order.getOrderlines().length === 0 &&
                this.props.isDepositOrder) ||
                settleDueLines.length) &&
            paylaterPaymentMethod &&
            !existingPayLaterPayment
        ) {
            if (order._isRefundOrder()) {
                return this.dialog.add(AlertDialog, {
                    title: _t("Error"),
                    body: _t("You cannot refund a deposit/settling order."),
                });
            }
            const partner = await this.ensurePartnerSelected(order);
            if (!partner) {
                return;
            }
            if (settleDueLines.length) {
                return this.settleOrderDues(order, partner, paylaterPaymentMethod);
            } else {
                return this.depositOrder(order, partner, change, paylaterPaymentMethod);
            }
        } else {
            return super.validateOrder(...arguments);
        }
    },
    async settleOrderDues(order, partner, paylaterPaymentMethod) {
        const selectedDuePartnerIds = order.selectedDuePartnerIds;
        const amountToSettle = order.getSettleAmount();
        if (selectedDuePartnerIds && selectedDuePartnerIds.includes(partner.id)) {
            const confirmed = await ask(this.dialog, {
                title: _t("Settle due orderlines"),
                body: _t(
                    "Do you want to deposit %s to %s?",
                    this.env.utils.formatCurrency(amountToSettle),
                    partner.name
                ),
                confirmLabel: _t("Yes"),
            });
            if (confirmed) {
                const paylaterPayment = order.addPaymentline(paylaterPaymentMethod);
                paylaterPayment.setAmount(-amountToSettle);
                return super.validateOrder(...arguments);
            }
        } else {
            this.dialog.add(AlertDialog, {
                title: _t("Error"),
                body: _t(
                    "The selected customer is not in the list of partners of the ongoing settling orderlines."
                ),
            });
        }
    },
    async depositOrder(order, partner, change, paylaterPaymentMethod) {
        const confirmed = await ask(this.dialog, {
            title: _t("The order is empty"),
            body: _t(
                "Do you want to deposit %s to %s?",
                this.env.utils.formatCurrency(change),
                partner.name
            ),
            confirmLabel: _t("Yes"),
        });
        if (confirmed) {
            await this.pos.addLineToCurrentOrder({
                price_unit: change,
                qty: 1,
                taxes_id: [],
                product_tmpl_id: this.pos.config.deposit_product_id,
            });
            const paylaterPayment = order.addPaymentline(paylaterPaymentMethod);
            paylaterPayment.setAmount(-change);
            return super.validateOrder(...arguments);
        }
    },
    async afterOrderValidation(suggestToSync = false) {
        await super.afterOrderValidation(...arguments);
        const hasCustomerAccountAsPaymentMethod = this.currentOrder.payment_ids.find(
            (paymentline) => paymentline.payment_method_id.type === "pay_later"
        );
        const partner = this.currentOrder.getPartner();
        if (hasCustomerAccountAsPaymentMethod && partner.total_due !== undefined) {
            this.pos.refreshTotalDueOfPartner(partner);
        }
    },
});
