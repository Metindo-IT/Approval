# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models, fields, _
from odoo.exceptions import UserError


class PosBlackboxLogIp(models.Model):
    _name = 'pos.blackbox.log.ip'
    _description = 'POS Blackbox Log IP'

    ip = fields.Char(string='IP Address', required=True)
    _ip_unique = models.UniqueIndex('(ip)')

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if result := self.search([('ip', '=', vals['ip'])]):
                return result
        return super().create(vals_list)

    def _log_ip(self, config_id, ip):
        if bool(config_id.certified_blackbox_identifier):
            self.create({'ip': ip})
        elif self.search_count([('ip', '=', ip)]):
            raise UserError(_("Fiscal Data Module Error. You cannot open an uncertified Point of Sale with this device."))
