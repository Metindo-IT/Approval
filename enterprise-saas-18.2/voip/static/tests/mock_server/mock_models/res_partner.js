import { mailModels } from "@mail/../tests/mail_test_helpers";

export class ResPartner extends mailModels.ResPartner {
    /** @override */
    _compute_display_name() {
        super._compute_display_name();
        for (const record of this) {
            if (record.company_name) {
                record.display_name = `${record.company_name}, ${record.display_name}`;
            }
        }
    }

    get_contacts() {
        return this._format_contacts(this.search([["phone", "!=", false]]));
    }

    /** @param {number[]} ids */
    _format_contacts(ids) {
        const contacts = this.browse(ids);
        return contacts.map((contact) => ({
            id: contact.id,
            displayName: contact.display_name,
            email: contact.email,
            phone: contact.phone,
            name: contact.display_name,
        }));
    }
}
