from odoo import api, models
from odoo.osv import expression


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    def _payment_request_from_kiosk(self, order):
        if not self.iot_device_id:
            return super()._payment_request_from_kiosk(order)
        return "success"

    @api.model
    def _load_pos_self_data_domain(self, data):
        domain = super()._load_pos_self_data_domain(data)
        if data['pos.config'][0]['self_ordering_mode'] == 'kiosk':
            domain = expression.OR([[('iot_device_id', '!=', False)], domain])
        return domain
