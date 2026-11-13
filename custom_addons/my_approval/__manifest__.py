{
    'name': 'My Approval',
    'version': '18.0.1.0.0',
    'category': 'Operations',
    'summary': 'Modul approval kustom baru',
    'depends': ['base'],
    'data': [
        'security/ir.model.access.csv',
        'views/approval_views.xml',
    ],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}