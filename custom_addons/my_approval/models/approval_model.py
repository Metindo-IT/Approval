from odoo import models, fields

class MyApproval(models.Model):
    _name = 'my.approval'
    _description = 'My Approval Request'

    name = fields.Char(string='Subject', required=True)
    description = fields.Text(string='Description')
    amount = fields.Float(string='Amount')
    state = fields.Selection([
        ('draft', 'Draft'),
        ('approved', 'Approved')
    ], string='Status', default='draft')