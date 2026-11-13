# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def lazy_session_info(self):
        res = super().lazy_session_info()
        res['iot_channel'] = self.env['iot.channel'].get_iot_channel()
        return res
