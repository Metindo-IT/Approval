import { _t } from "@web/core/l10n/translation";
import { CharField } from "@web/views/fields/char/char_field";
import { Many2OneField } from "@web/views/fields/many2one/many2one_field";
import { Component, onWillUpdateProps, useState } from "@odoo/owl";
import { Field } from "@web/views/fields/field";
import { StockMove } from "./mrp_record_line/stock_move";
import { fetchOperationNote, MrpWorkorder } from "./mrp_record_line/mrp_workorder";
import { QualityCheck } from "./mrp_record_line/quality_check";
import { mrpTimerField } from "@mrp/widgets/timer";
import { PriorityField } from "@web/views/fields/priority/priority_field";
import { useService } from "@web/core/utils/hooks";
import { MrpQualityCheckConfirmationDialog } from "./dialog/mrp_quality_check_confirmation_dialog";
import { MrpRegisterProductionDialog } from "./dialog/mrp_register_production_dialog";
import { MrpLogNoteDialog } from "./dialog/mrp_log_note_dialog";
import { SelectionField } from "@web/views/fields/selection/selection_field";
import { MrpMenuDialog } from "./dialog/mrp_menu_dialog";
import { MrpWorksheet } from "./mrp_record_line/mrp_worksheet";

export class MrpDisplayRecord extends Component {
    static components = {
        CharField,
        Field,
        Many2OneField,
        SelectionField,
        MrpTimerField: mrpTimerField.component,
        PriorityField,
        StockMove,
        MrpWorksheet,
        MrpWorkorder,
        QualityCheck,
    };
    static props = {
        groups: Object,
        barcodeTarget: { type: Boolean, optional: true },
        production: { optional: true, type: Object },
        record: Object,
        removeFromCache: Function,
        isMyWO: { optional: true, type: Boolean },
        selectWorkcenter: { optional: true, type: Function },
        sessionOwner: Object,
        updateEmployees: Function,
        workcenters: Array,
        demoRecord: { type: Boolean, optional: true },
    };
    static template = "mrp_workorder.MrpDisplayRecord";

    setup() {
        this.dialog = useService("dialog");
        this.action = useService("action");
        this.state = useState({
            underValidation: false,
        });
        this.resModel = this.props.record.resModel;
        this.model = this.props.record.model;
        this.record = this.props.record.data;
        this.props.record.component = this;

        // Display a line for the production's registration if there is no QC for it.
        this.displayRegisterProduction = true;
        if (this.resModel === "mrp.workorder") {
            this.displayRegisterProduction = !this.checks.some(
                (qc) => qc.data.test_type === "register_production"
            );
        }
        this.quantityToProduce = this.record.product_qty || this.props.production.data.product_qty;
        this.displayUOM = this.props.groups.uom;

        onWillUpdateProps((nextProps) => {
            this.resModel = nextProps.record.resModel;
            this.model = nextProps.record.model;
            this.record = nextProps.record.data;
        });
    }

    /**
     * Opens a confirmation dialog to register the produced quantity and set the
     * tracking number if it applies.
     */
    async registerProduction(check = false) {
        if (!this.props.production.data.qty_producing) {
            this.props.production.update({ qty_producing: this.props.production.data.product_qty });
        }
        const title = _t("Register Production: %s", this.props.production.data.product_id[1]);
        const params = {
            body: "",
            record: this.props.production,
            reload: this.env.reload.bind(this),
            title,
            qtyToProduce: this.record.qty_remaining,
        };
        if (check) {
            params.worksheetData = await this.getWorksheetData(check);
            params.body = check.data.note;
            params.checkId = check.resId;
            const previousId = check.data.previous_check_id[0];
            const nextId = check.data.next_check_id[0];
            const previousQC = this.record.check_ids.records.find((c) => c.data.id === previousId);
            const nextQC = this.record.check_ids.records.find((c) => c.data.id === nextId);
            params.openPreviousCheck = previousQC && this.displayInstruction.bind(this, previousQC);
            params.openNextCheck = nextQC && this.displayInstruction.bind(this, nextQC);
            params.qualityCheckDone = this.qualityCheckDone.bind(this);
            this.lastOpenedQualityCheck = check;
        }
        this.dialog.add(MrpRegisterProductionDialog, params);
    }

    editLogNote() {
        const title = _t("Log Note");
        const reload = () => this.env.reload();
        const params = { body: "", record: this.props.production, reload, title };
        this.dialog.add(MrpLogNoteDialog, params);
    }

