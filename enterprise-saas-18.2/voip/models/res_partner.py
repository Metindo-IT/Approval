from odoo import api, models
from odoo.osv import expression


class ResPartner(models.Model):
    _name = 'res.partner'
    _inherit = ["res.partner", "voip.queue.mixin"]

    @api.model
    def get_contacts(self, offset, limit, search_terms):
        domain = [("phone", "!=", False)]
        if search_terms:
            search_domain = expression.OR([
                [("phone", "like", search_terms)],
                [("complete_name", "ilike", search_terms)],
                [("email", "ilike", search_terms)],
            ])
            domain = expression.AND([domain, search_domain])
        return self.search(domain, offset=offset, limit=limit)._format_contacts()

    def _format_contacts(self):
        return [
            {
                "id": contact.id,
                "displayName": contact.display_name,
                "email": contact.email,
                "phone": contact.phone,
                "name": contact.name,
            }
            for contact in self
        ]
