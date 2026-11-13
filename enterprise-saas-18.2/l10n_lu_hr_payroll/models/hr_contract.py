# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class HrContract(models.Model):
    _inherit = 'hr.contract'

    l10n_lu_index_on_contract_signature = fields.Float(
        string='Index on Contract Signature (LU)', readonly=True, compute='_compute_indexed_wage')
    l10n_lu_indexed_wage = fields.Monetary(string='Indexed Wage (LU)', compute='_compute_indexed_wage')
    l10n_lu_current_index = fields.Float(string='Current Index (LU)', compute='_compute_indexed_wage')

    l10n_lu_meal_voucher_amount = fields.Monetary(string='Meal Vouchers (LU)')
    l10n_lu_meal_voucher_employer_cost = fields.Monetary(
        string='Meal Voucher Employer Cost (LU)', compute='_compute_l10n_lu_meal_voucher_employer_cost')
    l10n_lu_meal_voucher_employee_computation = fields.Selection(
        selection=[('removed_from_net', 'Removed From Net'),
        ('consider_as_bik', 'Consider as Benefit in Kind')],
        string="Employee Computation (LU)",
        required=True,
        default='removed_from_net'
    )
    l10n_lu_bik_meal_voucher_exceeding_amount = fields.Monetary(string='BIK Meal Voucher Exceeding Amount (LU)',
                                                                compute="_compute_l10n_lu_meal_voucher_employer_cost")
    l10n_lu_bik_vehicle = fields.Monetary(string='BIK Vehicle (LU)')
    l10n_lu_bik_vehicle_vat_included = fields.Boolean(string='BIK Vehicle VAT Included (LU)', default=True)
    l10n_lu_bik_other_benefits = fields.Monetary(string='Others')

    l10n_lu_alw_vehicle = fields.Monetary(string='Allowance Vehicle (LU)')

    _check_meal_voucher_amount = models.Constraint(
        'check(l10n_lu_meal_voucher_amount = 0 OR l10n_lu_meal_voucher_amount >= 2.8)',
        'The meal voucher amount can be zero for no meal voucher benefit or more than or equal to 2.8 euros'
    )

    @api.depends('wage')
    def _compute_indexed_wage(self):
        for contract in self:
            contract.l10n_lu_index_on_contract_signature = self.env['hr.rule.parameter']._get_parameter_from_code('l10n_lu_index', date=contract.date_start, raise_if_not_found=False)
            contract.l10n_lu_current_index = self.env['hr.rule.parameter']._get_parameter_from_code('l10n_lu_index', raise_if_not_found=False)
            if contract.l10n_lu_index_on_contract_signature and contract.l10n_lu_current_index:
                contract.l10n_lu_indexed_wage = (
                    contract.wage if contract.wage_type == 'monthly' else contract.hourly_wage
                ) / contract.l10n_lu_index_on_contract_signature * contract.l10n_lu_current_index
            else:
                contract.l10n_lu_indexed_wage = contract.wage

    @api.depends('l10n_lu_meal_voucher_amount')
    def _compute_l10n_lu_meal_voucher_employer_cost(self):
        meal_voucher_max_value = self.env['hr.rule.parameter']._get_parameter_from_code('l10n_lu_meal_voucher_max_value', raise_if_not_found=False)
        if not meal_voucher_max_value:
            self.l10n_lu_meal_voucher_employer_cost = 0
            self.l10n_lu_bik_meal_voucher_exceeding_amount = 0
            return
        # The employee always pays 2.8€ per meal voucher.
        # The employer contributes for the rest up to a maximum amount.
        for contract in self:
            if contract.l10n_lu_meal_voucher_amount and contract.l10n_lu_meal_voucher_amount > 2.8:
                contract_employer_contribution = contract.l10n_lu_meal_voucher_amount - 2.8
                maximum_employer_contribution = meal_voucher_max_value - 2.8
                contract.l10n_lu_meal_voucher_employer_cost = min(contract_employer_contribution, maximum_employer_contribution)
            else:
                contract.l10n_lu_meal_voucher_employer_cost = 0

            contract.l10n_lu_bik_meal_voucher_exceeding_amount = max(0, contract.l10n_lu_meal_voucher_amount - meal_voucher_max_value)
