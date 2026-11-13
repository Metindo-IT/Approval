import json

from datetime import date

from odoo import Command

from odoo.addons.l10n_in.tests.common import L10nInTestInvoicingCommon
from odoo.addons.account_reports.tests.common import TestAccountReportsCommon
from odoo.tools import file_open


class L10nInTestAccountReportsCommon(TestAccountReportsCommon, L10nInTestInvoicingCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.test_date = date(2023, 5, 20)

        # === Companies === #
        cls.default_company.write({'l10n_in_gst_efiling_feature': True})
        cls.user.company_ids = [cls.default_company.id, cls.company_data_2['company'].id]

        # === Taxes === #
        cls.comp_igst_18 = cls.env['account.chart.template'].ref('igst_sale_18')

    @classmethod
    def _set_vals_and_post(cls, move, ref=None, line_vals=None, post=True):
        if ref:
            move.ref = ref

        if line_vals:
            move.write({'invoice_line_ids': [Command.update(line.id, line_vals) for line in move.line_ids]})

        if post:
            move.action_post()
        return move

    @classmethod
    def _init_inv(cls, move_type='out_invoice', company=None, ref=None, partner=None, taxes=None, invoice_date=None, products=None, line_vals=None, post=True):
        return cls._set_vals_and_post(
            move=cls.init_invoice(
                move_type,
                products=products or cls.product_a,
                invoice_date=invoice_date or cls.test_date,
                taxes=taxes,
                company=company or cls.default_company,
                partner=partner,
            ),
            ref=ref,
            line_vals=line_vals,
            post=post
        )

    @classmethod
    def _create_credit_note(cls, inv, ref=None, credit_note_date=None, line_vals=None, post=True):
        move = inv._reverse_moves()
        move.invoice_date = credit_note_date or cls.test_date

        return cls._set_vals_and_post(
            move=move,
            ref=ref,
            line_vals=line_vals,
            post=post
        )

    @classmethod
    def _create_debit_note(cls, inv, ref=None, debit_note_date=None, line_vals=None):
        move_debit_note_wiz = cls.env['account.debit.note'].with_context(
            active_model="account.move",
            active_ids=inv.ids
        ).create({
            'date': debit_note_date or cls.test_date,
            'reason': 'no reason',
            'copy_lines': True,
        })
        move_debit_note_wiz.create_debit()

        return cls._set_vals_and_post(move=inv.debit_note_ids[0], ref=ref, line_vals=line_vals)

    @classmethod
    def _read_mock_json(self, filename):
        """
        Reads a JSON file using Odoo's file_open and returns the parsed data.

        :param filename: The name of the JSON file to read.
        :return: Parsed JSON data.
        """
        # Use file_open to open the file from the module's directory
        with file_open(f"{self.test_module}/tests/mock_jsons/{filename}", 'rb') as file:
            data = json.load(file)

        return data