    async quickRegisterProduction(check = false) {
        if (this.productionComplete) {
            return this.registerProduction(check);
        }
        const { production } = this.props;
        const qtyToSet = this.productionComplete ? 0 : production.data.product_qty;
        await production.update({ qty_producing: qtyToSet }, { save: true });
        // Calls `set_qty_producing` because the onchange won't be triggered.
        const args = [production.resIds];
        if (check) {
            args.push(check.resId);
        }
        await production.model.orm.call("mrp.production", "set_qty_producing", args);
        await this.env.reload(this.props.production);
    }

    async generateSerialNumber(check = false) {
        if (this.trackingMode === "lot" && this.props.production.data.qty_producing === 0) {
            await this.quickRegisterProduction(check);
        }
        const args = [this.props.production.resId];
        if (check) {
            args.push(check.resId);
        }
        const action = await this.model.orm.call("mrp.production", "action_generate_serial", args);
        if (action && typeof action === "object") {
            return this._doAction(action);
        }
        await this.env.reload(this.props.production);
    }

    get productionComplete() {
        const production =
            this.props.record.resModel === "mrp.production"
                ? this.record
                : this.props.production.data;
        if (production.product_tracking === "serial") {
            return Boolean(
                (production.qty_producing === 1 &&
                    production.lot_producing_id &&
                    production.state === "to_close") ||
                    production.state === "progress"
            );
        }
        return Boolean(
            (production.qty_producing !== 0 && production.state === "to_close") ||
                production.state === "progress"
        );
    }

    get quantityProducing() {
        return this.props.production.data.qty_producing;
    }

    getByproductLabel(record) {
        return _t("Register %s", record.data.product_id[1]);
    }

    get cssClass() {
        const active = this.active ? "o_active" : "";
        const disabled = this.disabled ? "o_disabled" : "";
        return `${active} ${disabled}`;
    }

    get displayDoneButton() {
        return this.resModel === "mrp.production" || this._workorderDisplayDoneButton();
    }

    get byProducts() {
        if (this.resModel === "mrp.workorder") {
            const checks = this.props.record.data.check_ids.records;
            const checked_byproducts = checks.reduce((result, current) => {
                if (current.data.test_type === "register_byproducts") {
                    return [...result, current.data.component_id[0]];
                }
                return result;
            }, []);
            return this.props.production.data.move_byproduct_ids.records.filter(
                (bp) =>
                    !checked_byproducts.includes(bp.data.product_id[0]) &&
                    (bp.data.operation_id[0] === undefined ||
                        bp.data.operation_id[0] === this.props.record.data.operation_id[0])
            );
        }
        return this.props.record.data.move_byproduct_ids.records;
    }

    get checks() {
        if (this.resModel === "mrp.production") {
            return [];
        }

        const checks = this.props.record.data.check_ids.records;
        const sortedChecks = [];
        if (checks.length) {
            let check = checks.find((qc) => !qc.data.previous_check_id);
            sortedChecks.push(check);
            while (check.data.next_check_id) {
                check = checks.find((qc) => qc.resId === check.data.next_check_id[0]);
                sortedChecks.push(check);
            }
        }

        return sortedChecks;
    }

    get moves() {
        let moves = this.props.record.data.move_raw_ids.records.filter(
            (move) => move.data.manual_consumption && !move.data.scrapped
        );
        let products;
        if (this.resModel === "mrp.production") {
            const checks = this.props.record.data.workorder_ids.records
                .map((wo) => wo.data.check_ids.records)
                .flat();
            products = checks.map((c) => c.data.component_id[0]);
        } else if (this.resModel === "mrp.workorder") {
            const productionMoves = this.props.production.data.move_raw_ids.records.filter(
                (m) =>
                    !m.data.operation_id &&
                    m.data.manual_consumption &&
                    !m.data.scrapped &&
                    m.data.workorder_id[0] !== this.props.record.data.id
            );
            moves = moves.concat(productionMoves);
            const checks = this.props.record.data.check_ids.records;
            products = checks.map((c) => c.data.component_id[0]);
        }
        return moves.filter((move) => !products.includes(move.data.product_id[0]));
    }

    get workorders() {
        if (this.resModel === "mrp.workorder") {
            return [];
        }
        return this.props.record.data.workorder_ids.records.filter(
            (wo) => !["pending", "waiting"].includes(wo.data.state)
        );
    }

    get logNote() {
        return this.props.production.data.log_note;
    }

