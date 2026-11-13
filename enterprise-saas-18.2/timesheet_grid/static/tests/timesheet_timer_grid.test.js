import { beforeEach, describe, expect, test } from "@odoo/hoot";
import {
    click,
    edit,
    hover,
    keyDown,
    keyUp,
    press,
    queryAll,
    queryFirst,
    queryText,
} from "@odoo/hoot-dom";
import { advanceTime, animationFrame, delay, runAllTimers } from "@odoo/hoot-mock";
import { Domain } from "@web/core/domain";
import {
    clickFieldDropdown,
    getService,
    mountView,
    mountWithCleanup,
    onRpc,
    removeFacet,
    selectFieldDropdownItem,
    toggleMenuItem,
    toggleSearchBarMenu,
} from "@web/../tests/web_test_helpers";
import { WebClient } from "@web/webclient/webclient";

import { defineTimesheetModels, HRTimesheet, ProjectProject } from "./hr_timesheet_models";
import { patchSession } from "@hr_timesheet/../tests/hr_timesheet_models";

defineTimesheetModels();
beforeEach(() => {
    patchSession();
    HRTimesheet._views["grid,false"] = HRTimesheet._views["grid,false"].replace(
        'js_class="timesheet_grid"',
        'js_class="timer_timesheet_grid"',
    ).replace(
        'widget="float_time"',
        'widget="timesheet_uom"',
    );
    HRTimesheet._views["grid,1"] = HRTimesheet._views["grid,1"].replace(
        'js_class="timesheet_grid"',
        'js_class="timer_timesheet_grid"',
    ).replace(
        'widget="float_time"',
        'widget="timesheet_uom"',
    );
});
onRpc(({ method }) => {
    if (method === "get_last_validated_timesheet_date") {
        return "2017-01-25";
    } else if (method === "action_start_new_timesheet_timer") {
        return false;
    }
});

test("hr.timesheet (grid)(timer): sample data", async () => {
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        arch: HRTimesheet._views["grid,false"].replace(
            'js_class="timer_timesheet_grid"',
            'js_class="timer_timesheet_grid" sample="1"',
        ),
        groupBy: [ "employee_id", "task_id" ],
        domain: Domain.FALSE.toList(),
    });

    expect(".o_grid_view").toHaveCount(1, {
        message: "The view should be correctly rendered with the sample data enabled when no data is found",
    });
    expect(".o_grid_add_line a").toHaveCount(0, {
        message: "The 'Add a line' button should not be visible inside the row added via the sample data",
    });
    expect(".o_grid_button_add:visible").toHaveCount(1, {
        message: "The 'Add a line' button should be visible",
    });
});

test("hr.timesheet (grid)(timer): 'Add a line' should be displayed when display_empty=true", async () => {
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        arch: HRTimesheet._views["grid,false"].replace(
            'js_class="timer_timesheet_grid"',
            'js_class="timer_timesheet_grid" display_empty="1"',
        ),
    });

    expect(".o_grid_add_line a").toHaveCount(1, {
        message: "The Add a line button should be displayed even if there is no data",
    });
    expect(".o_grid_button_add:visible").toHaveCount(0, {
        message: "The 'Add a line' button in the control panel should not be visible",
    });
    expect(".o_grid_renderer .o_grid_add_line a").toHaveText("Add a line", {
        message: "A button `Add a line` should be displayed in the grid view",
    })

    await click(".o_grid_add_line a");
    await animationFrame();
    expect(".modal").toHaveCount(1, {
        message: "A model should be displayed",
    });

    await click(".modal .modal-footer button.o_form_button_cancel");
    await animationFrame();
    expect(".o_grid_add_line a").toHaveCount(1, {
        message: "No Add a line button should be displayed when no data is found",
    });
    expect(".o_grid_button_add:visible").toHaveCount(0, {
        message:  "'Add a line' control panel button should be visible",
    });
});

