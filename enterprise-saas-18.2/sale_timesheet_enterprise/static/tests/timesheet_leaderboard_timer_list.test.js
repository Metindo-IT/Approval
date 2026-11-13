import { expect, test } from "@odoo/hoot";

import { mountView, onRpc } from "@web/../tests/web_test_helpers";

import { defineTimesheetModels } from "./sale_timesheet_models";

defineTimesheetModels();

async function initAndOpenView(showIndicator = true, showLeaderboard = true) {
    onRpc("read", ({ args }) => {
        if (
            args[1].length === 2 &&
            args[1][0] === "timesheet_show_rates" &&
            args[1][1] === "timesheet_show_leaderboard"
        ) {
            return [
                {
                    timesheet_show_rates: showIndicator,
                    timesheet_show_leaderboard: showLeaderboard,
                },
            ];
        }
    });
    await mountView({
        resModel: "account.analytic.line",
        type: "list",
        arch: `
            <list js_class="timesheet_timer_list">
                <field name="name"/>
            </list>`,
    });
}

test("Check that leaderboard is displayed if user's company has the features on.", async () => {
    await initAndOpenView();
    expect(".o_timesheet_leaderboard").toHaveCount(1);
});

test("Check that leaderboard is not displayed if user's company doesn't have the features on.", async () => {
    await initAndOpenView(false, false);
    expect(".o_timesheet_leaderboard").toHaveCount(0);
});
