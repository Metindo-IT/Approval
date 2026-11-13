# Part of Odoo. See LICENSE file for full copyright and licensing details

from odoo.tests import tagged
from odoo.addons.industry_fsm.tests.common import TestIndustryFsmCommon


@tagged('post_install', '-at_install')
class TestProjectTask(TestIndustryFsmCommon):
    def test_action_send_report(self):
        action = self.task.action_send_report()
        self.assertEqual(action['type'], 'ir.actions.client')
        self.assertEqual(action['tag'], 'display_notification')
        self.assertDictEqual(action['params'], {
            'message': 'There are no reports to send.',
            'sticky': False,
            'type': 'danger',
        })

        # Create a timesheet to make sure there is a report to send
        self.env['account.analytic.line'].create({
            'project_id': self.task.project_id.id,
            'task_id': self.task.id,
            'unit_amount': 1.0,
            'employee_id': self.employee_user.id,
        })
        # Make sure we can send a report for that task since there is a timesheet on it.
        self.task.invalidate_recordset(["display_send_report_primary", "timesheet_ids", "display_send_report_secondary"])
        report_action = self.task._get_send_report_action()
        self.assertEqual(report_action['type'], 'ir.actions.act_window')
        self.assertEqual(report_action['res_model'], 'mail.compose.message')
        self.assertEqual(report_action['target'], 'new')
        self.assertDictEqual(report_action['context'], {
            'default_composition_mode': 'comment',
            'default_model': 'project.task',
            'default_res_ids': self.task.ids,
            'default_template_id': self.env.ref('industry_fsm.mail_template_data_task_report').id,
            'fsm_mark_as_sent': True,
        })

        self.env.company.external_report_layout_id = False  # make sure no layout exists
        action = self.task.action_send_report()
        self.assertEqual(action['xml_id'], 'web.action_base_document_layout_configurator')
        self.assertEqual(action['type'], 'ir.actions.act_window')
        self.assertEqual(action['res_model'], 'base.document.layout')
        self.assertDictEqual(action['context']['report_action'], report_action)

        # Set default layout to check if the action returned by `action_send_report` is the report action
        self.env.company.external_report_layout_id = self.env.ref('web.external_layout_standard').id
        action = self.task.action_send_report()
        self.assertDictEqual(action, report_action, "The action returned should be the report one")
