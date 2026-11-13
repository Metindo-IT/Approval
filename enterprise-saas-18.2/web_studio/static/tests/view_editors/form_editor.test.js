import { describe, expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { queryAll, queryAllTexts, waitFor, waitForNone } from "@odoo/hoot-dom";
import { Component, onMounted, xml } from "@odoo/owl";

import {
    contains,
    defineModels,
    fields,
    getService,
    makeMockServer,
    defineActions,
    models,
    mountWithCleanup,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { registry } from "@web/core/registry";
import { ImageField } from "@web/views/fields/image/image_field";
import { charField } from "@web/views/fields/char/char_field";
import { COMPUTED_DISPLAY_OPTIONS } from "@web_studio/client_action/view_editor/interactive_editor/properties/type_widget_properties/type_specific_and_computed_properties";
import { mailModels } from "@mail/../tests/mail_test_helpers";
import { WebClient } from "@web/webclient/webclient";
import { WebClientEnterprise } from "@web_enterprise/webclient/webclient";

import {
    mountViewEditor,
    createMockViewResult,
    disableHookAnimation,
    openStudio,
    handleDefaultStudioRoutes,
} from "@web_studio/../tests/view_editor_tests_utils";
import { formEditor } from "@web_studio/client_action/view_editor/editors/form/form_editor";

describe.current.tags("desktop");

const R_DATASET_ROUTE = /\/web\/dataset\/call_(button|kw)\/[\w.-]+\/(?<step>\w+)/;
const R_WEBCLIENT_ROUTE = /(?<step>\/web\/webclient\/\w+)/;

class Coucou extends models.Model {
    display_name = fields.Char();
    m2o = fields.Many2one({ string: "Product", relation: "product" });
    char_field = fields.Char();
    product_ids = fields.One2many({ string: "Products", relation: "product" });

    _records = [];
}

class Partner extends models.Model {
    display_name = fields.Char();
    image = fields.Binary();
    empty_image = fields.Binary();

    _records = [
        {
            id: 1,
            display_name: "jean",
        },
    ];
}

class Product extends models.Model {
    display_name = fields.Char();
    m2m_employees = fields.Many2many({ string: "Partners", relation: "partner" });
    m2o_partner = fields.Many2one({ string: "M2OPartner", relation: "partner" });
    coucou_id = fields.Many2one({ string: "Coucou", relation: "coucou" });
    partner_ids = fields.One2many({ string: "Partners", relation: "partner" });
    toughness = fields.Selection({
        string: "toughness",
        selection: [
            ["0", "Hard"],
            ["1", "Harder"],
        ],
    });

    _records = [{ id: 1, display_name: "A very good product" }];
}

defineModels({ ...mailModels, Coucou, Product, Partner });

test("Form editor should contains the view and the editor sidebar", async () => {
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `<form>
            <sheet>
                <field name="display_name"/>
            </sheet>
        </form>
        `,
    });
    expect(".o_web_studio_editor_manager .o_web_studio_view_renderer").toHaveCount(1);
    expect(".o_web_studio_editor_manager .o_web_studio_sidebar").toHaveCount(1);
});

test("empty form editor", async () => {
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `<form/>
        `,
    });
    expect(".o_web_studio_form_view_editor").toHaveCount(1);
    expect(".o_web_studio_form_view_editor .o-web-studio-editor--element-clickable").toHaveCount(0);
    expect(".o_web_studio_form_view_editor .o_web_studio_hook").toHaveCount(0);
});

test("Form editor view buttons can be set to invisible", async () => {
    onRpc("/web_studio/edit_view", async (request) => {
        const { params } = await request.json();
        expect(params.operations[0].target.xpath_info).toEqual([
            {
                tag: "form",
                indice: 1,
            },
            {
                tag: "header",
                indice: 1,
            },
            {
                tag: "button",
                indice: 1,
            },
        ]);
        expect(params.operations[0].new_attrs).toEqual({ invisible: "True" });
        expect.step("edit_view");
    });
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `<form>
            <header>
                <button string="Test" type="object" class="oe_highlight"/>
            </header>
            <sheet>
                <field name="display_name"/>
            </sheet>
        </form>
        `,
    });
    expect(".o_web_studio_editor_manager .o_web_studio_view_renderer").toHaveCount(1);
    expect(".o_web_studio_editor_manager .o_web_studio_sidebar").toHaveCount(1);
    await contains(".o_form_renderer .o_statusbar_buttons > button").click();
    await contains(".o_notebook #invisible").click();
    expect.verifySteps(["edit_view"]);
});

