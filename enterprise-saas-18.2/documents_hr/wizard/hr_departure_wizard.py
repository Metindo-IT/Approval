# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class HrDepartureWizard(models.TransientModel):
    _inherit = 'hr.departure.wizard'

    send_documents_enabled = fields.Boolean("Send Docs", default=(lambda self: self._get_default_send_documents_enabled()))
    send_hr_documents_access_link = fields.Boolean(
        string="Send Access Link",
        help="Send a share link to the private email of the employee with all the HR files he owns in Documents app")
    warning_message = fields.Char(compute='_compute_warning_message')

    def _get_default_send_documents_enabled(self):
        return self.env.company.documents_hr_settings and self.env.company.documents_hr_folder

    def action_register_departure(self):
        super().action_register_departure()
        if self.send_documents_enabled and self.send_hr_documents_access_link:
            self.employee_ids.filtered(lambda e: e.private_email and e.user_id).action_send_documents_share_link()

    @api.depends('send_documents_enabled', 'send_hr_documents_access_link', 'employee_ids')
    def _compute_warning_message(self):
        for wizard in self:
            employees_without_email_or_user = wizard.employee_ids.filtered(
                lambda e: not e.private_email or not e.user_id
            )
            if (
                wizard.send_documents_enabled
                and wizard.send_hr_documents_access_link
                and employees_without_email_or_user
            ):
                wizard.warning_message = _(
                    "The following employees have no private email or user on record"
                    " and will not be sent a link to their documents:\n %s",
                    ', '.join(employees_without_email_or_user.mapped('name'))
                )
            else:
                wizard.warning_message = False
