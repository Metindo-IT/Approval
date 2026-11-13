import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Record } from "@web/model/record";
import { RecordSelector } from "@web/core/record_selectors/record_selector";
import { _t } from "@web/core/l10n/translation";
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

export class SignTemplateSidebarRoleItems extends Component {
    static template = "sign.SignTemplateSidebarRoleItems";
    static components = {
        Record,
        RecordSelector,
        Dropdown,
        DropdownItem,
    };
    static props = {
        signItemTypes: { type: Array },
        id: { type: Number },
        signTemplateId: { type: Number },
        isSignRequest: { type: Boolean },
        iframe: { type: Object, optional: true },
        roleId: { type: Number, optional: true },
        colorId: { type: Number },
        isInputFocused: { type: Boolean, optional: true },
        updateInputFocused: { type: Function },
        isCollapsed: { type: Boolean },
        updateCollapse: { type: Function },
        updateSigner: { type: Function },
        onDelete: { type: Function },
        itemsCount: { type: Number },
    };

    async setup() {
        this.orm = useService("orm");
        this.dialog = useService("dialog");
        this.state = useState({
            roleId: this.props.roleId,
            roleName: "",
            showEditLabelIcon: false,
        })
        this.icon_type = {
            'signature': 'fa-pencil-square-o',
            'initial': 'fa-pencil-square-o',
            'text': 'fa-font',
            'textarea': 'fa-bars',
            'checkbox': 'fa-check-square-o',
            'radio': 'fa-dot-circle-o',
            'selection': 'fa-angle-down',
            'strikethrough': 'fa-strikethrough',
        };
        this.orm.call('sign.item.role', 'read', [this.props.roleId]).then(role => {
            this.state.roleName = role[0].name;
        });
    }

    updateShowEditLabelIcon(ev, value) {
        /* Save signer name when unfocusing input for avoiding save conflicts.*/
        if (ev.target.value && !value && ev.target.value !== this.state.roleName)
            this.onChangeRoleName(ev.target.value);
        this.state.showEditLabelIcon = value;
    }

    async onDeleteDialog() {
        const hasItems = this.props.itemsCount > 0;
        if (!hasItems) {
            this.props.onDelete();
        } else {
            this.dialog.add(ConfirmationDialog, {
                title: _t('Delete signer "%s"', this.state.roleName),
                body: _t('Do you really want to delete this signer?'),
                confirmLabel: _t("Delete"),
                confirm: () => {
                    this.props.onDelete();
                },
                cancel: () => {},
            });
        }
    }

    onFocusRoleInput(id) {
        /* Focus the role input when it is clicked (if the dropdown is not collapsed). */
        if (!this.props.isCollapsed)
            this.props.updateInputFocused(id, true);
    }

    onChangeRoleName(name) {
       // Check if the new role name is different from the current one
       if (name && this.state.roleId && name !== this.state.roleName) {
            this.orm.write('sign.item.role', [this.state.roleId], { name: name });
            this.state.roleName = name;
            this.props.iframe.updateRoleName(this.state.roleId, this.state.roleName);
        }
    }

    onExpandSigner(id) {
        this.props.updateCollapse(id, false);
    }

    async openSignRoleRecord() {
        this.dialog.add(FormViewDialog, {
            resId: this.state.roleId,
            resModel: "sign.item.role",
            size: "md",
            title: _t("Signer Edition"),
            onRecordSaved: ({ data }) => {
                this.state.roleName = data.name;
            }
        });
    }

    async updateRole(resId) {
        if (resId) {
            this.state.roleId = resId;
            this.props.updateSigner(
                this.props.id,
                this.state.roleId,
                this.state.colorId
            );
        }
    }
}
