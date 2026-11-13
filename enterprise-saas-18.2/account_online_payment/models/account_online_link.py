from odoo import fields, models


class AccountOnlineLink(models.Model):
    _inherit = 'account.online.link'

    is_payment_enabled = fields.Boolean()
    is_payment_activated = fields.Boolean()

    def _update_payments_activated(self, data):
        self.ensure_one()

        if data.get('is_payment_enabled') is not None:
            self.is_payment_enabled = data['is_payment_enabled']

        if data.get('is_payment_activated') is not None:
            self.is_payment_activated = data['is_payment_activated']

    def _update_connection_status(self):
        data = super()._update_connection_status()

        self._update_payments_activated(data)

        return data
