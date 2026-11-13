import * as spreadsheet from "@odoo/o-spreadsheet";
import { initCallbackRegistry } from "@spreadsheet/o_spreadsheet/init_callbacks";

import { PivotAutofillPlugin } from "./plugins/pivot_autofill_plugin";
import { PivotDetailsSidePanel } from "./side_panels/pivot_details_side_panel";

import "./autofill";
import { insertPivot } from "./pivot_init_callback";

const { featurePluginRegistry, pivotSidePanelRegistry } = spreadsheet.registries;

featurePluginRegistry.add("odooPivotAutofillPlugin", PivotAutofillPlugin);

pivotSidePanelRegistry.add("ODOO", {
    editor: PivotDetailsSidePanel,
});

initCallbackRegistry.add("insertPivot", insertPivot);
