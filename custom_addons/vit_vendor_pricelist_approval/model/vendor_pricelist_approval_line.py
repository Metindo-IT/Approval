from odoo import fields, models


class VendorPricelistApprovalLine(models.Model):
    _name = "vendor.pricelist.approval.line"
    _description = "Vendor Pricelist Approval Line"
    _order = "stage asc, id asc"

    approval_id = fields.Many2one(
        'vendor.pricelist.approval',
        string="Dokumen Approval",
        required=True,
        ondelete='cascade',
        index=True,
    )
    stage = fields.Selection(
        [
            ('1', 'Tahap 1 - Purchasing'),
            ('2', 'Tahap 2 - Marketing'),
            ('3', 'Tahap 3 - Finance'),
        ],
        string="Tahap",
        required=True,
    )
    user_id = fields.Many2one(
        'res.users',
        string="Approver",
        required=True,
    )
    role = fields.Selection(
        [
            ('prepared', 'Prepared'),
            ('acknowledged', 'Acknowledged'),
            ('approved', 'Approved'),
        ],
        string="Peran",
        default='approved',
        required=True,
    )
    state = fields.Selection(
        [
            ('pending', 'Pending'),
            ('approved', 'Approved'),
            ('rejected', 'Rejected'),
        ],
        string="Status",
        default='pending',
        required=True,
    )
    date = fields.Datetime(string="Tanggal")
    note = fields.Char(string="Catatan")
