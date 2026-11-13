from dateutil.relativedelta import relativedelta

from odoo import models, _


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _schedule_activity(self, activity_type_xmlid, summary, date_deadline):
        """
            This is a dead method that is being kept until 18.3 to avoid breaking the stable policy. Please refrain from using it and resort to `activity_schedule` instead.
        """
        self.ensure_one()
        self.env['mail.activity'].create({
            'activity_type_id': self.env.ref(activity_type_xmlid).id,
            'summary': summary,
            'res_id': self.id,
            'res_model_id': self.env['ir.model']._get('account.move').id,
            'date_deadline': date_deadline,
        })

    def action_post(self):
        action = super().action_post()

        sudo = self.sudo()
        expressions_to_calculate = (
            sudo.env.ref('l10n_be.tax_report_line_44_tag')
            | sudo.env.ref('l10n_be.tax_report_title_operations_sortie_46').expression_ids._expand_aggregations()
            | sudo.env.ref('l10n_be.tax_report_title_operations_sortie_48').expression_ids._expand_aggregations()
        )

        for record in self:
            if not ((report := record.tax_closing_report_id) and record.tax_country_code == 'BE'):
                continue

            ec_sales_list_deadline = record.date + relativedelta(months=1, day=7)
            partner_vat_listing_deadline = record.date + relativedelta(years=1, month=3, day=31)

            grids = report._get_json_friendly_column_group_totals(
                report._compute_expression_totals_for_each_column_group(
                    expressions_to_calculate,
                    report.get_options({'date': {'mode': 'range', 'filter': 'this_month'}})
                )
            )
            grids_key = list(grids.keys())[0]

            if any(grid.get('value') for grid in grids[grids_key].values()):
                record.activity_schedule(
                    act_type_xmlid='l10n_be_reports.ec_sales_list_activity',
                    summary=_( 'Generate the EC Sales List: %s', ec_sales_list_deadline.strftime("&B &y")),
                    date_deadline=ec_sales_list_deadline,
                )

            if record.date.month in {10, 11, 12} and self.env.context.get('l10n_be_reports_generation_options', {}).get('client_nihil'):
                record.activity_schedule(
                    act_type_xmlid='l10n_be_reports.partner_vat_listing_report_activity',
                    summary=_( 'Generate the Partner VAT Listing: %s', partner_vat_listing_deadline.strftime("&y")),
                    date_deadline=partner_vat_listing_deadline,
                )

        return action
