import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";

export class AppointmentBookingActionHelper extends Component {
    static template = "appointment.AppointmentBookingActionHelper";
    static props = ["context", "onAddClicked"];
    setup() {
        this.action = useService("action");
        this.orm = useService("orm");
    }

    async openShareDialog() {
        const context = {
            'dialog_size': 'medium',
        };
        const appointmentId = this.props.context.default_appointment_type_id;
        if (appointmentId) {
            const appointment = await this.orm.searchRead("appointment.type", [["id", "=", appointmentId]], ["name"]);
            const shortCode = appointment[0].name.trim().toLowerCase().replaceAll(" ", "-");
            const isAlreadyUsed = await this.orm.searchCount("appointment.invite", [["short_code", "=", shortCode]]) !== 0;
            context['default_appointment_type_ids'] = [appointmentId];
            if (!isAlreadyUsed) {
                context['default_short_code'] = shortCode;
            }
        }
        this.action.doAction({
            name: 'Create a Share Link',
            type: 'ir.actions.act_window',
            res_model: 'appointment.invite',
            views: [[false, 'form']],
            target: 'new',
            context: context,
        });
    }
};
