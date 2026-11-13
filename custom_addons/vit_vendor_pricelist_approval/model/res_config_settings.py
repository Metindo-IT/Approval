from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    pricelist_approver_1_ids = fields.Many2many(
        'res.users',
        relation='vit_pl_appr1_rel',
        string="Approver Tahap 1 (Purchasing)",
    )
    pricelist_approver_2_ids = fields.Many2many(
        'res.users',
        relation='vit_pl_appr2_rel',
        string="Approver Tahap 2 (Marketing)",
    )
    pricelist_approver_3_ids = fields.Many2many(
        'res.users',
        relation='vit_pl_appr3_rel',
        string="Approver Tahap 3 (Finance)",
    )
    pricelist_follower_ids = fields.Many2many(
        'res.partner',
        relation='vit_pl_follower_rel',
        string="Follower Pricelist Approval",
    )
    pricelist_deadline_1 = fields.Integer(
        string="Batas Waktu Tahap 1 (Hari)",
        default=2,
        config_parameter='vit_vendor_pricelist_approval.deadline_1',
    )
    pricelist_deadline_2 = fields.Integer(
        string="Batas Waktu Tahap 2+3 (Hari)",
        default=3,
        config_parameter='vit_vendor_pricelist_approval.deadline_2',
    )

    @api.model
    def get_values(self):
        res = super().get_values()
        ICP = self.env['ir.config_parameter'].sudo()

        def _parse_ids(key):
            raw = ICP.get_param(key, default='')
            return [int(x) for x in raw.split(',') if x.strip().isdigit()]

        res.update(
            pricelist_approver_1_ids=[(6, 0, _parse_ids('vit_vendor_pricelist_approval.approver_1_ids'))],
            pricelist_approver_2_ids=[(6, 0, _parse_ids('vit_vendor_pricelist_approval.approver_2_ids'))],
            pricelist_approver_3_ids=[(6, 0, _parse_ids('vit_vendor_pricelist_approval.approver_3_ids'))],
            pricelist_follower_ids=[(6, 0, _parse_ids('vit_vendor_pricelist_approval.follower_ids'))],
        )
        return res

    def set_values(self):
        super().set_values()
        ICP = self.env['ir.config_parameter'].sudo()

        def _format_ids(records):
            return ','.join(str(r.id) for r in records)

        ICP.set_param('vit_vendor_pricelist_approval.approver_1_ids', _format_ids(self.pricelist_approver_1_ids))
        ICP.set_param('vit_vendor_pricelist_approval.approver_2_ids', _format_ids(self.pricelist_approver_2_ids))
        ICP.set_param('vit_vendor_pricelist_approval.approver_3_ids', _format_ids(self.pricelist_approver_3_ids))
        ICP.set_param('vit_vendor_pricelist_approval.follower_ids', _format_ids(self.pricelist_follower_ids))
