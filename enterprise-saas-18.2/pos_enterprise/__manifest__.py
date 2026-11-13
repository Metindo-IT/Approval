# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Point of Sale enterprise',
    'category': 'Sales/Point of Sale',
    'summary': 'Advanced features for PoS',
    'description': """
Advanced features for the PoS like better views 
for IoT Box config.   
""",
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'depends': ['web_enterprise', 'point_of_sale'],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_enterprise/static/src/**/*',
            ('remove', 'pos_enterprise/static/src/**/*.dark.scss'),
        ],
        'point_of_sale.assets_prod_dark': [
            ('include', 'web.dark_mode_variables'),
            # web._assets_backend_helpers
            ('before', 'web_enterprise/static/src/scss/bootstrap_overridden.scss', 'web_enterprise/static/src/scss/bootstrap_overridden.dark.scss'),
            ('after', 'web/static/lib/bootstrap/scss/_functions.scss', 'web_enterprise/static/src/scss/bs_functions_overridden.dark.scss'),
            # assets_backend
            'web_enterprise/static/src/**/*.dark.scss',
            'pos_enterprise/static/src/**/*.dark.scss',
        ],
    },
    'auto_install': True,
    'license': 'OEEL-1',
}