test("Form editor view buttons label and class are editable from the sidebar", async () => {
    let count = 0;

    onRpc("/web_studio/edit_view", async (request) => {
        const { params } = await request.json();
        expect(params.operations[0].target.xpath_info).toEqual([
            {
                tag: "form",
                indice: 1,
            },
            {
                tag: "header",
                indice: 1,
            },
            {
                tag: "button",
                indice: 1,
            },
        ]);
        if (count === 0) {
            expect(params.operations[0].new_attrs).toEqual({ string: "MyLabel" });
        } else {
            expect(params.operations[1].new_attrs).toEqual({ class: "btn-secondary" });
        }
        count++;
        expect.step("edit_view");
    });
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `<form>
            <header>
                <button string="Test" type="object" class="oe_highlight"/>
            </header>
            <sheet>
                <field name="display_name"/>
            </sheet>
        </form>
        `,
    });
    expect(".o_web_studio_editor_manager .o_web_studio_view_renderer").toHaveCount(1);
    expect(".o_web_studio_editor_manager .o_web_studio_sidebar").toHaveCount(1);
    await contains(".o_form_renderer .o_statusbar_buttons > button").click();
    expect("input[name=string]").toHaveValue("Test");
    await contains("input[name=string]").edit("MyLabel");
    expect.verifySteps(["edit_view"]);
    expect("input[name=class]").toHaveValue("oe_highlight");
    await contains("input[name=class]").edit("btn-secondary");
    expect.verifySteps(["edit_view"]);
});

test("optional field not in form editor", async () => {
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `<form>
            <sheet>
                <field name="display_name"/>
            </sheet>
        </form>
        `,
    });
    await contains(".o_web_studio_view_renderer .o_field_char").click();
    expect(".o_web_studio_sidebar_optional_select").toHaveCount(0);
});

test("many2one field edition", async () => {
    onRpc("/web_studio/get_studio_view_arch", () => ({ studio_view_arch: "" }));
    onRpc("get_formview_action", () => {
        throw new Error("The many2one form view should not be opened");
    });
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `<form>
            <sheet>
                <field name="m2o"/>
            </sheet>
        </form>
        `,
    });
    expect(".o_web_studio_form_view_editor .o-web-studio-editor--element-clickable").toHaveCount(1);
    await contains(
        ".o_web_studio_form_view_editor .o-web-studio-editor--element-clickable"
    ).click();
    expect(queryAll(".o_web_studio_sidebar .o_web_studio_property").length > 0).toBe(true);
    expect(".o_web_studio_form_view_editor .o-web-studio-editor--element-clickable").toHaveClass(
        "o-web-studio-editor--element-clicked"
    );
});

test("image field is the placeholder when record is empty", async () => {
    await mountViewEditor({
        type: "form",
        resModel: "partner",
        arch: `<form>
            <sheet>
                <field name='empty_image' widget='image'/>
            </sheet>
        </form>
        `,
    });
    expect(".o_web_studio_form_view_editor .o_field_image").toHaveCount(1);
    expect(".o_web_studio_form_view_editor .o_field_image img").toHaveAttribute(
        "data-src",
        "/web/static/img/placeholder.png",
        {
            message: "default image in empty record should be the placeholder",
        }
    );
});

test("image field edition (change size)", async () => {
    onRpc("/web_studio/edit_view", () => {
        const newArch = `
                <form>
                    <sheet>
                        <field name='image' widget='image' options='{"size":[0, 270],"preview_image":"coucou"}'/>
                    </sheet>
                </form>
            `;
        return createMockViewResult("form", newArch, Partner);
    });

    patchWithCleanup(ImageField.prototype, {
        setup() {
            super.setup();
            onMounted(() => {
                expect.step(
                    `image, width: ${this.props.width}, height: ${this.props.height}, previewImage: ${this.props.previewImage}`
                );
            });
        },
    });
    await mountViewEditor({
        type: "form",
        resModel: "partner",
        arch: `
            <form>
                <sheet>
                    <field name='image' widget='image' options='{"size":[0, 90],"preview_image":"coucou"}'/>
                </sheet>
            </form>
        `,
    });
    expect(".o_web_studio_form_view_editor .o_field_image").toHaveCount(1);
    // the image should have been fetched
    expect.verifySteps(["image, width: undefined, height: 90, previewImage: coucou"]);
    await contains(".o_web_studio_form_view_editor .o_field_image").click();
    expect(".o_web_studio_property_size").toHaveCount(1);
    expect(".o_web_studio_property_size .text-start").toHaveText("Small");
    expect(".o_web_studio_form_view_editor .o_field_image").toHaveClass(
        "o-web-studio-editor--element-clicked"
    );
    await contains(".o_web_studio_property_size button").click();
    await contains(".o_select_menu_item_label:contains(Large)").click();
    // the image should have been fetched again
    expect.verifySteps(["image, width: undefined, height: 270, previewImage: coucou"]);
    expect(".o_web_studio_property_size .text-start").toHaveText("Large");
});

test("image size can be unset from the selection", async () => {
    let editViewCount = 0;

    onRpc("/web_studio/edit_view", () => {
        editViewCount++;
        let newArch;
        if (editViewCount === 1) {
            newArch = `<form>
                <sheet>
                    <field name='image' widget='image' class='oe_avatar' options='{"preview_image": "image"}'/>
                    <div class='oe_title'>
                        <field name='display_name'/>
                    </div>
                </sheet>
            </form>`;
        }
        return createMockViewResult("form", newArch, Partner);
    });

    await mountViewEditor({
        type: "form",
        resModel: "partner",
        arch: `<form>
            <sheet>
                <field name='image' widget='image' class='oe_avatar' options='{"preview_image": "image", "size": [0,90]}'/>
                <div class='oe_title'>
                    <field name='display_name'/>
                </div>
            </sheet>
        </form>`,
    });
    expect('.o_field_widget.oe_avatar[name="image"]').toHaveCount(1);
    await contains(".o_field_widget[name='image']").click();
    expect(".o_web_studio_property_size .text-start").toHaveText("Small");
    await contains(".o_web_studio_property_size .o_select_menu_toggler_clear").click();
    expect(".o_web_studio_property_size .o_select_menu").toHaveText("");
});

