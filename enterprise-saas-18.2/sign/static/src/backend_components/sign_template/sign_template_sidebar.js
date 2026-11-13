import { Component, useState } from "@odoo/owl";
import { SignTemplateSidebarRoleItems } from "./sign_template_sidebar_role_items";
import { useService } from "@web/core/utils/hooks";

export class SignTemplateSidebar extends Component {
    static template = "sign.SignTemplateSidebar";
    static components = {
        SignTemplateSidebarRoleItems,
    };
    static props = {
        signItemTypes: { type: Array },
        isSignRequest: { type: Boolean },
        iframe: { type: Object, optional: true },
        signTemplateId: { type: Number },
        signers: { type: Array },
        templateName: { type: String },
        updateSigners: { type: Function },
        pushNewSigner: { type: Function },
        updateTemplateName: { type: Function },
        updateCollapse: { type: Function },
        updateInputFocused: { type: Function },
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            showEditNameIcon: false,
            templateName: this.props.templateName.slice(0, -4),
        });
    }

    updateShowEditNameIcon(ev, value) {
        /* Save template name when unfocusing input for avoiding save conflicts.*/
        const newTemplateName = ev.target.value;
        if (newTemplateName && !value && newTemplateName !== this.state.templateName)
            this.onTemplateNameChanged(ev);
        this.state.showEditNameIcon = value;
    }

    onClickAddSigner() {
        this.props.pushNewSigner();

        /* Auto-focus last added signer. */
        if (this.props.signers?.length > 0) {
            const lastSignerId = this.props.signers[this.props.signers.length-1].id;
            this.props.updateCollapse(lastSignerId, false);
        }
    }

    async updateSigner(signerId, roleId) {
        const updatedSigners = this.props.signers.map((signer) => {
            if (signer.id === signerId) {
                const newSigner = { ...signer, roleId: roleId };
                this.props.iframe.updateSigner(signerId, roleId, signer.colorId);
                return newSigner;
            }
            return signer;
        });
        this.props.updateSigners(updatedSigners);
    }

    deleteSigner(signerId, roleId) {
        const updatedSigners = [...this.props.signers].filter(signer => signer.id != signerId);

        /* After deleting the signer, if no signer is focused, focus the last one in the array. */
        if (!updatedSigners.some(signer => !signer.isCollapsed) && updatedSigners.length > 0)
            updatedSigners[updatedSigners.length - 1].isCollapsed = false;

        this.props.updateSigners(updatedSigners);
        this.props.iframe.deleteRole(roleId);
    }

    getSidebarRoleItemsProps(id) {
        const signer = this.props.signers.find(signer => signer.id === id);
        return {
            id: id,
            signTemplateId: this.props.signTemplateId,
            roleId: signer.roleId,
            colorId: signer.colorId,
            signItemTypes: this.props.signItemTypes,
            isSignRequest: this.props.isSignRequest,
            iframe: this.props.iframe,
            isCollapsed: signer.isCollapsed,
            isInputFocused: signer.isInputFocused,
            /* Update callbacks binding for parent props: */
            updateInputFocused: (id, value) => this.props.updateInputFocused(id, value),
            updateCollapse: (id, value) => this.props.updateCollapse(id, value),
            updateSigner: this.updateSigner.bind(this),
            onDelete: () => this.deleteSigner(id, signer.roleId),
            itemsCount: signer.itemsCount,
        };
    }

    onTemplateNameChanged(e) {
        const templateName = e.target.value;
        if (templateName) {
            this.props.updateTemplateName(templateName + ".pdf");
            this.state.templateName = templateName;
        } else {
            e.target.value = this.state.templateName;
        }
    }
}
