# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
from datetime import datetime
from json import dumps
from pprint import pformat

from odoo import models, fields, _, api
from odoo.addons.iap.tools.iap_tools import iap_jsonrpc
from odoo.addons.l10n_br_avatax.models.product_template import USE_TYPE_SELECTION
from odoo.exceptions import UserError, ValidationError, RedirectWarning
from odoo.tools import format_list, partition
from odoo.tools.float_utils import float_round, json_float_round

logger = logging.getLogger(__name__)

IAP_SERVICE_NAME = 'l10n_br_avatax_proxy'
DEFAULT_IAP_ENDPOINT = 'https://l10n-br-avatax.api.odoo.com'
DEFAULT_IAP_TEST_ENDPOINT = 'https://l10n-br-avatax.test.odoo.com'
ICP_LOG_NAME = 'l10n_br_avatax.log.end.date'
AVATAX_PRECISION_DIGITS = 2  # defined by API


class AccountExternalTaxMixin(models.AbstractModel):
    """ Brazilian Avatax adaptations. This class requires the following fields on the inherited model:
    - company_id (res.company): the company the record belongs to,
    - country_code (Char): the country code of the company this record belongs to,
    - fiscal_position_id (account.fiscal.position): fiscal position used for this record,
    - currency_id (res.currency): currency used on the record,
    - partner_shipping_id (res.partner): delivery address, where services are rendered or goods are delivered,
    - partner_id (res.partner): the end customer of the transaction,
    """
    _inherit = 'account.external.tax.mixin'

    l10n_br_is_service_transaction = fields.Boolean(
        "Is Service Transaction",
        compute="_compute_l10n_br_is_service_transaction",
        help="Technical field used to determine if this transaction should be sent to the service or goods API.",
    )
    l10n_br_cnae_code_id = fields.Many2one(
        "l10n_br.cnae.code",
        string="CNAE Code",
        compute="_compute_l10n_br_cnae_code_id",
        store=True,
        readonly=False,
        help="Brazil: the company's CNAE code for tax calculation and EDI."
    )
    l10n_br_goods_operation_type_id = fields.Many2one(
        "l10n_br.operation.type",
        compute="_compute_l10n_br_goods_operation_type_id",
        store=True,
        readonly=False,
        copy=False,
        string="Goods Operation Type",
        help="Brazil: this is the operation type related to the goods transaction. This will define the CFOP used on the NF-e."
    )
    l10n_br_use_type = fields.Selection(
        USE_TYPE_SELECTION,
        string="Purpose of Use",
        help="Brazil: this will override the purpose of use for all products sold here."
    )
    l10n_br_is_avatax = fields.Boolean(
        compute="_compute_l10n_br_is_avatax",
        string="Is Brazilian Avatax",
        help="Technical field used to check if this record requires tax calculation or EDI via Avatax."
    )
    # Technical field that holds errors meant for the actionable_errors widget.
    l10n_br_avatax_warnings = fields.Json(compute="_compute_l10n_br_avatax_warnings")

    def _compute_l10n_br_is_service_transaction(self):
        """Should be overridden. Used to determine if we should treat this record as a service (NFS-e) record."""
        self.l10n_br_is_service_transaction = False

    @api.depends('company_id')
    def _compute_l10n_br_cnae_code_id(self):
        for record in self:
            record.l10n_br_cnae_code_id = self.company_id.l10n_br_cnae_code_id

    @api.depends('country_code', 'fiscal_position_id')
    def _compute_l10n_br_goods_operation_type_id(self):
        """Set the default operation type which is standardSales. Should be overridden to determine
        the document type for the model."""
        for record in self:
            record.l10n_br_goods_operation_type_id = self.env.ref("l10n_br_avatax.operation_type_1") if record._l10n_br_is_avatax() else False

    @api.depends('country_code', 'fiscal_position_id')
    def _compute_l10n_br_is_avatax(self):
        for record in self:
            record.l10n_br_is_avatax = record._l10n_br_is_avatax()

    def _compute_is_tax_computed_externally(self):
        super()._compute_is_tax_computed_externally()
        self.filtered(lambda record: record.l10n_br_is_avatax).is_tax_computed_externally = True

    def _l10n_br_is_avatax(self):
        return self.country_code == 'BR' and self.fiscal_position_id.l10n_br_is_avatax

    def _depends_l10n_br_avatax_warnings(self):
        """Provides dependencies that trigger recomputation of l10n_br_avatax. Model-specific fields should be added
        with an override."""
        return ["l10n_br_is_avatax", "l10n_br_is_service_transaction", "currency_id", "company_id"]

    def _l10n_br_avatax_check_company(self):
        company_sudo = self.company_id.sudo()
        api_id, api_key = company_sudo.l10n_br_avatax_api_identifier, company_sudo.l10n_br_avatax_api_key
        if not api_id or not api_key:
            return {
                "missing_avatax_account": {
                    "message": _("Please create an Avatax account"),
                    "action_text": _("Go to the configuration panel"),
                    "action": self.env.ref('account.action_account_config').with_company(company_sudo)._get_action_dict(),
                    "level": "danger",
                }
            }

        return {}

    def _l10n_br_avatax_check_currency(self):
        if self.currency_id.name != 'BRL':
            return {
                "bad_currency": {
                    "message": _("Brazilian Real is required to calculate taxes with Avatax."),
                    "level": "danger",
                }
            }

        return {}

    def _l10n_br_avatax_check_lines(self, lines):
        errors = {}
        max_length_description = 7_000 if self.l10n_br_is_service_transaction else 120
        doc_type = self.env.ref("l10n_br.dt_SE" if self.l10n_br_is_service_transaction else "l10n_br.dt_55").doc_code_prefix

        for line in lines:
            product = line['tempProduct']
            cean = line['itemDescriptor']['cean']
            if not product:
                errors["required_product"] = {
                    "message": _("A product is required on each line when using Avatax."),
                    "level": "danger",
                }
            elif cean and (not cean.isdigit() or not (len(cean) == 8 or 12 <= len(cean) <= 14)):
                errors["bad_cean"] = {
                    "message": _("The barcode of %s must have either 8, or 12 to 14 digits when using Avatax.", product.display_name),
                    "level": "danger",
                }

            if line['lineAmount'] < 0:
                errors["negative_line"] = {
                    "message": _("Avatax Brazil doesn't support negative lines."),
                    "level": "danger",
                }

            description = line['itemDescriptor']['description']
            if description and len(description) > max_length_description:
                errors["description_too_long"] = {
                    "message": _(
                        "- The following label exceeds the %(max_characters)s character limit for %(doc_type)s: %(line)s",
                        max_characters=max_length_description, doc_type=doc_type, line=description
                    ),
                    "level": "danger",
                }

        if not self._l10n_br_get_non_transport_lines(lines):
            errors["non_transport_line"] = {
                "message": _("Avatax requires at least one non-transport line."),
                "level": "danger",
            }

        service_lines, consumable_lines = partition(
            lambda line: line["tempProduct"].product_tmpl_id._l10n_br_is_only_allowed_on_service_invoice(), lines
        )

        if not self.l10n_br_is_service_transaction:
            if service_lines:
                service_products = self.env["product.product"].union(*[line["tempProduct"] for line in service_lines])
                errors["disallowed_service_products"] = {
                    "message": _(
                        "%(transaction)s is a goods transaction but has service products:\n%(products)s.",
                        transaction=self.display_name,
                        products=format_list(self.env, service_products.mapped('display_name')),
                    ),
                    "action_text": _("View products"),
                    "action": service_products._get_records_action(name=_("View Product(s)")),
                    "level": "danger",
                }
        else:
            if consumable_lines:
                consumable_products = self.env["product.product"].union(*[line["tempProduct"] for line in consumable_lines])
                errors["disallowed_goods_products"] = {
                    "message": _(
                        "%(transaction)s is a service transaction but has non-service products:\n%(products)s",
                        transaction=self.display_name,
                        products=format_list(self.env, consumable_products.mapped('display_name')),
                    ),
                    "action_text": _("View products"),
                    "action": consumable_products._get_records_action(name=_("View Product(s)")),
                    "level": "danger",
                }

        return errors

    def _l10n_br_avatax_check_missing_fields_product(self, lines):
        res = {}
        incomplete_products = self.env['product.product']

        for line in lines:
            product = line['tempProduct']
            if product and not product.l10n_br_ncm_code_id:
                incomplete_products |= product

        if incomplete_products:
            res["products_missing_fields_danger"] = {
                    "message": _(
                        "For Brazilian tax calculation you must set a Mercosul NCM Code on the following:\n%(products)s",
                        products=format_list(self.env, incomplete_products.mapped("display_name"))
                    ),
                    "action_text": _("View products"),
                    "action": incomplete_products._l10n_br_avatax_action_missing_fields(self.l10n_br_is_service_transaction),
                    "level": "danger",
                }

        return res

    def _l10n_br_avatax_check_partner(self):
        res = {}
        if self.l10n_br_is_service_transaction:
            partner = self.partner_shipping_id
            city = partner.city_id
            if not city or city.country_id.code != "BR":
                res["missing_city"] = {
                    "message": _("%s must have a city selected in the list of Brazil's cities.", partner.display_name),
                    "action_text": _("View customer"),
                    "action": partner._get_records_action(),
                    "level": "danger",
                }

        return res

    @api.depends(lambda self: self._depends_l10n_br_avatax_warnings())
    def _compute_l10n_br_avatax_warnings(self):
        for record in self:
            if not record.l10n_br_is_avatax:
                record.l10n_br_avatax_warnings = False
                continue

            lines = record._l10n_br_get_calculate_lines_payload()
            record.l10n_br_avatax_warnings = {
                **record._l10n_br_avatax_check_company(),
                **record._l10n_br_avatax_check_currency(),
                **record._l10n_br_avatax_check_lines(lines),
                **record._l10n_br_avatax_check_missing_fields_product(lines),
                **record._l10n_br_avatax_check_partner(),
            }

    def _l10n_br_avatax_blocking_errors(self):
        """Only consider 'danger' level errors to be blocking. Other ones are considered warnings."""
        return [error for error in (self.l10n_br_avatax_warnings or {}).values() if error.get('level') == 'danger']

    def _l10n_br_avatax_log(self):
        self.env['account.external.tax.mixin']._enable_external_tax_logging(ICP_LOG_NAME)
        return True

    def _l10n_br_get_date_avatax(self):
        """ Returns the transaction date for this record. """
        raise NotImplementedError()

    def _l10n_br_get_avatax_lines(self):
        """ Returns line dicts for this record created with _l10n_br_build_avatax_line(). """
        raise NotImplementedError()

    def _l10n_br_get_operation_type(self):
        """ Returns the operationType used for requests to Avatax. """
        return self.l10n_br_goods_operation_type_id.technical_name

    def _l10n_br_get_invoice_refs(self):
        """ Should return a dict of invoiceRefs, as specified by the Avatax API. These are required for
        credit and debit notes. """
        return {}

    def _l10n_br_get_installments(self):
        """ Should return a dict of installments, as specified by the Avatax API. """
        return None

    def _l10n_br_line_model_name(self):
        return self._name + '.line'

    def _l10n_br_avatax_handle_response(self, response, title):
        if response.get('error'):
            logger.warning(pformat(response), stack_info=True)

            inner_errors = []
            for error in response['error'].get('innerError', []):
                # Useful inner errors are line-specific. Ones that aren't are typically not useful for the user.
                if 'lineCode' not in error:
                    continue

                product_name = self.env[self._l10n_br_line_model_name()].browse(error['lineCode']).product_id.display_name

                inner_errors.append(_('What:'))
                inner_errors.append('- %s: %s' % (product_name, error['message']))

                where = error.get('where', {})
                if where:
                    inner_errors.append(_('Where:'))
                for where_key, where_value in sorted(where.items()):
                    if where_key == 'date':
                        continue
                    inner_errors.append('- %s: %s' % (where_key, where_value))

            return '%s\n%s\n%s' % (title, response['error']['message'], '\n'.join(inner_errors))

    def _l10n_br_build_avatax_line(self, product, description, qty, unit_price, total, discount, line_id):
        """ Prepares the line data for the /calculations API call. temp* values are here to help with post-processing
        and will be removed before sending by _remove_temp_values_lines.

        :param product.product product: product on the line
        :param str description: the description of the line
        :param float qty: the number of items on the line
        :param float unit_price: the unit_price on the line
        :param float total: the amount on the line without taxes or discount
        :param float discount: the discount amount on the line
        :param int line_id: the database ID of the line record, this is used to uniquely identify it in Avatax
        :return dict: the basis for the 'lines' value in the /calculations API call
        """
        line = {
            'lineCode': line_id,
            'useType': self.l10n_br_use_type or product.l10n_br_use_type,
            'otherCostAmount': 0,
            'freightAmount': 0,
            'insuranceAmount': 0,
            'lineTaxedDiscount': discount,
            'lineAmount': total,
            'lineUnitPrice': unit_price,
            'numberOfItems': qty,
            'itemDescriptor': {
                'description': description or product.display_name or '',
                'cean': product.barcode or '',
            },
            'tempTransportCostType': product.l10n_br_transport_cost_type,
            'tempProduct': product,
        }

        descriptor = line['itemDescriptor']

        # Sending false or empty string returns errors
        if self.l10n_br_cnae_code_id:
            descriptor['cnae'] = self.l10n_br_cnae_code_id.sanitized_code

        if self.l10n_br_is_service_transaction:
            line['benefitsAbroad'] = self.partner_shipping_id.country_id.code != 'BR'
            descriptor['serviceCodeOrigin'] = product.l10n_br_property_service_code_origin_id.code
            descriptor['withLaborAssignment'] = product.l10n_br_labor
            descriptor['hsCode'] = product.l10n_br_ncm_code_id.code or ''

            # Explicitly filter on company, this can be called via controllers which run as superuser and bypass record rules.
            service_codes = product.product_tmpl_id.l10n_br_service_code_ids.filtered(lambda code: code.company_id == self.env.company)
            descriptor['serviceCode'] = (
                service_codes.filtered(lambda code: code.city_id == self.partner_shipping_id.city_id).code
                or product.l10n_br_property_service_code_origin_id.code
            )
        else:
            descriptor['cest'] = product.l10n_br_cest_code or ''
            descriptor['source'] = product.l10n_br_source_origin or ''
            descriptor['productType'] = product.l10n_br_sped_type or ''
            descriptor['hsCode'] = (product.l10n_br_ncm_code_id.code or '').replace('.', '')

        return line

    def _l10n_br_get_non_transport_lines(self, lines):
        return [line for line in lines if not line['tempTransportCostType']]

    def _l10n_br_distribute_transport_cost_over_lines(self, lines, transport_cost_type):
        """ Avatax requires transport costs to be specified per line. This distributes transport costs (indicated by
        their product's l10n_br_transport_cost_type) over the lines in proportion to their subtotals. """
        type_to_api_field = {
            'freight': 'freightAmount',
            'insurance': 'insuranceAmount',
            'other': 'otherCostAmount',
        }
        api_field = type_to_api_field[transport_cost_type]

        transport_lines = [line for line in lines if line['tempTransportCostType'] == transport_cost_type]
        regular_lines = self._l10n_br_get_non_transport_lines(lines)
        total = sum(line['lineAmount'] for line in regular_lines)

        if not regular_lines:
            # _compute_l10n_br_avatax_warnings() will inform the user about this
            return []

        for transport_line in transport_lines:
            transport_net = transport_line['lineAmount'] - transport_line['lineTaxedDiscount']
            remaining = transport_net
            for line in regular_lines[:-1]:
                current_cost = float_round(
                    transport_net * (line['lineAmount'] / total),
                    precision_digits=AVATAX_PRECISION_DIGITS
                )
                remaining -= current_cost
                line[api_field] += current_cost

            # put remainder on last line to avoid rounding issues
            regular_lines[-1][api_field] += remaining

        return [line for line in lines if line['tempTransportCostType'] != transport_cost_type]

    def _l10n_br_remove_temp_values_lines(self, lines):
        for line in lines:
            del line['tempTransportCostType']
            del line['tempProduct']

    def _l10n_br_repr_amounts(self, lines):
        """ Ensures all amount fields have the right amount of decimals before sending it to the API. """
        for line in lines:
            for amount_field in ('lineAmount', 'freightAmount', 'insuranceAmount', 'otherCostAmount'):
                line[amount_field] = json_float_round(line[amount_field], AVATAX_PRECISION_DIGITS)

    def _l10n_br_call_avatax_taxes(self):
        """Query Avatax with all the transactions linked to `self`.

        :return (dict<Model, dict>): a mapping between document records and the response from Avatax
        """
        if not self:
            return {}

        transactions = {record: record._l10n_br_get_calculate_payload() for record in self}
        return {
            record: record._l10n_br_iap_calculate_tax(transaction)
            for record, transaction in transactions.items()
        }

    def _l10n_br_get_partner_type(self, partner):
        if partner.country_code not in ('BR', False):
            return 'foreign'
        elif partner.is_company:
            return 'business'
        else:
            return 'individual'

    def _l10n_br_get_taxes_settings(self, partner):
        if self.l10n_br_is_service_transaction:
            settings = {
                'cofinsSubjectTo': partner.l10n_br_subject_cofins,
                'pisSubjectTo': partner.l10n_br_subject_pis,
                'csllSubjectTo': 'T' if partner.l10n_br_is_subject_csll else 'E',
            }
            regime = partner.l10n_br_tax_regime
            if regime and regime.startswith('simplified'):
                settings['issRfRateForSimplesTaxRegime'] = partner.l10n_br_iss_simples_rate

            return settings
        else:
            return {'icmsTaxPayer': partner.l10n_br_taxpayer == 'icms'}

    def _l10n_br_get_calculate_lines_payload(self):
        lines = [
            self._l10n_br_build_avatax_line(
                line['product_id'],
                line['description'],
                line['qty'],
                line['price_unit'],
                line['qty'] * line['price_unit'],
                line['qty'] * line['price_unit'] * (line['discount'] / 100.0),
                line['id'],
            )
            for line
            in self._get_line_data_for_external_taxes()
        ]
        lines = self._l10n_br_distribute_transport_cost_over_lines(lines, 'freight')
        lines = self._l10n_br_distribute_transport_cost_over_lines(lines, 'insurance')
        lines = self._l10n_br_distribute_transport_cost_over_lines(lines, 'other')

        return lines

    def _l10n_br_get_calculate_payload(self):
        """ Returns the full payload containing one record to be used in a /transactions API call. """
        self.ensure_one()
        transaction_date = self._get_date_for_external_taxes()
        partner = self.partner_id
        company = self.company_id.partner_id

        lines = self._l10n_br_get_calculate_lines_payload()
        self._l10n_br_remove_temp_values_lines(lines)
        self._l10n_br_repr_amounts(lines)

        taxes_settings_customer = self._l10n_br_get_taxes_settings(partner)
        taxes_settings_company = self._l10n_br_get_taxes_settings(company)
        if company.l10n_br_tax_regime == 'simplified':
            taxes_settings_company['pCredSN'] = self.company_id.l10n_br_icms_rate

        payments = {}
        if installments := self._l10n_br_get_installments():
            payments = {'payment': installments}

        activity_sector = {}
        if self.l10n_br_cnae_code_id:
            activity_sector = {'ActivitySector_CNAE': {'code': self.l10n_br_cnae_code_id.sanitized_code}}

        return {
            'header': {
                'transactionDate': (transaction_date or fields.Date.today()).isoformat(),
                'amountCalcType': 'gross',
                'documentCode': '%s_%s' % (self._name, self.id),
                'messageType': 'services' if self.l10n_br_is_service_transaction else 'goods',
                'companyLocation': '',
                'operationType': self._l10n_br_get_operation_type(),
                **self._l10n_br_get_invoice_refs(),
                'locations': {
                    'entity': {  # the customer
                        'name': partner.name,
                        'type': self._l10n_br_get_partner_type(partner),
                        'activitySector': {
                            'code': partner.l10n_br_activity_sector,
                        },
                        'taxesSettings': {
                            **taxes_settings_customer,
                        },
                        'taxRegime': partner.l10n_br_tax_regime,
                        'address': {
                            'zipcode': partner.zip,
                            'cityName': partner.city_id.name,
                        },
                        'federalTaxId': partner.vat,
                        'suframa': partner.l10n_br_isuf_code or '',
                    },
                    'establishment': {  # the seller
                        'name': company.name,
                        'type': 'business',
                        'activitySector': {
                            'code': company.l10n_br_activity_sector,
                            **activity_sector,
                        },
                        'taxesSettings': {
                            **taxes_settings_company,
                        },
                        'taxRegime': company.l10n_br_tax_regime,
                        'address': {
                            'zipcode': company.zip,
                            'cityName': company.city_id.name,
                        },
                        'federalTaxId': company.vat,
                        'suframa': company.l10n_br_isuf_code or '',
                    },
                },
                **payments,
            },
            'lines': lines,
        }

    def _l10n_br_get_line_total(self, line_result):
        """The service API already accounts for the discount in the net figure."""
        if self.l10n_br_is_service_transaction:
            return line_result["lineNetFigure"]
        else:
            return line_result["lineNetFigure"] - line_result["lineTaxedDiscount"]

    def _get_external_taxes(self):
        """ Override. """
        details, summary = super()._get_external_taxes()

        def find_or_create_tax(doc, tax_name, price_include):
            def repartition_line(repartition_type):
                return (0, 0, {
                    'repartition_type': repartition_type,
                    'company_id': doc.company_id.id,
                })

            price_include_override = 'tax_included' if price_include else 'tax_excluded'

            key = (tax_name, price_include_override, doc.company_id)
            if key not in tax_cache:
                # It's possible for multiple taxes to have the needed l10n_br_avatax_code. E.g.:
                # - existing customer install l10n_br_avatax
                # - computes taxes without reloading the fiscal localization, this creates fallback taxes
                # - reloads the fiscal localization
                # In this case take the most recent tax (the one included in the fiscal localization), that one is
                # most likely the one the user wants and will have the right accounts and tags.
                tax_cache[key] = self.env['account.tax'].with_context(active_test=False).search([
                    ('l10n_br_avatax_code', '=', tax_name),
                    ('price_include_override', '=', price_include_override),
                    ('company_id', '=', doc.company_id.id)
                ], limit=1, order='create_date desc')

                # all these taxes are archived by default, unarchive when used
                tax_cache[key].active = True

                if not tax_cache[key]:  # fall back on creating a bare-bones tax
                    tax_cache[key] = self.env['account.tax'].sudo().with_company(doc.company_id).create({
                        'name': tax_name,
                        'l10n_br_avatax_code': tax_name,
                        'amount': 1,  # leaving it at the default 0 causes accounting to ignore these
                        'amount_type': 'percent',
                        'price_include_override': price_include_override,
                        'refund_repartition_line_ids': [
                            repartition_line('base'),
                            repartition_line('tax'),
                        ],
                        'invoice_repartition_line_ids': [
                            repartition_line('base'),
                            repartition_line('tax'),
                        ],
                    })

            return tax_cache[key]
        tax_cache = {}

        br_records = self.filtered(lambda record: record.l10n_br_is_avatax)
        errors = []
        for record in br_records:
            if blocking := record._l10n_br_avatax_blocking_errors():
                errors.append(_(
                    "Taxes cannot be calculated for %(record)s:\n%(errors)s",
                    record=record.display_name, errors="\n".join(f"- {msg['message']}" for msg in blocking)
                ))

        if errors:
            raise ValidationError('\n\n'.join(errors))

        query_results = br_records._l10n_br_call_avatax_taxes()
        errors = []
        for document, query_result in query_results.items():
            error = self._l10n_br_avatax_handle_response(query_result, _(
                'Odoo could not fetch the taxes related to %(document)s.',
                document=document.display_name,
            ))
            if error:
                errors.append(error)
        if errors:
            raise UserError('\n\n'.join(errors))

        for document, query_result in query_results.items():
            subtracted_tax_types = set()
            tax_type_to_price_include = {}
            is_return = document._l10n_br_get_operation_type() == 'salesReturn'
            for line_result in query_result['lines']:
                record_id = line_result['lineCode']
                record = self.env[self._l10n_br_line_model_name()].browse(int(record_id))
                details[record] = {}
                details[record]['total'] = self._l10n_br_get_line_total(line_result)
                details[record]['tax_amount'] = 0
                details[record]['tax_ids'] = self.env['account.tax']
                for detail in line_result['taxDetails']:
                    if detail['taxImpact']['impactOnNetAmount'] != 'Informative':
                        tax_amount = detail['tax']
                        if is_return:
                            tax_amount = -tax_amount

                        if detail['taxImpact']['impactOnNetAmount'] == 'Subtracted':
                            tax_amount = -tax_amount
                            subtracted_tax_types.add(detail['taxType'])

                        price_include = detail['taxImpact']['impactOnNetAmount'] == 'Included'

                        # In the unlikely event there is an included and excluded tax with the same tax type we take
                        # whichever comes first. The tax computation will still be correct and the taxByType summary
                        # later will group them together.
                        tax_type_to_price_include.setdefault(detail['taxType'], price_include)
                        tax = find_or_create_tax(document, detail['taxType'], price_include)

                        details[record]['tax_amount'] += tax_amount
                        details[record]['tax_ids'] += tax

            summary[document] = {}
            for tax_type, type_details in query_result['summary']['taxByType'].items():
                tax = find_or_create_tax(document, tax_type, tax_type_to_price_include.get(tax_type, False))

                amount = type_details['tax']
                if is_return:
                    amount = -amount

                if tax_type in subtracted_tax_types:
                    amount = -amount

                # Tax avatax returns is opposite from aml balance (avatax is positive on invoice, negative on refund)
                summary[document][tax] = -amount

        details = {record: taxes for record, taxes in details.items() if taxes['tax_ids']}

        return details, summary

    # IAP related methods
    def _l10n_br_iap_request(self, route, json=None, company=None):
        company = company or self.company_id
        avatax_api_id, avatax_api_key = company.sudo().l10n_br_avatax_api_identifier, company.sudo().l10n_br_avatax_api_key

        default_endpoint = DEFAULT_IAP_ENDPOINT if company.l10n_br_avalara_environment == 'production' else DEFAULT_IAP_TEST_ENDPOINT
        iap_endpoint = self.env['ir.config_parameter'].sudo().get_param('l10n_br_avatax_iap.endpoint', default_endpoint)
        environment = company.l10n_br_avalara_environment
        url = f'{iap_endpoint}/api/l10n_br_avatax/1/{route}'

        params = {
            'db_uuid': self.env['ir.config_parameter'].sudo().get_param('database.uuid'),
            'account_token': self.env['iap.account'].get(IAP_SERVICE_NAME).account_token,
            'avatax': {
                'is_production': environment and environment == 'production',
                'json': json or {},
            }
        }

        if avatax_api_id:
            params['api_id'] = avatax_api_id
            params['api_secret'] = avatax_api_key

        start = str(datetime.utcnow())
        response = iap_jsonrpc(url, params=params, timeout=60)  # longer timeout because create_account can take some time
        end = str(datetime.utcnow())

        # Avatax support requested that requests and responses be provided in JSON, so they can easily load them in their
        # internal tools for troubleshooting.
        self._log_external_tax_request(
            'Avatax Brazil',
            ICP_LOG_NAME,
            f"start={start}\n"
            f"end={end}\n"
            f"args={pformat(url)}\n"
            f"request={dumps(json, indent=2)}\n"
            f"response={dumps(response, indent=2)}"
        )

        return response

    def _l10n_br_iap_ping(self, company):
        # This takes company because this function is called directly from res.config.settings instead of a sale.order or account.move
        return self._l10n_br_iap_request('ping', company=company)

    def _l10n_br_iap_create_account(self, account_data, company):
        # This takes company because this function is called directly from res.config.settings instead of a sale.order or account.move
        return self._l10n_br_iap_request('create_account', account_data, company=company)

    def _l10n_br_iap_calculate_tax(self, transaction):
        return self._l10n_br_iap_request('calculate_tax', transaction)