test("signature field edition (change full_name)", async () => {
    let editViewCount = 0;
    let newFieldName;

    onRpc("/web_studio/edit_view", async (request) => {
        const { params } = await request.json();
        editViewCount++;
        let newArch;
        if (editViewCount === 1) {
            expect(params.operations[0].node.attrs.widget).toBe("signature", {
                message: "'signature' widget should be there on field being dropped",
            });
            newFieldName = params.operations[0].node.field_description.name;
            newArch = `
                <form>
                    <group>
                        <field name='display_name'/>
                        <field name='m2o'/>
                        <field name='${newFieldName}' widget='signature'/>
                    </group>
                </form>
                `;
            Coucou._fields[newFieldName] = fields.Binary({
                string: "Signature",
            });
            return createMockViewResult("form", newArch, Coucou);
        } else if (editViewCount === 2) {
            expect(params.operations[1].new_attrs.options).toBe('{"full_name":"display_name"}', {
                message: "correct options for 'signature' widget should be passed",
            });
            newArch = `
                <form>
                    <group>
                        <field name='display_name'/>
                        <field name='m2o'/>
                        <field name='${newFieldName}' widget='signature' options='{"full_name": "display_name"}'/>
                    </group>
                </form>
                `;
        } else if (editViewCount === 3) {
            expect(params.operations[2].new_attrs.options).toBe('{"full_name":"m2o"}', {
                message: "correct options for 'signature' widget should be passed",
            });
            newArch = `
                <form>
                    <group>
                        <field name='display_name'/>
                        <field name='m2o'/>
                        <field name='${newFieldName}' widget='signature' options='{"full_name": "m2o"}'/>
                    </group>
                </form>
                `;
        }
        return createMockViewResult("form", newArch, Coucou);
    });
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `
            <form>
                <group>
                    <field name='display_name'/>
                    <field name='m2o'/>
                </group>
            </form>
        `,
    });
    await contains(".o_web_studio_new_fields .o_web_studio_field_signature").dragAndDrop(
        ".o_inner_group .o_web_studio_hook:first-child"
    );
    expect(".o_web_studio_form_view_editor .o_signature").toHaveCount(1);
    await contains(".o_web_studio_form_view_editor .o_signature").click();
    expect(".o_web_studio_property_full_name .o-dropdown").toHaveCount(1);
    expect(".o_web_studio_property_full_name button").toHaveText("", {
        message: "the auto complete field should be empty by default",
    });
    await contains(".o_web_studio_property_full_name button").click();
    await contains(".o_select_menu_item_label:contains(Name)").click();
    expect(".o_web_studio_property_full_name button").toHaveText("Display name");
    await contains(".o_web_studio_property_full_name button").click();
    await contains(".o_select_menu_item_label:contains(Product)").click();
    expect(".o_web_studio_property_full_name button").toHaveText("Product");
});

test("integer field should come with 0 as default value", async () => {
    onRpc("/web_studio/edit_view", async (request) => {
        const { params } = await request.json();
        expect.step("edit_view");
        expect(params.operations[0].node.field_description.type).toBe("integer");
        expect(params.operations[0].node.field_description.default_value).toBe("0");
    });

    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `
            <form>
                <group>
                    <field name='display_name'/>
                </group>
            </form>`,
    });
    await contains(".o_web_studio_new_fields .o_web_studio_field_integer").dragAndDrop(
        ".o_web_studio_hook[data-position=before]"
    );
    expect.verifySteps(["edit_view"]);
});

test("supports multiple occurences of field", async () => {
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `<form><group>
                <field name="display_name" widget="phone" options="{'enable_sms': false}" />
                <field name="display_name" invisible="1" />
            </group></form>`,
    });
    expect(
        ".o_web_studio_form_view_editor .o_inner_group .o-web-studio-editor--element-clickable"
    ).toHaveCount(1);
    await contains(".o_web_studio_sidebar .o_notebook_headers .nav-link:contains(View)").click();
    await contains(".o_web_studio_sidebar #show_invisible").click();
    expect(
        ".o_web_studio_form_view_editor .o_inner_group .o-web-studio-editor--element-clickable"
    ).toHaveCount(2);
    await contains(
        ".o_web_studio_form_view_editor .o_inner_group .o-web-studio-editor--element-clickable:eq(0)"
    ).click();
    // Would be true if not present in node's options
    expect(".o_web_studio_sidebar input[name='enable_sms']").not.toBeChecked();
    await contains(
        ".o_web_studio_form_view_editor .o_inner_group .o-web-studio-editor--element-clickable:eq(1)"
    ).click();
    expect(".o_web_studio_sidebar input[name='invisible']").toBeChecked();
});

