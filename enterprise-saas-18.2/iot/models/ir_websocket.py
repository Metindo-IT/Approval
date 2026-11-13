import secrets

from odoo import models


class IrWebsocket(models.AbstractModel):
    _inherit = 'ir.websocket'

    def _subscribe(self, data):
        mac_address = data.get("mac_address")
        if mac_address:
            iot_box = self.env["iot.box"].sudo().search([("identifier", "=", mac_address)], limit=1)
            if iot_box:
                iot_box.is_websocket_active = True
        return super()._subscribe(data)


class IotChannel(models.AbstractModel):
    _name = 'iot.channel'
    _description = "The Websocket Iot Channel"

    SYSTEM_PARAMETER_KEY = 'iot.ws_channel'

    def _create_channel_if_not_exist(self):
        iot_channel = f'iot_channel-{secrets.token_hex(16)}'
        self.env['ir.config_parameter'].sudo().set_param(self.SYSTEM_PARAMETER_KEY, iot_channel)
        return iot_channel

    def get_iot_channel(self, check=False):
        """
        Get the IoT channel name.
        To facilitate multi-company, the channel is unique for every company and IoT

        :param check: If False, it will force to return the channel name even if it is unused.
        """
        if (self.env.is_system() or self.env.user._is_internal()) and (not check or self.update_is_open()):
            iot_channel_key_value = self.env['ir.config_parameter'].sudo().get_param(self.SYSTEM_PARAMETER_KEY)
            return iot_channel_key_value or self._create_channel_if_not_exist()
        return ''

    def update_is_open(self):
        """
        Wherever the IoT Channel should be open or not.
        For performance reasons, we only open the channel if there is at least one IoT device with a report set.

        :return: True if the channel should be open, False otherwise
        """
        is_open = bool(self.env['iot.device'].search_count([('report_ids', '!=', False)], limit=1))
        if not is_open:
            self.env["iot.box"].search([]).write({"is_websocket_active": False})
        return is_open
