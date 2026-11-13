import { formView } from '@web/views/form/form_view';
import { registry } from '@web/core/registry';
import { AppointmentInviteViewFormController } from './appointment_invite_form_controller.js';

export const AppointmentInviteViewForm = {
    ...formView,
    Controller: AppointmentInviteViewFormController,
};

registry.category('views').add('appointment_invite_view_form', AppointmentInviteViewForm);
