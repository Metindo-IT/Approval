import uuid
import odoo.tests
from odoo import Command
from odoo.addons.website.tools import MockRequest
from odoo.addons.point_of_sale.tests.common import archive_products
from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon


@odoo.tests.tagged('post_install', '-at_install')
class TestPosUrbanPiperCommon(TestPointOfSaleHttpCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        archive_products(cls.env)
        cls.env['product.product'].search([
            ('id', 'in', [
                cls.env.ref('pos_urban_piper.product_packaging_charges').id,
                cls.env.ref('pos_urban_piper.product_delivery_charges').id,
                cls.env.ref('pos_urban_piper.product_other_charges').id,
            ])
        ]).product_tmpl_id.write({
            'active': True,
        })
        cls.env['ir.config_parameter'].set_param('pos_urban_piper.urbanpiper_username', 'demo')
        cls.env['ir.config_parameter'].set_param('pos_urban_piper.urbanpiper_apikey', 'demo')
        cls.urban_piper_config = cls.env['pos.config'].create({
            'name': 'Urban Piper',
            'module_pos_urban_piper': True,
            'urbanpiper_delivery_provider_ids': [Command.set([cls.env.ref('pos_urban_piper.pos_delivery_provider_justeat').id])]
        })
        cls.product_1 = cls.env['product.template'].create({
            'name': 'Product 1',
            'available_in_pos': True,
            'taxes_id': [(5, 0, 0)],
            'type': 'consu',
            'list_price': 100.0,
        })
        cls.product_2 = cls.env['product.template'].create({
            'name': 'Product 2',
            'available_in_pos': True,
            'taxes_id': [(5, 0, 0)],
            'type': 'consu',
            'list_price': 200.0,
        })


class TestFrontend(TestPosUrbanPiperCommon):

    def test_01_order_flow(self):
        self.urban_piper_config.open_ui()
        with MockRequest(self.env):
            identifier_1 = str(uuid.uuid4())
            self.env['pos.urbanpiper.test.order.wizard'].with_context(config_id=self.urban_piper_config.id).create({
                'product_id': self.product_1.id,
                'quantity': 1,
                'delivery_provider_id': self.env.ref('pos_urban_piper.pos_delivery_provider_justeat').id,
            }).make_test_order(identifier_1)
            identifier_2 = str(uuid.uuid4())
            self.env['pos.urbanpiper.test.order.wizard'].with_context(config_id=self.urban_piper_config.id).create({
                'product_id': self.product_2.id,
                'quantity': 1,
                'delivery_provider_id': self.env.ref('pos_urban_piper.pos_delivery_provider_justeat').id,
            }).make_test_order(identifier_2)
        self.env['pos_preparation_display.display'].create({
            'name': 'Preparation Display',
            'pos_config_ids': [(4, self.urban_piper_config.id)],
        })
        self.start_pos_tour('OrderFlowTour', pos_config=self.urban_piper_config, login="pos_admin")
        order_1 = self.env['pos.order'].search([('delivery_identifier', '=', identifier_1)])
        order_2 = self.env['pos.order'].search([('delivery_identifier', '=', identifier_2)])
        self.assertEqual(100.0, order_1.amount_total)
        self.assertEqual(100.0, order_1.amount_paid)
        self.assertEqual(0.0, order_1.amount_tax)
        self.assertEqual(100.0, order_1.payment_ids[0].amount)
        self.assertEqual(200.0, order_2.amount_total)
        self.assertEqual(200.0, order_2.amount_paid)
        self.assertEqual(0.0, order_2.amount_tax)
        self.assertEqual(200.0, order_2.payment_ids[0].amount)
        pdis_order1 = self.env['pos_preparation_display.order'].search([('pos_order_id', '=', order_1.id)], limit=1)
        pdis_order1 = self.env['pos_preparation_display.order'].search([('pos_order_id', '=', order_2.id)], limit=1)
        self.assertEqual(len(pdis_order1.preparation_display_order_line_ids), 1, "Should have 1 preparation orderlines")
        self.assertEqual(len(pdis_order1.preparation_display_order_line_ids), 1, "Should have 1 preparation orderlines")

    def test_02_order_with_instruction(self):
        self.urban_piper_config.open_ui()
        with MockRequest(self.env):
            identifier_1 = str(uuid.uuid4())
            self.env['pos.urbanpiper.test.order.wizard'].with_context(config_id=self.urban_piper_config.id).create({
                'product_id': self.product_1.id,
                'quantity': 4,
                'delivery_instruction': 'Make it spicy..',
                'delivery_provider_id': self.env.ref('pos_urban_piper.pos_delivery_provider_justeat').id,
            }).make_test_order(identifier_1)
        self.start_pos_tour('OrderWithInstructionTour', pos_config=self.urban_piper_config, login="pos_admin")
        order_1 = self.env['pos.order'].search([('delivery_identifier', '=', identifier_1)])
        self.assertEqual(400.0, order_1.amount_total)
        self.assertEqual(400.0, order_1.amount_paid)
        self.assertEqual(0.0, order_1.amount_tax)
        self.assertEqual(400.0, order_1.payment_ids[0].amount)
        self.assertEqual('Make it spicy..', order_1.general_customer_note)

    def test_03_order_with_charges_and_discount(self):
        self.urban_piper_config.open_ui()
        with MockRequest(self.env):
            identifier_1 = str(uuid.uuid4())
            self.env['pos.urbanpiper.test.order.wizard'].with_context(config_id=self.urban_piper_config.id).create({
                'product_id': self.product_1.id,
                'quantity': 5,
                'packaging_charge': 50,
                'delivery_charge': 100,
                'discount_amount': 150,
                'delivery_provider_id': self.env.ref('pos_urban_piper.pos_delivery_provider_justeat').id,
            }).make_test_order(identifier_1)
        self.start_pos_tour('OrderWithChargesAndDiscountTour', pos_config=self.urban_piper_config, login="pos_admin")
        order_1 = self.env['pos.order'].search([('delivery_identifier', '=', identifier_1)])
        self.assertEqual(500.0, order_1.amount_total)
        self.assertEqual(500.0, order_1.amount_paid)
        self.assertEqual(0.0, order_1.amount_tax)
        self.assertEqual(500.0, order_1.payment_ids[0].amount)
