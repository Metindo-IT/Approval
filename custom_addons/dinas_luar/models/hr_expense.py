from odoo import models, fields

class HrExpense(models.Model):
    _inherit = 'hr.expense'

    dinas_luar_id = fields.Many2one('dinas.luar', string='ID Dinas Luar')