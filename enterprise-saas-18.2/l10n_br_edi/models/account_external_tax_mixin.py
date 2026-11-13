# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models


class AccountExternalTaxMixin(models.AbstractModel):
    _inherit = "account.external.tax.mixin"

    def _l10n_br_build_avatax_line(self, product, description, qty, unit_price, total, discount, line_id):
        """ Override. Include required fields for EDI. """
        res = super()._l10n_br_build_avatax_line(product, description, qty, unit_price, total, discount, line_id)
        res["itemCode"] = product.default_code
        return res
