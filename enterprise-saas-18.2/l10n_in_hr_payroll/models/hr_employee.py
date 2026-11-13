# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import fields, models


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    l10n_in_uan = fields.Char(string='UAN', groups="hr.group_hr_user")
    l10n_in_pan = fields.Char(string='PAN', groups="hr.group_hr_user")
    l10n_in_esic_number = fields.Char(string='ESIC Number', groups="hr.group_hr_user")
    l10n_in_relationship = fields.Char("Relationship", groups="hr.group_hr_user", tracking=True)
    l10n_in_residing_child_hostel = fields.Integer("Child Residing in hostel", groups="hr.group_hr_user", tracking=True)
    l10n_in_lwf_account_number = fields.Char("LWF Account Number", groups="hr.group_hr_user", tracking=True)

    _unique_l10n_in_uan = models.Constraint(
        'unique (l10n_in_uan)',
        "This UAN already exists",
    )
    _unique_l10n_in_pan = models.Constraint(
        'unique (l10n_in_pan)',
        "This PAN already exists",
    )
    _unique_l10n_in_esic_number = models.Constraint(
        'unique (l10n_in_esic_number)',
        "This ESIC Number already exists",
    )

    def _get_employees_with_invalid_ifsc(self):
        return self.filtered(lambda emp: not bool(re.match("^[A-Z]{4}0[A-Z0-9]{6}$", emp.bank_account_id.bank_bic)))