    subRecordProps(subRecord) {
        const props = {
            clickable: !this.state.underValidation,
            displayUOM: this.displayUOM,
            parent: this.props.record,
        };
        if (
            subRecord.resModel === "quality.check" &&
            ["register_consumed_materials", "register_byproducts"].includes(
                subRecord.data.test_type
            )
        ) {
            props.displayInstruction = this.displayInstruction.bind(this, subRecord);
            const moves =
                subRecord.data.test_type === "register_consumed_materials"
                    ? this.props.production.data.move_raw_ids
                    : this.props.production.data.move_byproduct_ids;
            subRecord = moves.records.find((m) => m.data.check_id.resIds.includes(subRecord.resId));
        } else if (subRecord.resModel === "stock.move") {
            props.displayInstruction = this.displayRegisterConsumedComponent.bind(this, subRecord);
        }
        props.record = subRecord;

        if (subRecord.resModel === "quality.check") {
            props.displayInstruction = this.displayInstruction.bind(this, subRecord);
            props.sessionOwner = this.props.sessionOwner;
            props.updateEmployees = this.props.updateEmployees;
            if (subRecord.data.test_type === "register_production") {
                props.quantityToProduce = this.quantityToProduce;
            } else if (subRecord.data.test_type === "register_byproducts") {
                const relatedMove = this.props.production.data.move_byproduct_ids.records.find(
                    (move) => move.data.product_id[0] === subRecord.data.component_id?.[0]
                );
                if (relatedMove) {
                    props.quantityToProduce = relatedMove.data.product_uom_qty;
                }
            }
        } else if (subRecord.resModel === "mrp.workorder") {
            props.selectWorkcenter = this.props.selectWorkcenter;
            props.sessionOwner = this.props.sessionOwner;
            props.updateEmployees = this.props.updateEmployees;
        }
        return props;
    }

    async getWorksheetData(record) {
        const recordData = record.data;
        if (recordData.worksheet_document) {
            const sheet = await record.model.orm.read(
                "quality.check",
                [record.resId],
                ["worksheet_document"]
            );
            return {
                resModel: "quality.check",
                resId: recordData.id,
                resField: "worksheet_document",
                value: sheet[0].worksheet_document,
                page: 1,
            };
        }
        if (recordData.worksheet_url) {
            return {
                resModel: "quality.check",
                resId: recordData.id,
                resField: "worksheet_url",
                value: recordData.worksheet_url,
                page: 1,
            };
        }
        if (this.record.worksheet) {
            const sheet = await this.props.record.model.orm.read(
                "mrp.workorder",
                [this.record.id],
                ["worksheet"]
            );
            return {
                resModel: "mrp.workorder",
                resId: this.record.id,
                resField: "worksheet",
                value: sheet[0].worksheet,
                page: recordData.worksheet_page,
            };
        }
        if (this.record.worksheet_google_slide) {
            return {
                resModel: "mrp.workorder",
                resId: this.record.id,
                resField: "worksheet_google_slide",
                value: this.record.worksheet_google_slide,
                page: recordData.worksheet_page,
            };
        }
    }

    async openWorksheet() {
        const res = await this.props.record.model.orm.call(
            this.lastOpenedQualityCheck.resModel,
            "action_open_quality_check_wizard",
            [this.lastOpenedQualityCheck.resId]
        );
        await this.action.doAction(res, {
            onClose: async () => {
                await this.lastOpenedQualityCheck.load();
                await this.qualityCheckDone(false, this.lastOpenedQualityCheck.data.quality_state);
            },
        });
    }

    async displayRegisterConsumedComponent(
        move,
        previousQC = false,
        nextQC = false,
        fromCheck = false
    ) {
        //Display a modal to process the given Quality Check having test_type 'register_consumed_materials'.
        const action = await this.model.orm.call(
            "stock.move",
            "action_show_details_quality_check",
            [move.resId]
        );
        this.model.action.doAction(action, {
            props: {
                buttonTemplate: "mrp_workorder.ShopFloorDialogButtons",
                qualityCheckDone: fromCheck && this.qualityCheckDone.bind(this),
                openNextCheck: nextQC && this.displayInstruction.bind(this, nextQC),
                openPreviousCheck: previousQC && this.displayInstruction.bind(this, previousQC),
            },
            onClose: () => {
                this.env.reload(this.props.production);
            },
        });
    }

