from odoo import models, fields, api

class DinasLuar(models.Model):
    _name = 'dinas.luar'
    _description = 'Pengajuan Dinas Luar'

    name = fields.Char(string='Tujuan / Agenda', required=True)
    employee_id = fields.Many2one('hr.employee', string='Pegawai', required=True)
    start_date = fields.Date(string='Tanggal Mulai', required=True)
    end_date = fields.Date(string='Tanggal Selesai', required=True)
    
    # Integrasi Fleet
    use_company_vehicle = fields.Boolean(string='Gunakan Kendaraan Kantor')
    vehicle_id = fields.Many2one('fleet.vehicle', string='Kendaraan')

    # Integrasi Expense (Reimbursement)
    expense_ids = fields.One2many('hr.expense', 'dinas_luar_id', string='Expenses')
    expense_count = fields.Integer(compute='_compute_expense_count')

    state = fields.Selection([
        ('draft', 'Draft'),
        ('approved', 'Disetujui'),
        ('done', 'Selesai')
    ], default='draft', string='Status')

    @api.depends('expense_ids')
    def _compute_expense_count(self):
        for rec in self:
            rec.expense_count = len(rec.expense_ids)

    def action_approve(self):
        self.state = 'approved'

    def action_view_expenses(self):
        self.ensure_one()
        return {
            'name': 'Reimbursement Dinas Luar',
            'type': 'ir.actions.act_window',
            'res_model': 'hr.expense',
            'view_mode': 'list,form',
            'domain': [('dinas_luar_id', '=', self.id)],
            'context': {
                'default_dinas_luar_id': self.id,
                'default_employee_id': self.employee_id.id,
                'default_name': f"Reimbursement {self.name}",
            }
        }