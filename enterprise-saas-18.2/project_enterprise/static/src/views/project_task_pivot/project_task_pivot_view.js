import { registry } from "@web/core/registry";
import { pivotView } from "@web/views/pivot/pivot_view";
import { HighlightProjectTaskSearchModel } from "../highlight_project_task_search_model";

registry.category("views").add("project_enterprise_task_pivot", {
    ...pivotView,
    SearchModel: HighlightProjectTaskSearchModel,
});
