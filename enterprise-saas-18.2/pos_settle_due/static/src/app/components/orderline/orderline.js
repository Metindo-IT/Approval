import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { patch } from "@web/core/utils/patch";

patch(Orderline.prototype, {
    get priceChange() {
        if (this.line.isSettleDueLine()) {
            return false;
        }
        return super.priceChange;
    },
});
