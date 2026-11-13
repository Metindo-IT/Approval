import { beforeEach, describe, expect, test } from "@odoo/hoot";
import { mockDate } from "@odoo/hoot-mock";
import { mountView, onRpc } from "@web/../tests/web_test_helpers";
import { clickDate, selectDateRange } from "@web/../tests/views/calendar/calendar_test_helpers";
import { defineProjectModels } from "@project/../tests/project_models";
import { ProjectTask } from "@project_enterprise/../tests/task_gant_model";

describe.current.tags("desktop");
defineProjectModels();

beforeEach(() => {
    mockDate("2016-11-12 08:00:00", 0);
    onRpc("has_access", () => true);
});

ProjectTask._views.form = `
    <form>
        <field name="id"/>
        <field name="name"/>
        <field name="planned_date_begin"/>
        <field name="date_deadline" widget="daterange" options="{'start_date_field': 'planned_date_begin'}"/>
    </form>
`;

const calendarMountParams = {
    resModel: "project.task",
    type: "calendar",
    arch: `
        <calendar
            date_start="planned_date_start"
            date_stop="date_deadline"
            event_open_popup="1"
            mode="month"
            js_class="project_enterprise_task_calendar"
            quick_create="0"
        />
    `,
    config: { views: [[false, "form"]] },
};

test("Planned Date Begin Should Not Be Set When Selecting A Single Day", async () => {
    await mountView(calendarMountParams);
    expect(".o_calendar_view").toHaveCount(1);
    await clickDate("2016-11-13");
    expect(".modal-title").toHaveText("New Task");
    expect("button.o_add_start_date").toHaveCount(1, {
        message: "the planned date begin should not be set when selecting a single day",
    });
});

test("Planned Date Begin Should Be Set When Selecting Multiple Days", async () => {
    await mountView(calendarMountParams);
    await selectDateRange("2016-11-13", "2016-11-16");
    expect(".modal-title").toHaveText("New Task");
    expect("button.o_add_start_date").toHaveCount(0, {
        message: "the planned date begin should not be set when selecting a single day",
    });
});
