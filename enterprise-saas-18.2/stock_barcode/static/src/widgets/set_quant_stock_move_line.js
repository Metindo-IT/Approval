import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { X2ManyField, x2ManyField } from "@web/views/fields/x2many/x2many_field";
import { onWillStart } from "@odoo/owl";

export class StockBarcodeQuantOne2ManyField extends X2ManyField {
    setup() {
        super.setup();
        this.orm = useService("orm");
        this.notification = useService("notification");
        onWillStart(async () => {
            this.locationsEnabled = await user.hasGroup("stock.group_stock_multi_locations");
        });
    }

    async openRecord(record) {
        if (this.locationsEnabled) {
            const vals = { quant_id: record.data.id };
            if (["internal", "outgoing"].includes(this.props.record.data.picking_code)) {
                Object.assign(vals, {
                    location_id: record.data.location_id,
                    lot_id: record.data.lot_id,
                    package_id: record.data.package_id,
                    owner_id: record.data.owner_id,
                });
                return await this.props.record.update(vals);
            }
        }
        return super.openRecord(record);
    }
}

export const stockBarcodeQuantOne2ManyField = {
    ...x2ManyField,
    component: StockBarcodeQuantOne2ManyField,
};

registry.category("fields").add("stock_barcode_quant_one2many", stockBarcodeQuantOne2ManyField);
