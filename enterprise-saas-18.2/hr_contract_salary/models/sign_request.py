from odoo import models, _


class SignRequest(models.Model):
    _inherit = 'sign.request'

    def cancel(self):
        super().cancel()
        offers = self.env['hr.contract.salary.offer'].search([('sign_request_ids', 'in', self.ids)])

        offers.write({'state': 'cancelled'})
        for offer in offers:
            offer.message_post(body=_("The offer has been cancelled due to the signature request cancellation."))
