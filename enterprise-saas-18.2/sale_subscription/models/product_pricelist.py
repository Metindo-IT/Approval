# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ProductPricelist(models.Model):
    _inherit = "product.pricelist"

    product_subscription_pricing_ids = fields.One2many(
        'sale.subscription.pricing',
        'pricelist_id',
        string="Recurring Pricing",
        domain=[
            '|', ('product_template_id', '=', None), ('product_template_id.active', '=', True),
        ],
        copy=True,
    )

    def action_archive(self):
        """When archiving, we want to be archiving the product subscription pricing FIRST.
        The record of product_subscription_pricing_ids will be inactive when the price-list is archived."""
        self.with_context(active_test=False).product_subscription_pricing_ids.action_archive()
        return super().action_archive()

    def action_unarchive(self):
        """ When un-archiving, we want to un-archive the product subscription pricing LAST.
        The record of the product_subscription_pricing_ids will be active when the price list is unarchived."""
        self.with_context(active_test=False).product_subscription_pricing_ids.action_unarchive()
        return super().action_unarchive()
