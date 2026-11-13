import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";

import { AccountMoveFormView, AccountMoveFormRenderer } from '@account/components/account_move_form/account_move_form';
import { ExtractMixinFormRenderer } from '@iap_extract/components/manual_correction/form_renderer';

export class InvoiceExtractFormRenderer extends ExtractMixinFormRenderer(AccountMoveFormRenderer) {
    setup() {
        super.setup();
        this.recordModel = 'account.move';
        this._fieldsMapping = {
            'partner_id': 'supplier',
            'ref': 'invoice_id',
            'invoice_date': 'date',
            'invoice_date_due': 'due_date',
            'currency_id': 'currency',
            'quick_edit_total_amount': 'total',
        };
    }

    /**
     * @override ExtractMixinFormRenderer
     */
    shouldRenderBoxes() {
        return (
            super.shouldRenderBoxes() &&
            this.props.record.data.state === 'draft' &&
            ['in_invoice', 'in_refund', 'out_invoice', 'out_refund'].includes(this.props.record.data.move_type)
        )
    }

    async openCreatePartnerDialog(context) {
        const ctxFromDb = await this.orm.call('account.move', 'get_partner_create_data', [[this.props.record.resId], context]);
        this.dialog.add(
            FormViewDialog,
            {
                resModel: 'res.partner',
                context: Object.assign(
                    ctxFromDb,
                    Object.fromEntries(Object.entries(context).filter(([k, v]) => v !== undefined))
                ),
                title: _t("Create"),
                onRecordSaved: (record) => {
                    this.props.record.update({ partner_id: [record.resId] });
                },
            }
        );
    }

    /**
     * Parse date part only (not time) from the newFieldValue (taken from the boxes)
     */
    getDateFromField(newFieldValue) {
        return registry.category("parsers").get("date")(newFieldValue.split(' ')[0]);
    }

    /**
     * The matching between the clicked boxed and an existing partner in the db
     * is done in the backend: account_invoice_extract/models/account_invoice: _find_partner_id_with_name
     * Depending on the return value, a partner might have found or not; if not, open the create partner dialog
     * Returns the changes if any
     */
    async getSupplierChanges(newFieldValue) {
        // (Partial) matching partner found, its id has been returned
        if (Number.isFinite(newFieldValue) && newFieldValue !== 0) {
            return { partner_id: [newFieldValue] };
        }
        // No partner found, 0 is returned -> open the create partner dialog
        await this.openCreatePartnerDialog({
            default_name: this.selectedBoxes['supplier']?.text,
            default_vat: this.selectedBoxes['VAT_Number']?.text
        });
        return {};
    }

    /**
     * @override ExtractMixinFormRenderer
     */
    async handleFieldChanged(fieldName, newFieldValue) {
        let changes = {};
        switch (fieldName) {
            case 'date':
                changes = { invoice_date: this.getDateFromField(newFieldValue) };
                break;
            case 'supplier':
            case 'VAT_Number':
                changes = await this.getSupplierChanges(newFieldValue);
                if (Object.keys(changes).length === 0) {
                    return; // no changes means that we don't need to update the record
                }
                break;
            case 'due_date':
                changes = { invoice_date_due: this.getDateFromField(newFieldValue) };
                break;
            case 'invoice_id':
                changes =  ['out_invoice', 'out_refund'].includes(this.props.record.context.default_move_type) ? { name: newFieldValue } : { ref: newFieldValue };
                break;
            case 'currency':
                changes = { currency_id: [newFieldValue] };
                break;
            case 'total':
                changes = { quick_edit_total_amount: Number(newFieldValue) };
                break;
            default:
                throw new Error(`Invalid fieldName in handleFieldChanged(): ${fieldName}`);
        }
        this.props.record.update(changes)
    }
};

const AccountMoveFormViewExtract = {
    ...AccountMoveFormView,
    Renderer: InvoiceExtractFormRenderer,
};

registry.category("views").add("account_move_form", AccountMoveFormViewExtract, { force: true });
