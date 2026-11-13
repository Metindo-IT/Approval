from odoo import models, fields, api, _


class Pos_Preparation_DisplayOrder(models.Model):
    _inherit = 'pos_preparation_display.order'

    pos_table_id = fields.Many2one('restaurant.table')
    pos_course_id = fields.Many2one('restaurant.order.course')

    @api.model_create_multi
    def create(self, vals_list):
        course_id = self._context.get('po_course_id', None)
        if course_id:
            for vals in vals_list:
                if not vals.get('pos_course_id', None):
                    vals['pos_course_id'] = course_id
        return super().create(vals_list)

    def _export_for_ui(self, preparation_display):
        order_for_ui = super()._export_for_ui(preparation_display)

        if order_for_ui:
            order_for_ui['customer_count'] = self.pos_order_id.customer_count
            order_for_ui['table'] = {
                'id': self.pos_order_id.table_id.id,
                'seats': self.pos_order_id.table_id.seats,
                'table_number': self.pos_order_id.table_id.table_number,
                'color': self.pos_order_id.table_id.color,
            }
            if self.pos_course_id:
                order_for_ui['course'] = {
                    'index': self.pos_course_id.index,
                    'fired': self.pos_course_id.fired,
                    'fired_date': self.pos_course_id.fired_date,
                }
            order_for_ui['floating_order_name'] = self.pos_order_id.floating_order_name

        return order_for_ui

    def _get_preparation_order_values(self, order):
        order_to_create = super()._get_preparation_order_values(order)

        if order.get('pos_table_id'):
            order_to_create['pos_table_id'] = order['pos_table_id']

        return order_to_create

    @api.model
    def process_order(self, order_id, options={}):
        order = self.env['pos.order'].browse(order_id)

        if options.get('cancelled') or not order.course_ids or not order:
            return super().process_order(order_id, options)

        reload_display = False
        category_ids = []
        course_updated_notifications = []
        fired_course_id = options.get('fired_course_id')

        for course_id in order.course_ids:
            course_lines_uuids = course_id.line_ids.mapped(lambda l: l.uuid)
            course_already_fired = (course_id.fired and
                                    self.env['pos_preparation_display.order'].search([('pos_order_id', '=', order.id), ('pos_course_id', '=', course_id.id)], limit=1))
            order_line_filer = lambda line_uuid: line_uuid in course_lines_uuids
            changes = order.with_context(ppc_order_line_filter=order_line_filer, po_course_id=course_id.id)._process_preparation_changes(options)

            if changes.get('change'):
                category_ids += course_id.line_ids.product_id.pos_categ_ids.ids
                reload_display = True

            if changes.get('order_added') and course_already_fired:
                course_updated_notifications.append({
                    'category_ids': changes.get('category_ids'),
                    'notification': _("Course %s Updated", str(course_id.index))
                })

        if order and order.table_id:
            old_orders = self.env['pos_preparation_display.order'].search([('id', '=', order_id), ('pos_table_id', '!=', order.table_id.id)])
            for o in old_orders:
                o.pos_table_id = order.table_id

        if reload_display or fired_course_id:
            course = self.env['restaurant.order.course'].browse(fired_course_id)
            category_ids += course.line_ids.product_id.pos_categ_ids.ids
            preparation_display = self._search_preparation_displays({'category_ids': category_ids}, order)
            for display in preparation_display:
                display._send_load_orders_message(sound=True)

        if fired_course_id and any([c.id == fired_course_id for c in order.course_ids]):
            course = self.env['restaurant.order.course'].browse(fired_course_id)
            category_ids = course.line_ids.product_id.pos_categ_ids.ids
            self._send_notification_to_preparation_displays(order, {
                'category_ids': category_ids,
                'notification': _("Course %s Fired", str(course.index))
            })

        for notification in course_updated_notifications:
            self._send_notification_to_preparation_displays(order, notification)

        return True

    def _get_order_name(self):
        order = self.pos_order_id
        if order.session_id.config_id.module_pos_restaurant:
            if order.table_id:
                name = self._get_table_name(order.table_id)
                if self.pos_course_id:
                    name += f" - C{self.pos_course_id.index}"
                return name
            elif order.floating_order_name:
                return order.floating_order_name
            else:
                return _("Direct Sale")

        return super()._get_order_name()

    @api.model
    def _get_table_name(self, table):
        if not table:
            return ""
        name = f"T{table.table_number}"
        if table.parent_id:
            name += f" &{table.parent_id.table_number}"
        return name
