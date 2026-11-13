import { beforeEach, describe, expect, test, getFixture } from "@odoo/hoot";
import { click } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import {
    fieldInput,
    fields,
    getService,
    mountWithCleanup,
    onRpc,
    selectFieldDropdownItem,
    contains,
} from "@web/../tests/web_test_helpers";
import { WebClient } from "@web/webclient/webclient";
import { serializeDateTime } from "@web/core/l10n/dates";

import { defineTimesheetModels, HRTimesheet } from "./hr_timesheet_models";
import { patchSession } from "@hr_timesheet/../tests/hr_timesheet_models";

const now = luxon.DateTime.utc();
defineTimesheetModels();
beforeEach(() => {
    patchSession();
    HRTimesheet._views["kanban,false"] = `
        <kanban js_class="timesheet_timer_kanban">
            <templates>
                <field name="name"/>
                <t t-name="card">
                    <field name="employee_id"/>
                    <field name="project_id"/>
                    <field name="task_id"/>
                    <field name="date"/>
                    <field name="display_timer"/>
                    <field name="unit_amount"/>
                </t>
            </templates>
        </kanban>
    `;
    HRTimesheet._views["grid,false"] = HRTimesheet._views["grid,false"]
        .replace('js_class="timesheet_grid"', 'js_class="timer_timesheet_grid"')
        .replace('widget="float_time"', 'widget="timesheet_uom"');
});
describe.current.tags("desktop");

test("hr.timesheet (kanban)(timer): switch view with GroupBy and start the timer", async () => {
    await mountWithCleanup(WebClient);
    await getService("action").doAction({
        res_model: "account.analytic.line",
        type: "ir.actions.act_window",
        views: [
            [false, "grid"],
            [false, "kanban"],
        ],
        context: { group_by: ["project_id", "task_id"] },
    });

    await click(".o_switch_view.o_kanban");
    await animationFrame();
    await click(".btn_start_timer");
    await animationFrame();
    expect("button.btn_start_timer").toHaveCount(0, {
        message: "Timer should be running",
    });
});

test("hr.timesheet (kanban)(timer): start timer, set fields and switch view", async () => {
    let timerRunning = false;
    onRpc(({ method }) => {
        if (method === "get_running_timer" && timerRunning) {
            return {
                step_timer: 30,
                id: 4,
            };
        } else if (method === "action_start_new_timesheet_timer") {
            timerRunning = true;
            return { id: 4 };
        }
    });
    await mountWithCleanup(WebClient);
    await getService("action").doAction({
        res_model: "account.analytic.line",
        type: "ir.actions.act_window",
        views: [
            [false, "kanban"],
            [false, "grid"],
        ],
    });

    await click(".btn_start_timer");
    await fieldInput("name").edit("Test");
    await selectFieldDropdownItem("task_id", "BS task");

    await click(".o_switch_view.o_grid");
    await animationFrame();
    expect(".o_field_char[name='name'] input").toHaveValue("Test", {
        message: "Description shouldn't have changed by switching view",
    });
    expect(".o_field_many2one[name='task_id'] input").toHaveValue("BS task", {
        message: "Task shouldn't have changed by switching view",
    });
});

test("hr.timesheet (kanban)(timer): unlink timesheet through timesheet_uom_timer widget", async () => {
    HRTimesheet._fields.is_timer_running = fields.Boolean();
    HRTimesheet._records[0].is_timer_running = true;
    HRTimesheet._views["kanban,false"] = HRTimesheet._views["kanban,false"].replace(
        '<field name="unit_amount"/>',
        '<field name="unit_amount" widget="timesheet_uom_timer"/><field name="is_timer_running" invisible="1"/>'
    );
    onRpc(({ method }) => {
        if (method === "get_running_timer") {
            return {
                id: 1,
                step_timer: 30,
            };
        }
    });

    await mountWithCleanup(WebClient);
    await getService("action").doAction({
        res_model: "account.analytic.line",
        type: "ir.actions.act_window",
        views: [[false, "kanban"]],
        context: {
            group_by: ["project_id", "task_id"],
            my_timesheet_display_timer: 1,
        },
    });
    await animationFrame();

    expect(".o_icon_button").toHaveProperty("title", "Stop", {
        message: "The timer stop button should be visible",
    });

    // Stop the timer using the kanban view (timesheet_uom_timer widget)
    await click(".o_icon_button");
    await animationFrame();

    expect('div[name="project_id"] input').toHaveCount(0, {
        message: "The project input should not exist",
    });
});

test("Timer should not start when adding new record", async () => {
    let timerStarted = false;

    onRpc(({ method }) => {
        if (method === "get_running_timer") {
            return { step_timer: 30 };
        } else if (method === "action_start_new_timesheet_timer") {
            timerStarted = true;
            return false;
        } else if (method === "get_daily_working_hours") {
            return {};
        } else if (method === "get_server_time") {
            return serializeDateTime(now);
        } else if (method === "get_create_edit_project_ids") {
            return [];
        }
    });

    HRTimesheet._views["list,false"] = `
        <list js_class="timesheet_timer_list" editable="bottom">
            <field name="project_id"/>
        </list>
    `;

    HRTimesheet._views["search,false"] = `
        <search>
            <field name="project_id"/>
        </search>
    `;

    await mountWithCleanup(WebClient);
    await getService("action").doAction({
        res_model: "account.analytic.line",
        type: "ir.actions.act_window",
        views: [
            [false, "list"],
            [false, "kanban"],
        ],
    });

    await click(".o_list_button_add");
    await animationFrame();

    const fixture = getFixture();
    await contains(fixture.querySelector(".o-autocomplete--input")).click();
    await animationFrame();

    await contains(fixture.querySelector(".o-autocomplete .o-autocomplete--dropdown-item")).click();
    await animationFrame();

    await click(".o_switch_view.o_kanban");
    await animationFrame();

    expect(".btn_start_timer").toHaveCount(1);
    expect(timerStarted).toBe(false);
});
