from odoo import fields, models


class PurchaseOrderLine(models.Model):
    _inherit = "purchase.order.line"

    def _prepare_account_move_line(self, move=False):
        res = super()._prepare_account_move_line(move=move)
        if not self.product_id or self.display_type:
            return res

        req_categ = self.product_id.categ_id._get_pricelist_category() if self.product_id.categ_id else False
        if not req_categ:
            return res

        po_date = (
            self.order_id.date_order.date()
            if self.order_id.date_order
            else fields.Date.context_today(self)
        )
        commercial_partners = self.partner_id | self.partner_id.commercial_partner_id
        domain = [
            ('partner_id', 'in', commercial_partners.ids),
            ('active', '=', True),
            ('approval_state', '=', 'approved'),
            '|',
            ('product_id', '=', self.product_id.id),
            ('product_tmpl_id', '=', self.product_id.product_tmpl_id.id),
        ]
        seller = self.env['product.supplierinfo'].search(
            domain, order='date_start desc, id desc', limit=1
        )
        if seller and seller.pricelist_approval_id:
            seller_date = seller.date_start or (
                seller.pricelist_approval_id.submit_date
                and seller.pricelist_approval_id.submit_date.date()
            )
            if not seller_date or seller_date >= po_date:
                new_price = seller.price
                if seller.currency_id != self.order_id.currency_id:
                    new_price = seller.currency_id._convert(
                        new_price,
                        self.order_id.currency_id,
                        self.order_id.company_id or self.env.company,
                        fields.Date.context_today(self),
                    )
                if self.product_uom_id and seller.product_uom_id and self.product_uom_id != seller.product_uom_id:
                    new_price = seller.product_uom_id._compute_price(new_price, self.product_uom_id)
                res['price_unit'] = new_price
        return res
