import { expect, test, describe } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import {
    mountWithCleanup,
    onRpc,
} from "@web/../tests/web_test_helpers";
import { XmlResourceEditor } from "@web_studio/client_action/xml_resource_editor/xml_resource_editor";
import { Component, reactive, xml } from "@odoo/owl";
import { defineMailModels } from "@mail/../tests/mail_test_helpers";

describe.current.tags("desktop");

defineMailModels();

test("can display warnings", async () => {
    onRpc("/web_studio/get_xml_editor_resources", async () => {
        return {
            views: [{
                id: 1,
                arch: "<data/>",
            }]
        }
    });

    class Parent extends Component {
        static components = { XmlResourceEditor };
        static template = xml`<XmlResourceEditor displayAlerts="props.state.displayAlerts" onClose="() => {}" mainResourceId="1" />`;
        static props = ["*"];
    }

    const state = reactive({ displayAlerts: true });
    await mountWithCleanup(Parent, {
        props: { state }
    });
    await animationFrame();
    expect(".o_web_studio_code_editor_info .alert.alert-warning").toHaveCount(1)
    state.displayAlerts = false;
    await animationFrame();
    expect(".o_web_studio_code_editor_info .alert.alert-warning").toHaveCount(0)
});