    /**
     * Display a dialog to process the given Quality Check.
     * If none are given, try to open the next QC to process.
     * @param {Object} [record] a `quality.check` record object to display.
     */
    async displayInstruction(record) {
        if (!record) {
            // Searches the next Quality Check.
            let lastQC = this.lastOpenedQualityCheck?.data;
            const checks = this.props.record.data.check_ids.records;
            while (lastQC?.next_check_id && !record) {
                const nextCheckId = lastQC.next_check_id[0];
                const check = checks.find((check) => check.data.id === nextCheckId);
                if (check && check.data.quality_state === "none") {
                    record = check;
                }
                lastQC = check;
            }
            if (!record) {
                return;
            }
        }
        if (record.data.test_type === "register_production") {
            return this.registerProduction(record);
        }
        this.lastOpenedQualityCheck = record;
        const previousId = record.data.previous_check_id[0];
        const nextId = record.data.next_check_id[0];
        const previousQC = this.record.check_ids.records.find((c) => c.data.id === previousId);
        const nextQC = this.record.check_ids.records.find((c) => c.data.id === nextId);
        if (
            ["register_consumed_materials", "register_byproducts"].includes(record.data.test_type)
        ) {
            const moves =
                record.data.test_type === "register_consumed_materials"
                    ? this.props.production.data.move_raw_ids
                    : this.props.production.data.move_byproduct_ids;
            const move = moves.records.find((m) => m.data.check_id.resIds.includes(record.resId));
            return this.displayRegisterConsumedComponent(move, previousQC, nextQC, true);
        }
        const worksheetData = await this.getWorksheetData(record);
        if (!worksheetData && !record.data.note.length && record.data.test_type === "worksheet") {
            // if there is no instruction to display, open worksheet form directly
            await this.openWorksheet();
            return;
        }
        if (this.record.has_operation_note && !this.record.operation_note) {
            this.record.operation_note = await fetchOperationNote(this);
        }
        const params = {
            body: record.data.note,
            record,
            reload: this.env.reload.bind(this),
            title: record.data.title,
            worksheetData,
            checkInstruction: this.record.operation_note,
            qualityCheckDone: this.qualityCheckDone.bind(this),
            openNextCheck: nextQC && this.displayInstruction.bind(this, nextQC),
            openPreviousCheck: previousQC && this.displayInstruction.bind(this, previousQC),
        };

        this.dialog.add(MrpQualityCheckConfirmationDialog, params);
    }

    async qualityCheckDone(updateChecks = false, qualityState = "pass") {
        await this.env.reload(this.props.production);
        if (updateChecks || qualityState === "pass") {
            /*
                As the props are not yet updated with the new checks, we need to use this hack
                to get the updated next check from the env model.
             */
            const production = this.env.model.root.records.find(
                (r) => r.resId === this.props.production.resId
            );
            const workorder = production.data.workorder_ids.records.find(
                (wo) => wo.resId === this.props.record.resId
            );
            if (workorder) {
                const WOChecks = workorder.data.check_ids.records;
                const lastOpenedQualityCheck = WOChecks.find(
                    (r) => r.resId === this.lastOpenedQualityCheck.resId
                );
                const nextCheck = WOChecks.find(
                    (r) => r.resId === lastOpenedQualityCheck.data.next_check_id[0]
                );
                return this.displayInstruction(nextCheck);
            }
        }
    }

    get active() {
        return this.props.record.data.employee_ids.records.some(
            (e) => e.resId === this.props.sessionOwner.id
        );
    }

    get disabled() {
        if (this.props.demoRecord || this.state.underValidation) {
            return true;
        }
        if (
            this.resModel === "mrp.workorder" &&
            !this.props.record.data.all_employees_allowed &&
            !this.props.record.data.allowed_employees.currentIds.includes(
                this.props.sessionOwner.id
            )
        ) {
            return true;
        }
        return this.props.groups.workorders && !this.props.sessionOwner.id;
    }

    get trackingMode() {
        if (
            this.props.production.data.product_tracking === "serial" &&
            this.props.production.data.product_qty > 1 &&
            !["progress", "to_close"].includes(this.props.production.data.state)
        ) {
            return "mass_produce";
        }
        return this.props.production.data.product_tracking;
    }

    async onClickHeader() {
        if (this.props.record.resModel === "mrp.workorder") {
            this.startWorking(true);
        }
    }

    onClickOpenMenu() {
        if (this.props.demoRecord) {
            return;
        }
        const params = {
            workcenters: this.props.workcenters,
            checks: this.checks,
            isMyWO: this.props.isMyWO,
        };
        this.dialog.add(MrpMenuDialog, {
            groups: this.props.groups,
            title: _t("What do you want to do?"),
            record: this.props.record,
            params,
            reload: this.env.reload.bind(this),
            removeFromCache: this.props.removeFromCache,
        });
    }

