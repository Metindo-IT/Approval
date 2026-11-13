# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class BaseDocumentLayout(models.TransientModel):
    _inherit = 'base.document.layout'

    def _get_preview_template(self):
        if (
            self._context.get('active_model') == 'project.task'
            and self._context.get('active_id')
        ):
            return 'industry_fsm.worksheet_custom_preview'
        return super()._get_preview_template()

    def _get_render_information(self, styles):
        res = super()._get_render_information(styles)
        if (
            self._context.get('active_model', '') == 'project.task'
            and self._context.get('active_id')
        ):
            task = self.env['project.task'].browse(self._context.get('active_id'))
            res['doc'] = task
        return res
