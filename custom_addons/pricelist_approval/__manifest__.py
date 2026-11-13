{
    'name': 'Pricelist Approval',
    'version': '1.0',
    'summary': 'Marketing Pricelist Approval Process',
    'author': '[umar]',
    'depends': ['base', 'product'],
    'data': [
        'security/ir.model.access.csv',
        'views/pricelist_approval_views.xml',
    ],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}