test("options with computed display to have a dynamic sidebar list of options", async () => {
    let editCount = 0;
    // For this test, create fake options and make them tied to each other,
    // so the display and visibility is adapted in the editor sidebar
    patchWithCleanup(charField, {
        supportedOptions: [
            {
                label: "Fake super option",
                name: "fake_super_option",
                type: "boolean",
            },
            {
                label: "Suboption A",
                name: "suboption_a",
                type: "string",
            },
            {
                label: "Suboption B",
                name: "suboption_b",
                type: "boolean",
            },
            {
                label: "Suboption C",
                name: "suboption_c",
                type: "selection",
                choices: [
                    { label: "September 13", value: "sep_13" },
                    { label: "September 23", value: "sep_23" },
                ],
                default: "sep_23",
            },
            {
                label: "Suboption D",
                name: "suboption_d",
                type: "boolean",
            },
        ],
    });
    patchWithCleanup(COMPUTED_DISPLAY_OPTIONS, {
        suboption_a: {
            superOption: "fake_super_option",
            getInvisible: (value) => !value,
        },
        suboption_b: {
            superOption: "suboption_a",
            getReadonly: (value) => !value,
        },
        suboption_c: {
            superOption: "suboption_a",
            getInvisible: (value) => !value,
        },
        suboption_d: {
            superOption: "suboption_b",
            getValue: (value) => value,
            getReadonly: (value) => value,
        },
    });

    const arch = `<form><group>
        <field name="display_name"/>
    </group></form>`;
    onRpc("/web_studio/edit_view", async () => {
        editCount++;
        if (editCount === 1) {
            const newArch =
                "<form><group><field name='display_name' options='{\"fake_super_option\":True}'/></group></form>";
            return createMockViewResult("form", newArch, Coucou);
        }
        if (editCount === 2) {
            const newArch = `<form><group><field name='display_name' options="{'fake_super_option':True,'suboption_a':'Nice'}"/></group></form>`;
            return createMockViewResult("form", newArch, Coucou);
        }
        if (editCount === 3) {
            const newArch = `<form><group><field name='display_name' options="{'fake_super_option':True,'suboption_a':'Nice','suboption_b':True}"/></group></form>`;
            return createMockViewResult("form", newArch, Coucou);
        }
    });
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch,
    });

    await contains(".o_cell[data-field-name=display_name]").click();
    expect(".o_web_studio_property").toHaveCount(10);
    await contains("input[id=fake_super_option]").check();
    expect(".o_web_studio_property").toHaveCount(13);
    expect(".o_web_studio_property input[id='suboption_b']").not.toBeEnabled();
    expect(".o_web_studio_property input[id='suboption_d']").toBeEnabled();
    expect(".o_web_studio_property input[id='suboption_d']").not.toBeChecked();
    await contains("input[id=suboption_a]").edit("Nice");
    expect(".o_web_studio_property").toHaveCount(14);
    await contains("input[id=suboption_b]").check();
    expect(".o_web_studio_property").toHaveCount(14);
    expect(".o_web_studio_property input[id='suboption_d']").not.toBeEnabled();
    expect(".o_web_studio_property input[id='suboption_d']").toBeChecked();
    const computedOptions = queryAll(
        ".o_web_studio_property:nth-child(n+9):nth-last-child(n+5) label"
    );
    expect([...computedOptions].map((label) => label.textContent).join(", ")).toBe(
        "Suboption A, Suboption B, Suboption D, Suboption C",
        {
            message: "options are ordered and grouped with the corresponding super option",
        }
    );
});

test("field selection when editing a suboption", async () => {
    let editCount = 0;
    patchWithCleanup(charField, {
        supportedOptions: [
            {
                label: "Fake super option",
                name: "fake_super_option",
                type: "boolean",
            },
            {
                label: "Suboption",
                name: "suboption",
                type: "field",
            },
        ],
    });
    patchWithCleanup(COMPUTED_DISPLAY_OPTIONS, {
        suboption: {
            superOption: "fake_super_option",
            getInvisible: (value) => !value,
        },
    });

    const arch = `<form><group>
        <field name="display_name"/>
    </group></form>`;
    onRpc("/web_studio/edit_view", async () => {
        editCount++;
        if (editCount === 1) {
            const newArch =
                "<form><group><field name='display_name' options='{\"fake_super_option\":True}'/></group></form>";
            return createMockViewResult("form", newArch, Coucou);
        }
    });
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch,
    });

    await contains(".o_cell[data-field-name=display_name]").click();
    expect(".o_web_studio_property").toHaveCount(10);
    await contains("input[id=fake_super_option]").check();
    expect(".o_web_studio_property").toHaveCount(11);
    expect(".o_web_studio_property_suboption .o_select_menu").toHaveCount(1);
});

