# -*- coding: utf-8 -*-

from . import controllers
from . import models
from . import wizard


def _documents_hr_post_init(env):
    env['res.company'].search([('documents_hr_folder', '=', False)]).documents_hr_folder = env.ref(
        'documents_hr.document_hr_folder')
