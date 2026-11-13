import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { BlackboxError } from "@pos_blackbox_be/pos/app/utils/blackbox_error";
const EMPTY_SIGNATURE = "                                        ";

patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        if (this.pos.useBlackBoxBe() && !this.pos.userSessionStatus) {
            this.dialog.add(AlertDialog, {
                title: _t("POS error"),
                body: _t("User must be clocked in."),
            });
            return;
        }
        await super.validateOrder(isForceValidate);
    },
    async afterOrderValidation() {
        if (
            !this.currentOrder.blackbox_signature ||
            this.currentOrder.blackbox_signature == EMPTY_SIGNATURE
        ) {
            await this.pos.syncAllOrders({ orders: [this.currentOrder], throw: true });
        }
        return super.afterOrderValidation();
    },
    handleValidationError(error) {
        try {
            return super.handleValidationError(error);
        } catch (e) {
            if (e instanceof BlackboxError) {
                this.currentOrder.state = "draft";
            }
            throw error;
        }
    },
});