test("'class' attribute is editable in the sidebar with a tooltip", async () => {
    const arch = `<form>
        <header>
            <button string="Test" type="object" class="oe_highlight"/>
        </header>
        <sheet>
            <field name="display_name" class="studio"/>
        </sheet>
    </form>
    `;
    onRpc("/web_studio/edit_view", async (request) => {
        const { params } = await request.json();
        expect(params.operations[0].new_attrs).toEqual({ class: "new_class" });
        return createMockViewResult("form", arch, Coucou);
    });
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch,
    });
    await contains(".o_field_char").click();
    expect(".o_web_studio_property input[id=class]").toHaveCount(1);
    expect(".o_web_studio_property input[id=class]").toHaveValue("studio");
    const tooltip =
        "Use Bootstrap or any other custom classes to customize the style and the display of the element.";
    expect(".o_web_studio_property label:contains(Class) sup").toHaveAttribute(
        "data-tooltip",
        tooltip
    );
    await contains(".o_web_studio_property input[id=class]").edit("new_class");
    await contains(".o_statusbar_buttons button").click();
    expect(".o_web_studio_property input[id=class]").toHaveCount(1);
    expect(".o_web_studio_property input[id=class]").toHaveValue("oe_highlight");
    expect(".o_web_studio_property label:contains(Class) sup").toHaveAttribute(
        "data-tooltip",
        tooltip
    );
});

test("the name of the selected element is displayed in the sidebar", async () => {
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `<form>
        <header>
            <button string="Test" type="object" class="oe_highlight"/>
        </header>
        <sheet>
            <group>
                <field name="display_name" class="studio"/>
                <field name="m2o"/>
            </group>
            <notebook>
                <page string="Notes"/>
            </notebook>
        </sheet>
    </form>
    `,
    });
    await contains(".o_inner_group").click();
    expect(".o_web_studio_sidebar h3").toHaveText("Column");
    await contains(".o_cell[data-field-name=display_name]").click();
    expect(".o_web_studio_sidebar h3").toHaveText("Field");
    expect(".o_web_studio_sidebar h3").toHaveClass("o_web_studio_field_char", {
        message: "type of the field is displayed with an icon",
    });
    await contains(".o_cell[data-field-name=m2o]").click();
    expect(".o_web_studio_sidebar h3").toHaveClass("o_web_studio_field_many2one");
    await contains(".o_statusbar_buttons button").click();
    expect(".o_web_studio_sidebar h3.o_web_studio_icon_container").toHaveText("Button");
    await contains(".nav-link:contains(Notes)").click();
    expect(".o_web_studio_sidebar h3.o_web_studio_icon_container").toHaveText("Page");
});

test("edit options and attributes on a widget node", async () => {
    let editCount = 0;

    class MyTestWidget extends Component {
        static template = xml`<div t-attf-class="bg-{{props.color}}" t-attf-style="width:{{props.width}}px;">Inspector widget</div>`;
        static props = ["*"];
    }
    registry.category("view_widgets").add("test_widget", {
        component: MyTestWidget,
        extractProps: ({ attrs, options }) => ({
            width: attrs.width,
            color: options.color,
        }),
        supportedAttributes: [
            {
                label: "Width",
                name: "width",
                type: "string",
            },
        ],
        supportedOptions: [
            {
                label: "Color option",
                name: "color",
                type: "string",
            },
        ],
    });

    const arch = `<form><group>
        <widget name="test_widget"/>
    </group></form>`;
    onRpc("/web_studio/edit_view", async (request) => {
        const { params } = await request.json();
        editCount++;
        if (editCount === 1) {
            const newArch = `<form><group>
                <widget name="test_widget" width="30"/>
            </group></form>`;
            expect(params.operations[0].new_attrs).toEqual({ width: "30" });
            return createMockViewResult("form", newArch, Coucou);
        }
        if (editCount === 2) {
            expect(params.operations[1].new_attrs).toEqual({ options: '{"color":"primary"}' });
            const newArch = `<form><group>
                <widget name="test_widget" width="30" options="{'color': 'primary'}"/>
            </group></form>`;
            return createMockViewResult("form", newArch, Coucou);
        }
    });
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch,
    });

    await contains(".o_widget_test_widget").click();
    expect(".o_web_studio_property").toHaveCount(3);
    await contains("input[id=width]").edit("30");
    expect(".o_widget_test_widget div").toHaveStyle({ width: "30px" });
    await contains(".o_widget_test_widget").click();
    await contains("input[id=color]").edit("primary");
    expect(".o_widget_test_widget div").toHaveClass("bg-primary");
});

test("never save record -- hiding tab", async () => {
    const steps = [];
    onRpc("web_save", () => {
        steps.push("web_save");
    });
    patchWithCleanup(formEditor, {
        props() {
            const props = super.props(...arguments);
            class TestModel extends props.Model {}
            TestModel.Record = class extends TestModel.Record {
                _save() {
                    steps.push("_save");
                    return super._save(...arguments);
                }
            };
            props.Model = TestModel;
            return props;
        },
    });
    const arch = `<form><field name="display_name"/></form>`;
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch,
    });

    const visibilityStateProp = Object.getOwnPropertyDescriptor(
        Document.prototype,
        "visibilityState"
    );
    const prevVisibilitySate = document.visibilityState;
    Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
        writable: true,
    });

    document.dispatchEvent(new Event("visibilitychange"));
    await animationFrame();
    expect(steps).toEqual(["_save"]);
    Object.defineProperty(document, "visibilityState", visibilityStateProp);
    expect(document.visibilityState).toBe(prevVisibilitySate);
});

