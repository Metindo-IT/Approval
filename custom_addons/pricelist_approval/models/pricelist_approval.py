from odoo import models, fields, api

class PricelistApproval(models.Model):
    _name = 'pricelist.approval'
    _description = 'Pricelist Approval'

    name = fields.Char(string='Reference', required=True, default='New')
    pricelist_id = fields.Many2one('product.pricelist', string='Pricelist Tujuan', required=True)
    product_tmpl_id = fields.Many2one('product.template', string='Produk', required=True)
    proposed_price = fields.Float(string='Harga Pengajuan', required=True)
    
    state = fields.Selection([
        ('draft', 'Draft'),
        ('waiting', 'Menunggu Cek Marketing'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected')
    ], string='Status', default='draft')

    def action_submit(self):
        for rec in self:
            rec.state = 'waiting'

    def action_approve(self):
        for rec in self:
            # Otomatis membuat harga di Pricelist Odoo
            self.env['product.pricelist.item'].create({
                'pricelist_id': rec.pricelist_id.id,
                'product_tmpl_id': rec.product_tmpl_id.id,
                'fixed_price': rec.proposed_price,
                'applied_on': '1_product',
            })
            rec.state = 'approved'

    def action_reject(self):
        for rec in self:
            rec.state = 'rejected'