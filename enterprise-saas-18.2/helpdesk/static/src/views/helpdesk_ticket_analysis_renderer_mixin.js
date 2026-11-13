export const HelpdeskTicketAnalysisRendererMixin = (T) => class HelpdeskTicketAnalysisRendererMixin extends T {
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
