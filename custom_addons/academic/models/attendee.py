from odoo import fields, models

class Attendee(models.Model):
    _name = 'academic.attendee'
    _description = 'Attendee'

    name = fields.Char()
    session_id = fields.Many2one('academic.session', ondelete='cascade')
    partner_id = fields.Many2one('res.partner', required=True)
    course_id = fields.Many2one(related='session_id.course_id', store=True)