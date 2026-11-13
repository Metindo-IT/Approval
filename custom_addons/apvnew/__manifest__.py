{
    'name': 'Custom Approvals New',
    'version': '18.0.1.0.0',
    'category': 'Operations',
    'summary': 'Modul kustom mandiri untuk proses approval',
    'depends': ['base'],
    'data': [
        'security/ir.model.access.csv',
        'views/apv_views.xml',
    ],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}