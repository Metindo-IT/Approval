import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { _t } from "@web/core/l10n/translation";
import { SelectionPopup } from "@point_of_sale/app/components/popups/selection_popup/selection_popup";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        this.setAllTotalDueOfPartners(this.models["res.partner"].getAll());
    },
    getPartnerCredit(partner) {
        const order = this.getOrder();
        const partnerInfos = {
            totalDue: 0,
            totalWithCart: order ? order.getTotalWithTax() : 0,
            creditLimit: 0,
            useLimit: false,
            overDue: false,
        };

        if (!partner) {
            return partnerInfos;
        }
        if (partner.parent_name) {
            const parent = this.models["res.partner"].find((p) => p.name === partner.parent_name);
            if (parent) {
                partner = parent;
            }
        }

        partnerInfos.totalDue = partner.total_due || 0;
        partnerInfos.totalWithCart += partner.total_due || 0;
        partnerInfos.creditLimit = partner.credit_limit || 0;
        partnerInfos.overDue = partnerInfos.totalWithCart > partnerInfos.creditLimit;
        partnerInfos.useLimit =
            this.company.account_use_credit_limit &&
            partner.credit_limit > 0 &&
            partnerInfos.overDue;

        return partnerInfos;
    },
    async refreshTotalDueOfPartner(partner) {
        const res = await this.data.callRelated("res.partner", "get_total_due", [
            partner.id,
            this.config.id,
        ]);
        this.deviceSync.dispatch({ "res.partner": [partner] });
        const updatePartner = res["res.partner"][0];
        if (partner.parent_name) {
            const parent = this.models["res.partner"].find((p) => p.name === partner.parent_name);
            if (parent) {
                partner = parent;
            }
        }
        partner.total_due = updatePartner.total_due;
        return [updatePartner];
    },
    async setAllTotalDueOfPartners(partners) {
        const partners_total_due = await this.data.call("res.partner", "get_all_total_due", [
            partners.map((p) => p.id),
            this.config.id,
        ]);
        for (const partner of partners) {
            partner.total_due = partners_total_due.find(
                (p) => p["res.partner"][0].id == [partner.id]
            )["res.partner"][0].total_due;
        }
        return [partners];
    },
    async getPartnerSettleDetails(partnerId) {
        return await this.data.call("res.partner", "get_partner_settle_details", [partnerId]);
    },
    async onClickSettleDue(orderIds, partner_id, partner_ids) {
        const orders = await this.data.read("pos.order", orderIds);
        const currentOrder = this.getOrder();
        currentOrder.selectedDuePartnerIds = partner_ids;
        currentOrder.setPartner(partner_id);
        for (const order of orders) {
            await this.addLineToCurrentOrder({
                price_unit: order.customer_due_total,
                qty: 1,
                taxes_id: [],
                product_tmpl_id: this.config.settle_due_product_id,
                settled_order_id: order,
            });
        }
    },
    async depositMoney(partner, amount = 0) {
        const paymentMethods = this.config.payment_method_ids.filter(
            (method) => method.type != "pay_later"
        );
        const selectionList = paymentMethods.map((paymentMethod) => ({
            id: paymentMethod.id,
            label: paymentMethod.name,
            item: paymentMethod,
        }));
        this.dialog.add(SelectionPopup, {
            title: _t("Select the payment method to deposit money"),
            list: selectionList,
            getPayload: async (selectedPaymentMethod) => {
                // Reuse an empty order that has no partner or has partner equal to the selected partner.
                let newOrder;
                const emptyOrder = this.getOpenOrders().find(
                    (order) =>
                        order.lines.length === 0 &&
                        order.payment_ids.length === 0 &&
                        (!order.partner || order.partner.id === partner.id)
                );
                if (emptyOrder) {
                    newOrder = emptyOrder;
                    // Set the empty order as the current order.
                    this.setOrder(newOrder);
                } else {
                    newOrder = this.addNewOrder();
                }
                const payment = newOrder.addPaymentline(selectedPaymentMethod);
                payment.setAmount(amount);
                newOrder.setPartner(partner);
                newOrder.is_settling_account = true;
                this.showScreen("PaymentScreen", {
                    orderUuid: this.selectedOrderUuid,
                    isDepositOrder: true,
                });
            },
        });
    },
});
