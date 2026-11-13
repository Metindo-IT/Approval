import { describe, expect, test } from "@odoo/hoot";
import { TimesheetTimerRendererHook } from "@timesheet_grid/hooks/timesheet_timer_hooks";

describe.current.tags("desktop");

test("_onTimerUnlinked handles undefined timesheet", async () => {
    TimesheetTimerRendererHook.prototype.setup = function () {};
    let removeRecordsCalled = false;
    const propsList = {
        resModel: "account.analytic.line",
        _removeRecords: () => { removeRecordsCalled = true; },
        model: { load: () => {} }
    };
    const instance = new TimesheetTimerRendererHook(propsList, {});
    instance.timerState = { timesheetId: 42 };
    instance.orm = { call: () => Promise.resolve(true) };

    removeRecordsCalled = false;
    instance.timesheet = undefined;
    await instance._onTimerUnlinked();
    expect(removeRecordsCalled).toBe(false);

    removeRecordsCalled = false;
    instance.timesheet = { id: 123 };
    await instance._onTimerUnlinked();
    expect(removeRecordsCalled).toBe(true);
});
