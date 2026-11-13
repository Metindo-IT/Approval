from odoo import api, models
from odoo.tools.misc import formatLang


class BankRecWidget(models.Model):
    _inherit = 'bank.rec.widget'

    def _action_validate(self):
        # EXTENDS account_accountant
        super()._action_validate()
        line = self.st_line_id
        if line.partner_id and line.online_partner_information:
            # write value for account and merchant on partner only if partner has no value,
            # in case value are different write False
            value_merchant = line.partner_id.online_partner_information or line.online_partner_information
            value_merchant = value_merchant if value_merchant == line.online_partner_information else False
            line.partner_id.online_partner_information = value_merchant

    @api.model
    def collect_global_info_data(self, journal_id):
        info_data = super().collect_global_info_data(journal_id)
        journal = self.env['account.journal'].browse(journal_id)
        available_balance = ''
        if journal.exists() and any(company in journal.company_id._accessible_branches() for company in self.env.companies):
            if journal.account_online_account_id.available_balance:
                available_balance = formatLang(
                    self.env,
                    journal.account_online_account_id.available_balance,
                    currency_obj=journal.currency_id or journal.company_id.sudo().currency_id,
                )
        return {**info_data, 'available_balance_amount': available_balance}
