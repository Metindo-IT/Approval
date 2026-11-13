import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { SignTemplateControlPanel } from "./sign_template_control_panel";
import { SignTemplateBody } from "./sign_template_body";
import { Component, onWillStart, useState } from "@odoo/owl";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { SignTemplateSidebar } from "./sign_template_sidebar";
import { rpc } from "@web/core/network/rpc";

export class SignTemplate extends Component {
    static template = "sign.Template";
    static components = {
        SignTemplateControlPanel,
        SignTemplateBody,
        SignTemplateSidebar,
    };
    static props = {
        ...standardActionServiceProps,
    };

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.action = useService("action");
        const params = this.props.action.params;
        this.templateID = params.id;
        if (this.templateID) {
            this.props.updateActionState({ id: this.templateID });
        }
        this.actionType = params.sign_edit_call || "";
        this.resModel = params.resModel || "";
        this.signStatus = useState({
            isTemplateChanged: false,
            // isSignTemplateSaved is used as a flag to know if the template is saved or not.
            // It is used to show a notification when the user tries to edit the uploaded document.
            // It is set to true when the template is saved from the backend.
            isSignTemplateSaved: this.resModel === "sign.request" ? true : false,
            save : () => {},
            discardChanges : () => {},
        });

        onWillStart(async () => {
            if (!this.templateID) {
                return this.goBackToKanban();
            }
            return Promise.all([this.checkManageTemplateAccess(), this.fetchTemplateData(), this.fetchFont()]);
        });
        this.state = useState({
            signers: [],
            nextId: 0,
        });
        this.waitForIframeToLoad();
    }

    get showSidebar() {
        return !this.hasSignRequests && !this.env.isSmall;
    }

    /**
     * Checks if there are signers without sign items in the template
     * @returns {Boolean}
     */
    get hasSignersWithoutItems() {
        return this.state.signers.some(signer => signer.itemsCount === 0);
    }

    get signTemplateSidebarProps() {
        return {
            signItemTypes: this.signItemTypes,
            isSignRequest: this.resModel === "sign.request",
            iframe: this.state.iframe,
            signTemplateId: this.signTemplate.id,
            signers: this.state.signers,
            templateName: this.signTemplate.display_name,
            /* Update callbacks binding for parent. */
            updateTemplateName: (newTemplateName) => this.updateTemplateName(newTemplateName),
            updateCollapse: (id, value) => this.updateCollapse(id, value),
            updateInputFocused: (id, value) => this.updateInputFocused(id, value),
            updateSigners: this.updateSigners.bind(this),
            pushNewSigner: this.pushNewSigner.bind(this),
        }
    }

    waitForIframeToLoad() {
        if (this.state.iframe) {
            this.orm.call("sign.template", "get_template_items_roles_info", [this.templateID]).then(info => {
                /* Make all signers collapsed when loading for the first time. */
                const updatedInfo = info.map(item => ({
                    ...item,
                    isCollapsed: true,
                    isInputFocused: false,
                    itemsCount: 0,
                }));

                /* Make the last signer uncollapsed. */
                if (updatedInfo.length > 0)
                    updatedInfo[updatedInfo.length - 1].isCollapsed = false;

                /* Update signer's loaded information. */
                this.updateSigners(updatedInfo);
                this.state.nextId = this.state.signers.length;

                /* We must have at least one signer after load. */
                if (updatedInfo.length == 0)
                    this.pushNewSigner();

                /* Set callback for tracking number of items of each signer and load font. */
                this.state.iframe.updateSignItemsCountCallback = (signItemsCountByRole) => this.updateSignItemsCount(signItemsCountByRole);
                this.state.iframe.setFont(this.font);
            });
        } else {
            setTimeout(() => this.waitForIframeToLoad(), 50);
        }
    }

    updateSigners(newSigners) {
        this.state.signers = newSigners;
        this.state.signers.forEach(signer => {
            this.state.iframe.setRoleColor(signer.roleId, signer.colorId);
        });
    }

    updateSignItemsCount(signItemsCountByRole) {
        const updatedSigners = this.state.signers;
        updatedSigners.forEach(signer => {
            signer.itemsCount = signItemsCountByRole[signer.roleId] || 0;
        });
        this.updateSigners(updatedSigners);
    }

    async pushNewSigner() {
        const name = "Signer " + (this.state.nextId + 1).toString();
        const [roleId] = await this.orm.create('sign.item.role', [{ name: _t(name) }]);
        const colorId = this.getNextColor();
        this.state.signers.push({
            'id': this.state.nextId,
            'roleId': roleId,
            'colorId': colorId,
            'isCollapsed': false,
            'itemsCount': 0,
            'isInputFocused': true,
        });
        this.updateCollapse(this.state.nextId, false);
        this.state.iframe.setRoleColor(roleId, colorId);
        setTimeout(() => this.state.iframe.setupDragAndDrop(), 50);
        this.state.nextId++;
    }

    updateInputFocused(id, value) {
        /* Make the signer with the matching id receive the new value,
        and force all other signers to have its input unfocused. */
        this.state.signers.forEach(signer => {
            if (signer.id === id) {
                signer.isInputFocused = value;
            } else {
                signer.isInputFocused = false;
            }
        });
    }

    updateCollapse(id, value) {
        /* Make the signer with the matching id receive the new value,
        and force all other signers to have its dropdown collapsed. */
        this.state.signers.forEach(signer => {
            if (signer.id === id) {
                signer.isCollapsed = value;
            } else {
                signer.isCollapsed = true;
                signer.isInputFocused = false;
            }
        });
    }

    getNextColor() {
        const colors = this.state.signers.map(signer => signer.colorId);
        for (let i = 0; i < 55; i++) {
            if (!colors.includes(i)) {
                return i;
            }
        }
        return 0;
    }

    async fetchTemplateData() {
        const template = await this.orm.call("sign.template", "read", [
            [this.templateID],
            ["id", "attachment_id", "has_sign_requests", "responsible_count", "display_name", "active"],
        ]);
        if (!template.length) {
            this.templateID = undefined;
            this.notification.add(_t("The template doesn't exist anymore."), {
                title: _t("Warning"),
                type: "warning",
            });
            return;
        }
        this.signTemplate = template[0];
        this.state.templateName = this.signTemplate.display_name;
        this.hasSignRequests = this.signTemplate.has_sign_requests;
        this.responsibleCount = this.signTemplate.responsible_count;
        this.attachmentLocation = `/web/content/${this.signTemplate.attachment_id[0]}`;

        return Promise.all([
            this.fetchSignItemData(),
            this.fetchAttachment(),
            this.fetchSignItemTypes(),
            this.fetchSignRoles(),
            this.fetchRadioSets(),
        ]);
    }

    async fetchFont() {
        const fonts = await rpc("/web/sign/get_fonts/LaBelleAurore-Regular.ttf");
        this.font = fonts[0];
        this.state.iframe?.setFont(this.font);
    }

    async fetchRadioSets() {
        this.radioSets = await this.orm.call(
            "sign.template",
            "get_radio_sets_dict", [
                this.signTemplate.id
            ]
        );
    }

    async fetchSignItemTypes() {
        this.signItemTypes = await this.orm.call("sign.item.type", "search_read", [], {
            context: user.context,
        });
    }

    async fetchSignRoles() {
        this.signRoles = await this.orm.call("sign.item.role", "search_read", [], {
            context: user.context,
        });
    }

    async fetchSignItemData() {
        this.signItems = await this.orm.call(
            "sign.item",
            "search_read",
            [[["template_id", "=", this.signTemplate.id]]],
            { context: user.context }
        );

        this.signItems.forEach((item) => {
            item.radio_set_id = item?.radio_set_id[0] || undefined;
            item.roleName = item.responsible_id[1];
        });

        this.signItemOptions = await this.orm.call(
            "sign.item.option",
            "search_read",
            [[], ["id", "value"]],
            { context: user.context }
        );
    }

    async fetchAttachment() {
        const attachment = await this.orm.call(
            "ir.attachment",
            "read",
            [[this.signTemplate.attachment_id[0]], ["mimetype", "name"]],
            { context: user.context }
        );

        this.signTemplateAttachment = attachment[0];
        this.isPDF = this.signTemplateAttachment.mimetype.indexOf("pdf") > -1;
    }

    async updateTemplateName(newTemplateName) {
        await this.orm.call(
            "sign.template",
            "update_from_pdfviewer",
            [this.signTemplate.id],
            { name: newTemplateName || "" }
        );
    }

    /**
     * Checks that user has group sign.manage_template_access for showing extra fields
     */
    async checkManageTemplateAccess() {
        this.manageTemplateAccess = await user.hasGroup("sign.manage_template_access");
    }

    goBackToKanban() {
        return this.action.doAction("sign.sign_template_action", { clearBreadcrumbs: true });
    }

    async onTemplateSaveClick() {
        const templateId = this.signTemplate.id;
        this.state.properties = await this.orm.call("sign.template", "write", [[templateId], { active: true }]);
        this.signTemplate.active = true;
        this.notification.add(_t("Document saved as Template."), { type: "success" });
        return this.state.properties;
    }

    setIframe(iframe) {
        this.state.iframe = iframe;
        this.signStatus.save = iframe.saveChangesOnBackend.bind(iframe);
    }
}

registry.category("actions").add("sign.Template", SignTemplate);
