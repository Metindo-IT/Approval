/** @odoo-module **/
import { useService } from "@web/core/utils/hooks";
import { registry } from '@web/core/registry';
import { listView } from '@web/views/list/list_view';
import { ListController } from "@web/views/list/list_controller";
import { _t } from "@web/core/l10n/translation";

export class PayslipListController extends ListController {
    setup() {
        super.setup();
        this.orm = useService("orm");
    }

    getStaticActionMenuItems() {
        const menuItems = super.getStaticActionMenuItems();

        if (this.model.root.selection.every((record) => ['draft', 'verify'].includes(record.data.state))) {
            menuItems.compute_sheet = {
                description: _t('Compute Sheet'),
                callback: async () => await this.compute_sheet(),
            };
            menuItems.recompute_whole_sheet = {
                description: _t('Recompute Whole Sheet'),
                callback: async () => await this.recompute_whole_sheet(),
            };
        }

        if (this.model.root.selection.every((record) => record.data.state === 'verify')) {
            menuItems.confirm = {
                description: _t('Confirm'),
                callback: async () => await this.confirm(),
            };
        }

        if (this.model.root.selection.every((record) => record.data.state === 'done')) {
            menuItems.paid = {
                description: _t('Mark as Paid'),
                callback: async () => await this.paid(),
            };
        }

        if (this.model.root.selection.every((record) => record.data.state === 'paid')) {
            menuItems.unpaid = {
                description: _t('Unpaid'),
                callback: async () => await this.unpaid(),
            };
        }

        if (this.model.root.selection.every((record) => record.data.state === 'cancel')) {
            menuItems.draft = {
                description: _t('Set to Draft'),
                callback: async () => await this.draft(),
            };
        }

        if (this.model.root.selection.every((record) => record.data.state !== 'cancel')) {
            menuItems.cancel = {
                description: _t('Cancel'),
                callback: async () => await this.cancel(),
            };
        }

        return menuItems;
    }

    async refresh_page() {
        await this.actionService.doAction({
            'type': 'ir.actions.client',
            'tag': 'soft_reload',
        });
    }

    async paid() {
        await this.orm.call(
            "hr.payslip",
            "action_payslip_paid",
            [this.model.root.selection.map((a) => a.resId)]
        );
        await this.refresh_page();
    }

    async unpaid() {
        await this.orm.call(
            "hr.payslip",
            "action_payslip_unpaid",
            [this.model.root.selection.map((a) => a.resId)]
        );
        await this.refresh_page();
    }

    async confirm() {
        await this.orm.call(
            "hr.payslip",
            "action_payslip_done",
            [this.model.root.selection.map((a) => a.resId)],
            { context: { payslip_generate_pdf: true } },
        );
        await this.refresh_page();
    }

    async compute_sheet() {
        await this.orm.call(
            "hr.payslip",
            "compute_sheet",
            [this.model.root.selection.map((a) => a.resId)]
        );
        await this.refresh_page();
    }

    async recompute_whole_sheet() {
        await this.orm.call(
            "hr.payslip",
            "action_refresh_from_work_entries",
            [this.model.root.selection.map((a) => a.resId)]
        );
        await this.refresh_page();
    }

    async draft() {
        await this.orm.call(
            "hr.payslip",
            "action_payslip_draft",
            [this.model.root.selection.map((a) => a.resId)]
        );
        await this.refresh_page();
    }

    async cancel() {
        await this.orm.call(
            "hr.payslip",
            "action_payslip_cancel",
            [this.model.root.selection.map((a) => a.resId)]
        );
        await this.refresh_page();
    }
}
export const payslipListView = {
    ...listView,
    Controller: PayslipListController,
};

registry.category('views').add('hr_payroll_payslip_list', payslipListView)
