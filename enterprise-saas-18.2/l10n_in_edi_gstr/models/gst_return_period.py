from odoo import fields, models


class L10nInGSTReturnPeriod(models.Model):
    _inherit = 'l10n_in.gst.return.period'

    gstr1_include_einvoice = fields.Boolean(
        string="E-Invoice in GSTR-1",
        help="Enable this option to include invoice with generated E-invoices being pushing to GSTR-1.",
        tracking=True
    )
    l10n_in_gst_efiling_feature_enabled = fields.Boolean(related='company_id.l10n_in_gst_efiling_feature')
    l10n_in_edi_feature_enabled = fields.Boolean(related='company_id.l10n_in_edi_feature')

    def is_einvoice_skippable(self, move_id):
        # Check if the skip e-invoice condition is met for a given move_id.
        return (
            not self.gstr1_include_einvoice
            and move_id.l10n_in_edi_status in ['sent', 'cancelled']
        )
