from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.addons.l10n_au_hr_payroll.models.hr_employee import INCOME_STREAM_TYPES


class L10n_AuPayslipYtd(models.Model):
    _name = 'l10n_au.payslip.ytd'
    _description = "YTD Opening Balances"

    name = fields.Char(string="Description", compute="_compute_name", required=True)
    start_date = fields.Date(string="Fiscal Start Date", inverse="_fiscal_start_date", required=True, help="The date should be the start of the fiscal year.")
    employee_id = fields.Many2one("hr.employee", string="Employee", required=True)
    l10n_au_income_stream_type = fields.Selection(
        selection=INCOME_STREAM_TYPES,
        string="Income Stream Type", readonly=True, required=True)
    company_id = fields.Many2one(related="employee_id.company_id", required=True)
    currency_id = fields.Many2one(related="company_id.currency_id")
    struct_id = fields.Many2one(
        "hr.payroll.structure",
        compute="_compute_struct_id",
        store=True,
        readonly=False,
        string="Payroll Structure",
        required=True,
    )
    rule_id = fields.Many2one("hr.salary.rule", string="Salary Rule", required=True)
    requires_inputs = fields.Boolean("Requires Inputs")
    l10n_au_payslip_ytd_input_ids = fields.One2many("l10n_au.payslip.ytd.input", "l10n_au_payslip_ytd_id", string="Inputs")
    start_value = fields.Monetary(string="Start Value")
    ytd_amount = fields.Float(string="YTD Amount", compute="_compute_total_ytd")
    finalised = fields.Boolean(string="Finalised")

    _unique_employee = models.Constraint("unique(employee_id, rule_id, l10n_au_income_stream_type)",
        "Opening balances for an employee with the same income stream type can only be imported once.")

    @api.depends("l10n_au_payslip_ytd_input_ids", "l10n_au_payslip_ytd_input_ids.ytd_amount", "start_value")
    def _compute_total_ytd(self):
        for rec in self:
            if rec.requires_inputs:
                rec.ytd_amount = sum(rec.l10n_au_payslip_ytd_input_ids.mapped("ytd_amount"))
            else:
                rec.ytd_amount = rec.start_value

    def _fiscal_start_date(self):
        for rec in self:
            if rec.start_date:
                fiscal_year_last_month = int(rec.company_id.fiscalyear_last_month)
                start_year = rec.start_date.year
                # Start is previous year
                if rec.start_date.month <= fiscal_year_last_month:
                    start_year -= 1
                if fiscal_year_last_month == 12:
                    fiscal_year_last_month = 0
                rec.start_date = rec.start_date.replace(day=1, month=fiscal_year_last_month + 1, year=start_year)

    @api.depends("employee_id", "rule_id")
    def _compute_name(self):
        for rec in self:
            rec.name = f"{rec.employee_id.name} - {rec.rule_id.name}"

    @api.depends("employee_id")
    def _compute_struct_id(self):
        for rec in self:
            rec.struct_id = rec.employee_id.contract_id.structure_type_id.default_struct_id

    @api.model_create_multi
    def create(self, vals):
        records = super().create(vals)
        employees = self.env["hr.payslip"].search([("employee_id", "=", records.employee_id.ids), ("state", "in", ("done", "paid"))]).mapped("employee_id.name")
        if employees:
            raise UserError(_("You can't create or update YTD opening balances for %(employees)s, because there are "
                "validated payslips for these employee(s).", employees=", ".join(employees)))
        return records

    def write(self, vals):
        if any(finalised for finalised in self.mapped("finalised")):
            raise UserError(_("YTD Balances cannot be updated once finalised."))
        return super().write(vals)

    def action_add_inputs(self):
        self.ensure_one()
        return self._get_records_action(
            name="Add ytd inputs",
            view_id="l10n_au_hr_payroll_account.l10n_au_payslip_ytd_form",
            target="new",
        )


class L10n_AuPayslipYtdInput(models.Model):
    _name = 'l10n_au.payslip.ytd.input'
    _description = "YTD Opening Balances Inputs"

    l10n_au_payslip_ytd_id = fields.Many2one("l10n_au.payslip.ytd", required=True, ondelete="cascade")
    name = fields.Char(string="Description", compute="_compute_name", store=True)
    res_id = fields.Many2oneReference('Input', model_field='res_model', readonly=True)
    res_model = fields.Selection(
        selection=[
            ("hr.payslip.input.type", "Other Input"),
            ("hr.work.entry.type", "Work Entry Type"),
        ],
        string="Model",
        readonly=True,
    )
    ytd_amount = fields.Float(string="YTD Amount")

    @api.depends("res_id")
    def _compute_name(self):
        for rec in self:
            if rec.res_model == "hr.payslip.input.type":
                rec.name = rec.input_type.name
            elif rec.res_model == "hr.work.entry.type":
                rec.name = rec.work_entry_type.name

    @property
    def work_entry_type(self):
        work_entry_ids = self.filtered(lambda l: l.res_model == "hr.work.entry.type").mapped("res_id")
        return self.env["hr.work.entry.type"].browse(work_entry_ids)

    @property
    def input_type(self):
        input_ids = self.filtered(lambda l: l.res_model == "hr.payslip.input.type").mapped("res_id")
        return self.env["hr.payslip.input.type"].browse(input_ids)
