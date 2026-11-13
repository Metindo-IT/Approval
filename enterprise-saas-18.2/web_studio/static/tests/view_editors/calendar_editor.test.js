import { expect, test, describe } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import {
    mountWithCleanup,
    contains,
    models,
    fields,
    defineModels,
    getService,
    onRpc,
} from "@web/../tests/web_test_helpers";
import { defineMailModels } from "@mail/../tests/mail_test_helpers";
import { handleDefaultStudioRoutes } from "../view_editor_tests_utils";
import { WebClientEnterprise } from "@web_enterprise/webclient/webclient";
import { queryAllTexts } from "@odoo/hoot-dom";

describe.current.tags("desktop");

defineMailModels();

class Timeshift extends models.Model {
    _name = "timeshift";

    date_start = fields.Date();

    _views = {
        "calendar,1": `
            <calendar scales="month,year" date_start="date_start">
                <field name="display_name" />
            </calendar>`,
        "calendar,2": `
            <calendar date_start="date_start">
                <field name="display_name" />
            </calendar>`,
        search: `<search/>`,
    };
}

defineModels([Timeshift]);

handleDefaultStudioRoutes();

onRpc("timeshift", "has_access", () => true);

test("constrain available periods to the scale attribute", async () => {
    await mountWithCleanup(WebClientEnterprise);
    await animationFrame();

    await getService("action").doAction({
        name: "Timeshift",
        res_model: "timeshift",
        type: "ir.actions.act_window",
        view_mode: "calendar",
        views: [
            [1, "calendar"],
            [false, "search"],
        ],
        group_ids: [],
    });

    await contains(".o_web_studio_navbar_item").click();
    await contains(".o_web_studio_sidebar .o_web_studio_property_mode .dropdown-toggle").click();
    expect(queryAllTexts(".o-dropdown--menu .dropdown-item")).toEqual(["Month", "Year"]);
});

test("available periods without scale attribute", async () => {
    await mountWithCleanup(WebClientEnterprise);
    await animationFrame();

    await getService("action").doAction({
        name: "Timeshift",
        res_model: "timeshift",
        type: "ir.actions.act_window",
        view_mode: "calendar",
        views: [
            [2, "calendar"],
            [false, "search"],
        ],
        group_ids: [],
    });

    await contains(".o_web_studio_navbar_item").click();
    await contains(".o_web_studio_sidebar .o_web_studio_property_mode .dropdown-toggle").click();
    expect(queryAllTexts(".o-dropdown--menu .dropdown-item")).toEqual(["Day", "Month", "Week", "Year"]);
})
