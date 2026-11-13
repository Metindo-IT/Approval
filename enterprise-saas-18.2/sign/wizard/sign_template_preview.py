# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64

from odoo import api, fields,models,_
from odoo.exceptions import UserError


class SignTemplatePreview(models.TransientModel):
    _name = 'sign.template.preview'
    _description = 'Sign Tempate Preview'

    template_id = fields.Many2one('sign.template', ondelete='cascade')
    pdf_data = fields.Binary(compute='_compute_pdf')

    @api.depends('template_id')
    def _compute_pdf(self):
        for wiz in self:
            if not wiz.template_id:
                continue
            wiz.template_id.check_access('read')
            output = wiz.template_id.with_context(bin_size=False)._render_template_with_items()
            pdf_data = base64.b64encode(output.getvalue())
            output.close()
            wiz.pdf_data = pdf_data
