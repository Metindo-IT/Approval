import secrets
from odoo import models


class BlackboxIotChannel(models.AbstractModel):
    _inherit = 'iot.channel'

    def update_is_open(self):
        is_open = super().update_is_open() or bool(self.env['iot.device'].search_count([('type', '=', 'fiscal_data_module')], limit=1))
        if is_open:
            self.env["iot.box"].search([]).write({"is_websocket_active": True})
        return is_open
