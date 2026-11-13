# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import io
from collections import defaultdict
from datetime import datetime

from dateutil.relativedelta import relativedelta

from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from odoo.tools.misc import xlsxwriter

XLSX_FORMAT = {
    'NUMBER': 0,
    'TEXT': 1,
    'DATE': 2,
    'FORMULA': 3,
    'LABEL': 4,
}


class HrPayrollMasterReport(models.Model):
    _name = 'hr.payroll.master.report'
    _description = 'Payroll: Master Report'

    name = fields.Char(compute='_compute_name', store=True)
    date_from = fields.Date(required=True, default=fields.Date.today() + relativedelta(day=1))
    date_to = fields.Date(required=True, default=fields.Date.today() + relativedelta(day=1, months=1, days=-1))
    xlsx_file = fields.Binary(string='Report', readonly=True)
    xlsx_filename = fields.Char(readonly=True)
    period_has_payslips = fields.Boolean(compute='_compute_period_has_payslips')
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, required=True)
    salary_rule_ids = fields.Many2many('hr.salary.rule', string="Restrict to Rules")

    @api.depends('date_from', 'date_to')
    def _compute_name(self):
        for report in self:
            report.name = _('Master Report from %(date_from)s to %(date_to)s',
                            date_from=report.date_from or '', date_to=report.date_to or '')

    def _get_period_payslips_domain(self):
        self.ensure_one()
        domain = [
            ('date_from', '>=', self.date_from),
            ('date_to', '<=', self.date_to),
            ('company_id', '=', self.env.company.id),
            ('state', 'in', ['done', 'paid'])
        ]
        return domain

    @api.depends('date_from', 'date_to')
    def _compute_period_has_payslips(self):
        for report in self:
            payslips = self.env['hr.payslip'].search(self._get_period_payslips_domain())
            report.period_has_payslips = bool(payslips)

    @api.constrains('date_from', 'date_to')
    def _check_dates(self):
        for report in self:
            if report.date_from > report.date_to:
                raise ValidationError(_('The starting date must be before or equal to the ending date or in the past'))

    @api.model
    def _write_rows(self, worksheet, row_index, rows, formats):
        for i, (formatting, *value) in enumerate(rows):
            if formatting == XLSX_FORMAT['TEXT']:
                worksheet.write(row_index, i, *value, formats[XLSX_FORMAT['TEXT']])
            elif formatting == XLSX_FORMAT['DATE']:
                worksheet.write_datetime(row_index, i, *value, formats[XLSX_FORMAT['DATE']])

    def action_generate_report(self):
        company = self.company_id

        labels = [_('Employee ID'), _('Employee Name'), _('Joining Date'), _('Department'), _('Job Designation')]

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output)

        formats = {
            XLSX_FORMAT['TEXT']: workbook.add_format({'border': 1}),
            XLSX_FORMAT['DATE']: workbook.add_format({'border': 1, 'num_format': 'dd/mm/yyyy'}),
            XLSX_FORMAT['LABEL']: workbook.add_format({'border': 1, 'bold': True}),
        }

        payslips = self.env['hr.payslip'].sudo().search(self._get_period_payslips_domain())
        if not payslips:
            raise ValidationError(_('There are no eligible payslips for that period of time'))
        payslips_by_structure = defaultdict(lambda: self.env['hr.payslip'])
        payslips_by_employee_structure = defaultdict(lambda: defaultdict(lambda: self.env['hr.payslip']))
        for payslip in payslips:
            payslips_by_structure[payslip.struct_id] += payslip
            payslips_by_employee_structure[payslip.struct_id][payslip.employee_id] += payslip

        line_values = payslips._get_line_values(payslips.line_ids.salary_rule_id.mapped('code'))

        for structure, employee_slips in payslips_by_employee_structure.items():
            worksheet = workbook.add_worksheet(name=structure.name)

            if self.salary_rule_ids:
                ordered_rules = self.salary_rule_ids
            else:
                ordered_rules = payslips_by_structure[structure].line_ids.salary_rule_id.sorted('sequence')
            structure_labels = labels + ordered_rules.mapped('name')
            i = 1
            for employee, slips in employee_slips.items():
                joining_date = datetime.strptime(employee.first_contract_date.strftime('%Y-%m-%d'), '%Y-%m-%d').date()

                rows = [
                    (XLSX_FORMAT['TEXT'], employee.id),
                    (XLSX_FORMAT['TEXT'], employee.name),
                    (XLSX_FORMAT['DATE'], joining_date) if joining_date else (XLSX_FORMAT['TEXT'], ''),
                    (XLSX_FORMAT['TEXT'], employee.department_id.name or ''),
                    (XLSX_FORMAT['TEXT'], employee.job_title or ''),
                ]
                rows.extend((XLSX_FORMAT['TEXT'], company.currency_id.format(sum(line_values[rule.code][p.id]['total'] for p in slips))) for rule in ordered_rules)
                self._write_rows(worksheet, i, rows, formats)
                i += 1

            for col, label in enumerate(structure_labels):
                worksheet.write(0, col, label, formats[XLSX_FORMAT['LABEL']])
            worksheet.set_column(0, len(structure_labels) - 1, 20)

        workbook.close()
        xlsx_data = output.getvalue()
        self.xlsx_file = base64.encodebytes(xlsx_data)
        self.xlsx_filename = f'{self.name}.xlsx'
