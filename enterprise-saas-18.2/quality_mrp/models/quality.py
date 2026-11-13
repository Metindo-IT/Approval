# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class QualityPoint(models.Model):
    _inherit = "quality.point"

    @api.model
    def _get_domain_for_production(self, quality_points_domain):
        return quality_points_domain

    @api.constrains('measure_on', 'picking_type_ids')
    def _check_measure_on(self):
        for point in self:
            if point.measure_on == 'move_line' and any(pt.code == 'mrp_operation' for pt in point.picking_type_ids):
                raise UserError(_("The Quantity quality check type is not possible with manufacturing operation types."))


class QualityCheck(models.Model):
    _inherit = "quality.check"

    production_id = fields.Many2one(
        'mrp.production', 'Production Order', check_company=True)

    def _compute_qty_line(self):
        record_without_production = self.env['quality.check']
        for qc in self:
            if qc.production_id:
                qc.qty_line = qc.production_id.qty_producing
            else:
                record_without_production |= qc
        return super(QualityCheck, record_without_production)._compute_qty_line()

    def _can_move_to_failure_location(self):
        self.ensure_one()
        if self.production_id and self.quality_state == 'fail':
            return True
        return super()._can_move_to_failure_location()

    def _move_to_failure_location_operation(self, failure_location_id):
        self.ensure_one()
        if self.production_id and failure_location_id:
            self.production_id.location_dest_id = failure_location_id
            self.failure_location_id = failure_location_id
        return super()._move_to_failure_location_operation(failure_location_id)

    def _move_to_failure_location_product(self, failure_location_id):
        self.ensure_one()
        if self.production_id and failure_location_id:
            self.production_id.move_finished_ids.filtered(
                lambda m: m.product_id == self.product_id
            ).location_dest_id = failure_location_id
        self.failure_location_id = failure_location_id
        return super()._move_to_failure_location_product(failure_location_id)


class QualityAlert(models.Model):
    _inherit = "quality.alert"

    production_id = fields.Many2one(
        'mrp.production', "Production Order", check_company=True)
