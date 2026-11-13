# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from odoo import models, fields, _
from odoo.exceptions import UserError


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    l10n_in_gstr_gst_username = fields.Char(
        "GST username", related="company_id.l10n_in_gstr_gst_username", readonly=False
    )
    l10n_in_gstr_activate_einvoice_fetch = fields.Selection(
        related="company_id.l10n_in_gstr_activate_einvoice_fetch",
        readonly=False)
    l10n_in_gst_efiling_feature = fields.Boolean(related='company_id.l10n_in_gst_efiling_feature', readonly=False)
    l10n_in_fetch_vendor_edi_feature = fields.Boolean(related='company_id.l10n_in_fetch_vendor_edi_feature', readonly=False)
    l10n_in_enet_vendor_batch_payment_feature = fields.Boolean(related='company_id.l10n_in_enet_vendor_batch_payment_feature', readonly=False)
