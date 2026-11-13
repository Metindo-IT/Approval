{
    'name': 'Dinas Luar',
    'version': '1.0',
    'summary': 'Manajemen Dinas Luar, Kendaraan, dan Reimbursement',
    'author': '[umar]',
    'depends': ['base', 'hr', 'fleet', 'hr_expense'],
    'data': [
        'security/ir.model.access.csv',
        'views/dinas_luar_views.xml',
        'views/hr_expense_views.xml',
    ],
    'installable': True,
    'application': True,
}