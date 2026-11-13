/** @odoo-module **/

import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";
import { registry } from "@web/core/registry";
import { useBus, useService } from "@web/core/utils/hooks";

export class ShopFloorFormController extends FormController {
    static props = {
        ...FormController.props,
        qualityCheckDone: { type: Function | Boolean, optional: true },
        openPreviousCheck: { type: Function | Boolean, optional: true },
        openNextCheck: { type: Function | Boolean, optional: true },
    };

    setup() {
        super.setup();
        this.barcode = useService("barcode");
        useBus(this.barcode.bus, "barcode_scanned", this._onBarcodeScanned);
        this.actionService = useService("action");
    }

    async _onBarcodeScanned(event) {
        if (event.detail.barcode.startsWith("OBT") || event.detail.barcode.startsWith("OCD")) {
            return;
        }
        await this.model.root.save();
        await this.orm.call("stock.move", "add_lot_from_barcode", [
            [this.props.resId],
            event.detail.barcode,
        ]);
        await this.model.root.load();
    }

    async backPressed() {
        await this.saveButtonClicked({ closable: false });
        await this.props.openPreviousCheck();
        await this.actionService.doAction({ type: "ir.actions.act_window_close" });
    }

    async nextPressed() {
        await this.saveButtonClicked({ closable: false });
        await this.orm.call("stock.move", "action_pass", [this.props.resId]);
        if (this.props.qualityCheckDone) {
            await this.props.qualityCheckDone();
        }
        await this.actionService.doAction({ type: "ir.actions.act_window_close" });
    }

    async skipPressed() {
        await this.saveButtonClicked({ closable: false });
        await this.props.openNextCheck();
        await this.actionService.doAction({ type: "ir.actions.act_window_close" });
    }
}

export const form = { ...formView, Controller: ShopFloorFormController };

registry.category("views").add("move_form_shop_floor", form);
