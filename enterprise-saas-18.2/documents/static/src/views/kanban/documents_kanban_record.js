import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";
import { KanbanRecord } from "@web/views/kanban/kanban_record";
import { browser } from "@web/core/browser/browser";
import { FileUploadProgressBar } from "@web/core/file_upload/file_upload_progress_bar";
import { useBus, useService } from "@web/core/utils/hooks";
import { useState, xml } from "@odoo/owl";

const CANCEL_GLOBAL_CLICK = ["a", ".dropdown", ".oe_kanban_action"].join(",");

export class DocumentsKanbanRecord extends KanbanRecord {
    static components = {
        ...KanbanRecord.components,
        FileUploadProgressBar,
    };
    static defaultProps = {
        ...KanbanRecord.defaultProps,
    };
    static props = [...KanbanRecord.props];
    static template = xml`
        <div
            role="article"
            t-att-class="getRecordClasses()"
            t-att-data-id="props.record.id"
            t-att-tabindex="props.record.model.useSampleModel ? -1 : 0"
            t-on-click.synthetic="onGlobalClick"
            t-on-dragenter.stop.prevent="onDragEnter"
            t-on-dragover.stop.prevent="onDragOver"
            t-on-dragleave.stop.prevent="onDragLeave"
            t-on-drop.stop.prevent="onDrop"
            t-on-touchstart="onTouchStart"
            t-on-touchmove="onTouchMoveOrCancel"
            t-on-touchcancel="onTouchMoveOrCancel"
            t-on-touchend="onTouchEnd"
            t-ref="root">
            <span t-if="props.selectionAvailable" class="o_record_selection_tooltip d-none position-absolute p-2 rounded-3 start-50 top-50">Click to select</span>
            <t t-call="{{ templates[this.constructor.KANBAN_CARD_ATTRIBUTE] }}" t-call-context="this.renderingContext"/>
        </div>`;
    setup() {
        super.setup();
        // File upload
        const { bus, uploads } = useService("file_upload");
        this.documentUploads = uploads;
        useBus(bus, "FILE_UPLOAD_ADDED", (ev) => {
            if (ev.detail.upload.data.get("document_id") == this.props.record.resId) {
                this.render(true);
            }
        });
        this.drag = useState({ state: "none" });

        // Pdf Thumbnail
        this.pdfService = useService("documents_pdf_thumbnail");
        this.pdfService.enqueueRecords([this.props.record]);
    }

    /**
     * @override
     */
    getRecordClasses() {
        let result = super.getRecordClasses();
        if (this.props.record.selected) {
            result += " o_record_selected";
        }
        if (this.props.record.isRequest()) {
            result += " oe_file_request";
        }
        if (this.props.record.data.type == "folder") {
            result += " o_folder_record";
        }
        if (this.drag.state === "hover") {
            result += " o_drag_hover";
        } else if (this.drag.state === "invalid") {
            result += " o_drag_invalid";
        }
        return result;
    }

    get renderingContext() {
        const context = super.renderingContext;
        context.encodeURIComponent = encodeURIComponent;

        if ([false, "TRASH", "RECENT"].includes(this.env.searchModel.getSelectedFolderId())) {
            context.inFolder = this.props.record.data.folder_id?.[1] ||
                (
                    this.props.record.data?.owner_id?.[0] === user.userId
                    ? _t("My Drive")
                    : this.props.record.data?.owner_id
                        ? _t("Shared with me")
                        : _t("Company")
                );
        }
        context.mimetype = this.props.record.shortcutTarget.data.mimetype;
        return context;
    }
    /**
     * Get the current file upload for this record if there is any
     */
    getFileUpload() {
        return Object.values(this.documentUploads).find(
            (upload) => upload.data.get("document_id") == this.props.record.resId
        );
    }

    /**
     * @override
     */
    onGlobalClick(ev) {
        if (ev.target.closest(CANCEL_GLOBAL_CLICK)) {
            return;
        }
        const selectionLength = this.props.getSelection().length;
        // We can enable selection mode when only one item is selected if a key is pressed,
        // or if we have more than one item selected
        const isSelectionModeActive = selectionLength === 1 ? ev.shiftKey : selectionLength > 1;
        const selectionKeyActive = ev.altKey || ev.ctrlKey;
        if (ev.target.closest("div[name='document_preview']") && !(selectionKeyActive || ev.shiftKey)) {
            this.props.record.onClickPreview(ev);
        } else if (selectionKeyActive || isSelectionModeActive) {
            this.rootRef.el.focus();
            this.props.toggleSelection(this.props.record, ev.shiftKey);
        } else if (this.env.searchModel.getSelectedFolderId() === "TRASH" || this.props.record.data.type !== "folder") {
            // Select only one document record
            this.props.getSelection().forEach(r => r.toggleSelection(false));
            this.props.toggleSelection(this.props.record);
        } else {
            this.props.record.openFolder();
        }
    }

    onDragEnter(ev) {
        if (this.props.record.data.type !== "folder") {
            return;
        }
        const isInvalidFolder = this.props.getSelection()
            .map((r) => r.data.id)
            .includes(this.props.record.data.id);
        this.drag.state = isInvalidFolder ? "invalid" : "hover";
        const icon = this.rootRef.el.querySelector(".fa-folder-o");
        icon?.classList.remove("fa-folder-o");
        icon?.classList.add("fa-folder-open-o");
    }

    onDragOver(ev) {
        const isInvalidTarget =
            this.props.record.data.type !== "folder" ||
            this.props.getSelection().map((r) => r.data.id).includes(this.props.record.data.id);
        const dropEffect = isInvalidTarget ? "none" : ev.ctrlKey ? "link" : "move";
        ev.dataTransfer.dropEffect = dropEffect;
    }

    onDragLeave(ev) {
        // we do this since the dragleave event is fired when hovering a child
        const elemBounding = this.rootRef.el.getBoundingClientRect();
        const isOutside =
            ev.clientX < elemBounding.left ||
            ev.clientX > elemBounding.right ||
            ev.clientY < elemBounding.top ||
            ev.clientY > elemBounding.bottom;
        if (!isOutside) {
            return;
        }
        if (this.props.record.data.type !== "folder") {
            return;
        }
        this.drag.state = "none";
        const icon = this.rootRef.el.querySelector(".fa-folder-open-o");
        icon?.classList.remove("fa-folder-open-o");
        icon?.classList.add("fa-folder-o");
    }

    onDrop(ev) {
        this.drag.state = "none";
        const icon = this.rootRef.el.querySelector(".fa-folder-open-o");
        icon?.classList.remove("fa-folder-open-o");
        icon?.classList.add("fa-folder-o");
    }

    onTouchStart() {
        // We handle touch multi-selection for Documents with a long
        // press as well, as a simple touch already selects one record
        this.touchStartMs = Date.now();
        if (this.longTouchTimer === null) {
            this.longTouchTimer = browser.setTimeout(() => {
                this.props.record.toggleSelection(true);
                this.resetLongTouchTimer();
            }, this.LONG_TOUCH_THRESHOLD);
        }
    }
}
