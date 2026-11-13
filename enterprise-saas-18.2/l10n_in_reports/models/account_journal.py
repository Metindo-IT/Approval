from odoo import api, Command, fields, models


class AccountJournal(models.Model):
    _inherit = "account.journal"

    l10n_in_fetch_vendor_edi_feature_enabled = fields.Boolean(related='company_id.l10n_in_fetch_vendor_edi_feature')

    # enet_batch_payment related fields
    bank_template_id = fields.Many2one('enet.bank.template', string='Bank Template')
    enet_template_field_ids = fields.One2many('enet.template', 'journal_id', compute='_compute_enet_template_field_ids', store=True)
    has_enet_payment_method = fields.Boolean(compute='_compute_has_enet_payment_method')
    l10n_in_enet_vendor_batch_payment_feature_enabled = fields.Boolean(related='company_id.l10n_in_enet_vendor_batch_payment_feature')

    @api.depends('outbound_payment_method_line_ids.payment_method_id.code')
    def _compute_has_enet_payment_method(self):
        for journal in self:
            if journal.company_id.l10n_in_enet_vendor_batch_payment_feature:
                journal.has_enet_payment_method = any(
                    payment_method.payment_method_id.code in ['enet_rtgs', 'enet_neft', 'enet_fund_transfer', 'enet_demand_draft']
                    for payment_method in journal.outbound_payment_method_line_ids
                )
            else:
                journal.has_enet_payment_method = False

    @api.depends('bank_template_id')
    def _compute_enet_template_field_ids(self):
        for journal in self:
            bank_template = journal.bank_template_id
            if bank_template:
                journal.enet_template_field_ids = [Command.clear()] + [
                    Command.create({**field, 'journal_id': journal.id}) for field in bank_template.bank_configuration]
            else:
                journal.enet_template_field_ids = False

    def l10n_in_action_fetch_irn_data_for_account_journal(self):
        """ Fetch the GST return period for the current company and return the corresponding form view. """
        process_return_period = self.env['l10n_in.gst.return.period']._get_gst_return_period(self.company_id, create_if_not_found=True)
        return process_return_period.open_gst_return_period_form_view()
