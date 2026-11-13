from odoo import models, api


class IrUiView(models.Model):
    _name = 'ir.ui.view'
    _inherit = 'ir.ui.view'

    @api.model
    def _load_pos_data_fields(self, config_id):
        return ['id', 'name']

    def _load_pos_data(self, data):
        return [{
            "id": self.env.ref('pos_settle_due.customer_due_pos_order_list_view').id,
            "name": "customer_due_pos_order_list_view",
        }]

    def _post_read_pos_data(self, data):
        return data

    def _read_pos_record(self, ids, config_id):
        fields = self._load_pos_data_fields(self.id)
        return self.browse(ids).read(fields, load=False)
