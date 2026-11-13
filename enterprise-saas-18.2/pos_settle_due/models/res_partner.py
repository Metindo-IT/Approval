# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models, api


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def get_total_due(self, config_id):
        config = self.env['pos.config'].browse(config_id)
        pos_payments = self.env['pos.order'].search([
            ('partner_id', 'in', self.get_company_partner_ids()), ('state', '=', 'paid'),
            ('session_id.state', '!=', 'closed')]).mapped('payment_ids')
        total_settled = sum(pos_payments.filtered_domain(
            [('payment_method_id.type', '=', 'pay_later')]).mapped('amount'))

        self_sudo = self
        group_pos_user = self.env.ref('point_of_sale.group_pos_user')
        if group_pos_user in self.env.user.all_group_ids:
            self_sudo = self.sudo()  # allow POS users without accounting rights to settle dues

        total_due = self_sudo.parent_id.total_due if self.parent_id else self_sudo.total_due
        total_due += total_settled
        if self.env.company.currency_id.id != config.currency_id.id:
            pos_currency = config.currency_id
            total_due = self.env.company.currency_id._convert(total_due, pos_currency, self.env.company, fields.Date.today())
        partner = self.read(self._load_pos_data_fields(config_id), load=False)[0]
        partner['total_due'] = total_due
        return {
            'res.partner': [partner],
        }

    def get_company_partner_ids(self):
        self.ensure_one()
        if self.is_company:
            return self.child_ids.ids + [self.id]
        elif self.parent_id:
            return self.parent_id.child_ids.ids + [self.parent_id.id]
        else:
            return [self.id]

    def get_partner_settle_details(self):
        partner_list = self.get_company_partner_ids()
        count_order_to_settle = self.env['pos.order'].search_count([
            ('partner_id', 'in', partner_list),
            ('customer_due_total', '>', 0)
        ])
        return partner_list, count_order_to_settle

    def get_all_total_due(self, config_id):
        due_amounts = []
        for partner in self:
            due_amounts.append(partner.get_total_due(config_id))
        return due_amounts

    @api.model
    def _load_pos_data_fields(self, config_id):
        params = super()._load_pos_data_fields(config_id)
        if self.env.user.has_group('account.group_account_readonly') or self.env.user.has_group('account.group_account_invoice'):
            params += ['credit_limit', 'total_due', 'use_partner_credit_limit']
        return params

    def _post_read_pos_data(self, data):
        config_id = self.env['pos.config'].browse(self.env.context.get('config_id'))

        if config_id.currency_id != self.env.company.currency_id and (self.env.user.has_group('account.group_account_readonly') or self.env.user.has_group('account.group_account_invoice')):
            for partner in data:
                partner['total_due'] = self.env.company.currency_id._convert(partner['total_due'], config_id.currency_id, self.env.company, fields.Date.today())
        return super()._post_read_pos_data(data)
