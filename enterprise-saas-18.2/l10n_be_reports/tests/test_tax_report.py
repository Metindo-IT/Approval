# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command, fields
from odoo.addons.account_reports.tests.account_sales_report_common import AccountSalesReportCommon
from odoo.tests import tagged
from freezegun import freeze_time
from unittest.mock import patch


@tagged('post_install_l10n', 'post_install', '-at_install')
class BelgiumTaxReportTest(AccountSalesReportCommon):

    @classmethod
    @AccountSalesReportCommon.setup_country('be')
    def setUpClass(cls):
        super().setUpClass()
        cls.company.update({
            'vat': 'BE0477472701',
        })

    @freeze_time('2019-12-31')
    def test_generate_xml_minimal(self):
        company = self.env.company
        report = self.env.ref('l10n_be.tax_report_vat')
        options = report.get_options({})

        # The partner id is changing between execution of the test so we need to append it manually to the reference.
        ref = str(company.partner_id.id) + '112019'

        # This is the minimum expected from the belgian tax report xml.
        # As no values are in the report, we only find the grid 71 which is always expected to be present.
        expected_xml = """
        <ns2:VATConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/VATConsignment" VATDeclarationsNbr="1">
            <ns2:VATDeclaration SequenceNumber="1" DeclarantReference="%s">
                <ns2:Declarant>
                    <VATNumber xmlns="http://www.minfin.fgov.be/InputCommon">0477472701</VATNumber>
                    <Name>company_1_data</Name>
                    <Street></Street>
                    <PostCode></PostCode>
                    <City></City>
                    <CountryCode>BE</CountryCode>
                    <EmailAddress>jsmith@mail.com</EmailAddress>
                    <Phone>+32475123456</Phone>
                </ns2:Declarant>
                <ns2:Period>
                    <ns2:Month>11</ns2:Month>
                    <ns2:Year>2019</ns2:Year>
                </ns2:Period>
                <ns2:Data>
                    <ns2:Amount GridNumber="71">0.00</ns2:Amount>
                </ns2:Data>
                <ns2:ClientListingNihil>NO</ns2:ClientListingNihil>
                <ns2:Ask Restitution="NO"/>
                <ns2:Comment>/</ns2:Comment>
            </ns2:VATDeclaration>
        </ns2:VATConsignment>
        """ % ref

        self.assertXmlTreeEqual(
            self.get_xml_tree_from_string(self.env[report.custom_handler_model_name].export_tax_report_to_xml(options)['file_content']),
            self.get_xml_tree_from_string(expected_xml)
        )

    @freeze_time('2019-12-31')
    def test_generate_xml_minimal_with_comment(self):
        company = self.env.company
        report = self.env.ref('l10n_be.tax_report_vat')
        options = report.get_options({})
        options['comment'] = "foo"

        ref = str(company.partner_id.id) + '112019'

        # This is the minimum expected from the belgian tax report xml.
        # As no values are in the report, we only find the grid 71 which is always expected to be present.
        expected_xml = """
               <ns2:VATConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/VATConsignment" VATDeclarationsNbr="1">
                   <ns2:VATDeclaration SequenceNumber="1" DeclarantReference="%s">
                       <ns2:Declarant>
                           <VATNumber xmlns="http://www.minfin.fgov.be/InputCommon">0477472701</VATNumber>
                           <Name>company_1_data</Name>
                           <Street></Street>
                           <PostCode></PostCode>
                           <City></City>
                           <CountryCode>BE</CountryCode>
                           <EmailAddress>jsmith@mail.com</EmailAddress>
                           <Phone>+32475123456</Phone>
                       </ns2:Declarant>
                       <ns2:Period>
                           <ns2:Month>11</ns2:Month>
                           <ns2:Year>2019</ns2:Year>
                       </ns2:Period>
                       <ns2:Data>
                           <ns2:Amount GridNumber="71">0.00</ns2:Amount>
                       </ns2:Data>
                       <ns2:ClientListingNihil>NO</ns2:ClientListingNihil>
                       <ns2:Ask Restitution="NO"/>
                       <ns2:Comment>foo</ns2:Comment>
                   </ns2:VATDeclaration>
               </ns2:VATConsignment>
               """ % ref

        self.assertXmlTreeEqual(
            self.get_xml_tree_from_string(
                self.env[report.custom_handler_model_name].export_tax_report_to_xml(options)['file_content']),
            self.get_xml_tree_from_string(expected_xml)
        )

    @freeze_time('2019-12-31')
    def test_generate_xml_minimal_with_representative(self):
        company = self.env.company
        report = self.env.ref('l10n_be.tax_report_vat')
        options = report.get_options({})

        # Create a new partner for the representative and link it to the company.
        representative = self.env['res.partner'].create({
            'company_type': 'company',
            'name': 'Fidu BE',
            'street': 'Fidu Street 123',
            'city': 'Brussels',
            'zip': '1000',
            'country_id': self.env.ref('base.be').id,
            'vat': 'BE0477472701',
            'phone': '+32470123456',
            'email': 'info@fidu.be',
        })
        company.account_representative_id = representative.id

        # The partner_id is changing between execution of the test so we need to append it manually to the reference.
        ref = str(company.partner_id.id) + '112019'

        # This is the minimum expected from the belgian tax report XML.
        # Only the representative node has been added to make sure it appears in the XML.
        expected_xml = """
            <ns2:VATConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/VATConsignment" VATDeclarationsNbr="1">
                <ns2:Representative>
                    <RepresentativeID identificationType="NVAT" issuedBy="BE">0477472701</RepresentativeID>
                    <Name>Fidu BE</Name>
                    <Street>Fidu Street 123</Street>
                    <PostCode>1000</PostCode>
                    <City>Brussels</City>
                    <CountryCode>BE</CountryCode>
                    <EmailAddress>info@fidu.be</EmailAddress>
                    <Phone>+32470123456</Phone>
                </ns2:Representative>
                <ns2:VATDeclaration SequenceNumber="1" DeclarantReference="%s">
                    <ns2:Declarant>
                        <VATNumber xmlns="http://www.minfin.fgov.be/InputCommon">0477472701</VATNumber>
                        <Name>company_1_data</Name>
                        <Street></Street>
                        <PostCode></PostCode>
                        <City></City>
                        <CountryCode>BE</CountryCode>
                        <EmailAddress>jsmith@mail.com</EmailAddress>
                        <Phone>+32475123456</Phone>
                    </ns2:Declarant>
                    <ns2:Period>
                        <ns2:Month>11</ns2:Month>
                        <ns2:Year>2019</ns2:Year>
                    </ns2:Period>
                    <ns2:Data>
                        <ns2:Amount GridNumber="71">0.00</ns2:Amount>
                    </ns2:Data>
                    <ns2:ClientListingNihil>NO</ns2:ClientListingNihil>
                    <ns2:Ask Restitution="NO"/>
                    <ns2:Comment>/</ns2:Comment>
                </ns2:VATDeclaration>
            </ns2:VATConsignment>
            """ % ref

        self.assertXmlTreeEqual(
            self.get_xml_tree_from_string(self.env[report.custom_handler_model_name].export_tax_report_to_xml(options)['file_content']),
            self.get_xml_tree_from_string(expected_xml)
        )

    @freeze_time('2019-12-31')
    def test_generate_xml(self):
        company = self.env.company
        first_tax = self.env['account.tax'].search([('name', '=', '21% M'), ('company_id', '=', self.company_data['company'].id)], limit=1)
        second_tax = self.env['account.tax'].search([('name', '=', '21% M.Cocont'), ('company_id', '=', self.company_data['company'].id)], limit=1)

        # Create and post a move with two move lines to get some data in the report
        move = self.env['account.move'].create({
            'move_type': 'in_invoice',
            'journal_id': self.company_data['default_journal_purchase'].id,
            'partner_id': self.partner_a.id,
            'invoice_date': '2019-11-12',
            'date': '2019-11-12',
            'invoice_line_ids': [(0, 0, {
                'product_id': self.product_a.id,
                'quantity': 1.0,
                'name': 'product test 1',
                'price_unit': 100,
                'tax_ids': first_tax.ids,
            }), (0, 0, {
                'product_id': self.product_b.id,
                'quantity': 1.0,
                'name': 'product test 2',
                'price_unit': 50,
                'tax_ids': second_tax.ids,
            })]
        })
        move.action_post()

        report = self.env.ref('l10n_be.tax_report_vat')
        options = report.get_options({})

        # The partner id is changing between execution of the test so we need to append it manually to the reference.
        ref = str(company.partner_id.id) + '112019'

        expected_xml = """
        <ns2:VATConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/VATConsignment" VATDeclarationsNbr="1">

            <ns2:VATDeclaration SequenceNumber="1" DeclarantReference="%s">
                <ns2:Declarant>
                    <VATNumber xmlns="http://www.minfin.fgov.be/InputCommon">0477472701</VATNumber>
                    <Name>company_1_data</Name>
                    <Street></Street>
                    <PostCode></PostCode>
                    <City></City>
                    <CountryCode>BE</CountryCode>
                    <EmailAddress>jsmith@mail.com</EmailAddress>
                    <Phone>+32475123456</Phone>
                </ns2:Declarant>
                <ns2:Period>
                    <ns2:Month>11</ns2:Month>
                    <ns2:Year>2019</ns2:Year>
                </ns2:Period>
                <ns2:Data>
                    <ns2:Amount GridNumber="56">10.50</ns2:Amount>
                    <ns2:Amount GridNumber="59">31.50</ns2:Amount>
                    <ns2:Amount GridNumber="72">21.00</ns2:Amount>
                    <ns2:Amount GridNumber="81">150.00</ns2:Amount>
                    <ns2:Amount GridNumber="87">50.00</ns2:Amount>
                </ns2:Data>
                <ns2:ClientListingNihil>NO</ns2:ClientListingNihil>
                <ns2:Ask Restitution="NO"/>
                <ns2:Comment>/</ns2:Comment>
            </ns2:VATDeclaration>
        </ns2:VATConsignment>
        """ % ref

        self.assertXmlTreeEqual(
            self.get_xml_tree_from_string(self.env['l10n_be.tax.report.handler'].export_tax_report_to_xml(options)['file_content']),
            self.get_xml_tree_from_string(expected_xml)
        )

    @freeze_time('2019-12-31')
    def test_generate_xml_vat_unit(self):
        company = self.env.company
        company_2 = self.company_data_2['company']
        unit_companies = company + company_2

        company_2.currency_id = company.currency_id

        tax_unit = self.env['account.tax.unit'].create({
            'name': "One unit to rule them all",
            'country_id': company.country_id.id,
            'vat': "BE0477472701",
            'company_ids': [Command.set(unit_companies.ids)],
            'main_company_id': company.id,
        })

        first_tax = self.env['account.tax'].search([('name', '=', '21% M'), ('company_id', '=', self.company_data['company'].id)], limit=1)
        second_tax = self.env['account.tax'].search([('name', '=', '21% M.Cocont'), ('company_id', '=', self.company_data['company'].id)], limit=1)

        # Create and post a move with two move lines to get some data in the report
        move = self.env['account.move'].create({
            'move_type': 'in_invoice',
            'journal_id': self.company_data['default_journal_purchase'].id,
            'partner_id': self.partner_a.id,
            'invoice_date': '2019-11-12',
            'date': '2019-11-12',
            'invoice_line_ids': [(0, 0, {
                'product_id': self.product_a.id,
                'quantity': 1.0,
                'name': 'product test 1',
                'price_unit': 100,
                'tax_ids': first_tax.ids,
            }), (0, 0, {
                'product_id': self.product_b.id,
                'quantity': 1.0,
                'name': 'product test 2',
                'price_unit': 50,
                'tax_ids': second_tax.ids,
            })]
        })
        move.action_post()

        report = self.env.ref('l10n_be.tax_report_vat')
        options = report.get_options({})
        options['tax_unit'] = tax_unit.id

        # The partner id is changing between execution of the test so we need to append it manually to the reference.
        ref = str(company.partner_id.id) + '112019'

        expected_xml = """
        <ns2:VATConsignment xmlns="http://www.minfin.fgov.be/InputCommon" xmlns:ns2="http://www.minfin.fgov.be/VATConsignment" VATDeclarationsNbr="1">

            <ns2:VATDeclaration SequenceNumber="1" DeclarantReference="%s">
                <ns2:Declarant>
                    <VATNumber xmlns="http://www.minfin.fgov.be/InputCommon">0477472701</VATNumber>
                    <Name>company_1_data</Name>
                    <Street></Street>
                    <PostCode></PostCode>
                    <City></City>
                    <CountryCode>BE</CountryCode>
                    <EmailAddress>jsmith@mail.com</EmailAddress>
                    <Phone>+32475123456</Phone>
                </ns2:Declarant>
                <ns2:Period>
                    <ns2:Month>11</ns2:Month>
                    <ns2:Year>2019</ns2:Year>
                </ns2:Period>
                <ns2:Data>
                    <ns2:Amount GridNumber="00">0.00</ns2:Amount>
                    <ns2:Amount GridNumber="56">10.50</ns2:Amount>
                    <ns2:Amount GridNumber="59">31.50</ns2:Amount>
                    <ns2:Amount GridNumber="72">21.00</ns2:Amount>
                    <ns2:Amount GridNumber="81">150.00</ns2:Amount>
                    <ns2:Amount GridNumber="87">50.00</ns2:Amount>
                </ns2:Data>
                <ns2:ClientListingNihil>NO</ns2:ClientListingNihil>
                <ns2:Ask Restitution="NO"/>
                <ns2:Comment>/</ns2:Comment>
            </ns2:VATDeclaration>
        </ns2:VATConsignment>
        """ % ref
        self.assertXmlTreeEqual(
            self.get_xml_tree_from_string(self.env[report.custom_handler_model_name].export_tax_report_to_xml(options)['file_content']),
            self.get_xml_tree_from_string(expected_xml)
        )

    @freeze_time('2025-01-18')
    def test_generate_ec_sales_list_activity(self):
        fiscal_position = self.env['account.fiscal.position'].search([
            *self.env['account.fiscal.position']._check_company_domain(self.company),
            ('name', '=', 'Intra-Community'),
        ], limit=1)

        test_partner = self.env['res.partner'].create({
            'name': 'Test Partner',
            'country_id': self.env.ref('base.fr').id,
            'vat': 'FR51306138900',
            'property_account_position_id': fiscal_position.id,
        })

        invoice = self.env['account.move'].create({
            'partner_id': test_partner.id,
            'move_type': 'out_invoice',
            'invoice_date': fields.Date.today(),
            'invoice_line_ids': [
                Command.create({
                    'name': 'Goods',
                    'price_unit': 5000, # Has to be over 250 to be considered as an EC sale
                    'quantity': 1,
                    'tax_ids': self.env['account.tax'].search([
                        ('amount', '=', 0),
                        ('type_tax_use', '=', 'sale'),
                        ('company_id', '=', self.company.id),
                    ]).ids,
                })
            ],
        })
        invoice.action_post()

        report = self.env.ref('l10n_be.tax_report_vat')

        closing_entry = (
            self.env['account.generic.tax.report.handler']
            .with_context({'override_tax_closing_warning': True})
            ._get_periodic_vat_entries(
                report.get_options({'date': {'mode': 'range', 'filter': 'this_month'}})
            )
        )

        action = closing_entry.action_post()

        with patch.object(self.env.registry['account.move'], '_get_vat_report_attachments', autospec=True, side_effect=lambda *args, **kwargs: []):
            closing_entry.with_context(action.get('context')).action_post()

        self.assertEqual(
            self.env['mail.activity'].search_count([
                ('res_id', '=', closing_entry.id),
                ('activity_type_id', '=', self.env.ref('l10n_be_reports.ec_sales_list_activity').id),
            ]),
            1
        )
