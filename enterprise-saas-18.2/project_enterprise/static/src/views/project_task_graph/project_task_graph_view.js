import { registry } from "@web/core/registry";
import { graphView } from "@web/views/graph/graph_view";
import { HighlightProjectTaskSearchModel } from "../highlight_project_task_search_model";

registry.category("views").add("project_enterprise_task_graph", {
    ...graphView,
    SearchModel: HighlightProjectTaskSearchModel,
});
