import { registry } from "@web/core/registry";
import { formView } from "@web/views/form/form_view";
import { FormRenderer } from "@web/views/form/form_renderer";

import { ExtractMixinFormRenderer } from '@iap_extract/components/manual_correction/form_renderer';


export class AccountBankStatementFormRenderer extends ExtractMixinFormRenderer(FormRenderer) {
    setup() {
        super.setup();

        this.recordModel = 'account.bank.statement';
        this._fieldsMapping = {
            'balance_start': 'balance_start',
            'balance_end_real': 'balance_end',
        };
    }

    /**
     * override ExtractMixinFormRenderer
     */
    async handleFieldChanged(fieldName, newFieldValue) {
        let changes = {};
        switch (fieldName) {
            case 'balance_start':
                changes = { balance_start: Number(newFieldValue) };
                break;
            case 'balance_end':
                changes = { balance_end_real: Number(newFieldValue) };
                break;
            default:
                throw new Error(`Invalid fieldName in handleFieldChanged(): ${fieldName}`);
        }
        this.props.record.update(changes)
    }
};


export const AccountBankStatementFormViewExtract = {
    ...formView,
    Renderer: AccountBankStatementFormRenderer,
};

registry.category("views").add("account_bank_statement_form", AccountBankStatementFormViewExtract);
