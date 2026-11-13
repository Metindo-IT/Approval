import { patch } from "@web/core/utils/patch";
import { Order } from "@pos_preparation_display/app/models/order";
import { deserializeDateTime } from "@web/core/l10n/dates";

patch(Order.prototype, {
    setup(order) {
        super.setup(...arguments);
        this.table = order.table;
        this.course = order.course;
        this.floating_order_name = order.floating_order_name;
    },

    getDurationSinceFireDate() {
        return this.computeDurationSinceDate(deserializeDateTime(this.course.fired_date));
    },
});
