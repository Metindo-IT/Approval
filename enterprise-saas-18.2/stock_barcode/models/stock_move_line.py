import re

from odoo import api, fields, models, _
from odoo.tools import frozendict
from odoo.addons.stock_barcode.models.epc_encoder import EpcScheme


class StockMoveLine(models.Model):
    _inherit = 'stock.move.line'

    product_barcode = fields.Char(related='product_id.barcode')
    formatted_product_barcode = fields.Char(compute="_compute_product_barcode")
    location_processed = fields.Boolean()
    dummy_id = fields.Char(compute='_compute_dummy_id', inverse='_inverse_dummy_id')
    parent_location_id = fields.Many2one('stock.location', compute='_compute_parent_location_id')
    parent_location_dest_id = fields.Many2one('stock.location', compute='_compute_parent_location_id')
    product_stock_quant_ids = fields.One2many('stock.quant', compute='_compute_product_stock_quant_ids')
    lot_properties = fields.Properties(related='lot_id.lot_properties', definition='product_id.lot_properties_definition', readonly=True)
    hide_lot_name = fields.Boolean(compute='_compute_hide_lot_name', default=True)
    hide_lot = fields.Boolean(compute='_compute_hide_lot_name', default=True)
    image_1920 = fields.Image(related="product_id.image_1920")
    product_reference_code = fields.Char(related="product_id.code", string="Product Reference Code")
    qty_done = fields.Float(compute='_compute_qty_done', inverse='_inverse_qty_done', digits='Product Unit')  # Dummy field
    electronic_product_code = fields.Char(compute='_compute_electronic_product_code')
    packaging_uom_id = fields.Many2one('uom.uom', related='move_id.packaging_uom_id', string='Packaging Unit of Measure')
    packaging_uom_qty = fields.Float(related='move_id.packaging_uom_qty', string='Packaging Quantity')

    @api.depends('tracking', 'picking_type_use_existing_lots', 'picking_type_use_create_lots', 'lot_name')
    def _compute_hide_lot_name(self):
        for line in self:
            if line.tracking not in ('lot', 'serial'):
                line.hide_lot_name = True
                line.hide_lot = True
                continue
            line.hide_lot_name = not line.picking_type_use_create_lots or (line.picking_type_use_existing_lots and not line.lot_name)
            line.hide_lot = not line.picking_type_use_existing_lots or (line.picking_type_use_create_lots and line.lot_name)

    @api.depends('picking_id')
    def _compute_parent_location_id(self):
        for line in self:
            line.parent_location_id = line.picking_id.location_id
            line.parent_location_dest_id = line.picking_id.location_dest_id

    @api.depends('product_id', 'parent_location_id')
    def _compute_product_stock_quant_ids(self):
        domain = [
            ('product_id', 'in', self.product_id.ids),
            ('company_id', 'in', self.env.companies.ids),
            ('location_id.usage', '=', 'internal'),
            ('quantity', '>', '0'),
            ('location_id', 'child_of', self.picking_id.location_id.ids),
        ]
        quant_ids = dict(self.env['stock.quant']._read_group(domain, groupby=['product_id'], aggregates=['id:recordset']))
        for line in self:
            line.product_stock_quant_ids = quant_ids.get(line.product_id, self.env['stock.quant'])

    def _compute_dummy_id(self):
        self.dummy_id = ''

    def _compute_qty_done(self):
        for line in self:
            line.qty_done = line.quantity if line.picked else 0

    @api.depends('product_barcode')
    def _compute_product_barcode(self):
        for line in self:
            line.formatted_product_barcode = f'[{line.product_barcode}]' if line.product_barcode else _('No Barcode')

    def _inverse_dummy_id(self):
        pass

    def _inverse_qty_done(self):
        for line in self.with_context({'preserve_state': True}):
            if line.qty_done:
                line.quantity = line.qty_done
            line.picked = line.qty_done > 0

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            # To avoid a write on `quantity` at the creation of the record (in the `qty_done`
            # inverse, when the line's move is not created yet), we set the `quantity` directly at
            # the creation and remove `qty_done` in the meantime.
            if 'qty_done' in vals:
                vals['quantity'] = vals['qty_done']
                vals['picked'] = vals['qty_done'] > 0
                del vals['qty_done']
                # Also delete the default value in the context.
                self.env.context = frozendict({k: v for k, v in self.env.context.items() if k != 'default_qty_done'})
        return super().create(vals_list)

    def _get_fields_stock_barcode(self):
        return [
            'product_id',
            'product_category_name',
            'location_id',
            'location_dest_id',
            'move_id',
            'qty_done',
            'quantity',
            'display_name',
            'product_uom_id',
            'product_barcode',
            'owner_id',
            'lot_id',
            'lot_name',
            'package_id',
            'result_package_id',
            'dummy_id',
            'picked',
            'move_id',
            'packaging_uom_id',
            'packaging_uom_qty',
        ]

    def _compute_electronic_product_code(self):
        movelines_per_product = self.grouped('product_id')
        epc_sequence = self.env['ir.sequence'].search([('code', '=', 'stock_barcode.epc.serial')], limit=1)
        for product_id, move_line_ids in movelines_per_product.items():
            if not product_id.barcode:
                move_line_ids.electronic_product_code = self.env._("Error: We can't generate an Electronic Product Code for a product without a barcode.")
                continue
            if not re.match(r"^\d+$", product_id.barcode):  # length and check digit do not matter
                move_line_ids.electronic_product_code = self.env._("Error: The product barcode is not a valid Global Trade Item Number, we can't generate an Electronic Product Code for it.")
                continue
            if product_id.tracking == 'none':
                alphanumeric_tracking = False
                start_number = int(epc_sequence.next_by_id())
                tracking_number_list = [i for i in range(start_number, start_number + len(move_line_ids), 1)]
                epc_sequence.write({'number_next_actual': start_number + len(move_line_ids)})
            else:
                tracking_number_list = [m.lot_id.name if m.lot_id else m.lot_name for m in move_line_ids if m.lot_id or m.lot_name]
                if len(tracking_number_list) == 0:
                    move_line_ids.electronic_product_code = self.env._("Error: We can't generate an Electronic Product Code for a tracked product without a tracking number.")
                    continue
                alphanumeric_tracking = any(re.search(r'[^\d]', tracking_number) for tracking_number in tracking_number_list)
            # NOTE: In the future, obtain the filter & company prefix length rather than providing them explicitly
            gtin = product_id.barcode
            filter_value = 1 # POS Item
            company_prefix_length = 7
            scheme_name, field_name = ('sgtin-198', 'serial_string') if alphanumeric_tracking else ('sgtin-96', 'serial_integer')
            scheme = EpcScheme(scheme_name)
            element_string = f"(01) {gtin} (21) {tracking_number_list[0]}"
            try:
                move_line_ids[0].electronic_product_code = scheme.encode(element_string, filter_value, company_prefix_length)
            except Exception as e:
                # When an error is explicitely returned as an exception, we can't generate an EPC for the whole product, so we skip other tracking numbers
                move_line_ids.electronic_product_code = str(e)
                continue
            # Since we operate on a single product, we can reuse the base encoding for all the tracking numbers to fasten the process
            for i in range(1, len(move_line_ids)):
                tracking_number = tracking_number_list[i]
                move_line_ids[i].electronic_product_code = scheme.encode_partial(field_name, tracking_number)
