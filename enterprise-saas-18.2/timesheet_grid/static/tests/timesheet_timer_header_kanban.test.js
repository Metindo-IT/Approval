import { describe, expect, test, beforeEach } from "@odoo/hoot";
import { waitFor, click } from "@odoo/hoot-dom";
import { contains, onRpc, mountView } from "@web/../tests/web_test_helpers";

import { defineTimesheetModels } from "./hr_timesheet_models";
import { patchSession } from "@hr_timesheet/../tests/hr_timesheet_models";

defineTimesheetModels();
beforeEach(() => {
    patchSession();
});

describe.current.tags("desktop");

test("timesheet.grid (kanban)(timer): start & stop", async () => {
    await mountView({
        type: "kanban",
        resModel: "account.analytic.line",
    });
    await contains(".btn_start_timer").click();
    await waitFor(".btn_stop_timer");
    expect("div.pinned_header input").toHaveCount(3, {
        message: "When the timer is running in the kanban view, the timesheet in the header should be editable."
    });

    await click(".btn_stop_timer");
    await waitFor(".btn_start_timer");
    expect("div.pinned_header input").toHaveCount(0);
});

test("timesheet.grid (kanban)(timer): start & stop, view is grouped", async () => {
    await mountView({
        type: "kanban",
        resModel: "account.analytic.line",
        groupBy: [ "project_id"],
    });
    await contains(".btn_start_timer").click();
    await waitFor(".btn_stop_timer");
    expect("div.pinned_header input").toHaveCount(3, {
        message: "When the timer is running in the kanban view, the timesheet in the header should be editable."
    });

    await click(".btn_stop_timer");
    await waitFor(".btn_start_timer");
    expect("div.pinned_header input").toHaveCount(0);
});

test("timesheet.grid (kanban)(timer): start & stop, view is grouped multiple times", async () => {
    await mountView({
        type: "kanban",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id", "name"],
    });
    await contains(".btn_start_timer").click();
    await waitFor(".btn_stop_timer");
    expect("div.pinned_header input").toHaveCount(3, {
        message: "When the timer is running in the kanban view, the timesheet in the header should be editable."
    });

    await click(".btn_stop_timer");
    await waitFor(".btn_start_timer");
    expect("div.pinned_header input").toHaveCount(0);
});

test("timesheet.grid (kanban)(timer): start the timer with no valid project", async () => {
    onRpc(({ method }) => {
        if (method === "action_start_new_timesheet_timer") {
            return false;
        }
    });
    await mountView({
        type: "kanban",
        resModel: "account.analytic.line",
    });
    await contains(".btn_start_timer").click();
    await waitFor(".btn_stop_timer");
    expect("div.pinned_header input").toHaveCount(3, {
        message: "When the timer is running in the kanban view, the timesheet in the header should be editable."
    });

    await click(".btn_stop_timer");
    await waitFor("div.o_notification_manager h5:contains(Invalid fields:)");
    expect("div.o_notification_manager h5:contains(Invalid fields:)").toHaveCount(1, {
        message: "The default notification of 'required fields' of a Many2one relation should be raised."
    });
});
