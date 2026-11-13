import { _t } from "@web/core/l10n/translation";
import { MrpWorkorder } from "./mrp_workorder";
import { MrpQualityCheckConfirmationDialog } from "../dialog/mrp_quality_check_confirmation_dialog";
import { useService } from "@web/core/utils/hooks";

export class QualityCheck extends MrpWorkorder {
    static template = "mrp_workorder.QualityCheck";
    static components = {
        ...MrpWorkorder.components,
        MrpQualityCheckConfirmationDialog,
    };

    setup() {
        super.setup();
        this.fieldState = "quality_state";
        this.name = this.props.record.data.title || this.props.record.data.name;
        this.note = this.props.record.data.note;
        this.action = useService("action");
    }

    clicked() {
        this.props.displayInstruction();
    }

    async pass() {
        const { record } = this.props;
        if (["instructions", "passfail"].includes(record.data.test_type)) {
            return this._pass();
        } else if (record.data.test_type === "print_label") {
            const res = await record.model.orm.call(record.resModel, "action_print", [
                record.resId,
            ]);
            await this.action.doAction(res);
            this._pass();
            return;
        } else if (record.data.test_type === "picture") {
            return;
        }
        this.clicked();
    }

    get active() {
        return false;
    }

    get failed() {
        return this.state === "fail";
    }

    get isComplete() {
        return this.passed || this.failed;
    }

    get icon() {
        switch (this.props.record.data.test_type) {
            case "picture":
                return "fa fa-camera";
            case "instructions":
                return "fa fa-square-o";
            case "passfail":
                return "fa fa-check";
            case "measure":
                return "fa fa-arrows-h";
            case "print_label":
                return "fa fa-print";
            default:
                return "fa fa-lightbulb-o";
        }
    }

    get passed() {
        return this.state === "pass";
    }

    get showMeasure() {
        return (
            this.props.record.data.quality_state === "pass" &&
            this.props.record.data.test_type === "measure"
        );
    }

    get uom() {
        if (this.displayUOM) {
            return this.props.uom[1];
        }
        return this.quantityToProduce === 1 ? _t("Unit") : _t("Units");
    }

    _pass() {
        this.props.record.update({ quality_state: "pass" });
        this.props.record.save({ reload: false });
        this.props.record._parentRecord.model.notify();
    }

    get shouldDisplayCheckmark() {
        return this.state === "pass" && !this.showMeasure;
    }
}
