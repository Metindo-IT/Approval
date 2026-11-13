import { defineModels } from "@web/../tests/web_test_helpers";
import { planningModels } from "@planning/../tests/planning_mock_models";
import { defineMailModels } from "@mail/../tests/mail_test_helpers";

export function definePlanningHolidaysModels() {
    defineMailModels()
    return defineModels(planningHolidaysModels);
}

export const planningHolidaysModels = { ...planningModels };
