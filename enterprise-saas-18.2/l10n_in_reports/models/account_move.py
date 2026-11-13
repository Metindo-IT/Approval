# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import contextlib
import json
import jwt
import re

from datetime import date, datetime
from markupsafe import Markup

from odoo import _, api, Command, fields, models, modules
from odoo.tools import split_every

from .irn_exception import IrnException

UOM_REF_MAP = {
    "CMS": "uom.product_uom_cm",
    "CBM": "uom.product_uom_cubic_meter",
    "DOZ": "uom.product_uom_dozen",
    "GMS": "uom.product_uom_gram",
    "KGS": "uom.product_uom_kgm",
    "KME": "uom.product_uom_km",
    "LTR": "uom.product_uom_litre",
    "MTR": "uom.product_uom_meter",
    "QTL": "uom.product_uom_yard",
    "SQF": "uom.product_uom_square_foot",
    "SQM": "uom.product_uom_square_meter",
    "TON": "uom.product_uom_ton",
    "UNT": "uom.product_uom_unit",
    "YDS": "uom.product_uom_yard",
}

MOVE_TYPE_MAPPING = {
    'INV': 'in_invoice',
    'CRN': 'in_refund',
    'DBN': 'in_invoice'
}

IRN_PATTERN = r'^[a-z0-9]{64}$'


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_in_transaction_type = fields.Selection(
        selection=[
            ("inter_state", "Inter State"),
            ("intra_state", "Intra State"),
        ],
        string="Indian Transaction Type",
        compute="_compute_l10n_in_transaction_type",
        store=True,
    )
    l10n_in_fetch_vendor_edi_feature_enabled = fields.Boolean(related='company_id.l10n_in_fetch_vendor_edi_feature')

    # gstr related fields
    l10n_in_exception = fields.Html("Exception")
    l10n_in_gst_return_period_id = fields.Many2one("l10n_in.gst.return.period", "GST Return Period")
    l10n_in_gstr2b_reconciliation_status = fields.Selection(selection=[
        ("pending", "Pending"),
        ("matched", "Fully Matched"),
        ("partially_matched", "Partially Matched"),
        ("exception", "Exception"),
        ("bills_not_in_gstr2", "Bills Not in GSTR-2"),
        ("gstr2_bills_not_in_odoo", "GSTR-2 Bills not in Odoo")],
        string="GSTR-2B Reconciliation",
        readonly=True,
        default="pending"
    )
    l10n_in_reversed_entry_warning = fields.Boolean('Display reversed entry warning', compute="_compute_l10n_in_reversed_entry_warning")
    l10n_in_irn_number = fields.Char('IRN Number', readonly=True)
    l10n_in_gstr_activate_einvoice_fetch = fields.Selection(related="company_id.l10n_in_gstr_activate_einvoice_fetch")
    l10n_in_gst_efiling_feature_enabled = fields.Boolean(related="company_id.l10n_in_gst_efiling_feature")

    @api.depends("country_code", "l10n_in_state_id", "company_id")
    def _compute_l10n_in_transaction_type(self):
        self.fetch(['country_code', 'l10n_in_state_id',"company_id"])
        for move in self:
            if move.country_code == "IN":
                if move.l10n_in_state_id and move.l10n_in_state_id == move.company_id.state_id:
                    move.l10n_in_transaction_type = 'intra_state'
                else:
                    move.l10n_in_transaction_type = 'inter_state'
            else:
                move.l10n_in_transaction_type = False

    @api.depends('move_type', 'reversed_entry_id', 'state', 'invoice_date', 'invoice_line_ids.tax_ids')
    def _compute_l10n_in_reversed_entry_warning(self):
        for move in self:
            if move.country_code == 'IN' and move.company_id.l10n_in_gst_efiling_feature and move.move_type == 'out_refund' and move.state == 'draft' and move.invoice_date and move.reversed_entry_id and move.invoice_line_ids.tax_ids:
                move.l10n_in_reversed_entry_warning = move.reversed_entry_id.invoice_date < move._l10n_in_get_fiscal_year_start_date(move.company_id, move.invoice_date)
            else:
                move.l10n_in_reversed_entry_warning = False

    def _l10n_in_get_fiscal_year_start_date(self, company, reversal_move_date):
        fiscal_year_start_month = (int(company.fiscalyear_last_month) % 12) + 1
        fiscal_year_start_date = date(reversal_move_date.year, fiscal_year_start_month, 1)
        if reversal_move_date.month <= 11:
            fiscal_year_start_date = fiscal_year_start_date.replace(year=reversal_move_date.year - 1)
        return fiscal_year_start_date

    def _post(self, soft=True):
        for invoice in self:
            if invoice.l10n_in_gstr2b_reconciliation_status == "gstr2_bills_not_in_odoo":
                invoice.l10n_in_gstr2b_reconciliation_status = "pending"
        return super(AccountMove, self)._post(soft=soft)

    def l10n_in_update_move_using_irn(self):
        """ Fetch the attachment from IRN and use it to update the invoice.

        If an appropriate attachment already exists, update the invoice with that attachment instead,
        reversing modifications to the invoice.

        :returns: action to refresh the form view.
        """
        context = {'active_id': self.ids, 'active_model': 'account.move'}
        self.env['l10n_in.gst.return.period'].with_context(context)._check_config(next_gst_action='fetch_irn_from_account_move', company=self.env.company)

        JSON_MIMETYPE = 'application/json'
        STATUS_CANCELLED = 'CNL'
        for move in self:
            # Filter valid JSON attachments
            attachment = move.attachment_ids.filtered(
                lambda a: a.mimetype == JSON_MIMETYPE and self._is_l10n_in_irn_json(a.raw)
            )[:1]
            if attachment:
                move._extend_with_attachments(attachment)
                continue
            try:
                # Retrieve IRN details if no valid attachment is found
                gov_json_data = self._l10n_in_retrieve_details_from_irn(move.l10n_in_irn_number, move.company_id)
            except IrnException as e:
                if str(e) == 'no-credit':
                    message = self._l10n_in_edi_get_iap_buy_credits_message()
                else:
                    message = str(e)
                move.message_post(
                    author_id=self.env.ref('base.partner_root').id,
                    body=Markup("Fetching IRN details failed with error(s):<br/> %s") % message
                )
                continue
            attachment = self.env['ir.attachment'].create({
                # Limit the name to 45 characters to avoid exceeding the limit on e-invoice portal
                'name': f'{move.l10n_in_irn_number[:45]}.json',
                'mimetype': JSON_MIMETYPE,
                'raw': json.dumps(gov_json_data),
                'res_model': 'account.move',
                'res_id': move.id,
            })
            move._extend_with_attachments(attachment, new=True)
            if gov_json_data.get('Status') == STATUS_CANCELLED and move.state != 'cancel':
                move.message_post(body=_("This bill has been marked as canceled based on the e-invoice status."))
                move.button_cancel()
        return {'type': 'ir.actions.act_window_close'}  # Refresh the form to show the key

    # ========================================
    # Cron Method
    # ========================================

    def _l10n_in_cron_update_with_irn(self, job_count=10):
        """ Update draft account moves with IRN details for Indian companies.

        :param job_count: the number of moves to process in each batch.
        """
        indian_companies = self.env['res.company'].search([
            ('account_fiscal_country_id.code', '=', 'IN'),
            ('l10n_in_fetch_vendor_edi_feature', '=', True),
        ])
        for indian_company in indian_companies:
            if indian_company._is_l10n_in_gstr_token_valid():
                domain = [
                    ('company_id', '=', indian_company.id),
                    ('state', '=', 'draft'),
                    ('company_id.l10n_in_gstr_activate_einvoice_fetch', '=', 'automatic'),
                    ('l10n_in_irn_number', '!=', False),
                    ('posted_before', '=', False),
                    ('line_ids', 'not any', [(1, '=', 1)]),
                ]
                moves = self.env['account.move'].search(domain)
                for move_batch in split_every(job_count, moves):
                    for move in move_batch:
                        move.l10n_in_update_move_using_irn()
                    if not modules.module.current_test:
                        self._cr.commit()

    # ========================================
    # Import Vendor Bills and Credit Notes
    # ========================================

    @api.model
    def _is_l10n_in_irn_json(self, content):
        """ Determine whether the given file content is a vendor bill JSON retrieved from IRN. """
        with contextlib.suppress(json.JSONDecodeError, UnicodeDecodeError):
            content = json.loads(content)
            return all(key in content for key in (
                'Irn', 'AckNo', 'AckDt', 'SignedInvoice', 'Status',
            ))

    def _get_edi_decoder(self, file_data, new=False):
        # EXTENDS 'account'
        if file_data['type'] == 'binary' and self._is_l10n_in_irn_json(file_data['content']):
            return self._l10n_in_irn_import_invoice
        return super()._get_edi_decoder(file_data, new=new)

    def _l10n_in_irn_import_invoice(self, invoice, data, is_new):
        """ Import invoice details from IRN data and update the corresponding invoice.

        Signed invoice data is decoded before being passed to the import function.

        :param invoice: the invoice record to be updated.
        :param data: dict representing the signed invoice attachment.
        :param is_new: indicates if the invoice is newly created.

        :returns: True if the import was successful, False if it fails.
        """
        try:
            # Load content from the data
            attachment_content = json.loads(data['content'])
            signed_invoice = attachment_content['SignedInvoice']
        except (json.JSONDecodeError, KeyError):
            return False
        # Decode the signed invoice using JWT
        try:
            decoded_data = jwt.decode(signed_invoice, options={'verify_signature': False})
            decoded_invoice_data = json.loads(decoded_data.get('data', '{}'))
        except (json.JSONDecodeError, jwt.exceptions.DecodeError):
            # Post a message on the invoice regarding the failure
            invoice.message_post(body="Failed to decode signed invoice.")
            return False
        # Update the invoice with decoded data
        with self._get_edi_creation() as self:
            return self._l10n_in_update_bill_with_irn_details(decoded_invoice_data)

    def _l10n_in_update_bill_with_irn_details(self, content):
        """ Update the invoice with details retrieved from IRN.

        :param content: dict representing all invoice details.

        :returns: True if the update was successful

        """
        def _get_tax(rate, tag):
            tax = self.env['account.tax'].search([
                ('type_tax_use', '=', 'purchase'),
                ('amount', '=', rate),
                '|', ('repartition_line_ids.tag_ids', 'in', tag),
                     ('children_tax_ids.repartition_line_ids.tag_ids', 'in', tag)
            ], limit=1)
            return tax

        bill_details = content['DocDtls']
        seller_details = content['SellerDtls']
        item_list = content['ItemList']
        value_details = content['ValDtls']
        trans_details = content['TranDtls']

        self.l10n_in_irn_number = content.get('Irn', False)
        self.move_type = {
            'INV': 'in_invoice',
            'CRN': 'in_refund',
            'DBN': 'in_invoice'
        }.get(bill_details.get('Typ'), 'in_invoice')

        # Find a partner if one exists, else create one
        if seller_details.get('Gstin'):
            seller_partner = self.env['res.partner'].search([
                ('vat', '=', seller_details['Gstin']),
            ], limit=1)
            if not seller_partner:
                partner_vals = self.env['res.partner']._l10n_in_get_partner_vals_by_vat(seller_details['Gstin'])
                if partner_vals:
                    seller_partner = self.env['res.partner'].create(partner_vals)
            self.partner_id = seller_partner

        if (bill_date := bill_details.get('Dt')):
            self.invoice_date = datetime.strptime(bill_date, '%d/%m/%Y').strftime('%Y-%m-%d')

        self.ref = bill_details.get('No')
        igst_tag_id = self.env.ref('l10n_in.tax_tag_igst')
        cgst_tag_id = self.env.ref('l10n_in.tax_tag_cgst')
        sgst_tag_id = self.env.ref('l10n_in.tax_tag_sgst')
        sgst_rc_tag_id = self.env.ref('l10n_in.tax_tag_sgst_rc')
        cgst_rc_tag_id = self.env.ref('l10n_in.tax_tag_cgst_rc')
        igst_rc_tag_id = self.env.ref('l10n_in.tax_tag_igst_rc')
        gst_tag_ids = cgst_tag_id + sgst_tag_id
        gst_rc_tag_ids = sgst_rc_tag_id + cgst_rc_tag_id

        uom_map = {
            irn_uom: self.env['ir.model.data']._xmlid_to_res_id(xmlid)
            for irn_uom, xmlid in UOM_REF_MAP.items()
        }

        invoice_lines = []
        other_charges = value_details.get('OthChrg', 0)
        cess_charges = 0
        not_mapped_tax_values = {}
        is_rcm_invoice = 1 if trans_details.get('RegRev') == "Y" else 0
        for item in item_list:
            line_dict = {}
            gst_rate = item.get('GstRt')

            if gst_rate:
                is_igst = bool(item.get('IgstAmt'))
                if is_rcm_invoice:
                    tax_tag_ids = igst_rc_tag_id.ids if is_igst else gst_rc_tag_ids.ids
                else:
                    tax_tag_ids = igst_tag_id.ids if is_igst else gst_tag_ids.ids

                applicable_tax = _get_tax(gst_rate, tax_tag_ids)
                if applicable_tax:
                    line_dict['tax_ids'] = [Command.link(applicable_tax.id)]
                else:
                    tax_key_base = (gst_rate, "IGST" if is_igst else "GST")
                    tax_amount = item.get('IgstAmt', 0) if is_igst else item.get('CgstAmt', 0) + item.get('SgstAmt', 0)
                    not_mapped_tax_values.setdefault(tax_key_base, 0)
                    not_mapped_tax_values[tax_key_base] += tax_amount
                    if is_rcm_invoice:
                        tax_key_rcm = tax_key_base + ("RC",)
                        not_mapped_tax_values.setdefault(tax_key_rcm, 0)
                        not_mapped_tax_values[tax_key_rcm] -= tax_amount

            line_dict['product_uom_id'] = uom_map.get(item.get('Unit'))
            # For service-type products where the quantity might be 0, therefore, replace 0 with 1 to ensure proper handling.
            quantity = item.get('Qty') or 1
            price_unit = item.get('UnitPrice')
            if price_unit:
                line_dict['discount'] = (item.get('Discount', 0.0) / item.get('TotAmt', 1.0)) * 100.0 if item.get('TotAmt') else 0.0
            else:
                # For service-type products where UnitPrice might be 0,
                # calculate and replace it with AssAmt divided by quantity to ensure accurate unit pricing and proper handling.
                price_unit = item.get('AssAmt', 0) / quantity
            invoice_lines.append(
                Command.create({
                    **line_dict,
                    'name': item.get('PrdDesc'),
                    'l10n_in_hsn_code': item.get('HsnCd'),
                    'quantity': quantity,
                    'price_unit': price_unit,
                })
            )
            other_charges += item.get('OthChrg', 0)
            cess_charges += sum(item.get(key, 0) for key in ['CesAmt', 'CesNonAdvlAmt', 'StateCesAmt', 'StateCesNonAdvlAmt'])

        # Create other charges line
        if other_charges:
            invoice_lines.append(Command.create({
                'name': "Other Charges",
                'price_unit': other_charges,
            }))
        # Create cess charges line
        if cess_charges:
            invoice_lines.append(Command.create({
                'name': "CESS Charges",
                'price_unit': cess_charges,
            }))
        # Create invoice lines for the grouped tax values
        for tax_group, tax_amount in not_mapped_tax_values.items():
            line_name = f"{tax_group[0]}% ({tax_group[1]}){' - Reverse Charge' if is_rcm_invoice else ''}"
            invoice_lines.append(Command.create({
                'name': line_name,
                'price_unit': tax_amount,
            }))
        # Create rounding value line
        if (rounding_amount := value_details.get('RndOffAmt')):
            invoice_lines.append(Command.create({
                'name': "Rounding Value",
                'price_unit': rounding_amount,
            }))
        # Create discount value line
        if (discount_amount := value_details.get('Discount')):
            invoice_lines.append(Command.create({
                'name': "Discount Value",
                'price_unit': discount_amount * -1,
            }))
        if self.invoice_line_ids:
            self.invoice_line_ids.unlink()
        self.invoice_line_ids = invoice_lines
        return True

    def _l10n_in_retrieve_details_from_irn(self, irn_number, company_id):
        """ Retrieve signed invoice details for a given IRN number via the IAP proxy service.

        :param irn_number: IRN number for which signed details are to be retrieved.
        :param company_id: company for which the request is made.

        :returns: dict containing signed IRN details.
        """
        response = self.env['l10n_in.gst.return.period']._request(
            url="/iap/l10n_in_reports/1/einvoice/irndtl",
            params={
                "irn_number": irn_number,
                "auth_token": company_id.sudo().l10n_in_gstr_gst_token,
            },
            company=company_id,
        )
        data = response.get('data', {}).get('data', {})
        if data and 'SignedInvoice' in data:
            return data
        errors = response.get('error', {})
        raise IrnException(errors)

    def _l10n_in_get_bill_from_irn(self, irn):
        bill_action = self.env['ir.actions.act_window']._for_xml_id('account.action_move_in_invoice_type')
        irn_lower = irn and irn.lower() or irn
        if not re.match(IRN_PATTERN, irn_lower):
            return super()._l10n_in_get_bill_from_irn(irn)
        if self.env.company.l10n_in_fetch_vendor_edi_feature and self.env.company.l10n_in_gstr_activate_einvoice_fetch in ('manual', 'automatic'):
            match_bill = self.env['account.move'].search([('l10n_in_irn_number', '=', irn_lower)], limit=1)
            if not match_bill:
                match_bill = self.env['account.move'].create({
                    'l10n_in_irn_number': irn_lower,
                    'move_type': 'in_invoice',
                })
                if self.env.company.l10n_in_gstr_activate_einvoice_fetch == "automatic":
                    match_bill.l10n_in_update_move_using_irn()
            bill_action['views'] = [(self.env.ref('account.view_move_form').id, 'form')]
            bill_action['res_id'] = match_bill.id
            return {'action': bill_action}

        return {'warning': _("To Get Bill by IRN First activate Fetch Vendor E-Invoiced Document in setting.")}

    # ===============================
    # QR Code Bill Scan Methods
    # ===============================

    @api.model
    def l10n_in_get_bill_from_qr_raw(self, qr_raw):
        try:
            qr_json = jwt.decode(qr_raw, options={'verify_signature': False})
        except jwt.exceptions.DecodeError:
            res = self._l10n_in_get_bill_from_irn(qr_raw)
            if res:
                return res
            return {'warning': _("Scanned QR/IRN it's not E-Invoice QR/IRN code. Please scan/enter E-invoice QR/IRN code")}
        qr_json_data = json.loads(qr_json.get('data', '{}'))
        is_valid = self._l10n_in_validate_qr_data(qr_json_data)
        if not is_valid:
            return {'warning': _("Scanned QR/IRN is not appropriate as per E-Invoice QR/IRN")}
        default_journal = self.env['account.journal'].search([
            ('type', '=', 'purchase'),
            ('company_id', '=', self.env.company.id)], limit=1)
        bill_action = self.env.ref('account.action_move_in_invoice_type')._get_action_dict()
        bill_action.update({
            'views': [[False, "form"]],
            'context': {
                'create': False, # If new button is clicked then below default values will be set again.
                'default_ref': qr_json_data.get('DocNo'),
                'default_l10n_in_irn_number': qr_json_data.get('Irn'),
                'default_journal_id': default_journal.id,
                'default_invoice_date': datetime.strptime(qr_json_data.get('DocDt'), "%d/%m/%Y"),
                'default_move_type': MOVE_TYPE_MAPPING.get(qr_json_data.get('DocTyp')),
                'default_partner_id': self._l10n_in_get_partner_from_gstin(qr_json_data.get('SellerGstin')),
                'default_invoice_line_ids': self.env.company.extract_single_line_per_tax and [
                    Command.create(self._l10n_in_get_move_lines_vals_from_qr_data(default_journal, qr_json_data))] or [],
            }
        })
        bill_action = {'action': bill_action}
        return bill_action

    @api.model
    def _l10n_in_get_move_lines_vals_from_qr_data(self, journal, qr_data):
        price_unit = qr_data.get('TotInvVal')
        move_line_vals = {
            'name': _('HSN: %s', qr_data.get('MainHsnCode')),
            'quantity': 1,
            'price_unit': price_unit,
            'account_id': journal.default_account_id.id,
        }
        products = self.env['product.product'].search([('l10n_in_hsn_code', '=', qr_data.get('MainHsnCode'))], limit=2)
        if products:
            taxes = products[0].supplier_taxes_id # Same HSN code -> same taxes
            if taxes:
                taxes_on_line = igst_taxes = taxes
                fiscal_position = self.env.ref(f'account.{self.env.company.id}_fiscal_position_in_inter_state', raise_if_not_found=False)
                if fiscal_position:
                    # The tax computation of taxes i.e. GST 5%, GST 18%, etc.
                    # the `total_exluded` value is computed incorrectly because of
                    # two sub-taxes i.e. SGST and CGST because the tax amount of the first tax
                    # is added to the next tax base value, it is better to use IGST for `total_exluded` value computation
                    igst_taxes = fiscal_position.map_tax(igst_taxes)
                    # If the supplier and the buyer are from different states then IGST will be applied
                    if qr_data.get('SellerGstin')[0:2] != qr_data.get('BuyerGstin')[0:2]:
                        taxes_on_line = igst_taxes
                computed_tax = igst_taxes.filtered(lambda tax: not any(tax.flatten_taxes_hierarchy().mapped('price_include'))
                    ).with_context(force_price_include=True).compute_all(price_unit=price_unit)
                move_line_vals.update({
                    'price_unit': computed_tax.get('total_excluded'),
                    'tax_ids': [Command.set(taxes_on_line.ids)],
                })
            if len(products) == 1:
                move_line_vals.update({'product_id': products.id})
        return move_line_vals

    def _l10n_in_get_partner_from_gstin(self, gstin):
        partner = self.env['res.partner']._retrieve_partner(vat=gstin)
        if partner:
            return partner.id
        partner_vals = self.env['res.partner']._l10n_in_get_partner_vals_by_vat(gstin)
        if partner_vals:
            partner = self.env['res.partner'].create(partner_vals)
            #read_by_vat method is not providing the state/country code
            #by using the following methods the state and country will set from the partner vat
            partner.onchange_vat()
            partner._onchange_state()
            return partner.id
        return False

    @api.model
    def _l10n_in_validate_qr_data(self, qr_data):
        return all(key in qr_data for key in ["DocNo", "SellerGstin", "TotInvVal", "DocDt", "DocTyp", "MainHsnCode"])
