import { registry } from "@web/core/registry";
import { KanbanMany2OneAvatarUserField, kanbanMany2OneAvatarUserField } from "@mail/views/web/fields/many2one_avatar_user_field/many2one_avatar_user_field";

export class ReferralKanbanMany2OneAvatarUserField extends KanbanMany2OneAvatarUserField {
    static template = "mail.ReferralKanbanMany2OneAvatarUserField";
}

export const referralKanbanMany2OneAvatarUserField = {
    ...kanbanMany2OneAvatarUserField,
    component: ReferralKanbanMany2OneAvatarUserField,
};

registry.category("fields").add("kanban.referral_many2one_avatar_user", referralKanbanMany2OneAvatarUserField);
