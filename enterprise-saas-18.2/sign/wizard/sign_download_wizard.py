# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, fields, models
from odoo.exceptions import UserError


class SignRequestDownload(models.TransientModel):
    _name = 'sign.request.download'
    _description = 'Sign Request Download'

    def _default_signed_sign_request_ids(self):
        active_ids = self._context.get('active_ids', [])
        sign_requests = self.env['sign.request'].search([
            ('id', 'in', active_ids),
            ('state', '=', 'signed')
        ])
        return sign_requests

    def _default_other_request_ids(self):
        active_ids = self._context.get('active_ids', [])
        sign_requests = self.env['sign.request'].search([
            ('id', 'in', active_ids),
            ('state', '!=', 'signed')
        ])
        return sign_requests

    signed_sign_request_ids = fields.Many2many(comodel_name='sign.request',
                                               relation='signed_sign_request_rel_rel',
                                               default=_default_signed_sign_request_ids)
    other_sign_request_ids = fields.Many2many(comodel_name='sign.request',
                                              relation='other_sign_request_rel_rel',
                                              default=_default_other_request_ids)

    def action_download_signed_documents(self):
        """
        Download the completed document(s) for selected sign requests.

        This method processes the active records passed in the context (`active_ids`),
        checks if their state is 'signed', and triggers the download of the completed document(s).
        If a document is available, the method constructs and returns the action URL for downloading.
        """
        self.ensure_one()
        if not self.signed_sign_request_ids:
            raise UserError(_('No signed documents available for download.'))
        return self.signed_sign_request_ids.get_completed_document()

    def action_view_sign_requests(self):
        """
        Open a window action to display `sign.request` records that need to be signed.
        Filters the records to only show those in a state indicating that a signature is required.
        """
        self.ensure_one()
        return {
            'name': _('Document Download'),
            'type': 'ir.actions.act_window',
            'view_mode': 'list',
            'views': [(False, 'list'), (False, 'form')],
            'res_model': 'sign.request',
            'domain': [('id', 'in', self.other_sign_request_ids.ids)],
        }
