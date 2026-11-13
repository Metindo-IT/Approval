import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import DocumentViewer from "@mrp_workorder/components/viewer";
import { FloatField } from "@web/views/fields/float/float_field";
import { Many2OneField } from "@web/views/fields/many2one/many2one_field";
import { TabletImageField } from "@quality/tablet_image_field/tablet_image_field";
import { useService, useBus } from "@web/core/utils/hooks";
import { useState } from "@odoo/owl";
import { HtmlField } from "@html_editor/fields/html_field";

export class MrpQualityCheckConfirmationDialog extends ConfirmationDialog {
    static props = {
        ...ConfirmationDialog.props,
        record: Object,
        reload: { type: Function, optional: true },
        qualityCheckDone: { type: Function, optional: true },
        worksheetData: { type: Object, optional: true },
        checkInstruction: { type: Object, optional: true },
        openPreviousCheck: { type: Function, optional: true },
        openNextCheck: { type: Function, optional: true },
    };
    static template = "mrp_workorder.MrpQualityCheckConfirmationDialog";
    static components = {
        ...ConfirmationDialog.components,
        DocumentViewer,
        FloatField,
        Many2OneField,
        TabletImageField,
        HtmlField,
    };

    setup() {
        super.setup();
        this.barcode = useService("barcode");
        this.notification = useService("notification");
        this.action = useService("action");
        useBus(this.props.record.model.bus, "update", this.render.bind(this, true));
        this.state = useState({ disabled: false });
    }

    get confirmLabel() {
        if (["instructions", "passfail"].includes(this.recordData.test_type)) {
            return _t("Next");
        } else if (this.recordData.test_type === "print_label") {
            return _t("Print Labels");
        }
        return _t("Validate");
    }

    get shouldDisplayValidateButton() {
        return this.recordData.test_type !== "passfail" || this.recordData.quality_state !== "none";
    }

    async validate() {
        this.state.disabled = true;
        if (this.recordData.test_type === "print_label") {
            return this.doActionAndClose("action_print", false);
        } else if (this.recordData.test_type === "measure") {
            return this.doActionAndClose("do_measure");
        } else if (this.recordData.test_type === "worksheet") {
            return this.doActionAndClose("action_worksheet_check", false);
        }
        const skipSave = ["instructions", "passfail"].includes(this.recordData.test_type);
        await this.doActionAndClose("action_next", !skipSave);
    }

    async openWorksheet() {
        const res = await this.props.record.model.orm.call(
            this.props.record.resModel,
            "action_quality_worksheet",
            [this.props.record.resId]
        );
        await this.action.doAction(res);
    }

    async pass() {
        this.state.disabled = true;
        await this.doActionAndClose("action_pass_and_next");
    }

    async fail() {
        this.state.disabled = true;
        await this.doActionAndClose("action_fail_and_next");
    }

    async doActionAndClose(action, saveModel = true, reloadChecks = false) {
        if (saveModel) {
            await this.props.record.save();
        }
        const res = await this.props.record.model.orm.call(this.props.record.resModel, action, [
            this.props.record.resId,
        ]);
        if (res) {
            await this.action.doAction(res, {
                onClose: () => {
                    this.props.reload(this.props.record);
                },
            });
            if (res.type === "ir.actions.act_window") {
                this.props.close();
                return;
            }
        }
        if (!reloadChecks) {
            await this.props.record.load();
        }
        await this.props.qualityCheckDone(reloadChecks, this.props.record.data.quality_state);
        this.props.close();
    }

    get measureInfo() {
        return {
            name: "measure",
            record: this.props.record,
        };
    }

    get note() {
        const note = this.recordData.note;
        return note && !["<p><br></p>", `<div><br></div>`].includes(note) && note !== "false"
            ? note
            : undefined;
    }

    get htmlInfo() {
        return {
            name: "note",
            record: this.props.record,
            readonly: true,
            embeddedComponents: true,
        };
    }

    get picInfo() {
        return {
            name: "picture",
            record: this.props.record,
            width: 100,
            height: 100,
        };
    }

    get recordData() {
        return this.props.record.data;
    }

    back() {
        this.state.disabled = true;
        if (this.props.openPreviousCheck) {
            this.props.openPreviousCheck();
        }
        this.props.close();
    }

    skip() {
        this.state.disabled = true;
        if (this.props.openNextCheck) {
            this.props.openNextCheck();
        }
        this.props.close();
    }
}
