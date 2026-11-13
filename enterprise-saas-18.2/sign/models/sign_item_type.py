# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class SignItemType(models.Model):
    _name = 'sign.item.type'
    _description = "Signature Item Type"

    name = fields.Char(string="Field Name", required=True, translate=True)
    icon = fields.Char()
    item_type = fields.Selection([
        ('signature', "Signature"),
        ('initial', "Initial"),
        ('text', "Text"),
        ('textarea', "Multiline Text"),
        ('checkbox', "Checkbox"),
        ('radio', "Radio"),
        ('selection', "Selection"),
        ('strikethrough', "Strikethrough"),
    ], required=True, string='Type', default='text')

    tip = fields.Char(required=True, default="fill in", help="Hint displayed in the signing hint", translate=True)
    placeholder = fields.Char(translate=True)

    default_width = fields.Float(string="Default Width", digits=(4, 3), required=True, default=0.150)
    default_height = fields.Float(string="Default Height", digits=(4, 3), required=True, default=0.015)
    model_id = fields.Many2one('ir.model', string="Specific Model Linked",
                                domain=[('model', '!=', 'sign.request'), ('is_mail_thread', '=', 'True')])
    model_name = fields.Char(related='model_id.model')
    auto_field = fields.Char(string="Auto-fill Field", groups='base.group_system',
                             help="Technical name of the field on the partner model to auto-complete this signature field at the time of signature.")

    @api.constrains('auto_field')
    def _check_auto_field_exists(self):
        for sign_type in self:
            if sign_type.auto_field and sign_type.model_id.model:
                record = self.env[sign_type.model_id.model]
                try:
                    auto_field_value = record.mapped(sign_type.auto_field)
                except KeyError:
                    auto_field_value = None
                if auto_field_value is None or isinstance(auto_field_value, models.BaseModel):
                    raise ValidationError(_("Malformed expression: %(exp)s", exp=sign_type.auto_field))
