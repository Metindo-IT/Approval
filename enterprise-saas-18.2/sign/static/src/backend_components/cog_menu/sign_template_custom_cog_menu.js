import { Component, useState } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { SignTemplateAccessRights } from "../sign_template/sign_template_access_rights";

export class SignTemplateCustomCogMenu extends Component {
    static template = "sign.SignTemplateCustomCogMenu";
    static components = { Dropdown, DropdownItem };
    static props = {
        signTemplate: { type: Object },
        hasSignRequests: { type: Boolean },
        manageTemplateAccess: { type: Boolean },
        isPDF: { type: Boolean },
        onTemplateSaveClick: { type: Function },
    };

    setup() {
        this.action = useService("action");
        this.notification = useService("notification");
        this.orm = useService("orm");
        this.dialogService = useService("dialog");
        this.state = useState({
            properties: false,
        });
    }

    onTemplatePropertiesClick() {
        this.action.doAction({
            name: "Edit Template Form",
            type: "ir.actions.act_window",
            res_model: "sign.template",
            res_id: this.props.signTemplate.id,
            views: [[false, "form"]],
        });
    }

    async editTemplate() {
        const duplicatedTemplateIds = await this.orm.call("sign.template", "copy", [
            [this.props.signTemplate.id],
        ]);

        this.action.doAction({
            type: "ir.actions.client",
            tag: "sign.Template",
            name: _t("Edit Template"),
            params: {
                id: duplicatedTemplateIds[0],
            },
        });
    }

    get showEditButton() {
        return this.props.hasSignRequests && this.props.isPDF;
    }

    onAccessRightsClick() {
        this.dialogService.add(SignTemplateAccessRights, {
            signTemplate: this.props.signTemplate,
            hasSignRequests: this.props.hasSignRequests,
        });
    }

    onPreviewClick() {
        this.action.doActionButton({
            type: "object",
            resModel: "sign.template",
            name: "action_template_preview",
            resIds: [this.props.signTemplate.id],
        })
    }
}
