import {
    SpreadsheetModels,
    defineSpreadsheetModels,
    getBasicServerData,
} from "@spreadsheet/../tests/helpers/data";
import {
    SpreadsheetDashboard as SpreadsheetDashboardCommunity,
    SpreadsheetDashboardGroup as SpreadsheetDashboardGroupCommunity,
} from "@spreadsheet_dashboard/../tests/helpers/data";

export class SpreadsheetDashboard extends SpreadsheetDashboardCommunity {
    _records = [];
}

export class SpreadsheetDashboardGroup extends SpreadsheetDashboardGroupCommunity {
    _records = [];
}

export function defineSpreadsheetDashboardEditionModels() {
    const SpreadsheetDashboardModels = [SpreadsheetDashboard, SpreadsheetDashboardGroup];
    Object.assign(SpreadsheetModels, SpreadsheetDashboardModels);
    defineSpreadsheetModels();
}

export function getDashboardBasicServerData() {
    const { views, models } = getBasicServerData();
    return { views, models: { ...models, "spreadsheet.dashboard": {} } };
}
