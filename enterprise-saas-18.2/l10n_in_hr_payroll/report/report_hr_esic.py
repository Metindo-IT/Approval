# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import calendar
import io

from datetime import datetime

from odoo import api, fields, models, _
from odoo.tools.misc import xlsxwriter
from odoo.exceptions import UserError, ValidationError

from .report_hr_epf import MONTH_SELECTION


class HrESICReport(models.Model):
    _name = 'l10n.in.hr.payroll.esic.report'
    _description = 'Indian Payroll: Employee State Insurance Report'

    def _get_year_selection(self):
        current_year = datetime.now().year
        return [(str(i), i) for i in range(1990, current_year + 1)]

    month = fields.Selection(MONTH_SELECTION, default=lambda self: str(datetime.today().month), required=True)
    year = fields.Selection(selection='_get_year_selection', required=True, default=lambda self: str(datetime.now().year))
    period_has_payslips = fields.Boolean(compute='_compute_period_has_payslips')
    xlsx_file = fields.Binary(string="XLSX file")
    xlsx_filename = fields.Char()

    @api.model
    def default_get(self, field_list=None):
        if self.env.company.country_id.code != "IN":
            raise UserError(_('You must be logged in a Indian company to use this feature'))
        return super().default_get(field_list)

    @api.depends('month', 'year')
    def _compute_display_name(self):
        month_description = dict(self._fields['month']._description_selection(self.env))
        for report in self:
            report.display_name = f"{month_description.get(report.month)}-{report.year}"

    def _get_period_payslips_with_employees(self):
        self.ensure_one()
        indian_employees = self.env['hr.employee'].search([('contract_id.l10n_in_esic_amount', '>', 0)]).filtered(lambda e: e.company_country_code == 'IN')
        end_date = calendar.monthrange(int(self.year), int(self.month))[1]

        payslips = self.env['hr.payslip'].search([
            ('employee_id', 'in', indian_employees.ids),
            ('date_from', '>=', f'{self.year}-{self.month}-1'),
            ('date_to', '<=', f'{self.year}-{self.month}-{end_date}'),
            ('state', 'in', ('done', 'paid'))
        ])
        return indian_employees, payslips

    @api.depends('month', 'year')
    def _compute_period_has_payslips(self):
        for report in self:
            _, payslips = report._get_period_payslips_with_employees()
            report.period_has_payslips = bool(payslips)

    @api.model
    def _get_employee_esi_data(self):
        # Get the relevant records based on the year and month
        result = []
        indian_employees, payslips = self._get_period_payslips_with_employees()

        if not payslips:
            return []

        payslip_line_values = payslips._get_line_values(['GROSS', 'ESICF', 'ESICS'])

        for employee in indian_employees:
            esi_wage_base = 0
            employee_esi_contribution = 0
            employer_esi_contribution = 0

            payslip_ids = payslips.filtered(lambda p: p.employee_id == employee)

            for payslip in payslip_ids:
                esi_wage_base += payslip_line_values['GROSS'][payslip.id]['total']
                employee_esi_contribution -= payslip_line_values['ESICS'][payslip.id]['total']
                employer_esi_contribution += payslip_line_values['ESICF'][payslip.id]['total']

            if not employee_esi_contribution and not employer_esi_contribution:
                continue

            result.append((
                employee.name,
                employee.registration_number or '-',
                employee.l10n_in_esic_number or '-',
                esi_wage_base,
                employee_esi_contribution,
                employer_esi_contribution,
                employee_esi_contribution + employer_esi_contribution  # Total Contribution by employee and employer
            ))

        return result

    def action_export_xlsx(self):
        self.ensure_one()

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet('Employee_ESI_report')
        style_highlight = workbook.add_format({'bold': True, 'pattern': 1, 'bg_color': '#E0E0E0', 'align': 'center'})
        style_normal = workbook.add_format({'align': 'center', 'font_size': 12})
        row = 0
        worksheet.set_row(row, 20)

        headers = [
            _("EMPLOYEE NAME"),
            _("EMPLOYEE NUMBER"),
            _("STATUTORY REGISTRATION NUMBER"),
            _("ESI WAGES"),
            _("EMPLOYEE CONTRIBUTION"),
            _("EMPLOYER CONTRIBUTION"),
            _("TOTAL REMITTED"),
        ]

        rows = self._get_employee_esi_data()

        if not rows:
            raise ValidationError(_('No Employees on the ESI report for the selected period'))

        for col, header in enumerate(headers):
            worksheet.write(row, col, header, style_highlight)
            worksheet.set_column(col, col, 33)

        row = 1
        for data_row in rows:
            col = 0
            worksheet.set_row(row, 20)
            for data in data_row:
                worksheet.write(row, col, data, style_normal)
                col += 1
            row += 1

        workbook.close()
        xlsx_data = output.getvalue()

        self.xlsx_file = base64.encodebytes(xlsx_data)
        self.xlsx_filename = f"{self.display_name} ESI Report.xlsx"
