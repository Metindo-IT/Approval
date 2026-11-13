from odoo import models, _


class CustomerStatementCustomHandler(models.AbstractModel):
    _name = 'account.customer.statement.report.handler'
    _inherit = 'account.partner.ledger.report.handler'
    _description = 'Customer Statement Custom Handler'

    def _custom_options_initializer(self, report, options, previous_options):
        super()._custom_options_initializer(report, options, previous_options)

        options['buttons'].append({
            'name': _('Send'),
            'action': 'action_send_statements',
            'sequence': 90,
            'always_show': True,
        })

    def _get_report_send_recipients(self, options):
        partners = options.get('partner_ids', [])
        if not partners:
            report = self.env['account.report'].browse(options['report_id'])
            self._cr.execute(self._get_query_sums(report, options))
            partners = [row['groupby'] for row in self._cr.dictfetchall() if row['groupby']]
        return self.env['res.partner'].browse(partners)

    def action_send_statements(self, options):
        template = self.env.ref('account_reports.email_template_customer_statement', False)
        partners = self.env['res.partner'].browse(options.get('partner_ids', []))
        return {
            'name': _("Send %s Statement", partners.name) if len(partners) == 1 else _("Send Partner Ledgers"),
            'type': 'ir.actions.act_window',
            'views': [[False, 'form']],
            'res_model': 'account.report.send',
            'target': 'new',
            'context': {
                'default_mail_template_id': template.id if template else False,
                'default_report_options': options,
            },
        }
