import { FormController } from "@web/views/form/form_controller";
import { useService } from "@web/core/utils/hooks";
import { onMounted } from "@odoo/owl";
import { user } from "@web/core/user";

export class AppointmentInviteViewFormController extends FormController {
    setup() {
        super.setup();
        this.orm = useService("orm");
        this.actionService = useService("action");

        onMounted(async () => {
            /**
             * When opening the appointment invite modal, we attempt to find a "identical configuration".
             * We only account for simple use cases, aka not multi-appointments, not user/resource-specific.
             * 
             * If we find an identical configuration, we toggle a boolean to let the model know that
             * we don't want to show any warning about the "code being already used".
             * 
             * This is then used inside "AppointmentInviteCopyClose" to avoid creating a new record 
             * and just copy the link.
             * 
             * When the user changes anything to the configuration, we re-generate a new random code
             * (onchange on model side).
             */
            if (this.model.root.isNew) {
                const appointmentTypes = this.model.root.data.appointment_type_ids.records;
                const resourceChoice = this.model.root.data.resources_choice;
                if (appointmentTypes.length && ['current_user', 'all_assigned_resources'].includes(resourceChoice)
                    && appointmentTypes[0]?.evalContext?.id) {
                    let resourceChoiceLeaf = [['resources_choice', '=', 'all_assigned_resources']];
                    if (resourceChoice === 'current_user') {
                        resourceChoiceLeaf = [
                            ['resources_choice', '=', 'current_user'],
                            ['staff_user_ids', '=', user.userId],
                        ];
                    }
                    const identicalConfig = await this.orm.searchRead(
                        "appointment.invite",
                        [
                            ['appointment_type_ids', '=', appointmentTypes[0].evalContext.id],
                            ...resourceChoiceLeaf,
                        ],
                        ["id", "short_code"],
                        { limit: 1 }
                    );

                    if (identicalConfig && identicalConfig.length === 1) {
                        return this.model.root.update({ 
                            has_identical_config: true,
                            short_code: identicalConfig[0].short_code,
                         });
                    }
                }
            }
        });
    }
}
