import { _t } from "@web/core/l10n/translation";

import { Component } from "@odoo/owl";

export class StockMove extends Component {
    static props = {
        clickable: Boolean,
        displayUOM: Boolean,
        label: { optional: true, type: String },
        parent: Object,
        record: Object,
        uom: { optional: true, type: Object },
        displayInstruction: { optional: true, type: Function },
    };
    static template = "mrp_workorder.StockMove";

    setup() {
        this.fieldState = "state";
        this.resModel = this.props.record.resModel;
        this.resId = this.props.record.resId;
    }

    get cssClass() {
        return this.isComplete ? "text-muted" : "";
    }

    get isComplete() {
        return Boolean(this.props.record.data.picked);
    }

    get toConsumeQuantity() {
        const move = this.props.record.data;
        const parent = this.props.parent.data;
        let toConsumeQuantity = move.should_consume_qty || move.product_uom_qty;
        if (parent.product_tracking === "serial") {
            toConsumeQuantity /= this.props.parent.data.product_qty;
        }
        return toConsumeQuantity;
    }

    get quantityDone() {
        return this.props.record.data.quantity;
    }

    get uom() {
        if (this.props.displayUOM) {
            return this.props.record.data.product_uom[1];
        }
        return this.toConsumeQuantity === 1 ? _t("Unit") : _t("Units");
    }

    async onClick() {
        if (!this.props.clickable) {
            return;
        }
        await this.clicked();
    }

    async clicked() {
        this.props.displayInstruction();
    }

    async toggleQuantityDone() {
        if (!this.props.clickable) {
            return;
        } else if (!this.toConsumeQuantity || this.isComplete) {
            return this.clicked();
        }
        await this.props.record.model.orm.call("stock.move", "action_pass", [
            this.props.record.resId,
            true,
        ]);
        await this.env.reload(this.props.parent);
    }

    get state() {
        return this.props.record.data[this.fieldState];
    }
}