test("CharField can edit its placeholder_field option", async () => {
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `<form>
        <header>
            <button string="Test" type="object" class="oe_highlight"/>
        </header>
        <sheet>
            <group>
                <field name="display_name" class="studio"/>
            </group>
        </sheet>
    </form>
    `,
    });
    await contains(".o_cell[data-field-name=display_name]").click();
    expect(".o_web_studio_property[name=placeholder_field]").toHaveCount(1);
    expect(".o_web_studio_property label[for=placeholder_field]").toHaveText(
        "Dynamic Placeholder?",
        {
            message: "the option is title Dynamic Placeholder and has a tooltip",
        }
    );
    expect(".o_web_studio_property[name=dynamic_placeholder]").toHaveCount(0, {
        message:
            "this options is not documented, because it does not make sense to edit this from studio",
    });
    expect(".o_web_studio_property[name=dynamic_placeholder_model_reference_field]").toHaveCount(
        0,
        {
            message:
                "this options is not documented, because it does not make sense to edit this from studio",
        }
    );
});

test("form editor - chatter edition", async () => {
    onRpc("/web_studio/get_email_alias", () => ({ email_alias: "coucou" }));
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: /*xml*/ `
            <form>
                <sheet>
                    <field name='display_name'/>
                </sheet>
                <chatter/>
            </form>
        `,
        filterRegistry: false,
    });
    // click on the chatter
    await contains(".o-mail-Form-chatter .o_web_studio_overlay").click();
    expect(".o_web_studio_sidebar .nav-link.active").toHaveText("Properties", {
        message: "the Properties tab should now be active",
    });
    await waitFor(".o_web_studio_sidebar input[name='email_alias']");
    expect(".o_web_studio_sidebar input[name='email_alias']").toHaveValue("coucou", {
        message: "the email alias in sidebar should be fetched",
    });
    await waitFor(".o-mail-Form-chatter.o-web-studio-editor--element-clicked");
});

test("always invisible fields are flagged as not present in arch", async () => {
    await mountViewEditor({
        type: "form",
        resModel: "coucou",
        arch: `<form>
            <field name="display_name" />
            <field name="m2o" invisible="True" />
            <field name="char_field" invisible="1" />
        </form>
    `,
    });

    expect(".o_web_studio_view_renderer .o_field_widget").toHaveCount(1);
    await contains(".o_web_studio_sidebar .o_web_studio_existing_fields_header").click();
    expect(".o_web_studio_sidebar .o_web_studio_existing_fields").toHaveText(
        "Char field\nCreated on\nId\nLast Modified on\nProduct\nProducts"
    );
});

test("disable creation(no_create options) in many2many_avatar_user and many2many_avatar_employee widget", async () => {
    onRpc("/web_studio/edit_view", async (request) => {
        const { params: args } = await request.json();
        expect.step("edit_view");
        expect(args.operations[0].new_attrs.options).toBe('{"no_create":true}');
    });
    await mountViewEditor({
        type: "form",
        resModel: "product",
        arch: /*xml*/ `
            <form>
                <sheet>
                    <group>
                        <field name="m2m_employees" widget="many2many_avatar_user"/>
                    </group>
                </sheet>
            </form>
        `,
    });
    await contains(".o_field_many2many_avatar_user[name='m2m_employees']").click();
    expect(".o_web_studio_sidebar #no_create").toHaveCount(1);
    expect(".o_web_studio_sidebar #no_create:checked").toHaveCount(0);

    await contains(".o_web_studio_sidebar #no_create").click();
    expect.verifySteps(["edit_view"]);
});

