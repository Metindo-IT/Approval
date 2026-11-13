# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import  api, models, fields, _
from odoo.exceptions import ValidationError

class SaleCommissionAchievement(models.Model):
    _inherit = 'sale.commission.achievement'

    add_user_id = fields.Many2one('sale.commission.plan.user', "Add to",
        domain=[('plan_id.active', '=', True)]
    )
    reduce_user_id = fields.Many2one('sale.commission.plan.user', "Reduce From",
        domain=[('plan_id.active', '=', True)],
    )
    achieved = fields.Monetary("Achieved", currency_field='currency_id')
