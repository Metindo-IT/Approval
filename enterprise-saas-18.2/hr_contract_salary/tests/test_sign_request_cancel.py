from odoo import Command
from odoo.tools import file_open
from odoo.tests.common import TransactionCase


class TestSignRequestCancel(TransactionCase):

    def setUp(cls):
        super().setUp()

        with file_open('hr_contract_salary/static/src/demo/employee_contract.pdf', "rb") as f:
            pdf_content = f.read()

        cls.attachment = cls.env['ir.attachment'].create({
            'type': 'binary',
            'raw': pdf_content,
            'name': 'test_employee_contract.pdf',
        })

        cls.template_id = cls.env['sign.template'].create({
            'name': 'Employee Contract Template',
            'attachment_id': cls.attachment.id,
        })

        cls.structure_type = cls.env['hr.payroll.structure.type'].create({'name': 'struct'})
        cls.job = cls.env['hr.job'].create({'name': 'Software Developer'})
        cls.contract = cls.env['hr.contract'].create({
            'name': "Contract",
            'wage': 6500,
            'structure_type_id': cls.structure_type.id,
            'job_id': cls.job.id,
        })

        cls.env['sign.item'].create([{
            'type_id': cls.env.ref('sign.sign_item_type_text').id,
            'required': True,
            'responsible_id': cls.env.ref('sign.sign_item_role_customer').id,
            'page': 1,
            'posX': 0.273,
            'posY': 0.158,
            'template_id': cls.template_id.id,
            'width': 0.150,
            'height': 0.015,
        }])

        partner = cls.env['res.partner'].create({'name': 'Employee', 'email': 'employee@example.com'})
        cls.sign_request = cls.env['sign.request'].create({
            'template_id': cls.template_id.id,
            'reference': 'Test Offer',
            'request_item_ids': [Command.create({
                'partner_id': partner.id,
                'role_id': cls.env.ref('sign.sign_item_role_customer').id,
            })],
        })

        cls.salary_offer = cls.env['hr.contract.salary.offer'].create({
            'contract_template_id': cls.contract.id,
            'sign_request_ids': cls.sign_request,
        })

    def test_cancel_sign_request(self):
        self.sign_request.cancel()
        self.assertEqual(self.salary_offer.state, 'cancelled', "The offer should be cancelled when the sign request is cancelled.")