test("edit one2many form view (2 level) and check chatter allowed", async () => {
    Product._views = { "list,2": /*xml*/ `<list><field name='display_name'/></list>` };
    Partner._views = { "list,false": /*xml*/ `<list><field name='display_name'/></list>` };
    Coucou._views = {
        "form,1": /*xml*/ `
            <form>
                <sheet>
                    <field name='display_name'/>
                    <field name='product_ids'>
                        <form>
                            <sheet>
                                <group>
                                    <field name='partner_ids'>
                                        <form><sheet><group><field name='display_name'/></group></sheet></form>
                                    </field>
                                </group>
                            </sheet>
                        </form>
                    </field>
                </sheet>
            </form>
        `,
        "list,false": /*xml*/ `<list></list>`,
        "search,false": /*xml*/ `<search></search>`,
    };
    const { env: pyEnv } = await makeMockServer();
    const partnerId = pyEnv["partner"].create({ display_name: "jean" });
    const productId = pyEnv["product"].create({
        display_name: "xpad",
        partner_ids: [partnerId],
    });
    const coucouId1 = pyEnv["coucou"].create({
        display_name: "Coucou 11",
        product_ids: [productId],
    });
    defineActions([
        {
            xml_id: "studio.coucou_action",
            name: "coucouAction",
            res_model: "coucou",
            res_id: coucouId1,
            type: "ir.actions.act_window",
            views: [[1, "form"]],
        },
    ]);
    handleDefaultStudioRoutes();
    onRpc("/web_studio/chatter_allowed", () => true);
    onRpc("name_search", async ({ kwargs }) => {
        expect(kwargs.args).toEqual(
            [
                ["relation", "=", "partner"],
                ["ttype", "in", ["many2one", "many2many"]],
                ["store", "=", true],
            ],
            {
                message:
                    "the domain should be correctly set when searching for a related field for new button",
            }
        );
        return [[1, "Partner"]];
    });
    onRpc("/*", (request) => {
        const route = new URL(request.url).pathname;
        const match = route.match(R_DATASET_ROUTE) || route.match(R_WEBCLIENT_ROUTE);
        const step = match?.groups?.step || route;
        if (!["/mail/action", "/mail/data", "/hr_attendance/attendance_user_data"].includes(step)) {
            expect.step(step);
        }
    });

    await mountWithCleanup(WebClient);
    await animationFrame();
    expect.verifySteps(["/web/webclient/translations", "/web/webclient/load_menus"]);
    await getService("action").doAction("studio.coucou_action");
    expect.verifySteps(["/web/action/load", "get_views", "web_read"]);
    await openStudio();
    expect.verifySteps([
        "get_views",
        "/web_studio/chatter_allowed",
        "/web_studio/get_studio_view_arch",
        "web_read",
        "/mail/thread/recipients/fields",
    ]);
    expect(".o_web_studio_add_chatter").toHaveCount(1);

    await contains(".o_field_one2many").click();

    await contains('.o_web_studio_editX2Many[data-type="form"]').click();
    await waitForNone(".o_web_studio_add_chatter");
    expect.verifySteps(["fields_get", "get_views", "web_read"]);

    await contains(".o_field_one2many").click();

    await contains('.o_web_studio_editX2Many[data-type="form"]').click();
    expect.verifySteps(["fields_get", "web_read"]);
    expect(".o_field_char").toHaveText("jean", {
        message: "the partner view form should be displayed.",
    });

    disableHookAnimation();
    await contains(".o_web_studio_field_char").dragAndDrop(".o_inner_group .o_web_studio_hook");
    expect.verifySteps(["/web_studio/edit_view"]);
});

test("edit one2many list view that uses parent key [REQUIRE FOCUS]", async () => {
    Product._views = { "list,2": /*xml*/ `<list><field name='display_name'/></list>` };
    Coucou._views = {
        "form,1": /*xml*/ `
            <form>
                <sheet>
                    <field name='display_name'/>
                    <field name='product_ids'>
                        <form>
                            <sheet>
                                <field name="m2o_partner"
                                    invisible="parent.display_name == 'coucou'"
                                    domain="[('display_name', '=', parent.display_name)]" />
                            </sheet>
                        </form>
                    </field>
                </sheet>
            </form>
        `,
        "search,false": /*xml*/ `<search></search>`,
    };
    const { env: pyEnv } = await makeMockServer();
    const partnerId = pyEnv["partner"].create({ display_name: "jacques" });
    const productId = pyEnv["product"].create({
        display_name: "xpad",
        m2o_partner: partnerId,
    });
    const coucouId1 = pyEnv["coucou"].create({
        display_name: "Coucou 11",
        product_ids: [productId],
    });
    defineActions([
        {
            xml_id: "studio.coucou_action",
            name: "coucouAction",
            res_model: "coucou",
            res_id: coucouId1,
            type: "ir.actions.act_window",
            views: [[1, "form"]],
        },
    ]);
    handleDefaultStudioRoutes();
    onRpc("/web_studio/edit_view", async (request) => {
        const { params } = await request.json();
        expect(params.operations[0].new_attrs).toEqual({ invisible: "False" });
        expect.step("edit_view");
    });

    await mountWithCleanup(WebClientEnterprise);
    await animationFrame();
    await getService("action").doAction("studio.coucou_action");
    await openStudio();
    // edit the x2m form view
    await contains(".o_field_one2many").click();
    await contains('.o_web_studio_editX2Many[data-type="form"]').click();
    expect(".o_field_widget[name='m2o_partner']").toHaveText("jacques", {
        message: "the x2m form view should be correctly rendered",
    });

    await contains('.o_field_widget[name="m2o_partner"]').click();
    // open the domain editor
    await waitForNone(".modal");
    expect(".o_web_studio_sidebar input#domain").toHaveValue(
        "[('display_name', '=', parent.display_name)]"
    );

    await contains(".o_web_studio_sidebar input#domain").click();
    expect(".modal .modal-body").toHaveText(
        "Match\nall\nof the following rules:\nDisplay name\nis equal\nis not equal\ncontains\ndoes not contain\nis in\nis not in\nis set\nis not set\nstarts with\nends with\nparent.display_name\nNew Rule"
    );

    // Close the modal and remove the domain on invisible attr
    await contains(".btn-close").click();
    await contains("#invisible").click();
    expect.verifySteps(["edit_view"]);
});

