import { TimeOffToDeferWarning, useTimeOffToDefer } from "@hr_payroll_holidays/views/hooks";
import { ListRenderer } from "@web/views/list/list_renderer";
import { payslipListView } from "@hr_payroll/views/payslip_list/hr_payslip_list_controller";
import { registry } from '@web/core/registry';
import { listView } from '@web/views/list/list_view';

class PayslipListRenderer extends ListRenderer {
    static template = "hr_payroll_holidays.PayslipListRenderer";
    static components = { ...ListRenderer.components, TimeOffToDeferWarning };

    setup() {
        super.setup();
        this.timeOff = useTimeOffToDefer();
    }
}

payslipListView.Renderer = PayslipListRenderer;

const payslipRunListView = {
    ...listView,
    Renderer: PayslipListRenderer,
}

registry.category('views').add('hr_payroll_payslip_run_list', payslipRunListView)
