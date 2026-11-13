{
    'name': 'Indian - Accounting Reports',
    'version': '1.1',
    'description': """
Accounting reports for India
================================
    """,
    'category': 'Accounting/Localizations/Reporting',
    'depends': [
        'l10n_in',
        'account_reports',
        'sign',
        'account_batch_payment',
        'barcodes',
        'account_invoice_extract',
        'documents',
        'account_asset',
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/service_cron.xml',
        'data/mail_activity_type_data.xml',
        'data/account_tax_report_tds_tcs_data.xml',
        'data/account_financial_html_report_gstr1.xml',
        'data/account_financial_html_report_gstr3b.xml',
        'data/balance_sheet.xml',
        'data/profit_and_loss.xml',
        'data/bank_template.xml',
        'data/enet_payment_methods.xml',
        'wizard/gst_otp_validation.xml',
        'views/account_asset_view.xml',
        'views/account_modify_views.xml',
        'views/gst_return_period.xml',
        'views/account_move_views.xml',
        'views/res_config_settings.xml',
        'views/account_journal_dashboard_view.xml',
        'views/account_batch_payment_views.xml',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'installable': True,
    'post_init_hook': '_l10n_in_reports_post_init',
    'license': 'OEEL-1',
    'assets': {
        'web.assets_backend': [
            'l10n_in_reports/static/src/**/*',
        ],
    },
    'external_dependencies': {
        'python': ['pyjwt']
    },
}
