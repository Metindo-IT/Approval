from odoo import models, fields, api

class ApprovalRequestInherit(models.Model):
    _inherit='approval.request'

    custom_field_example = fields.Char(string='Custom Field')