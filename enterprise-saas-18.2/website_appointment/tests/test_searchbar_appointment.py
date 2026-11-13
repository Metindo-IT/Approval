# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests.common import HttpCase
from odoo.tests.common import tagged


@tagged("post_install", "-at_install")
class TestSearchbarAppointments(HttpCase):

    def test_search_within_appointments(self):
        self.env["appointment.type"].create({
            "appointment_tz": "UTC",
            "assign_method": "time_auto_assign",
            "min_schedule_hours": 1.0,
            "max_schedule_days": 8,
            "min_cancellation_hours": 2,
            "name": "yoga session",
            "resource_manage_capacity": True,
            "schedule_based_on": "resources",
            "is_published" : True,
        })
        self.start_tour(self.env["website"].get_client_action_url("/"), "test_searchbar_within_appointments", login="admin")