test("hr.timesheet (grid)(timer): basics", async () => {
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });

    expect(".timesheet-timer").toHaveCount(1, {
        message: "The timer header should be rendered",
    });
    expect(".btn_start_timer").toHaveCount(1, {
        message: "The start timer button should be rendered",
    });
    expect(".o_grid_row_title").toHaveCount(5, {
        message: "5 rows should be rendered",
    });
    expect("button.btn_timer_line").toHaveCount(5, {
        message: "A 'start' button should be rendered before each line",
    });
    // Can't do `queryAllTexts` because it retrieves innerText, which is lowercase
    expect(queryAll("button.btn_timer_line").every(
        (node) => node.textContent === node.textContent.toUpperCase()
    )).toBe(true, {
        message: "The character displayed on each button should be in uppercase"
    });
    expect("button.btn_timer_line.btn-danger").toHaveCount(0, {
        message: "There shouln't be a running timer on any row",
    });

    await click(".btn_start_timer");
    await animationFrame();
    expect(".btn_start_timer").toHaveCount(0, {
        message: "The start button should no longer rendered since a timer will be running",
    });
    expect(".btn_stop_timer").toHaveCount(1, {
        message: "A stop button should be rendered instead of the start one",
    });
    expect(".btn_stop_timer").toBeFocused({
        message: "The stop button should be focused",
    });
    expect(".o_timer_discard button.stop-timer").toHaveCount(1, {
        message: "Cancel button should be rendered to be able to unlink the timer",
    });
    expect(".timesheet-timer .o_field_widget[name=project_id]").toHaveCount(1, {
        message: "The project_id field should be rendered inside the timer header",
    });
    expect(".timesheet-timer .o_field_widget[name=task_id]").toHaveCount(1, {
        message: "The task_id field should be rendered inside the timer header",
    });
    expect(".timesheet-timer .o_field_widget[name=name]").toHaveCount(1, {
        message: "The name field should be rendered inside the timer header",
    });

    await click(".btn_stop_timer");
    await animationFrame();
    expect(".btn_stop_timer").toHaveCount(1, {
        message: "A stop button should be still there since the project_id is invalid because it is required and empty",
    });
    expect(".timesheet-timer .o_field_widget.o_field_invalid[name=project_id]").toHaveCount(1, {
        message: "The project_id field should be invalid since it is required and empty",
    });

    await click(".o_timer_discard button");
    await animationFrame();
    expect(".btn_start_timer").toHaveCount(1, {
        message: "The start button should be rendered since a timer has been dropped",
    });
    expect(".o_grid_add_line .btn-link").toHaveCount(1, {
        message: "There shouldn't be a 'Add a line' button",
    });
});

