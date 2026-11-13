# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api


class ChooseDeliveryPackage(models.TransientModel):
    _inherit = 'choose.delivery.package'

    available_scale_ids = fields.Many2many('iot.device', related='move_line_ids.picking_type_id.iot_scale_ids')
    iot_device_id = fields.Many2one('iot.device', "Scale", compute='_compute_iot_device_id', store=True, readonly=False)
    iot_device_identifier = fields.Char(related='iot_device_id.identifier')
    iot_ip = fields.Char(related='iot_device_id.iot_ip')
    manual_measurement = fields.Boolean(related='iot_device_id.manual_measurement')

    @api.depends('move_line_ids')
    def _compute_iot_device_id(self):
        for wizard in self:
            picking_type_scales = wizard.move_line_ids.picking_type_id.iot_scale_ids
            if len(picking_type_scales) == 1:
                wizard.iot_device_id = picking_type_scales
