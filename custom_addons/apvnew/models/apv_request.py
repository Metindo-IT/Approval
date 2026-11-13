from odoo import models, fields

class ApvNewRequest(models.Model):
    _name = 'apv.new.request'
    _description = 'APV New Request'

    name = fields.Char(string='Approval Subject', required=True)
    owner_id = fields.Many2one('res.users', string='Request Owner', default=lambda self: self.env.user)
    amount = fields.Float(string='Amount')
    date = fields.Date(string='Date')
    state = fields.Selection([
        ('to_submit', 'To Submit'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('refused', 'Refused')
    ], string='Status', default='to_submit')