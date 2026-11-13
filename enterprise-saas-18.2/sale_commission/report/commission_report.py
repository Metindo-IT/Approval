# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime

from odoo import api, models, fields, _
from odoo.fields import Domain
from odoo.tools import SQL

from odoo.addons.resource.models.utils import filter_domain_leaf

class SaleCommissionReport(models.Model):
    _name = 'sale.commission.report'
    _description = "Sales Commission Report"
    _order = 'id'
    _auto = False

    target_id = fields.Many2one('sale.commission.plan.target', "Period", readonly=True)
    target_amount = fields.Monetary("Target Amount", readonly=True, currency_field='currency_id')
    plan_id = fields.Many2one('sale.commission.plan', "Commission Plan", readonly=True)
    user_id = fields.Many2one('res.users', "Sales Person", readonly=True)
    # TODO master: remove
    team_id = fields.Many2one('crm.team', "Sales Team", readonly=True)
    achieved = fields.Monetary("Achieved", readonly=True, currency_field='currency_id')
    achieved_rate = fields.Float("Achieved Rate", readonly=True, aggregator='avg')
    commission = fields.Monetary("Commission", readonly=True, currency_field='currency_id')
    currency_id = fields.Many2one('res.currency', "Currency", readonly=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    forecast_id = fields.Many2one('sale.commission.plan.target.forecast', 'fc')
    payment_date = fields.Date("Payment Date", readonly=True)
    forecast = fields.Monetary("Forecast", readonly=True, currency_field='currency_id')
    date_to = fields.Date(related='target_id.date_to')

    @api.model
    def _search(self, domain, offset=0, limit=None, order=None):
        """ Extract the currency conversion date form the date_to field.
        It is used to be able to get fixed results not depending on the currency daily rates.
        The date is converted to a string to allow updating the date value in view customizations.
        """
        date_to_domain = domain and filter_domain_leaf(domain, lambda field: 'date_to' in field)
        date_to_list = date_to_domain and [datetime.strptime(d[2], '%Y-%m-%d') for d in date_to_domain if len(d) == 3]
        context = self.env.context.copy()
        if date_to_list:
            date_to = max(date_to_list)
            context.update(conversion_date=date_to.strftime('%Y-%m-%d'))
        self = self.with_context(context)
        return super(SaleCommissionReport, self)._search(domain, offset, limit, order)

    def action_achievement_detail(self):
        self.ensure_one()
        domain = [('plan_id', '=', self.plan_id.id),
                       ('user_id', '=', self.user_id.id),
                       ('date', '>=', self.target_id.date_from),
                       ('date', '<=', self.target_id.date_to),
                ]
        context = {'commission_user_ids': self.user_id.ids,
                   'commission_team_ids': self.team_id.ids,
        }
        return {
            "type": "ir.actions.act_window",
            "res_model": "sale.commission.achievement.report",
            "name": _('Commission Detail: %(name)s', name=self.target_id.name),
            "views": [[self.env.ref('sale_commission.sale_achievement_report_view_list').id, "list"]],
            "context": context,
            "domain": domain,
        }

    def write(self, values):
        # /!\ Do not call super as the table doesn't exist
        if 'forecast' in values:
            amount = values['forecast']
            for line in self:
                if line.forecast_id:
                    line.sudo().forecast_id.amount = amount
                else:
                    line.forecast_id = self.env['sale.commission.plan.target.forecast'].sudo().create({
                        'target_id': line.target_id.id,
                        'amount': amount,
                        'plan_id': line.plan_id.id,
                        'user_id': line.user_id.id,
                    })
            # Update the field's cache otherwise the field reset to the original value on the field
            self.env.cache._set_field_cache(self, self._fields.get('forecast')).update(dict.fromkeys(self.ids, amount))
        return True

    def _get_date_range(self):
        if self.env.context.get('group_quarter'):
            return "date_trunc('quarter', a.payment_date)"
        elif self.env.context.get('group_year'):
            return "date_trunc('year', a.payment_date)"
        return "a.payment_date"

    @property
    def _table_query(self):
        query = self._query()
        table_query = SQL(query)
        return table_query

    def _query(self):
        users = self.env.context.get('commission_user_ids', [])
        if users:
            users = self.env['res.users'].browse(users).exists()
        teams = self.env.context.get('commission_team_ids', [])
        if teams:
            teams = self.env['crm.team'].browse(teams).exists()

        res = f"""
WITH {self.env['sale.commission.achievement.report']._commission_lines_query(users=users, teams=teams)},
achievement AS (
    SELECT
        ROW_NUMBER() OVER (ORDER BY MAX(era.date_to) DESC, u.user_id) AS id,
        era.id AS target_id,
        era.plan_id AS plan_id,
        u.user_id AS user_id,
        MIN(cl.team_id) AS team_id,
        COALESCE(cl.company_id, MAX(scp.company_id)) AS company_id,
        SUM(achieved) AS achieved,
        CASE
            WHEN MAX(era.amount) > 0 THEN GREATEST(SUM(achieved), 0) / MAX(era.amount)
            ELSE 0
        END AS achieved_rate,
        cl.currency_id AS currency_id,
        MAX(era.amount) AS amount,
        MAX(era.date_to) AS payment_date,
        MAX(scpf.id) AS forecast_id,
        MAX(scpf.amount) AS forecast
        FROM sale_commission_plan_target era
        LEFT JOIN sale_commission_plan_user u
            ON u.plan_id=era.plan_id
            AND COALESCE(u.date_from, era.date_from)<era.date_to
            AND COALESCE(u.date_to, era.date_to)>era.date_from
        LEFT JOIN commission_lines cl
        ON cl.plan_id = era.plan_id
        AND cl.date >= era.date_from
        AND cl.date <= era.date_to
        AND cl.user_id = u.user_id
    LEFT JOIN sale_commission_plan_target_forecast scpf
        ON (scpf.target_id = era.id AND u.user_id = scpf.user_id)
    LEFT JOIN sale_commission_plan scp ON scp.id = u.plan_id
    GROUP BY
        era.id,
        era.plan_id,
        u.user_id,
        cl.company_id,
        cl.currency_id
), target_com AS (
    SELECT
        amount AS before,
        target_rate AS rate_low,
        LEAD(amount) OVER (PARTITION BY plan_id ORDER BY target_rate) AS amount,
        LEAD(target_rate) OVER (PARTITION BY plan_id ORDER BY target_rate) AS rate_high,
        plan_id
    FROM sale_commission_plan_target_commission scpta
    JOIN sale_commission_plan scp ON scp.id = scpta.plan_id
    WHERE scp.type = 'target'
), achievement_target AS (
    SELECT
        min(a.id) as id,
        min(a.target_id) as target_id,
        a.plan_id,
        a.user_id,
        a.team_id,
        a.company_id,
        {self.env.company.currency_id.id} AS currency_id,
        MIN(a.forecast_id) as forecast_id,
        {self._get_date_range()} as payment_date,
        SUM(a.achieved) AS achieved,
        CASE WHEN SUM(a.amount) > 0 THEN SUM(a.achieved) / (SUM(a.amount) * cr.rate) ELSE NULL END AS achieved_rate,
        SUM(a.amount) * cr.rate AS target_amount,
        SUM(a.forecast) * cr.rate AS forecast,
        COUNT(1) AS ct
    FROM achievement a
    LEFT JOIN currency_rate cr
        ON cr.company_id = a.company_id
    GROUP BY
        a.plan_id, a.user_id, a.team_id, a.company_id, a.currency_id, cr.rate, {self._get_date_range()}
)
SELECT
    a.*,
    CASE
        WHEN tc.before IS NULL THEN a.achieved
        WHEN tc.rate_high IS NULL THEN tc.before * a.ct
        ELSE (tc.before + (tc.amount - tc.before) * (a.achieved_rate - tc.rate_low) / (tc.rate_high - tc.rate_low)) * a.ct
    END AS commission
 FROM achievement_target a
    LEFT JOIN target_com tc ON (
        tc.plan_id = a.plan_id AND
        tc.rate_low <= a.achieved_rate AND
        (tc.rate_high IS NULL OR tc.rate_high > a.achieved_rate)
    )
"""
        return res
