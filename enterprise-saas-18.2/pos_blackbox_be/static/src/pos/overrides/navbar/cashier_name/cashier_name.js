import { CashierName } from "@point_of_sale/app/components/navbar/cashier_name/cashier_name";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";

patch(CashierName.prototype, {
    async selectCashier(pin = false, login = false, list = false) {
        await super.selectCashier(...arguments);
        if (this.pos.useBlackBoxBe() && !this.pos.userSessionStatus) {
            await this.pos.clock(true);
        }
        return;
    },
    get userStatus() {
        return this.pos.userSessionStatus ? _t("In") : _t("Out");
    },
});
