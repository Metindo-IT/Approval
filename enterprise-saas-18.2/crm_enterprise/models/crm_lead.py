# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    days_to_convert = fields.Float('Days To Convert', compute='_compute_days_to_convert', store=True)
    days_exceeding_closing = fields.Float('Exceeded Closing Days', compute='_compute_days_exceeding_closing', store=True)

    @api.depends('date_conversion', 'create_date')
    def _compute_days_to_convert(self):
        for lead in self:
            if lead.date_conversion:
                lead.days_to_convert = (fields.Datetime.from_string(lead.date_conversion) - fields.Datetime.from_string(lead.create_date)).days
            else:
                lead.days_to_convert = 0

    @api.depends('date_deadline', 'date_closed')
    def _compute_days_exceeding_closing(self):
        for lead in self:
            if lead.date_closed and lead.date_deadline:
                lead.days_exceeding_closing = (fields.Datetime.from_string(lead.date_deadline) - fields.Datetime.from_string(lead.date_closed)).days
            else:
                lead.days_exceeding_closing = 0
