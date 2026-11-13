# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': "Indian - GSTR with E-invoice",
    'description': """
Indian - GSTR with E-invoice
====================================
This bridge module allows to manage Indian GSTR with E-invoice module.
    """,
    'category': 'Accounting/Localizations/Reporting',
    'depends': ['l10n_in_edi', 'l10n_in_reports'],
    'data': [
        'views/gst_return_period.xml',
    ],
    'auto_install': True,
    'license': 'OEEL-1',
}