    async validate() {
        this.state.underValidation = true;
        let { resModel, resId } = this.props.record;
        let methodName = "button_mark_done";
        const kwargs = {};
        if (resModel === "mrp.workorder") {
            if (this.record.state === "ready" && this.record.qty_producing === 0) {
                this.props.record.update({ qty_producing: this.record.qty_production });
            }
            this.validatingEmployee = this.props.sessionOwner.id;
            if (
                this.props.record.data.employee_ids.records.some(
                    (emp) => emp.resId === this.validatingEmployee
                )
            ) {
                await this.model.orm.call(resModel, "stop_employee", [
                    resId,
                    [this.validatingEmployee],
                ]);
                await this.props.record.load();
            }
            await this.props.record.save();
            methodName = "do_finish";
            kwargs.context = { no_start_next: true, mrp_display: true };
            if (this.validatingEmployee) {
                kwargs.context.employee_id = this.validatingEmployee;
            }
        }
        if (
            resModel === "mrp.production" ||
            (this.props.production.data.picking_type_auto_close &&
                this.record.is_last_unfinished_wo)
        ) {
            methodName = "button_mark_done";
            if (this.trackingMode === "serial") {
                kwargs.context = { skip_redirection: true };
                if (this.record.product_qty > 1) {
                    kwargs.context.skip_backorder = true;
                    kwargs.context.mo_ids_to_backorder = [resId];
                }
            } else if (this.trackingMode === "mass_produce") {
                methodName = "action_mass_produce";
            }
            resModel = "mrp.production";
            resId = this.props.production.resId;
        }
        try {
            const action = await this.model.orm.call(resModel, methodName, [resId], kwargs);
            if (action && typeof action === "object") {
                if (action.context) {
                    action.context.skip_redirection = true;
                }
                return this._doAction(action);
            }
        } catch (error) {
            this.state.underValidation = false;
            throw error;
        }
        if (resModel === "mrp.production") {
            // Manually remove the parent MO from the model, to avoid a full reload.
            const productions_root = this.props.production.model.root;
            productions_root.records.splice(
                productions_root.records.findIndex((r) => r.resId === this.props.production.resId),
                1
            );
            productions_root.count--;
        } else {
            this.props.removeFromCache(resId);
            if (this.quantityProducing < this.quantityToProduce) {
                // To make sure we see any potentially created backorders
                await this.env.reload();
            } else {
                await this.env.reload(this.props.production);
            }
            this.state.underValidation = false;
        }
    }

    _doAction(action) {
        return this.model.action.doAction(action, {
            onClose: () => {
                this.env.reload();
            },
        });
    }

    openFormView() {
        this.model.action.doAction({
            type: "ir.actions.act_window",
            res_model: this.props.record.resModel,
            views: [[false, "form"]],
            res_id: this.props.record.resId,
        });
    }

    get uom() {
        if (this.displayUOM) {
            return this.record.product_uom_id?.[1];
        }
        return this.quantityToProduce === 1 ? _t("Unit") : _t("Units");
    }

    _workorderDisplayDoneButton() {
        return (
            ["pending", "waiting", "ready", "progress"].includes(this.record.state) &&
            this.record.check_ids.records.every((qc) =>
                ["pass", "fail"].includes(qc.data.quality_state)
            )
        );
    }

    async startWorking(shouldStop = false) {
        const { resModel, resId } = this.props.record;
        if (resModel !== "mrp.workorder") {
            return;
        }
        await this.props.updateEmployees();
        const admin_id = this.props.sessionOwner.id;
        if (
            admin_id &&
            !this.props.record.data.employee_ids.records.some((emp) => emp.resId === admin_id)
        ) {
            await this.model.orm.call(resModel, "button_start", [resId], {
                context: { mrp_display: true },
            });
            await this.env.reload(this.props.production);
            const checks = this.env.model.root.records
                .find((r) => r.resId === this.props.production.resId)
                .data.workorder_ids.records.find((wo) => wo.resId === this.props.record.resId).data
                .check_ids.records;
            const current_check_id = this.props.record.data.current_quality_check_id[0];
            if (checks.length && current_check_id) {
                const check = checks.find((qc) => qc.data.id == current_check_id);
                return this.displayInstruction(check);
            }
        } else if (shouldStop) {
            await this.model.orm.call(resModel, "stop_employee", [resId, [admin_id]]);
        }
        await this.env.reload(this.props.production);
    }

    get showWorksheetCheck() {
        if (this.props.record.resModel !== "mrp.workorder") {
            return false;
        }
        const hasPDF = this.record.worksheet;
        const hasSlide = this.record.worksheet_google_slide;
        const hasNote = this.record.has_operation_note;
        return hasPDF || hasSlide || hasNote;
    }

    async openNextQC() {
        const nextQC = this.lastOpenedQualityCheck
            ? null
            : this.checks.find((qc) => qc.data.quality_state === "none");
        await this.displayInstruction(nextQC);
    }
}
