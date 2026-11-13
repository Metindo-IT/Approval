import { expect, test, describe } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import {
    mountWithCleanup,
    contains,
    mockService,
    makeMockEnv,
} from "@web/../tests/web_test_helpers";
import { Component, onWillRender, useState, xml } from "@odoo/owl";
import { ReportEditorModel } from "@web_studio/client_action/report_editor/report_editor_model";
import { defineMailModels } from "@mail/../tests/mail_test_helpers";

describe.current.tags("desktop");

defineMailModels();

test("setting is in edition doesn't produce intempestive renders", async () => {
    mockService("ui", {
        block: () => expect.step("block"),
        unblock: () => expect.step("unblock"),
    });

    const env = await makeMockEnv();

    class Child extends Component {
        static template = xml`<div class="child" t-esc="props.rem.isInEdition"/>`;
        static props = ["*"];
        setup() {
            onWillRender(() => expect.step("Child rendered"));
        }
    }

    class Parent extends Component {
        static components = { Child };
        static template = xml`
            <Child rem="rem" />
            <button class="test-btn" t-on-click="() => rem.setInEdition(false)">btn</button>
        `;
        static props = ["*"];

        setup() {
            this.rem = useState(
                new ReportEditorModel({ services: env.services, resModel: "partner" })
            );
            onWillRender(() => expect.step("Parent rendered"));
            this.rem.setInEdition(true);
        }
    }

    await mountWithCleanup(Parent);
    await animationFrame();

    expect.verifySteps(["block", "Parent rendered", "Child rendered"]);
    expect(".child").toHaveText("true");

    await contains("button.test-btn").click();

    expect(".child").toHaveText("false");
    expect.verifySteps(["unblock", "Child rendered"]);
});
