import { expect, test } from "@odoo/hoot";
import { mountView } from "@web/../tests/web_test_helpers";

import { defineTimesheetModels, HRTimesheet } from "./hr_timesheet_models";
import { patchSession } from "@hr_timesheet/../tests/hr_timesheet_models";

defineTimesheetModels();

test.tags("desktop");
test("hr.timesheet (list)(timer): basics", async () => {
    patchSession();
    HRTimesheet._records = [
        { id: 1, name: 'yop' },
        { id: 2, name: 'bip' },
    ];
    await mountView({
        type: "list",
        resModel: "account.analytic.line",
        arch: `
            <list js_class="timesheet_timer_list">
                <field name="name"/>
            </list>
        `,
    });

    expect(".o_timesheet_timer_list_view").toHaveCount(1);
    expect(".pinned_header .timesheet-timer").toHaveCount(1);
    expect(".o_pager").toHaveCount(1);
    expect(".o_pager").toHaveText("1-2 / 2");
});
