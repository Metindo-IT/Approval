import { GanttRendererControls } from "@web_gantt/gantt_renderer_controls";

export class TaskGanttRendererControls extends GanttRendererControls {
    static template = "project_enterprise.TaskGanttRendererControls";
    static props = [...GanttRendererControls.props, "getCriticalPath?"];
}
