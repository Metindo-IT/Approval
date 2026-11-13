from odoo import api, models


class L10nKeOSCUCode(models.Model):
    _name = 'l10n_ke_edi_oscu.code'
    _inherit = 'l10n_ke_edi_oscu.code'

    def _load_pos_data(self, data):
        domain = []
        fields = self._load_pos_data_fields(data['pos.config'][0]['id'])
        data = self.search_read(domain, fields, load=False)
        return data

    @api.model
    def _load_pos_data_fields(self, config_id):
        return ['code_type']

    def _post_read_pos_data(self, data):
        return data

    def _read_pos_record(self, ids, config_id):
        fields = self._load_pos_data_fields(self.id)
        return self.browse(ids).read(fields, load=False)
