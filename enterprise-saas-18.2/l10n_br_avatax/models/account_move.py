# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, api, fields, _
from odoo.tools import format_list


class AccountMove(models.Model):
    _inherit = "account.move"

    def _depends_l10n_br_avatax_warnings(self):
        """account.external.tax.mixin override."""
        return super()._depends_l10n_br_avatax_warnings() + ["invoice_line_ids.product_id", "partner_shipping_id"]

    @api.depends("l10n_br_is_avatax", "move_type", "debit_origin_id")
    def _compute_l10n_br_goods_operation_type_id(self):
        """Override."""
        self.l10n_br_goods_operation_type_id = False
        for move in self.filtered("l10n_br_is_avatax"):
            if move.debit_origin_id:
                move.l10n_br_goods_operation_type_id = self.env.ref("l10n_br_avatax.operation_type_3")  # amountComplementary
            elif move.move_type == "out_refund":
                move.l10n_br_goods_operation_type_id = self.env.ref("l10n_br_avatax.operation_type_60")  # salesReturn
            else:
                move.l10n_br_goods_operation_type_id = self.env.ref("l10n_br_avatax.operation_type_1")  # standardSales

    @api.depends("l10n_latam_document_type_id")
    def _compute_l10n_br_is_service_transaction(self):
        """account.external.tax.mixin override."""
        for move in self:
            move.l10n_br_is_service_transaction = (
                move.l10n_br_is_avatax and move.l10n_latam_document_type_id == self.env.ref("l10n_br.dt_SE")
            )

    def _l10n_br_avatax_check_missing_fields_product(self, lines):
        """account.external.tax.mixin override."""
        res = super()._l10n_br_avatax_check_missing_fields_product(lines)
        warning_fields = ["l10n_br_use_type"]

        if self.l10n_br_is_service_transaction:
            warning_fields += ["l10n_br_property_service_code_origin_id", "l10n_br_service_code_ids"]
        else:
            warning_fields += ["l10n_br_ncm_code_id", "l10n_br_sped_type", "l10n_br_source_origin"]

        incomplete_products = self.env['product.product']
        fields = set()

        for line in lines:
            product = line['tempProduct']
            if not product:
                continue

            for field in warning_fields:
                if not product[field]:
                    incomplete_products |= product
                    fields.add(product._fields[field])

        if incomplete_products:
            res["invoice_products_missing_fields_warning"] = {
                "message": _(
                    "To avoid tax miscalculations make sure to set up %(fields)s on the following:\n%(products)s",
                    fields=format_list(self.env, [field._description_string(self.env) for field in fields]),
                    products=format_list(self.env, incomplete_products.mapped("display_name")),
                ),
                "action_text": _("View products"),
                "action": incomplete_products._l10n_br_avatax_action_missing_fields(self.l10n_br_is_service_transaction),
                "level": "warning",
            }

        return res

    def _l10n_br_avatax_check_partner(self):
        """account.external.tax.mixin override."""
        res = super()._l10n_br_avatax_check_partner()
        recommended_fields = ("street_name", "street_number", "street2", "zip", "l10n_br_tax_regime", "l10n_br_taxpayer", "l10n_br_activity_sector", "state_id")
        missing_fields = [self.partner_id._fields[field] for field in recommended_fields if not self.partner_id[field]]
        if missing_fields:
            res["missing_partner_fields_warning"] = {
                "message": _(
                    "To avoid tax miscalculations make sure to set up %(fields)s on %(partner_name)s.",
                    fields=format_list(self.env, [field._description_string(self.env) for field in missing_fields]),
                    partner_name=self.partner_id.display_name
                ),
                "action_text": _("View customer"),
                "action": self.partner_id._l10n_br_avatax_action_missing_fields(),
                "level": "warning",
            }

        return res

    def _l10n_br_get_origin_invoice(self):
        return self.debit_origin_id or self.reversed_entry_id

    def _l10n_br_invoice_refs_for_code(self, ref_type, document_code):
        return {
            "invoicesRefs": [
                {
                    "type": ref_type,
                    ref_type: document_code,
                }
            ]
        }

    def _l10n_br_get_invoice_refs(self):
        """account.external.tax.mixin override."""
        if origin := self._l10n_br_get_origin_invoice():
            return self._l10n_br_invoice_refs_for_code("documentCode", f"{origin._name}_{origin.id}")

        return {}

    def _l10n_br_get_installments(self):
        """account.external.tax.mixin override."""
        payments = self.line_ids.filtered(lambda line: line.display_type == "payment_term" and line.date_maturity)
        future_payments = payments.filtered(
            lambda line: line.date_maturity > (self.invoice_date or fields.Date.context_today(self))
        )
        if not future_payments:
            return None

        return {
            "installmentTerms": "1" if len(payments) == 1 else "5",
            "bill": {
                "nFat": self.name,
                "vNet": self.amount_total,
                "vOrig": self.amount_total,
            },
            "installment": [
                {
                    "documentNumber": f"{index + 1:03}",
                    "date": payment.date_maturity.isoformat(),
                    "grossValue": payment.balance,
                    "netValue": payment.balance,
                }
                for index, payment in enumerate(payments.sorted("date_maturity"))
            ],
        }
