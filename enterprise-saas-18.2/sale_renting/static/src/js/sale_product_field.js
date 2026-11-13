import { SaleOrderLineProductField } from '@sale/js/sale_product_field';
import { serializeDateTime } from "@web/core/l10n/dates";
import { patch } from '@web/core/utils/patch';

patch(SaleOrderLineProductField.prototype, {
    _getAdditionalRpcParams() {
        const params = super._getAdditionalRpcParams();
        const saleOrder = this.props.record.model.root;
        if (saleOrder.data.is_rental_order) {
            params.start_date = serializeDateTime(saleOrder.data.rental_start_date);
            params.end_date = serializeDateTime(saleOrder.data.rental_return_date);
        }
        return params;
    },

    _getAdditionalDialogProps() {
        const props = super._getAdditionalDialogProps();
        const saleOrder = this.props.record.model.root;
        if (saleOrder.data.is_rental_order) {
            props.start_date = serializeDateTime(saleOrder.data.rental_start_date);
            props.end_date = serializeDateTime(saleOrder.data.rental_return_date);
        }
        return props;
    },
});
