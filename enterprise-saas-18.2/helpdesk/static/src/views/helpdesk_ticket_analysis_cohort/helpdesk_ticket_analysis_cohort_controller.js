import { CohortController } from "@web_cohort/cohort_controller";

export class HelpdeskTicketAnalysisCohortController extends CohortController {
    openView(domain, views, context) {
        this.actionService.doAction({
            context,
            domain,
            name: "Tickets",
            res_model: "helpdesk.ticket",
            target: "current",
            type: "ir.actions.act_window",
            views,
        }, {
            viewType: "list",
        });
    }
}
