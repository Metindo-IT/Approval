from odoo import _, api, fields, models

class Course(models.Model):
    _name = 'academic.course'
    _description = 'Course'

    name = fields.Char('Name', required=True)
    description = fields.Text('Description')
    session_ids = fields.One2many('academic.session', 'course_id')
    responsible_id = fields.Many2one('res.users', string='Responsible',
    default=lambda self: self.env.user)

    _sql_constraints = [ 
        ('name_desc_check', 'CHECK(name != description)', 
        'Title and description must differ'), 
        ('name_unique', 'UNIQUE(name)', 
        'Course name must be unique'), 
    ]
    def copy_data(self, default=None):
        vals_list = super().copy_data(default=default) 
        return [ 
            dict(vals, name=_('Copy of %s', rec.name)) 
            for rec, vals in zip(self, vals_list) 
        ]