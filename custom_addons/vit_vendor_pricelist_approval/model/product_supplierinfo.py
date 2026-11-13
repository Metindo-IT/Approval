from odoo import api, fields, models, _
from odoo.exceptions import UserError


class ProductSupplierinfo(models.Model):
    _inherit = "product.supplierinfo"

    active = fields.Boolean(default=True)
    approval_state = fields.Selection(
        [
            ('draft', 'Draft'),
            ('to_approve', 'Waiting Approval'),
            ('approved', 'Approved'),
            ('rejected', 'Rejected'),
        ],
        string="Status Approval",
        default='approved',
        copy=False,
        index=True,
    )
    pricelist_approval_id = fields.Many2one(
        'vendor.pricelist.approval',
        string="Dokumen Approval",
        copy=False,
        index=True,
        ondelete='set null',
    )
    replaced_supplierinfo_ids = fields.Many2many(
        'product.supplierinfo',
        'product_supplierinfo_replace_rel',
        'new_supplierinfo_id',
        'old_supplierinfo_id',
        string="Harga Lama yang Digantikan",
        copy=False,
    )
    old_price = fields.Float(
        string="Harga Lama",
        compute="_compute_old_price",
        digits='Product Price',
    )
    price_diff_pct = fields.Float(
        string="Selisih (%)",
        compute="_compute_old_price",
        digits=(16, 2),
    )

    @api.depends('price', 'replaced_supplierinfo_ids', 'replaced_supplierinfo_ids.price')
    def _compute_old_price(self):
        for rec in self:
            old_records = rec.with_context(active_test=False).replaced_supplierinfo_ids
            if old_records:
                old_p = old_records[0].price
                rec.old_price = old_p
                rec.price_diff_pct = ((rec.price - old_p) / old_p * 100.0) if old_p else 0.0
            else:
                rec.old_price = 0.0
                rec.price_diff_pct = 0.0

    def _get_approval_category_from_vals(self, vals):
        categ = self.env['product.category']
        if vals.get('product_id'):
            product = self.env['product.product'].browse(vals['product_id'])
            categ = product.categ_id
        elif vals.get('product_tmpl_id'):
            tmpl = self.env['product.template'].browse(vals['product_tmpl_id'])
            categ = tmpl.categ_id
        return categ._get_pricelist_category() if categ else categ

    def _get_approval_category(self):
        self.ensure_one()
        categ = self.product_id.categ_id or self.product_tmpl_id.categ_id
        return categ._get_pricelist_category() if categ else categ

    def _find_matching_active_supplierinfo(self):
        self.ensure_one()
        prod_ids = [self.product_id.id] if self.product_id else self.product_tmpl_id.product_variant_ids.ids
        tmpl_id = self.product_tmpl_id.id or (self.product_id and self.product_id.product_tmpl_id.id)
        commercial_partners = self.partner_id | self.partner_id.commercial_partner_id

        domain = [
            ('id', '!=', self.id),
            ('partner_id', 'in', commercial_partners.ids),
            ('active', '=', True),
            ('approval_state', '=', 'approved'),
            '|',
            ('product_id', 'in', prod_ids),
            ('product_tmpl_id', '=', tmpl_id),
        ]
        if self.company_id:
            domain.append(('company_id', 'in', [False, self.company_id.id]))
        return self.env['product.supplierinfo'].search(domain, order='id desc')

    @api.model_create_multi
    def create(self, vals_list):
        is_import = bool(self.env.context.get('import_file'))
        is_internal = bool(self.env.context.get('pricelist_approval_write'))
        is_manager = self.env.user.has_group(
            'vit_vendor_pricelist_approval.group_vendor_pricelist_manager'
        )
        for vals in vals_list:
            req_categ = self._get_approval_category_from_vals(vals)
            if req_categ:
                if is_import:
                    vals['active'] = False
                    vals['approval_state'] = 'draft'
                elif not is_internal and not is_manager:
                    if vals.get('active', True) or vals.get('approval_state', 'approved') == 'approved':
                        raise UserError(_(
                            "Kategori produk '%s' wajib melalui Pricelist Approval. "
                            "Silakan import harga atau buat melalui menu Pricelist Approval."
                        ) % req_categ.display_name)
        return super().create(vals_list)

    @api.model
    def load(self, fields, data):
        res = super().load(fields, data)
        if self.env.context.get('import_file') and res.get('ids'):
            pending = self.with_context(active_test=False).browse(res['ids']).filtered(
                lambda s: s.approval_state == 'draft' and not s.pricelist_approval_id
            )
            if pending:
                self.env['vendor.pricelist.approval']._attach_imported_prices(pending)
        return res

    def write(self, vals):
        if self.env.context.get('import_file'):
            if any(rec.approval_state == 'approved' for rec in self):
                raise UserError(_(
                    "Tidak boleh meng-update harga yang sudah aktif melalui import. "
                    "Hapus kolom 'id' pada file import; harga baru harus dibuat sebagai baris baru."
                ))

        if not self.env.context.get('pricelist_approval_write'):
            if 'active' in vals or 'approval_state' in vals:
                raise UserError(_(
                    "Status aktif dan status approval tidak boleh diubah secara manual. "
                    "Gunakan proses Pricelist Approval."
                ))

            locked_fields = {
                'partner_id', 'product_id', 'product_tmpl_id', 'product_uom_id',
                'min_qty', 'price', 'currency_id', 'date_start', 'date_end', 'discount',
            }
            if locked_fields.intersection(vals.keys()):
                if any(rec.approval_state == 'to_approve' for rec in self):
                    raise UserError(_(
                        "Harga vendor yang sedang dalam proses approval ('Waiting Approval') "
                        "tidak boleh diubah."
                    ))
                is_manager = self.env.user.has_group(
                    'vit_vendor_pricelist_approval.group_vendor_pricelist_manager'
                )
                if not is_manager:
                    for rec in self:
                        if rec.approval_state == 'approved' and rec._get_approval_category():
                            raise UserError(_(
                                "Harga vendor yang sudah aktif pada kategori wajib approval "
                                "tidak boleh diubah secara manual. Buat Pricelist Approval baru."
                            ))

        return super().write(vals)

    def unlink(self):
        if not self.env.context.get('pricelist_approval_write'):
            if any(rec.approval_state == 'to_approve' for rec in self):
                raise UserError(_(
                    "Harga vendor yang sedang dalam proses approval ('Waiting Approval') "
                    "tidak boleh dihapus."
                ))
        return super().unlink()
