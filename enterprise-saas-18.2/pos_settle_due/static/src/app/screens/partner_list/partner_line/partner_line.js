import { PartnerLine } from "@point_of_sale/app/screens/partner_list/partner_line/partner_line";
import { patch } from "@web/core/utils/patch";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { CustomSelectCreateDialog } from "@pos_settle_due/app/views/view_dialogs/select_create_dialog";
import { useService } from "@web/core/utils/hooks";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

patch(PartnerLine.prototype, {
    setup() {
        super.setup(...arguments);
        this.pos = usePos();
        this.dialog = useService("dialog");
    },
    get partnerInfos() {
        return this.pos.getPartnerCredit(this.props.partner);
    },
    async settleCustomerDue() {
        this.props.close();
        const partner_id = this.props.partner.id;
        const partnerDetails = await this.pos.getPartnerSettleDetails(partner_id);
        if (!partnerDetails[1]) {
            return this.depositMoney(this.props.partner.total_due);
        }
        this.dialog.add(CustomSelectCreateDialog, {
            resModel: "pos.order",
            noCreate: true,
            multiSelect: true,
            listViewId: this.pos.models["ir.ui.view"].find(
                (v) => v.name == "customer_due_pos_order_list_view"
            ).id,
            domain: [
                ["partner_id", "in", partnerDetails[0]],
                ["customer_due_total", ">", 0],
            ],
            onSelected: async (orderIds) => {
                const settleDueLinesIds = this.pos
                    .getOrder()
                    .lines.filter((line) => line.isSettleDueLine())
                    .map((line) => line.settled_order_id.id);
                const isAnyOrderAlreadySettled = orderIds.some((orderId) =>
                    settleDueLinesIds.includes(orderId)
                );
                if (isAnyOrderAlreadySettled) {
                    return this.dialog.add(AlertDialog, {
                        title: _t("Error"),
                        body: _t("One of the selected orders is already being settled."),
                    });
                }
                this.pos.onClickSettleDue(orderIds, partner_id, partnerDetails[0]);
            },
        });
    },
    async depositMoney(amount = 0) {
        this.props.close();
        this.pos.depositMoney(this.props.partner, amount);
    },
});
