# -*- coding: utf-8 -*-

from markupsafe import Markup
from odoo.fields import Command
from odoo.tests import tagged
from datetime import datetime

from .gantt_reschedule_dates_common import ProjectEnterpriseGanttRescheduleCommon

@tagged('-at_install', 'post_install')
class TestTaskDependencies(ProjectEnterpriseGanttRescheduleCommon):

    def test_task_dependencies_display_warning_dependency_in_gantt(self):
        self.task_1.write({'state': '01_in_progress'})
        self.assertTrue(self.task_1.display_warning_dependency_in_gantt, 'display_warning_dependency_in_gantt should be True if the task state is neither done or canceled')
        self.task_1.write({'state': '1_done'})
        self.assertFalse(self.task_1.display_warning_dependency_in_gantt, 'display_warning_dependency_in_gantt should be False if the task state is done')

    def test_tasks_dependencies_warning_when_planning(self):
        self.task_4.write({'depend_on_ids': [Command.link(self.task_1.id)]})
        self.assertFalse(self.task_4.dependency_warning)
        self.task_5.write({'depend_on_ids': False})
        self.task_4.write({'depend_on_ids': [Command.link(self.task_5.id)]})
        self.assertEqual(self.task_4.dependency_warning, Markup('<p>This task cannot be planned before the following tasks on which it depends: %s</p>') % (self.task_5.name))

    def test_project_critical_path(self):
        """Create new tasks to test critical path to get the following configuration (1->6 are already created):

        ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌─────────────┐
        │1. 24/06  9h├──►│3. 24/06 13h├──►│4. 30/06 15h├──►│5.  2/08  8h├──►│6.  4/08  8h├──►│10.  5/08  9h│
        │         12h│   │         15h│   │         17h│   │    3/08 17h│   │         17h│   │          12h│
        └────────────┘   └──────────┬─┘   └────────────┘   └────────────┘   └────────────┘   └─────────────┘
                                    │                                                          ▲    ▲
                                    │     ┌────────────┐   ┌────────────┐                      │    │
                                    └────►│7. 30/06 15h├──►│8.  2/08  8h├──────────────────────┘    │
                                          │         17h│   │         12h│                           │
                                          └─────────┬──┘   └────────────┘                           │
                                                    │                                               │
                                                    │      ┌────────────┐                           │
                                                    └─────►│9.  2/08  - ├───────────────────────────┘
                                                           │         12h│
                                                           └────────────┘
        """
        task_7 = self.ProjectTask.create({
            'name': 'Pigs UserTask 7',
            'user_ids': self.user_projectuser,
            'project_id': self.project_pigs.id,
            'depend_on_ids': [Command.link(self.task_3.id)],
            'planned_date_begin': datetime(2021, 6, 30, 15, 0, 0),
            'date_deadline': datetime(2021, 6, 30, 17, 0, 0),
        })
        task_8, task_9 = self.ProjectTask.create([{
            'name': 'Pigs UserTask 8',
            'user_ids': self.user_projectuser,
            'project_id': self.project_pigs.id,
            'depend_on_ids': [Command.link(task_7.id)],
            'planned_date_begin': datetime(2021, 8, 2, 8, 0, 0),
            'date_deadline': datetime(2021, 8, 2, 12, 0, 0),
        }, {
            'name': 'Pigs UserTask 9',
            'user_ids': self.user_projectuser,
            'project_id': self.project_pigs.id,
            'depend_on_ids': [Command.link(task_7.id)],
            'date_deadline': datetime(2021, 8, 2, 12, 0, 0),
        }])
        task_10 = self.ProjectTask.create({
            'name': 'Pigs UserTask 10',
            'user_ids': self.user_projectuser,
            'project_id': self.project_pigs.id,
            'depend_on_ids': [Command.link(self.task_6.id), Command.link(task_8.id), Command.link(task_9.id)],
            'planned_date_begin': datetime(2021, 8, 5, 9, 0, 0),
            'date_deadline': datetime(2021, 8, 5, 12, 0, 0),
        })

        # Test get_critical_path class method of model project.task
        critical_path = self.env['project.task'].get_critical_path([('project_id', '=', self.project_pigs.id)])
        self.assertEqual([self.task_1.id, self.task_3.id, self.task_4.id, self.task_5.id, self.task_6.id, task_10.id], critical_path,
                         "The critical path should be the ordered list of dependant tasks with the shortest duration")
