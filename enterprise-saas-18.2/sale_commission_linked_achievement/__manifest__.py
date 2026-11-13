# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Sale Commission additionnal fields',
    'version': '1.0',
    'category': 'Sales/Commission',
    'summary': "Manage your salespersons' commissions with improved adjustments",
    'description': """
This module is only temporary for its purpose is to add new fields in a stable version (saas-18.1).
    """,
    'depends': ['sale_commission'],
    'data': [
        'views/sale_commission_achievement_view.xml',
        'views/sale_commission_plan_view.xml',
    ],
    'license': 'OEEL-1',
}
