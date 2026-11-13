# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models


class StockMove(models.Model):
    _inherit = 'stock.move'

    check_id = fields.One2many('quality.check', 'move_id')
    note = fields.Html('Note', related='check_id.note')
    worksheet_document = fields.Binary('Worksheet Image/PDF', compute='_compute_worksheet_document')
    worksheet_note = fields.Html('Worksheet description', related='check_id.workorder_id.operation_id.note')
    product_barcode = fields.Char(related='product_id.barcode')
    move_line_ids_picked = fields.One2many('stock.move.line', 'move_id', domain=[('picked', '=', True)])
    picking_type_prefill_shop_floor_lots = fields.Boolean(related='picking_type_id.prefill_shop_floor_lots')


    @api.depends('check_id.worksheet_document', 'check_id.source_document', 'check_id.workorder_id.operation_id.worksheet')
    def _compute_worksheet_document(self):
        for record in self:
            if record.check_id:
                record.worksheet_document = record.check_id.worksheet_document if record.check_id.source_document == "step" else record.check_id.workorder_id.operation_id.worksheet
            else:
                record.worksheet_document = None

    @api.depends('workorder_id')
    def _compute_manual_consumption(self):
        super()._compute_manual_consumption()
        for move in self:
            if move.product_id in move.workorder_id.check_ids.component_id and \
            move.product_id not in move.raw_material_production_id.workorder_ids.check_ids.component_id:
                move.manual_consumption = True

    def _should_bypass_set_qty_producing(self):
        production = self.raw_material_production_id or self.production_id
        if production and ((self.product_id in production.workorder_ids.quality_point_ids.component_id) or self.operation_id):
            return True
        return super()._should_bypass_set_qty_producing()

    def _action_assign(self, force_qty=False):
        res = super()._action_assign(force_qty=force_qty)
        for workorder in self.raw_material_production_id.workorder_ids:
            for check in workorder.check_ids:
                if check.test_type not in ('register_consumed_materials', 'register_byproducts'):
                    continue
                check.write(workorder._defaults_from_move(check.move_id))
        return res

    def action_show_details_quality_check(self):
        self.ensure_one()
        view = self.env.ref('mrp_workorder.view_stock_move_operations_quality_check')
        return {
            'name': (self.check_id.title or _('Detailed Operations')) + f' - {self.product_id.name}, {self.product_uom_qty} {self.product_uom.name}',
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'res_model': 'stock.move',
            'views': [(view.id, 'form')],
            'view_id': view.id,
            'target': 'new',
            'res_id': self.id,
            'context': dict(
                self.env.context,
                dialog_size='extra-large',
                active_mo_id=self.raw_material_production_id.id
            ),
        }

    @api.ondelete(at_uninstall=False)
    def _unlink_quality_check(self):
        self.env['quality.check'].search([('move_id', 'in', self.ids)]).unlink()

    def action_add_from_catalog_raw(self):
        mo = self.env['mrp.production'].browse(self.env.context.get('order_id'))
        return mo.with_context(child_field='move_raw_ids', from_shop_floor=self.env.context.get('from_shop_floor')).action_add_from_catalog()

    def action_pass(self, keep_hidden_lines=False):
        if not keep_hidden_lines:
            for record in self:
                if record.has_tracking != 'none' and not record.picking_type_id.prefill_shop_floor_lots:
                    # Remove any reserved smls that are hidden
                    record.move_line_ids.filtered(lambda ml: not ml.picked).unlink()
        for check in self.check_id:
            check.action_next()
        if not self.check_id:
            self.picked = True
        return True

    def add_lot_from_barcode(self, barcode):
        self.ensure_one()
        lot_id = self.env['stock.lot']
        if barcode != self.product_barcode: # Only search/create lot when not scanning the product barcode
            if self.product_id.tracking != 'none':
                lot_id = self.env['stock.lot'].search([('name', '=', barcode), ('product_id', '=', self.product_id.id)], limit=1)
                if not lot_id: # Create a new lot and create a sml with qty 1
                    lot_id = self.env['stock.lot'].with_context(active_mo_id=self.raw_material_production_id.id).create([{'name': barcode, 'product_id': self.product_id.id}])
                    self.env['stock.move.line'].create([{**self._prepare_move_line_vals(
                        quantity=self.product_id.uom_id._compute_quantity(1, self.product_uom)
                    ), 'lot_id': lot_id.id, 'picked': True}])
                    return # tracked product, new lot created
            else:
                return # untracked product but unknown barcode -> bail
        elif self.product_id.tracking != 'none':
            return # tracked product but non-lot barcode -> bail (as we don't know which lot/sn to update
        hide_unpicked = self.product_id.tracking != 'none' and not self.picking_type_prefill_shop_floor_lots
        if hide_unpicked:
            move_line = next((sml for sml in self.move_line_ids if sml.lot_id == lot_id and not sml.picked), False)
            if move_line:  # Set hidden reservation sml to picked to make it visible
                move_line.picked = True
                return
        move_line = next((sml for sml in self.move_line_ids if sml.lot_id == lot_id), False)
        if move_line and self.product_id.tracking == 'serial':
            return # Do not increase the qty of a serial move line as it can only be == 1
        available_qty = self.env['stock.quant']._get_available_quantity(self.product_id, self.location_id, lot_id)
        remaining_qty = self.product_qty - sum(sml.quantity_product_uom for sml in self.move_line_ids if not hide_unpicked or sml.picked)
        # Try to fill maximally with available, otherwise increase by 1
        qty_to_take = 1 if self.product_id.tracking == 'serial' else max(min(remaining_qty, available_qty), 1)
        if move_line:
            move_line.quantity += self.product_id.uom_id._compute_quantity(qty_to_take, self.product_uom)
        elif lot_id or self.product_id.tracking == 'none':
            self.env['stock.move.line'].create([{**self._prepare_move_line_vals(
                quantity=self.product_id.uom_id._compute_quantity(qty_to_take, self.product_uom)
            ), 'lot_id': lot_id.id if lot_id else False, 'picked': True}])

    def _visible_quantity(self):
        self.ensure_one()
        if self.env.context.get('hide_unpicked'):
            return sum(
                sml.product_uom_id._compute_quantity(sml.quantity, self.product_uom, rounding_method='HALF-UP')
                for sml in self.move_line_ids_picked
            )
        return super()._visible_quantity()
