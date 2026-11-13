import { ListController } from "@web/views/list/list_controller";
import { DocumentsControllerMixin } from "@documents/views/documents_controller_mixin";
import { preSuperSetup, useDocumentView } from "@documents/views/hooks";
import { useEffect, useRef, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class DocumentsListController extends DocumentsControllerMixin(ListController) {
    static template = "documents.DocumentsListController";
    setup() {
        preSuperSetup();
        super.setup(...arguments);
        this.documentService = useService("document.document");
        this.uploadFileInputRef = useRef("uploadFileInput");
        const properties = useDocumentView(this.documentsViewHelpers());
        Object.assign(this, properties);

        this.documentStates = useState({
            previewStore: {},
        });

        useEffect(() => {
            this.documentService.getSelectionActions = () => {
                return {
                    getTopbarActions: () => this.getTopBarActionMenuItems(),
                    getMenuProps: () => this.actionMenuProps
                };
            }
            return () => this.documentService.getSelectionActions = null;
        }, () => []);
    }

    get hasSelectedRecords() {
        return this.targetRecords.length;
    }

    get targetRecords() {
        return this.model.targetRecords;
    }

    /**
     * Override this to add view options.
     */
    documentsViewHelpers() {
        return {
            getSelectedDocumentsElements: () =>
                this.root?.el?.querySelectorAll(
                    ".o_data_row.o_data_row_selected .o_list_record_selector"
                ) || [],
            setPreviewStore: (previewStore) => {
                this.documentStates.previewStore = previewStore;
            },
            isRecordPreviewable: this.isRecordPreviewable.bind(this),
        };
    }

    isRecordPreviewable(record) {
        return record.isViewable();
    }
}
