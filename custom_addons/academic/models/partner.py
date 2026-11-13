from odoo import fields, models

class Partner(models.Model):
    _inherit = 'res.partner'

    is_instructor = fields.Boolean('Instructor', default=False)