test("hr.timesheet (grid)(timer): basics without Add a line button", async () => {
    onRpc(({ method }) => {
        if (method === "get_last_validated_timesheet_date") {
            return "2017-01-30";
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });

    expect(".o_grid_add_line .btn-link").toHaveCount(0, {
        message: "'Add a line' button should be displayed",
    });
});

test("hr.timesheet (grid)(timer): timer already running", async () => {
    HRTimesheet._records.push({
        id: 10,
        unit_amount: 5740 / 3600, // 01:35:40
        project_id: 1,
        task_id: 1,
        name: "Description",
    });
    onRpc(({ method }) => {
        if (method === "get_running_timer") {
            return {
                id: 10,
                start: 5740, // 01:35:40
                project_id: 1,
                task_id: 1,
                description: "Description",
                step_timer: 30,
            };
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });

    expect(".btn_stop_timer").toHaveCount(1, {
        message: "should have rendered the stop timer button",
    });
    expect(".o_grid_row_timer .fa-stop").toHaveCount(1, {
        message: "a row should have the timer running",
    });
    expect(".timesheet-timer .o_field_widget[name=project_id] input").toHaveValue("P1");
    expect(".timesheet-timer .o_field_widget[name=task_id] input").toHaveValue("BS task");
    expect(".timesheet-timer .o_field_widget[name=name] input").toHaveValue("Description");
    await animationFrame();
    expect(
        queryText(".timesheet-timer div[name=display_timer] span")
    ).toMatch(/01:35:4./, { message: "Timer is set" });
});

test("hr.timesheet (grid)(timer): stop running timer then restart new one", async () => {
    HRTimesheet._records.push({
        id: 10,
        unit_amount: 5740 / 3600, // 01:35:40
        project_id: 1,
        task_id: 1,
        name: "Description",
    });
    let timerRunning = true;
    onRpc(({ method, model }) => {
        if (method === "get_running_timer" && timerRunning) {
            return {
                step_timer: 30,
                id: 10,
                start: 5740, // 01:35:40
                project_id: 1,
                task_id: 1,
                description: "Description",
            };
        } else if (method === "action_timer_stop") {
            timerRunning = false;
            return 0.15;
        } else if (
            !timerRunning &&
            model === "account.analytic.line" &&
            method === "web_read_group"
        ) {
            expect.step("Reload");
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });

    expect(".timesheet-timer .btn_stop_timer").toHaveCount(1, {
        message: "The stop button should be rendered since a timer is running",
    });

    await click(".timesheet-timer .btn_stop_timer");
    await animationFrame();
    expect(".o_grid_row_timer .fa-stop").toHaveCount(0, {
        message: "No row should have a timer running",
    });
    // When stopping the timer, a reload of the view should not be triggered since there was an active row for the current timesheet
    expect.verifySteps([]);

    await click(".btn_start_timer");
    await animationFrame();
    expect(".btn_stop_timer").toHaveCount(1, {
        message: "The button should still be displayed",
    });
    expect(".o_grid_row_timer .fa-stop").toHaveCount(0, {
        message: "No row should have a timer running",
    });
    expect(".timesheet-timer .o_field_widget[name=project_id] input").toHaveValue("", {
        message: "project_id in the timer header should be reset",
    });
    expect(".timesheet-timer .o_field_widget[name=task_id] input").toHaveValue("", {
        message: "task_id in the timer header should be reset",
    });
    expect(".timesheet-timer .o_field_widget[name=name] input").toHaveValue("", {
        message: "name field in the timer header should be reset",
    });
    expect(
        queryText(".timesheet-timer div[name=display_timer] span")
    ).toMatch(/00:00:0./, { message: "Timer should be reset" });
});

test("hr.timesheet (grid)(timer): drop running timer then restart new one", async () => {
    HRTimesheet._records.push({
        id: 10,
        unit_amount: 5740 / 3600, // 01:35:40
        project_id: 1,
        task_id: 1,
        name: "Description",
    });
    let timerRunning = true;
    onRpc(({ method }) => {
        if (method === "get_running_timer" && timerRunning) {
            return {
                step_timer: 30,
                id: 10,
            };
        } else if (method === "action_timer_unlink") {
            timerRunning = false;
            return false;
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });

    await press("escape")
    await animationFrame();
    expect(".o_grid_row_timer .fa-stop").toHaveCount(0, {
        message: "No row should have a timer running",
    });
    expect(".btn_start_timer").toBeFocused({
        message: "Start button should be focused",
    });

    await click(".btn_start_timer");
    await animationFrame();
    expect(".btn_stop_timer").toHaveCount(1, {
        message: "The button to stop the timer should be displayed",
    });
    expect(".o_grid_row_timer .fa-stop").toHaveCount(0, {
        message: "No row should have a timer running",
    });
    expect(".timesheet-timer .o_field_widget[name=project_id] input").toHaveValue("", {
        message: "project_id in the timer header should be reset",
    });
    expect(".timesheet-timer .o_field_widget[name=task_id] input").toHaveValue("", {
        message: "task_id in the timer header should be reset",
    });
    expect(".timesheet-timer .o_field_widget[name=name] input").toHaveValue("", {
        message: "name field in the timer header should be reset",
    });
    expect(
        queryText(".timesheet-timer div[name=display_timer] span")
    ).toMatch(/00:00:0./, { message: "Timer should be reset" });
});

test("hr.timesheet (grid)(timer): start buttons with groupBy", async () => {
    // `arch` and `searchViewArch` args sound overkill, but actually,
    // if `searchViewArch` is not given, the search view is created.
    // And if it is given, you need to give `arch` too.
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        arch: HRTimesheet._views["grid,false"],
        searchViewArch: HRTimesheet._views["search,false"],
    });

    await toggleSearchBarMenu();
    await toggleMenuItem("Task");
    await toggleMenuItem("Project");
    expect("button.btn_timer_line").toHaveCount(5, {
        message: "The timer button should be rendered for each row displayed in the grid since the project_id is in the rowFields",
    });

    await toggleMenuItem("Project");
    expect("button.btn_timer_line").toHaveCount(0, {
        message: "The timer button should not be rendered in any row in the grid view since the project_id field is no longer in the rowFields",
    });

    await toggleMenuItem("Task");
    await toggleMenuItem("Project");
    expect("button.btn_timer_line").toHaveCount(2, {
        message: "The timer button should be rendered for each row displayed in the grid since the project_id is in the rowFields",
    });
});


test("hr.timesheet (grid)(timer): start button with shift", async () => {
    let timesheetId = 6;
    onRpc(({ args, method }) => {
        if (method === "action_add_time_to_timesheet") {
            const { project_id, task_id } = args[1];
            HRTimesheet._records.push({
                id: ++timesheetId,
                project_id,
                task_id,
                date: "2017-01-25",
                unit_amount: 0.5,
            });
            return timesheetId;
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "task_id", "project_id" ],
    });

    const checkHeaderText = () => expect(".timesheet-timer > div > div").toHaveText(
        "Press Enter or [a] to launch the timer\nPress Shift + [A] to add 30 min",
        { message: "The text displayed next to Start button should be the default one" },
    );

    checkHeaderText();
    // activeElement should be the start button
    await keyDown("shift");
    await animationFrame();
    checkHeaderText();

    expect(queryAll("button.btn_timer_line").every(
        (node) => node.textContent === node.textContent.toUpperCase()
    )).toBe(true, {
        message: "The character displayed on each button should be in uppercase",
    });
    expect("button.btn_timer_line .text-lowercase").toHaveCount(0, {
        message: "The letter displayed in each button should be in uppercase",
    });

    await press("a");
    await animationFrame();
    await press("a");
    await animationFrame();
    await press("a");
    await animationFrame();
    expect(queryFirst(
        ".o_grid_row.o_grid_highlightable:not(.o_grid_row_title,.o_grid_row_total,.o_grid_column_total) .bg-info"
    ).nextElementSibling).toHaveText("1:30");

    await keyUp("shift");
    await animationFrame();
    checkHeaderText();
    expect("button.btn_timer_line .text-lowercase").toHaveCount(5, {
        message: "The character on the button displayed in each row should be in lowercase",
    });

    await click(".timesheet-timer .btn_start_timer");
    await animationFrame();
    await keyDown("shift");
    await animationFrame();
    expect("button.btn_timer_line .text-lowercase").toHaveCount(5, {
        message: "The character on the button displayed in each row should still be in lowercase as the header is focused",
    });
});

test("hr.timesheet (grid)(timer): start timer from button line", async () => {
    let timesheetId = 6;
    onRpc(({ method, args }) => {
        if (method === "action_start_new_timesheet_timer") {
            const { project_id, task_id } = args[0];
            if (!project_id) {
                return false;
            }
            const timesheet = {
                id: ++timesheetId,
                project_id,
                task_id,
                date: "2017-01-25",
                unit_amount: 0.0,
            };
            HRTimesheet._records.push(timesheet);
            return timesheet;
        } else if (method === "action_add_time_to_timesheet") {
            const { project_id, task_id } = args[1];
            const timesheet = {
                id: ++timesheetId,
                project_id,
                task_id,
                date: "2017-01-25",
                unit_amount: 0.5,
            };
            HRTimesheet._records.push(timesheet);
            return timesheetId;
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "task_id", "project_id" ],
    });

    expect(".btn_start_timer").toHaveCount(1, {
        message: "No timer running so start button should be displayed",
    });
    expect(".btn_stop_timer").toHaveCount(0, {
        message: "No timer running so stop button should not be displayed",
    });
    expect(".o_grid_row_title").toHaveCount(5, {
        message: "5 rows should be displayed in the grid view",
    });
    expect(".btn_timer_line").toHaveCount(5, {
        message: "A timer button should be displayed in each row",
    });

    await click("button.btn_timer_line");
    await animationFrame();
    expect(".btn_start_timer").toHaveCount(0, {
        message: "A timer should be running and so the start button should not be displayed",
    });
    expect(".btn_stop_timer").toHaveCount(1, {
        message: "A timer should be running and so the stop button should be displayed instead of start one",
    });
    expect("button.btn_timer_line.btn-danger .fa-stop").toHaveCount(1, {
        message: "A row should have the timer button red with stop icon to notify the timer is running in that row",
    });
    expect("button.btn_timer_line:not(.btn-danger)").toHaveCount(4, {
        message: "4 rows should not have a timer running",
    });
    expect(
        queryAll("button.btn_timer_line").map((button) => button.classList.contains("btn-danger"))
    ).toEqual([true, false, false, false, false], {
        message: "Only first row should have the timer runnning",
    });
    expect(".timesheet-timer .o_field_widget[name=project_id] input").toHaveValue("P1", {
        message: "project_id in the timer header should be the one in the first row",
    });
    expect(".timesheet-timer .o_field_widget[name=task_id] input").toHaveValue("", {
        message: "task_id in the timer header should be the one in the first row (no task)",
    });
    expect(".timesheet-timer .o_field_widget[name=name] input").toHaveValue("", {
        message: "name field in the timer header should be empty (default value)",
    });
    expect(
        queryText(".timesheet-timer div[name=display_timer] span")
    ).toMatch(/00:00:0./, { message: "Timer should start at 0" });

    await click("button.btn_timer_line:not(.btn-danger)");
    await animationFrame();
    expect(".btn_start_timer").toHaveCount(0, {
        message: "A timer should be running and so the start button should not be displayed",
    });
    expect(".btn_stop_timer").toHaveCount(1, {
        message: "A timer should be running and so the stop button should be displayed instead of start one",
    });
    expect("button.btn_timer_line.btn-danger .fa-stop").toHaveCount(1, {
        message: "A row should have the timer button red with stop icon to notify the timer is running in that row",
    });
    expect("button.btn_timer_line:not(.btn-danger)").toHaveCount(4, {
        message: "4 rows should not have a timer running",
    });

    expect(
        queryAll("button.btn_timer_line").map((button) => button.classList.contains("btn-danger"))
    ).toEqual([false, true, false, false, false], {
        message: "Only second row should have the timer runnning",
    });
    expect(".timesheet-timer .o_field_widget[name=project_id] input").toHaveValue("Webocalypse Now", {
        message: "project_id in the timer header should be the one in the first row",
    });
    expect(".timesheet-timer .o_field_widget[name=task_id] input").toHaveValue("Another BS task", {
        message: "task_id in the timer header should be the one in the first row (Another BS task is expected)",
    });
    expect(".timesheet-timer .o_field_widget[name=name] input").toHaveValue("", {
        message: "name field in the timer header should be empty (default value)",
    });
    expect(
        queryText(".timesheet-timer div[name=display_timer] span")
    ).toMatch(/00:00:0./, { message: "Timer should start at 0" });
});

test("hr.timesheet (grid)(timer): change description running timer", async () => {
    onRpc(({ method }) => {
        if (method === "get_running_timer") {
            return { step_timer: 30, id: 1 };
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });

    await click(".timesheet-timer div[name=name] input");
    await edit("Description");
    expect(".timesheet-timer div[name=name] input").toHaveValue("Description", {
        message: "`Description` should correctly be written in the name description in the timer header",
    });
});


test("hr.timesheet (grid)(timer): check that individual and total overtime are properly displayed", async () => {
    onRpc(({ method }) => {
        if (method === "get_daily_working_hours") {
            return {
                "2017-01-22": 0,
                "2017-01-23": 7,
                "2017-01-24": 7,
                "2017-01-25": 7,
                "2017-01-26": 7,
                "2017-01-27": 7,
                "2017-01-28": 0,
            };
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });

    const columnTotalEls = queryAll(".o_grid_column_total");
    let dangerColumnTotalCells = 0;
    let warningColumnTotalCells = 0;
    let emptyColumnTotalCells = 0;
    let columnTotalEl;

    for (const node of columnTotalEls) {
        if (!columnTotalEl && queryFirst(".o_grid_bar_chart_total_title", { root: node })) {
            columnTotalEl = node;
        }
        if (node.classList.contains("o_grid_bar_chart_container")) {
            continue;
        }
        const columnTotalTitleEl = queryFirst(".o_grid_bar_chart_total_title", { root: node });
        if (!columnTotalTitleEl) {
            emptyColumnTotalCells++;
        } else if (queryFirst("span.text-danger", { root: columnTotalTitleEl })) {
            dangerColumnTotalCells++;
        } else if (queryFirst("span.text-warning", { root: columnTotalTitleEl })) {
            warningColumnTotalCells++;
        }
    }

    expect(emptyColumnTotalCells).toBe(4, {
        message: "4 column totals should not have any number since the employee has recorded nothing",
    });
    expect(dangerColumnTotalCells).toBe(3, {
        message: "3 column totals should have a total displayed in red since the employee has not done all his working hours",
    });
    expect(warningColumnTotalCells).toBe(1, {
        message: "1 column totals should have a total displayed in orange since the employee has done extra working hours",
    });
    expect(".o_grid_bar_chart_container .o_grid_bar_chart_overtime").toHaveCount(4, {
        message: "4 overtimes indication should be displayed in 4 cells displaying barchart total",
    });
    expect(".o_grid_bar_chart_container:not(.o_grid_highlighted) .o_grid_bar_chart_overtime").toHaveCount(4, {
        message: "4 overtimes indication should be displayed in 4 cells displaying barchart total should not be visible",
    });

    await hover(columnTotalEl);
    await animationFrame();
    await advanceTime(10); // debounce on mouse over event.
    expect(".o_grid_bar_chart_container.o_grid_highlighted .o_grid_bar_chart_overtime").toBeDisplayed({
        message: "The overtime of the total column hovered should be visible",
    });

    const overtimeClasses = [ "text-danger", "text-warning", "text-danger", "text-danger" ];
    queryAll(
        ".o_grid_bar_chart_container .o_grid_bar_chart_overtime"
    ).forEach((node, i) => expect(node).toHaveClass(overtimeClasses[i], {
        message: "Daily overtime should have been displayed in different color",
    }));

    expect(
        ".o_grid_highlightable.position-md-sticky.end-0.d-flex.align-items-center.justify-content-center.fw-bold.text-bg-warning"
    ).toHaveCount(1, {
        message: "Total overtime should be displayed in orange because employees have done more work than the normal hours",
    });
});

test("hr.timesheet (grid)(timer): start timer and cancel it", async () => {
    let containerRowTimerButton, rowTitle;
    onRpc(({ method, model, kwargs }) => {
        if (method === "action_start_new_timesheet_timer") {
            return {
                start: 0,
                project_id: false,
                task_id: false,
                description: "",
            };
        } else if (method === "name_search") {
            if (model === "project.project") {
                kwargs.args = [["allow_timesheets", "=", true]];
            } else if (model === "project.task") {
                kwargs.args = [];
            }
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });

    expect(".btn_start_timer").toHaveCount(1, {
        message: "The timer should be running"
    });

    await click(".btn_start_timer");
    await animationFrame();
    expect(".btn_start_timer").toHaveCount(0, {
        message: "The timer should be running",
    });
    expect(".btn_stop_timer").toHaveCount(1, {
        message: "The stop button should be displayed"
    });
    expect(".o_timer_discard button").toHaveCount(1, {
        message: "The cancel button should be displayed",
    });

    await selectFieldDropdownItem("project_id", "P1")
    expect(".btn_timer_line.btn-danger").toHaveCount(1, {
        message: "The timer is running on the row with the project selected",
    });
    containerRowTimerButton = queryFirst(".btn_timer_line.btn-danger").closest(".o_grid_highlightable");
    rowTitle = queryText(
        `.o_grid_row_title[data-grid-row='${containerRowTimerButton.dataset.gridRow}']`
    );
    expect(rowTitle).toMatch(/P1.*/, {
        message: "The row title with the timer running should contain the project selected in the timer header",
    });
    expect(rowTitle).not.toMatch(/.*BS task/, {
        message: "The row title with the timer running should not contain a task name",
    });

    await selectFieldDropdownItem("task_id", "BS task")
    expect(".btn_timer_line.btn-danger").toHaveCount(1, {
        message: "The timer is running on the row with the project and task selected in the timer header",
    });
    containerRowTimerButton = queryFirst(".btn_timer_line.btn-danger").closest(".o_grid_highlightable");
    rowTitle = queryText(
        `.o_grid_row_title[data-grid-row='${containerRowTimerButton.dataset.gridRow}']`
    );
    expect(rowTitle).toMatch(/P1.*/, {
        message: "The row title with the timer running should contain the project selected in the timer header",
    });
    expect(rowTitle).toMatch(/.*BS task/, {
        message: "The row title with the timer running should contain a task name",
    });

    await click(".o_timer_discard button");
    await animationFrame();
    expect(".btn_timer_line.btn-danger").toHaveCount(0, {
        message: "The timer should be cancelled",
    });
    expect(".btn_stop_timer").toHaveCount(0, {
        message: "The stop button should no longer be displayed",
    });
    expect(".o_timer_discard button").toHaveCount(0, {
        message: "The cancel button should no longer be displayed",
    });
    expect(".btn_start_timer").toHaveCount(1, {
        message: "The timer should no longer be running",
    });
});

test("hr.timesheet (grid)(timer): start and stop timer with GridTimerButton (keyboard shortcut)", async () => {
    let timesheetId = 6;
    onRpc(({ method, args }) => {
        if (method === "action_start_new_timesheet_timer") {
            const { project_id, task_id } = args[0];
            if (!project_id) {
                return false;
            }
            const timesheet = {
                id: ++timesheetId,
                project_id,
                task_id,
                date: "2017-01-25",
                unit_amount: 0.0,
            };
            HRTimesheet._records.push(timesheet);
            return timesheet;
        } else if (method === "action_timer_stop") {
            return 0.25;
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
    });

    expect(".btn_start_timer").toHaveCount(1, {
        message: "No timer should be running",
    });
    const gridTimerButtonContainer = queryFirst('button.btn_timer_line').closest(".o_grid_highlightable");
    expect(
        `.o_grid_row.o_grid_highlightable.o_grid_cell_today[data-grid-row="${gridTimerButtonContainer.dataset.gridRow}"]`
    ).toHaveText("0:00");

    await press("a");
    await animationFrame();
    expect(".btn_start_timer").toHaveCount(0, {
        message: "A timer should be running",
    });
    expect(".btn_timer_line.btn-danger").toHaveCount(1, {
        message: "The row with the GridTimerButton with 'a' letter in the grid view should have the timer running",
    });
    expect("button.btn_timer_line.btn-danger").toHaveCount(1, {
        message: "The row with the running timer should be the one with the 'a' letter in the GridTimerButton",
    });

    await press("a");
    await animationFrame();
    expect(".btn_start_timer").toHaveCount(1, {
        message: "The timer should be stopped",
    });
    expect(".btn_timer_line.fa-stop-danger").toHaveCount(0, {
        message: "The running timer in the row with the GridTimerButton with 'a' letter in the grid should be stopped",
    });
    expect(
        `.o_grid_cell_today[data-grid-row="${gridTimerButtonContainer.dataset.gridRow}"]`
    ).toHaveText("0:15", {
        message: "The today cell in the row with `A` button should be increased by 15 minutes",
    });
});

test("hr.timesheet (grid)(timer): start timer and then another with GridTimerButton (keyboard shortcut)", async () => {
    let timesheetId = 6;
    onRpc(({ method, args }) => {
        if (method === "action_start_new_timesheet_timer") {
            const { project_id, task_id } = args[0];
            if (!project_id) {
                return false;
            }
            const timesheet = {
                id: ++timesheetId,
                project_id,
                task_id,
                date: "2017-01-25",
                unit_amount: 0.0,
            };
            HRTimesheet._records.push(timesheet);
            return timesheet;
        } else if (method === "action_timer_stop") {
            return 0.25;
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
    });

    expect(".btn_start_timer").toHaveCount(1, {
        message: "No timer should be running",
    });
    const gridTimerButtonContainer = queryFirst('button.btn_timer_line').closest(".o_grid_highlightable");
    expect(
        `.o_grid_cell_today[data-grid-row="${gridTimerButtonContainer.dataset.gridRow}"]`
    ).toHaveText("0:00");

    await press("a");
    await animationFrame();
    expect(".btn_start_timer").toHaveCount(0, {
        message: "A timer should be running",
    });
    expect(".btn_timer_line.btn-danger").toHaveCount(1, {
        message: "The row with the GridTimerButton with 'a' letter in the grid view should have the timer running",
    });
    expect(".o_grid_row_timer.o_grid_highlightable[data-row='1']").toHaveCount(1, {
        message: "The row with the running timer should be the one with the 'a' letter in the GridTimerButton",
    });

    await press("b");
    await animationFrame();
    expect(".btn_start_timer").toHaveCount(0, {
        message: "A timer should be running",
    });
    expect(".btn_timer_line.btn-danger").toHaveCount(1, {
        message: "The row with the GridTimerButton with 'b' letter in the grid view should have the timer running",
    });
    expect(".o_grid_row_timer.o_grid_highlightable[data-row='2']").toHaveCount(1, {
        message: "The row with the running timer should be the one with the 'b' letter in the GridTimerButton",
    });
    expect(
        `.o_grid_cell_today[data-grid-row="${gridTimerButtonContainer.dataset.gridRow}"]`
    ).toHaveText("0:15", {
        message: "The today cell in the row with `A` button should be increased by 15 minutes",
    });
});

test("hr.timesheet (grid)(timer): GridTimerButton when there are 26+ rows", async () => {
    for (let i = 0; i <= 26; i++) {
        const project_id = 100 + i;
        ProjectProject._records.push({
            id: project_id,
            name: `Project ${i}`,
            allow_timesheets: true,
        });
        HRTimesheet._records.push({
            project_id,
            date: "2017-01-25",
            unit_amount: 1.0,
        });
    }
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });

    expect(".o_grid_row_title").toHaveCount(32, {
        message: "The view should have 32 total rows rendered",
    });
    expect(".btn_start_timer").toHaveCount(1, {
        message: "No timer should be running",
    });

    expect(".btn_timer_line.btn-outline-secondary:has(.fa-play)").toHaveCount(6, {
        message: "Having 32 total records and only 26 letters for the shortcuts, the last 6 of the GridTimerButton should have fa-play icon instead of a letter",
    });
    expect(queryFirst("button span span", {
        root: queryFirst(".o_grid_row:has(.btn_timer_line.btn-outline-secondary):last"),
    })).toHaveClass("fa-play", {
        message: "After all letters, GridTimerButton should display a 'fa-play' icon"
    });
});

test("hr.timesheet (grid)(timer): start timer and create a new project and a new task", async () => {
    let reload = false;
    onRpc(({ method, model, args, kwargs }) => {
        if (method === "action_start_new_timesheet_timer") {
            return {
                rate: 0,
                project_id: false,
                task_id: false,
                description: "",
            };
        } else if (method === "action_timer_stop") {
            // The newly created timesheet need to be pushed on the mockserver model otherwise it will not be fetched
            // on the reload of the view. The new line will then not be created either, failing the assert on row count.
            const [ id ] = args;
            HRTimesheet._records.push({
                rate: 0,
                id,
                project_id: id == 8 ? 1 : 3,
                task_id: id == 8 ? 4 : false,
                date: "2017-01-25",
                description: "",
            });
            reload = true;
            return 0.25;
        } else if (
            reload &&
            model === "account.analytic.line" &&
            method === "web_read_group"
        ) {
            expect.step("Reload");
            reload = false;
        } else if (method === "name_search") {
            if (model === "project.project") {
                kwargs.args = [["allow_timesheets", "=", true]];
            } else if (model === "project.task") {
                kwargs.args = [];
            }
        }
    });
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });

    // Create a new timesheet with a new project.
    expect(".o_grid_row_title").toHaveCount(5, {
        message: "The view should have 5 rows rendered",
    });
    await click(".btn_start_timer");
    await animationFrame();
    await clickFieldDropdown("project_id");
    await edit("a new project");
    await runAllTimers();
    await click(".o_m2o_dropdown_option_create");
    await click(".btn_stop_timer");
    await animationFrame();
    expect(".o_grid_row_title").toHaveCount(6, {
        message: "The view should have 6 rows rendered",
    });
    // When stopping the timer, a reload of the view should be triggered since there were no active row for the current project
    expect.verifySteps(["Reload"]);

    // Create a new timesheet with a new task in an existing project.
    await click(".btn_start_timer");
    await animationFrame();
    await selectFieldDropdownItem("project_id", "P1")
    await clickFieldDropdown("task_id");
    await edit("a new task");
    await runAllTimers();
    await click(".o_m2o_dropdown_option_create");
    await click(".btn_stop_timer");
    await animationFrame();
    expect(".o_grid_row_title").toHaveCount(7, {
        message: "The view should have 7 rows rendered",
    });
    // When stopping the timer, a reload of the view should be triggered since there were no active row for the tuple project > task
    expect.verifySteps(["Reload"]);
});

test("hr.timesheet (grid)(timer): switch view with GroupBy and start the timer", async () => {
    await mountWithCleanup(WebClient);
    await getService("action").doAction({
        res_model: "account.analytic.line",
        type: "ir.actions.act_window",
        views: [[false, "grid"], [false, "kanban"]],
        context: { group_by: ["project_id", "task_id"] },
    });

    await click(".o_switch_view.o_kanban");
    await animationFrame();
    await click(".btn_start_timer");
    await animationFrame();
    expect("button.btn_start_timer").not.toBeDisplayed({
        message: "Timer should be running",
    });
});

test("hr.timesheet (grid)(timer): total cell bg color", async () => {
    onRpc(({ method }) => {
        if (method === "get_daily_working_hours") {
            return {
                "2017-01-24": 4,
                "2017-01-25": 4,
            };
        }
    })
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
        groupBy: [ "project_id", "task_id" ],
    });
    expect(".o_grid_highlightable.text-bg-warning").toHaveCount(1, {
        message: "Total should be an overtime (10 > 8)",
    })
});

test("hr.timesheet (grid)(timer): display sample data and then data + fetch last validate timesheet date", async () => {
    HRTimesheet._views["grid,false"] = HRTimesheet._views["grid,false"].replace("<grid", "<grid sample='1'");
    onRpc(({ method }) => {
        if (method === "get_daily_working_hours") {
            return {
                "2017-01-24": 4,
                "2017-01-25": 4,
            };
        } else if (method === "get_last_validated_timesheet_date") {
            expect.step("get_last_validated_timesheet_date");
        }
    });

    await mountWithCleanup(WebClient);
    await getService("action").doAction({
        res_model: "account.analytic.line",
        type: "ir.actions.act_window",
        views: [[ false, "grid" ]],
        context: { search_default_nothing: 1 },
    });

    expect(".o_view_sample_data").toHaveCount(1);
    await removeFacet("Nothing");
    expect(".o_grid_sample_data").toHaveCount(0);
    expect(".o_grid_row_title").toHaveCount(6);
    expect.verifySteps(["get_last_validated_timesheet_date"]); // the rpc should be called only once
});


test("hr.timesheet (grid)(timer): start button is always in focus", async () => {
    HRTimesheet._records = [{
        id: 1,
        display_timer: true,
        is_timesheet: true,
        timer_start: "2017-01-25 00:00:00",
        company_id: 1,
        date: "2017-01-25",
    }];
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
    });

    // At each mount and patch Start Button should be in focus
    expect(".btn_start_timer").toHaveCount(1);
    expect(".btn_start_timer").toBeFocused();

    // Click on a clickable button/action should be accessible and should not be disturbed
    // Force focus must not disturb other clicks
    await click(".o_grid_row:not(.o_grid_row_title, .o_grid_row_timer)");
    await delay(50);
    expect(".o_grid_component div input").toBeFocused();

    // Click on body which doesn't have any fields/actions must make Start button to come in focus
    await click(document.body);
    expect(".btn_start_timer").toBeFocused();
});

describe.current.tags("desktop");
test("hr.timesheet (grid)(timer): stop button is always in focus", async () => {
    HRTimesheet._records = [{
        id: 1,
        display_timer: true,
        is_timesheet: true,
        timer_start: "2017-01-25 00:00:00",
        company_id: 1,
        date: "2017-01-25",
    }];
    await mountView({
        type: "grid",
        resModel: "account.analytic.line",
    });

    await click(".btn_start_timer");
    await animationFrame();
    // At each mount and patch Stop Button should be in focus
    expect(".btn_stop_timer").toHaveCount(1);
    expect(".btn_stop_timer").toBeFocused();

    // Click on a clickable button/input should be accessible and should not be disturbed
    // Force focus must not disturb other clicks/inputs
    await click('.o_field_many2one[name="project_id"] input');
    expect('.o_field_many2one[name="project_id"] input').toBeFocused();

    // Click on body which doesn't have any fields/actions must make Stop button to come in focus
    await click(document.body);
    expect(".btn_stop_timer").toBeFocused();
});
