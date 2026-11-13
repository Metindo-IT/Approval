/** @odoo-module */

import { registry } from "@web/core/registry";
import { Component } from "@odoo/owl";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";

import { useSignViewButtons } from "@sign/views/hooks";

export class UploadPdfButton extends Component {
    static template = "hr_contract_sign.upload_pdf_button"
    static props = {
        ...standardWidgetProps,
    };

    setup() {
        super.setup(...arguments);
        // Import and assign functions from useSignViewButtons to enable access to `requestFile`,
        // which is essential for handling file uploads.
        const functions = useSignViewButtons();
        Object.assign(this, functions);
    }

    onClickUpload(context) {
        // Set `resModel` to 'sign.template' as it is required by the file upload logic
        // to properly associate the uploaded files with the correct model.
        this.props.resModel = 'sign.template';
        return this.requestFile(context);
    }
}

registry.category("view_widgets").add("upload_pdf_button", {
    component: UploadPdfButton,
});
