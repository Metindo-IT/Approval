from odoo import _, api, fields, models

class Session(models.Model):
    _name = 'academic.session'
    _description = 'Session'

    name = fields.Char(required=True)
    start_date = fields.Date()
    duration = fields.Integer(help='Durasi (hari)')
    seats = fields.Integer('Number of Seats')
    active = fields.Boolean(default=True)

    course_id = fields.Many2one(
        'academic.course',
        ondelete='cascade',
        required=True
    )

    instructor_id = fields.Many2one('res.partner')

    attendee_ids = fields.One2many(
        'academic.attendee',
        'session_id'
    )

    taken_seats = fields.Float(
        compute='_compute_taken_seats', 
        store=True, aggregator='avg'
    )

    image = fields.Image(
        'Image', max_width=512, max_height=512
    )

    start_date = fields.Date(default=fields.Date.context_today) 
    active = fields.Boolean(default=True)
    end_date = fields.Date( compute='_compute_end_date', store=True)

    state = fields.Selection([ 
        ('draft', 'Draft'), 
        ('confirmed', 'Confirmed'), 
        ('done', 'Done'), 
    ], default='draft', required=True) 
    
    def action_confirm(self):
        self.write({'state': 'confirmed'}) 
    
    def action_done(self): 
        self.write({'state': 'done'}) 
        
    def action_draft(self): 
        self.write({'state': 'draft'})

    @api.depends('seats', 'attendee_ids')
    def _compute_taken_seats(self):
        for rec in self:
            if not rec.seats:
                rec.taken_seats = 0.0
            else:
                rec.taken_seats = (
                    100.0 * len(rec.attendee_ids) / rec.seats
                )

    @api.onchange('seats', 'attendee_ids')
    def _onchange_seats(self): 
        if self.seats < 0: 
            return {'warning': { 
                'title': _('Incorrect seats value'), 
                'message': _('Seats cannot be negative'), 
            }} 
        if self.seats < len(self.attendee_ids): 
            return {'warning': { 
                'title': _('Too many attendees'), 
                'message': _('Add seats or remove attendees'), 
            }}

    @api.constrains('instructor_id', 'attendee_ids') 
    def _check_instructor(self): 
        for rec in self: 
            if rec.instructor_id in rec.attendee_ids.partner_id: 
                raise ValidationError( _('Instructor cannot be an attendee'))

    # @api.depends('start_date', 'duration') 
    # def _compute_end_date(self): 
    #     for rec in self: 
    #         d = max(rec.duration - 1, 0) 
    #         rec.end_date = rec.start_date and \
    #         fields.Date.add(rec.start_date, days=d)

    @api.depends('start_date', 'duration')
    def _compute_end_date(self):
        for rec in self:
            d = max(rec.duration - 1, 0)
            rec.end_date = (
                fields.Date.add(rec.start_date, days=d)
                if rec.start_date else False
            )