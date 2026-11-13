import { describe, test } from "@odoo/hoot";
import { click, contains, start, startServer } from "@mail/../tests/mail_test_helpers";
import { setupVoipTests } from "@voip/../tests/voip_test_helpers";
import { serverState } from "@web/../tests/web_test_helpers";

describe.current.tags("desktop");
setupVoipTests();

test("Clicking on systray item when softphone is hidden shows the softphone.", async () => {
    start();
    await click(".o_menu_systray button[title='Open Softphone']");
    await contains(".o-voip-Softphone");
});

test("Clicking on systray item when softphone is displayed and unfolded hides the softphone.", async () => {
    start();
    await click(".o_menu_systray button[title='Open Softphone']");
    await click(".o_menu_systray button[title='Close Softphone']");
    await contains(".o-voip-Softphone");
});

test("Clicking on systray item when softphone is displayed but folded unfolds the softphone.", async () => {
    start();
    await click(".o_menu_systray button[title='Open Softphone']");
    await click(".o-voip-Softphone-topbar"); // fold
    await click(".o_menu_systray button[title='Unfold Softphone']");
    await contains(".o-voip-Softphone-content");
});

test("Display missed call count in systray rounded pill “10” when there are 10 missed calls", async () => {
    const pyEnv = await startServer();
    for (let i = 0; i < 10; ++i) {
        pyEnv["voip.call"].create({ state: "missed", user_id: serverState.userId });
    }
    start();
    await contains("button[title='Open Softphone']", { text: "10" });
});