test("move a field in one2many list", async () => {
    Coucou._views = {
        "form,1": /*xml*/ `
            <form>
                <sheet>
                    <field name='display_name'/>
                    <field name='product_ids'>
                        <list>
                            <field name='m2o_partner'/>
                            <field name='coucou_id'/>
                        </list>
                    </field>
                </sheet>
            </form>
        `,
        "search,false": /*xml*/ `<search></search>`,
    };
    const { env: pyEnv } = await makeMockServer();
    const coucouId1 = pyEnv["coucou"].create({
        display_name: "Coucou 11",
        product_ids: pyEnv["product"].search([["display_name", "=", "xpad"]]),
    });
    defineActions([
        {
            xml_id: "studio.coucou_action",
            name: "coucouAction",
            res_model: "coucou",
            res_id: coucouId1,
            type: "ir.actions.act_window",
            views: [[1, "form"]],
        },
    ]);
    handleDefaultStudioRoutes();
    onRpc("/web_studio/edit_view", async (request) => {
        const { params } = await request.json();
        expect.step("edit_view");
        expect(params.operations[0]).toEqual({
            node: {
                tag: "field",
                attrs: { name: "coucou_id" },
                subview_xpath: "/form[1]/sheet[1]/field[2]/list[1]",
                xpath_info: [
                    {
                        indice: 1,
                        tag: "list",
                    },
                    {
                        indice: 2,
                        tag: "field",
                    },
                ],
            },
            position: "before",
            target: {
                tag: "field",
                attrs: { name: "m2o_partner" },
                subview_xpath: "/form[1]/sheet[1]/field[2]/list[1]",
                xpath_info: [
                    {
                        indice: 1,
                        tag: "list",
                    },
                    {
                        indice: 1,
                        tag: "field",
                    },
                ],
            },
            type: "move",
        });
    });

    await mountWithCleanup(WebClientEnterprise);
    await animationFrame();
    await getService("action").doAction("studio.coucou_action");
    await openStudio();
    // edit the x2m form view
    await contains(".o_field_one2many").click();
    await contains('.o_web_studio_editX2Many[data-type="list"]').click();
    expect(queryAllTexts(".o_web_studio_list_view_editor th.o_column_sortable")).toEqual([
        "M2OPartner",
        "Coucou",
    ]);

    // move coucou at index 0
    await contains(".o_web_studio_list_view_editor th:contains('coucou')").dragAndDrop(
        "th.o_web_studio_hook"
    );
    expect.verifySteps(["edit_view"]);
});

test("One2Many list editor column_invisible in attrs ", async () => {
    Coucou._views = {
        "form,1": /*xml*/ `
            <form>
                <field name='product_ids'>
                    <list>
                        <field name="display_name" column_invisible="not parent.id" />
                    </list>
                </field>
            </form>
        `,
        "search,false": /*xml*/ `<search></search>`,
    };
    const { env: pyEnv } = await makeMockServer();
    pyEnv["coucou"].create({
        display_name: "Coucou 11",
        product_ids: pyEnv["product"].search([["display_name", "=", "xpad"]]),
    });
    defineActions([
        {
            xml_id: "studio.coucou_action",
            name: "coucouAction",
            res_model: "coucou",
            type: "ir.actions.act_window",
            views: [[1, "form"]],
        },
    ]);
    handleDefaultStudioRoutes();
    onRpc("/web_studio/edit_view", async (request) => {
        const { params } = await request.json();
        expect.step("edit_view");
        expect(params.operations[0].new_attrs).toEqual({ readonly: "True" });
    });

    await mountWithCleanup(WebClientEnterprise);
    await animationFrame();
    await getService("action").doAction("studio.coucou_action");
    await openStudio();
    // Enter edit mode of the O2M
    await contains(".o_field_one2many[name=product_ids]").click();
    await contains('.o_web_studio_editX2Many[data-type="list"]').click();
    await contains(".o_web_studio_sidebar .nav-link:contains('View')").click();
    await contains(".o_web_studio_sidebar input#show_invisible").click();
    // select the first column
    await contains("thead th[data-studio-xpath]").click();
    // enable readonly
    await contains(".o_web_studio_sidebar input#readonly").click();
    expect.verifySteps(["edit_view"]);
});

test("One2Many form datapoint doesn't contain the parent datapoint", async () => {
    /*
     * OPW-2125214
     * When editing a child o2m form with studio, the fields_get method tries to load
     * the parent fields too. This is not allowed anymore by the ORM.
     * It happened because, before, the child datapoint contained the parent datapoint's data
     */
    Coucou._views = {
        "form,1": /*xml*/ `
            <form>
                <field name='product_ids'>
                    <form>
                        <field name="display_name" />
                        <field name="toughness" />
                    </form>
                </field>
            </form>
        `,
        "search,false": /*xml*/ `<search></search>`,
    };
    Product._views = {
        "list,2": /*xml*/ `<list><field name="display_name" /></list>`,
    };
    const { env: pyEnv } = await makeMockServer();
    const coucouId1 = pyEnv["coucou"].create({ display_name: "Coucou 11" });
    defineActions([
        {
            xml_id: "studio.coucou_action",
            name: "coucouAction",
            res_model: "coucou",
            res_id: coucouId1,
            type: "ir.actions.act_window",
            views: [[1, "form"]],
        },
    ]);
    handleDefaultStudioRoutes();
    onRpc("product", "onchange", ({ args }) => {
        expect(Object.keys(args[3])).toEqual(["display_name", "toughness"]);
    });

    await mountWithCleanup(WebClientEnterprise);
    await animationFrame();
    await getService("action").doAction("studio.coucou_action");
    await openStudio();
    await contains(".o_field_one2many").click();
    await contains('.o_web_studio_editX2Many[data-type="form"]').click();
});
