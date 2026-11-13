# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime

from odoo import models, api, fields
from odoo.tools import SQL

from odoo.addons.resource.models.utils import filter_domain_leaf


class SaleCommissionAchievementReport(models.Model):
    _inherit = 'sale.commission.achievement.report'

    def _achievement_lines_add(self, users=None, teams=None):
        # Adjustement added to a salesperson
        return f"""
achievement_commission_lines_add AS (
    SELECT
        scpu.user_id AS user_id,
        scp.team_id AS team_id,
        scp.id AS plan_id,
        sca.currency_rate * sca.achieved * cr.rate AS achieved,
        {self.env.company.currency_id.id} AS currency_id,
        sca.date AS date,
        sca.company_id,
        sca.id AS related_res_id,
        'sale.commission.achievement' AS related_res_model
    FROM sale_commission_achievement sca
    JOIN sale_commission_plan_user scpu ON scpu.id = sca.add_user_id
    JOIN sale_commission_plan scp ON scpu.plan_id = scp.id
    JOIN currency_rate cr ON cr.company_id=scp.company_id
    WHERE scp.active
      AND scp.state = 'approved'
    {'AND scpu.user_id in (%s)' % ','.join(str(i) for i in users.ids) if users else ''}
    GROUP BY scpu.user_id,scp.team_id,scp.id,sca.currency_rate,sca.achieved,cr.rate,sca.date,scp.company_id,sca.id
)
""", "achievement_commission_lines_add"

    def _achievement_lines_rem(self, users=None, teams=None):
        # Adjustement removed to a salesperson
        return f"""
achievement_commission_lines_rem AS (
    SELECT
        scpu.user_id AS user_id,
        scp.team_id AS team_id,
        scp.id AS plan_id,
        - sca.currency_rate * sca.achieved * cr.rate AS achieved,
        {self.env.company.currency_id.id} AS currency_id,
        sca.date AS date,
        sca.company_id,
        sca.id AS related_res_id,
        'sale.commission.achievement' AS related_res_model
    FROM sale_commission_achievement sca
    JOIN sale_commission_plan_user scpu ON scpu.id = sca.reduce_user_id
    JOIN sale_commission_plan scp ON scpu.plan_id = scp.id
    JOIN currency_rate cr ON cr.company_id=scp.company_id
    WHERE scp.active
      AND scp.state = 'approved'
    {'AND scpu.user_id in (%s)' % ','.join(str(i) for i in users.ids) if users else ''}
    GROUP BY scpu.user_id,scp.team_id,scp.id,sca.currency_rate,sca.achieved,cr.rate,sca.date,scp.company_id,sca.id
)
""", "achievement_commission_lines_rem"

    def _commission_lines_cte(self, users=None, teams=None):
        return [self._achievement_lines_add(users, teams),
                self._achievement_lines_rem(users, teams),
                self._sale_lines(users, teams),
                self._invoices_lines(users, teams)]
