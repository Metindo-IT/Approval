import { patch } from "@web/core/utils/patch";
import { AccountFileUploader } from "@account/components/account_file_uploader/account_file_uploader";
import { UploadDropZone } from "@account/components/upload_drop_zone/upload_drop_zone";
import { BankRecKanbanView, BankRecKanbanController, BankRecKanbanRenderer } from "@account_accountant/components/bank_reconciliation/kanban";
import { useState } from "@odoo/owl";

patch(BankRecKanbanController, {
    components: { ...BankRecKanbanController.components, AccountFileUploader },
});

patch(BankRecKanbanRenderer.prototype, {
    setup() {
        super.setup();
        this.dropzoneState = useState({
            visible: false,
        });
    },

    onDragStart(ev) {
        if (ev.dataTransfer.types.includes("Files")) {
            this.dropzoneState.visible = true
        }
    },
});

patch(BankRecKanbanRenderer, {
    components: { ...BankRecKanbanRenderer.components, UploadDropZone },
});

patch(BankRecKanbanView, {
    buttonTemplate: "account.BankRecKanbanButtons",
});
