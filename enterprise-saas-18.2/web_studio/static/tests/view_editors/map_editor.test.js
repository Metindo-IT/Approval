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
import { WebClientEnterprise } from "@web_enterprise/webclient/webclient";
import { createMockViewResult, handleDefaultStudioRoutes } from "../view_editor_tests_utils";

describe.current.tags("desktop");

defineMailModels();

class Partner extends models.Model {
    _name = "partner";

    name = fields.Char();
    partner_latitude = fields.Float();
    partner_longitude = fields.Float();
    contact_address_complete = fields.Char();
    sequence = fields.Integer();
    task_ids = fields.One2many({ relation: "task" });

    _records = [
        {
            id: 1,
            name: "Foo",
            partner_latitude: 10.0,
            partner_longitude: 10.5,
            contact_address_complete: "Chaussée de Namur 40, 1367, Ramillies",
            sequence: 1,
        },
    ];
}

class Task extends models.Model {
    _name = "task";

    name = fields.Char();
    scheduled_date = fields.Char();
    sequence = fields.Integer();
    description = fields.Char();
    partner_id = fields.Many2one({ relation: "partner" });
    o2m_field = fields.One2many({ relation: "partner" });
    m2m_field = fields.Many2many({ relation: "partner" });
    binary_field = fields.Binary();

    _records = [{
        id: 1,
        name: "first record",
        description: "first description",
        partner_id: 1,
    }];

    _views = {
        "map,1": `
            <map res_partner='partner_id' routing='true' hide_name='true' hide_address='true' studio_map_field_ids="[1,2]">
                <field name='name' string='Name'/>
                <field name='description' string='Description'/>
            </map>`,
        search: "<search/>",
    }
}

defineModels([Partner, Task]);

handleDefaultStudioRoutes();

test("marker popup fields in editor sidebar", async () => {
    expect.assertions(12);

    await mountWithCleanup(WebClientEnterprise);
    await animationFrame();

    onRpc("/web_studio/edit_view", async (request) => {
        const { params } = await request.json();
        expect.step("edit_view");
        expect(params.operations[0]).toEqual({
            type: "map_popup_fields",
            target: { field_ids: [1], operation_type: "remove" },
        });
        const arch = `
            <map res_partner='partner_id' routing='true' hide_name='true' hide_address='true' studio_map_field_ids="[2]">
                <field name='description' string='Description'/>
            </map>`;

        return createMockViewResult("map", arch, Partner);
    });

    await getService("action").doAction({
        name: "Task",
        res_model: "task",
        type: "ir.actions.act_window",
        view_mode: "map",
        views: [
            [1, "map"],
            [false, "search"],
        ],
        group_ids: [],
    });

    await contains(".o_web_studio_navbar_item").click();
    expect(".o_web_studio_sidebar .o_map_popup_fields").toHaveCount(1);
    expect(".o_web_studio_sidebar .o_map_popup_fields .badge").toHaveCount(2);
    expect("div.leaflet-marker-icon").toHaveCount(1);

    await contains("div.leaflet-marker-icon").click();

    expect(".o-map-renderer--popup-table tbody tr:first .o-map-renderer--popup-table-content-name").toHaveText("Name");
    expect(".o-map-renderer--popup-table tbody tr:first .o-map-renderer--popup-table-content-value").toHaveText("first record");
    expect(".o-map-renderer--popup-table tbody tr:last .o-map-renderer--popup-table-content-name").toHaveText("Description");
    expect(".o-map-renderer--popup-table tbody tr:last .o-map-renderer--popup-table-content-value").toHaveText("first description");

    await contains(".o_web_studio_sidebar .o_map_popup_fields .badge .o_delete").click();
    expect.verifySteps(["edit_view"]);
    expect(".o_web_studio_sidebar .o_map_popup_fields .badge").toHaveCount(1);

    await contains("div.leaflet-marker-icon").click();
    expect(".o-map-renderer--popup-table tbody tr").toHaveCount(1);
    expect(".o-map-renderer--popup-table tbody tr .o-map-renderer--popup-table-content-value").toHaveText("first description");
});

test("map additional fields domain", async () => {
    expect.assertions(2);

    await mountWithCleanup(WebClientEnterprise);
    await animationFrame();

    onRpc("ir.model.fields", "name_search", async (params) => {
        expect.step("name_search");
        expect(params.kwargs.args).toEqual([
            "&",
            "&",
            ["model", "=", "task"],
            ["ttype", "not in", ["many2many", "one2many", "binary"]],
            "!",
            ["id", "in", [1, 2]],
        ]);
    });

    await getService("action").doAction({
        name: "Task",
        res_model: "task",
        type: "ir.actions.act_window",
        view_mode: "map",
        views: [
            [1, "map"],
            [false, "search"],
        ],
        group_ids: [],
    });

    await contains(".o_web_studio_navbar_item").click();
    await contains(".o_field_many2many_tags input").click();
    expect.verifySteps(["name_search"]);
});

test("many2many, one2many and binary fields cannot be selected in SortBy dropdown for map editor", async () => {
    await mountWithCleanup(WebClientEnterprise);
    await animationFrame();

    await getService("action").doAction({
        name: "Task",
        res_model: "task",
        type: "ir.actions.act_window",
        view_mode: "map",
        views: [
            [1, "map"],
            [false, "search"],
        ],
        group_ids: [],
    });

    await contains(".o_web_studio_navbar_item").click();
    await contains(".dropdown-toggle.o_select_menu_toggler:eq(1)").click();
    // There are 3 hidden fields that are not defined above in the class (id, create_date, write_date)
    expect(".o_select_menu_item").toHaveCount(8);
});
