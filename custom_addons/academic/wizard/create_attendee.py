from odoo import fields, models

class CreateAttendeeWizard(models.TransientModel): 
    _name = 'academic.wizard' 
    _description = 'Add Attendees to Sessions' 
    
    session_ids = fields.Many2many('academic.session', default=lambda self: self.env.context.get('active_ids')) 
    partner_ids = fields.Many2many('res.partner', string='Attendee') 
    
    def action_add_attendee(self): 
        self.env['academic.attendee'].create([ 
            {'session_id': s.id, 'partner_id': p.id} 
            for s in self.session_ids for p in self.partner_ids]) 
        return {'type': 'ir.actions.act_window_close'}