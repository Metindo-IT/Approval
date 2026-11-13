import { onRpc, defineModels } from "@web/../tests/web_test_helpers";

import { SaleOrderLine } from "@sale_project/../tests/project_task_model";
import { defineTimesheetModels as defineTimesheetGridModels } from "@timesheet_grid/../tests/hr_timesheet_models";

export function defineTimesheetModels() {
    onRpc("get_billable_time_target", (request) => {
        if (request.model == "hr.employee") {
            return [{ billable_time_target: 150 }];
        }
        return [{}];
    });
    defineTimesheetGridModels();
    defineModels([SaleOrderLine]);
}
