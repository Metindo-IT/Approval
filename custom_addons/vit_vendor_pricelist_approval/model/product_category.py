from odoo import fields, models


class ProductCategory(models.Model):
    _inherit = "product.category"

    pricelist_code = fields.Char("Kode Pricelist")
    pricelist_approval_required = fields.Boolean("Wajib Approval Pricelist")

    def _get_pricelist_category(self):
        """Kategori terdekat (diri sendiri / parent) yang wajib approval."""
        self.ensure_one()
        categ = self
        while categ and not categ.pricelist_approval_required:
            categ = categ.parent_id
        return categ
