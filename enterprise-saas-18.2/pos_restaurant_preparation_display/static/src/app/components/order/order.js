import { patch } from "@web/core/utils/patch";
import { Order } from "@pos_preparation_display/app/components/order/order";
import { useEffect } from "@odoo/owl";
patch(Order.prototype, {
    setup() {
        super.setup();
        this.didMount = false;
        // Ensure the correct duration is calculated immediately when switching from "pending" to a non-pending state
        useEffect(
            (isPending) => {
                if (!this.didMount) {
                    this.didMount = true;
                    return;
                }
                if (!isPending) {
                    this._updateDuration();
                }
            },
            () => [this.isPending]
        );
    },
    get isPending() {
        const { order } = this.props;
        return this.isInFirstStage() && order?.course && !order.course.fired;
    },
    isInFirstStage() {
        return this.preparationDisplay.firstStage.id === this.props.order.stageId;
    },
    _getOrderDuration() {
        const { order } = this.props;
        if (this.isInFirstStage() && order?.course?.fired) {
            return order.getDurationSinceFireDate();
        }
        return super._getOrderDuration();
    },
    get cardColor() {
        const cardColor = super.cardColor;
        const table = this.props.order.table;
        let tableOrdersInStage = [];

        if (table.id && this.preparationDisplay.tables[table.id].length) {
            const tableOrders = this.preparationDisplay.tables[table.id];
            tableOrdersInStage = tableOrders.filter((order) => order.stageId === this.stage.id);

            if (this.preparationDisplay.selectedStageId === 0) {
                tableOrdersInStage = tableOrders;
            }
        }

        return tableOrdersInStage.length > 1 ? "o_pdis_card_color_" + (table.id % 9) : cardColor;
    },
});
