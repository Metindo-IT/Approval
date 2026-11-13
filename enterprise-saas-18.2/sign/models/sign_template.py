# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import io
import os
import re

from collections import defaultdict

from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.rl_config import TTFSearchPath
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth
from PIL import UnidentifiedImageError

from odoo import api, fields, models, Command, _
from odoo.exceptions import UserError, ValidationError
from odoo.osv import expression
from odoo.tools import config, misc, pdf, format_date
from odoo.tools.pdf import PdfFileReader, PdfFileWriter, PdfReadError, reshape_text

TTFSearchPath.append(misc.file_path("web/static/fonts/sign"))



def _fix_image_transparency(image):
    """ Modify image transparency to minimize issue of grey bar artefact.
    When an image has a transparent pixel zone next to white pixel zone on a
    white background, this may cause on some renderer grey line artefacts at
    the edge between white and transparent.

    This method sets black transparent pixel to white transparent pixel which solves
    the issue for the most probable case. With this the issue happen for a
    black zone on black background but this is less likely to happen.
    """
    pixels = image.load()
    for x in range(image.size[0]):
        for y in range(image.size[1]):
            if pixels[x, y] == (0, 0, 0, 0):
                pixels[x, y] = (255, 255, 255, 0)


class SignTemplate(models.Model):
    _name = 'sign.template'
    _description = "Signature Template"

    def _default_favorited_ids(self):
        return [(4, self.env.user.id)]

    attachment_id = fields.Many2one('ir.attachment', string="Attachment", required=True, ondelete='cascade')
    name = fields.Char(related='attachment_id.name', readonly=False, store=True)
    num_pages = fields.Integer('Number of pages', compute="_compute_num_pages", readonly=True, store=True)
    datas = fields.Binary(related='attachment_id.datas')
    sign_item_ids = fields.One2many('sign.item', 'template_id', string="Signature Items", copy=True)
    responsible_count = fields.Integer(compute='_compute_responsible_count', string="Responsible Count")

    active = fields.Boolean(default=True, string="Active")
    favorited_ids = fields.Many2many('res.users', string="Favorited Users", relation="sign_template_favorited_users_rel", default=_default_favorited_ids)
    user_id = fields.Many2one('res.users', string="Responsible", default=lambda self: self.env.user)

    sign_request_ids = fields.One2many('sign.request', 'template_id', string="Signature Requests")

    tag_ids = fields.Many2many('sign.template.tag', string='Tags')
    color = fields.Integer()
    redirect_url = fields.Char(string="Redirect Link", default="",
        help="Optional link for redirection after signature")
    redirect_url_text = fields.Char(string="Link Label", default="Close", translate=True,
        help="Optional text to display on the button link")
    signed_count = fields.Integer(compute='_compute_signed_in_progress_template')
    in_progress_count = fields.Integer(compute='_compute_signed_in_progress_template')

    authorized_ids = fields.Many2many('res.users', string="Authorized Users", relation="sign_template_authorized_users_rel", default=_default_favorited_ids)
    group_ids = fields.Many2many("res.groups", string="Authorized Groups")
    has_sign_requests = fields.Boolean(compute="_compute_has_sign_requests", compute_sudo=True, store=True)

    is_sharing = fields.Boolean(compute='_compute_is_sharing', help='Checked if this template has created a shared document for you')

    @api.model
    def name_search(self, name='', args=None, operator='ilike', limit=100):
        # Display favorite templates first
        domain = expression.AND([[('display_name', operator, name)], args or []])
        templates = self.search_fetch(domain, ['display_name'], limit=limit)
        if limit is None or len(templates) < limit:
            templates = templates.sorted(key=lambda t: self.env.user in t.favorited_ids, reverse=True)
        else:
            favorited_templates = self.search_fetch(
                expression.AND([domain, [('favorited_ids', '=', self.env.user.id)]]),
                ['display_name'], limit=limit)
            templates = favorited_templates + (templates - favorited_templates)
            templates = templates[:limit]
        return [(template.id, template.display_name) for template in templates.sudo()]

    @api.depends('attachment_id.datas')
    def _compute_num_pages(self):
        for record in self:
            try:
                record.num_pages = self._get_pdf_number_of_pages(base64.b64decode(record.attachment_id.datas))
            except Exception:
                record.num_pages = 0

    @api.depends('sign_item_ids.responsible_id')
    def _compute_responsible_count(self):
        for template in self:
            template.responsible_count = len(template.sign_item_ids.mapped('responsible_id'))

    @api.depends('sign_request_ids')
    def _compute_has_sign_requests(self):
        for template in self:
            template.has_sign_requests = bool(template.with_context(active_test=False).sign_request_ids)

    def _compute_signed_in_progress_template(self):
        sign_requests = self.env['sign.request']._read_group([('state', '!=', 'canceled')], ['state', 'template_id'], ['__count'])
        signed_request_dict = {template.id: count for state, template, count in sign_requests if state == 'signed'}
        in_progress_request_dict = {template.id: count for state, template, count in sign_requests if state == 'sent'}
        for template in self:
            template.signed_count = signed_request_dict.get(template.id, 0)
            template.in_progress_count = in_progress_request_dict.get(template.id, 0)

    @api.depends_context('uid')
    def _compute_is_sharing(self):
        sign_template_sharing_ids = set(self.env['sign.request'].search([
            ('state', '=', 'shared'), ('create_uid', '=', self.env.user.id), ('template_id', 'in', self.ids)
        ]).template_id.ids)
        for template in self:
            template.is_sharing = template.id in sign_template_sharing_ids

    @api.model
    def get_empty_list_help(self, help_message):
        if not self.env.ref('sign.template_sign_tour', raise_if_not_found=False):
            return '<p class="o_view_nocontent_smiling_face">%s</p>' % _('Upload a PDF')
        return super().get_empty_list_help(help_message)

    @api.model_create_multi
    def create(self, vals_list):
        # Sometimes the attachment is not already created in database when the sign template create method is called
        attachment_vals = [{'name': val['name'], 'datas': val.pop('datas')} for val in vals_list if not val.get('attachment_id') and val.get('datas')]
        attachments_iter = iter(self.env['ir.attachment'].create(attachment_vals))
        for val in vals_list:
            if not val.get('attachment_id', True):
                try:
                    val['attachment_id'] = next(attachments_iter).id
                except StopIteration:
                    raise UserError(_('No attachment was provided'))
        attachments = self.env['ir.attachment'].browse([vals.get('attachment_id') for vals in vals_list if vals.get('attachment_id')])
        for attachment in attachments:
            self._check_pdf_data_validity(attachment.datas)
        # copy the attachment if it has been attached to a record
        for vals, attachment in zip(vals_list, attachments):
            if attachment.res_model or attachment.res_id:
                vals['attachment_id'] = attachment.copy().id
            else:
                attachment.res_model = self._name
        templates = super().create(vals_list)
        for template, attachment in zip(templates, templates.attachment_id):
            attachment.write({
                'res_model': self._name,
                'res_id': template.id
            })
        templates.attachment_id.check('read')
        return templates

    def write(self, vals):
        res = super().write(vals)
        if 'attachment_id' in vals:
            self.attachment_id.check('read')
        return res

    def copy_data(self, default=None):
        vals_list = super().copy_data(default=default)
        for template, vals in zip(self, vals_list):
            vals['name'] = vals.get('name', template._get_copy_name(template.name))
        return vals_list

    @api.model
    def create_with_attachment_data(self, name, data, active=True):
        try:
            attachment = self.env['ir.attachment'].create({'name': name, 'datas': data})
            return self.create({'attachment_id': attachment.id, 'active': active}).id
        except UserError:
            return 0

    @api.model
    def _get_pdf_number_of_pages(self, pdf_data):
        file_pdf = PdfFileReader(io.BytesIO(pdf_data), strict=False, overwriteWarnings=False)
        return len(file_pdf.pages)

    def go_to_custom_template(self, sign_directly_without_mail=False):
        self.ensure_one()
        return {
            'name': "Template \"%(name)s\"" % {'name': self.attachment_id.name},
            'type': 'ir.actions.client',
            'tag': 'sign.Template',
            'params': {
                'id': self.id,
                'sign_directly_without_mail': sign_directly_without_mail,
            },
        }

    def _check_send_ready(self):
        if any(item.type_id.item_type == 'selection' and not item.option_ids for item in self.sign_item_ids):
            raise UserError(_("One or more selection items have no associated options"))

    def toggle_favorited(self):
        self.ensure_one()
        self.write({'favorited_ids': [(3 if self.env.user in self[0].favorited_ids else 4, self.env.user.id)]})

    @api.ondelete(at_uninstall=False)
    def _unlink_except_existing_signature(self):
        if self.filtered(lambda template: template.has_sign_requests):
            raise UserError(_(
                "You can't delete a template for which signature requests "
                "exist but you can archive it instead."))

    @api.model
    def _check_pdf_data_validity(self, datas):
        try:
            self._get_pdf_number_of_pages(base64.b64decode(datas))
        except Exception as e:
            raise UserError(_("One uploaded file cannot be read. Is it a valid PDF?"))

    def get_radio_set_info_by_item_id(self, sign_item_ids=None):
        """
        :param list of sign item IDs (sign_item_ids)
        :return: dict radio_set_by_item_dict that maps each sign item ID in sign_item_ids of type "radio"
        to a dictionary containing num_options and radio_set_id of the radio set it belongs to.
        """
        radio_set_by_item_dict = {}
        if sign_item_ids:
            radio_items = self.sign_item_ids.filtered(lambda item: item.radio_set_id and item.id in sign_item_ids)
            radio_set_by_item_dict = {
                radio_item.id: {
                    'num_options': radio_item.num_options,
                    'radio_set_id': radio_item.radio_set_id.id,
                } for radio_item in radio_items
            }
        return radio_set_by_item_dict

    def get_radio_sets_dict(self):
        """
        :return: dict radio_sets_dict that maps each radio set that belongs to
        this template to a dictionary containing num_options and radio_item_ids.
        """
        radio_sets = self.sign_item_ids.filtered(lambda item: item.radio_set_id).radio_set_id
        radio_sets_dict = {
            radio_set.id: {
                'num_options': radio_set.num_options,
                'radio_item_ids': radio_set.radio_items.ids,
            } for radio_set in radio_sets
        }
        return radio_sets_dict

    def update_attachment_name(self, name):
        """
        Updates the attachment's name. If the provided name is empty or None,
        the current name is retained. This forced update prevents the creation
        of duplicate sign items during simultaneous RPC requests.
        :param name: The new name for the attachment.
        :return:
            - True: Indicates the attachment name was successfully updated.
            - False: Indicates the update was skipped because a sign request linked
                    to the template already exists
        """
        self.ensure_one()
        sign_requests = self.env['sign.request'].search([('template_id', '=', self.id)], limit=1)
        if not sign_requests:
            self.attachment_id.name = name or self.attachment_id.name
            return True
        return False

    def update_from_pdfviewer(self, sign_items=None, deleted_sign_item_ids=None, name=None):
        """ Update a sign.template from the pdfviewer
        :param dict sign_items: {id (str): values (dict)}
            id: positive: sign.item's id in database (the sign item is already in the database and should be update)
                negative: negative random itemId(transaction_id) in pdfviewer (the sign item is new created in the pdfviewer and should be created in database)
            values: values to update/create
        :param list(str) deleted_sign_item_ids: list of ids of deleted sign items. These deleted ids may be
            positive: the sign item exists in the database
            negative: the sign item is new created in pdfviewer but removed before a successful transaction
        :return: dict new_id_to_item_id_map: {negative itemId(transaction_id) in pdfviewer (str): positive id in database (int)}
        """
        self.ensure_one()
        if self.has_sign_requests:
            return False
        if sign_items is None:
            sign_items = {}

        self.update_attachment_name(name)

        # update new_sign_items to avoid recreating sign items
        new_sign_items = dict(sign_items)
        sign_items_exist = self.sign_item_ids.filtered(lambda r: str(r.transaction_id) in sign_items)
        for sign_item in sign_items_exist:
            new_sign_items[str(sign_item.id)] = new_sign_items.pop(str(sign_item.transaction_id))
        new_id_to_item_id_map = {str(sign_item.transaction_id): sign_item.id for sign_item in sign_items_exist}

        # unlink sign items
        deleted_sign_item_ids = set() if deleted_sign_item_ids is None else set(deleted_sign_item_ids)
        self.sign_item_ids.filtered(lambda r: r.id in deleted_sign_item_ids or (r.transaction_id in deleted_sign_item_ids)).unlink()

        # update existing sign items
        for item in self.sign_item_ids.filtered(lambda r: str(r.id) in new_sign_items):
            str_item_id = str(item.id)
            if 'option_ids' in new_sign_items.get(str_item_id):
                new_option_ids = list(map(int, new_sign_items[str_item_id]['option_ids']))
                new_sign_items[str_item_id]['option_ids'] = [[6, 0, new_option_ids]]
            item.write(new_sign_items.pop(str_item_id))

        # create new sign items
        new_values_list = []
        for key, values in new_sign_items.items():
            if int(key) < 0:
                values['template_id'] = self.id
                new_values_list.append(values)
        new_id_to_item_id_map.update(zip(new_sign_items.keys(), self.env['sign.item'].create(new_values_list).ids))

        return new_id_to_item_id_map

    @api.model
    def _get_copy_name(self, name):
        regex = re.compile(r'(.*?)((?:\(\d+\))?)((?:\.pdf)?)$')
        match = regex.search(name)
        name_doc = match.group(1)
        name_ver = match.group(2)
        name_ext = match.group(3)
        version = int(name_ver[1:-1]) + 1 if name_ver else 2
        return f"{name_doc}({version}){name_ext}"

    @api.model
    def rotate_pdf(self, template_id=None):
        template = self.browse(template_id)
        if template.has_sign_requests:
            return False

        template.datas = base64.b64encode(pdf.rotate_pdf(base64.b64decode(template.datas)))

        return True

    def open_requests(self):
        return {
            "type": "ir.actions.act_window",
            "name": _("Sign requests"),
            "res_model": "sign.request",
            "res_id": self.id,
            "domain": [["template_id", "in", self.ids]],
            "views": [[False, 'kanban'], [False, "form"]],
            "context": {'search_default_signed': True}
        }

    def open_shared_sign_request(self):
        self.ensure_one()
        shared_sign_request = self.sign_request_ids.filtered(lambda sr: sr.state == 'shared' and sr.create_uid == self.env.user)
        if not shared_sign_request:
            if len(self.sign_item_ids.mapped('responsible_id')) > 1:
                raise ValidationError(_("You cannot share this document by link, because it has fields to be filled by different roles. Use Send button instead."))
            shared_sign_request = self.env['sign.request'].with_context(no_sign_mail=True).create({
                'template_id': self.id,
                'request_item_ids': [Command.create({'role_id': self.sign_item_ids.responsible_id.id or self.env.ref('sign.sign_item_role_default').id})],
                'reference': "%s-%s" % (self.name, _("Shared")),
                'state': 'shared',
            })
        return {
            "name": _("Share Document by Link"),
            'type': 'ir.actions.act_window',
            "res_model": "sign.request",
            "res_id": shared_sign_request.id,
            "target": "new",
            'views': [[self.env.ref("sign.sign_request_share_view_form").id, 'form']],
        }

    def get_action_in_progress_requests(self):
        """ Get the in-progress sign requests related to this template. """
        sign_request_ids = self.env['sign.request'].search([('state', '=', 'sent'), ('template_id', '=', self.id)]).ids
        return {
            'type': 'ir.actions.act_window',
            'name': _('In Progress Requests'),
            'res_model': 'sign.request',
            'views': [[False, 'list'], [False, 'form']],
            'domain': [('id', 'in', sign_request_ids)],
        }

    def get_action_signed_requests(self):
        """ Get the signed sign requests related to this template. """
        sign_request_ids = self.env['sign.request'].search([('state', '=', 'signed'), ('template_id', '=', self.id)]).ids
        return {
            'type': 'ir.actions.act_window',
            'name': _('Signed Requests'),
            'res_model': 'sign.request',
            'views': [[False, 'list'], [False, 'form']],
            'domain': [('id', 'in', sign_request_ids)],
        }

    def stop_sharing(self):
        self.ensure_one()
        return self.sign_request_ids.filtered(lambda sr: sr.state == 'shared' and sr.create_uid == self.env.user).unlink()

    def _copy_sign_items_to(self, new_template):
        """ copy all sign items of the self template to the new_template """
        self.ensure_one()
        if new_template.has_sign_requests:
            raise UserError(_("Somebody is already filling a document which uses this template"))
        item_id_map = {}
        for sign_item in self.sign_item_ids:
            new_sign_item = sign_item.copy({'template_id': new_template.id})
            item_id_map[str(sign_item.id)] = str(new_sign_item.id)
        return item_id_map

    def _get_sign_items_by_page(self):
        self.ensure_one()
        items = defaultdict(lambda: self.env['sign.item'])
        for item in self.sign_item_ids:
            items[item.page] += item
        return items

    def trigger_template_tour(self):
        template = self.env.ref('sign.template_sign_tour')
        if template.has_sign_requests:
            template = template.copy({
                'favorited_ids': [Command.link(self.env.user.id)],
                'active': False
            })
        return {
            'type': 'ir.actions.client',
            'tag': 'sign.Template',
            'name': template.name,
            'params': {
                'sign_edit_call': 'sign_send_request',
                'id': template.id,
                'sign_directly_without_mail': False
            }
        }

    ##################
    # PDF Rendering #
    ##################

    def _check_is_encrypted(self):
        self.ensure_one()
        if not self.sign_item_ids:
            return False
        old_pdf = PdfFileReader(io.BytesIO(self.attachment_id.raw), strict=False)
        return old_pdf.isEncrypted

    def _get_font(self):
        custom_font = self.env["ir.config_parameter"].sudo().get_param("sign.use_custom_font")
        # The font must be a TTF font. The tool 'otf2ttf' may be useful for conversion.
        if custom_font:
            pdfmetrics.registerFont(TTFont(custom_font, custom_font + ".ttf"))
            return custom_font
        return "Helvetica"

    def _get_normal_font_size(self):
        return 0.015

    @api.model
    def _get_page_size(self, pdf_reader):
        max_width = max_height = 0
        for page in pdf_reader.pages:
            media_box = page.mediaBox
            width = media_box and media_box.getWidth()
            height = media_box and media_box.getHeight()
            max_width = width if width > max_width else max_width
            max_height = height if height > max_height else max_height

        return (max_width, max_height) if max_width and max_height else None

    def _get_preview_values(self):
        """ prepare preview values based on current user and auto field"""
        self.ensure_one()
        values_dict = {}
        sign_item_type_date = self.env.ref('sign.sign_item_type_date', raise_if_not_found=False)
        phone_item_type = self.env.ref('sign.sign_item_type_phone', raise_if_not_found=False)
        company_item_type = self.env.ref('sign.sign_item_type_company', raise_if_not_found=False)
        email_item_type = self.env.ref('sign.sign_item_type_email', raise_if_not_found=False)
        name_item_type = self.env.ref('sign.sign_item_type_name', raise_if_not_found=False)
        with misc.file_open('sign/static/demo/signature.png', 'rb') as image_file:
            signature_b64 = base64.b64encode(image_file.read())
        with misc.file_open('sign/static/img/initial_example.png', 'rb') as image_file:
            initial_b64 = base64.b64encode(image_file.read())
        for it in self.sign_item_ids:
            role_name = it.responsible_id.name
            value = None
            if it.type_id == name_item_type:
                value = _("%s's name", role_name)
            elif it.type_id == phone_item_type:
                value = "+1 555-555-5555 (%s)" % role_name
            elif it.type_id == company_item_type:
                value = _("%s Company", role_name)
            elif it.type_id == email_item_type:
                value = "%s@example.com" % role_name.lower()
            elif it.type_id.item_type == "signature":
                value = "data:image/png;base64,%s" % signature_b64.decode()
            elif it.type_id.item_type == "initial":
                value = 'data:image/png;base64,%s' % initial_b64.decode()
            elif it.type_id.item_type == "text":
                if it.type_id != sign_item_type_date:
                    value = _("Sample generated by Odoo for %s.", role_name)
                else:
                    value = format_date(self.env, fields.Date.today())
            elif it.type_id.item_type == "textarea":
                value = _("""Odoo is a suite of open source business apps
that cover all your company needs:
CRM, eCommerce, accounting, inventory, point of sale,\n project management, etc.
            """)
            elif it.type_id.item_type == "checkbox":
                value = "on"
            elif it.type_id.item_type == "selection":
                value = it.option_ids[:1].id  # we select always the first option
            elif it.type_id.item_type == "radio":
                radio_items = it.radio_set_id.radio_items
                value = "on" if it == radio_items[:1] else ""  # we select always the first option
            elif it.type_id.item_type == "strikethrough":
                value = "striked"
            values_dict[it.id] = {
                "value": value,
                "frame": "",
                'frame_has_hash': False,
            }
        signed_values = values_dict
        return signed_values, values_dict

    def _render_template_with_items(self, password="", signed_values=None, values_dict=None, final_log_hash=None):
        self.ensure_one()
        items_by_page = self._get_sign_items_by_page()
        if not signed_values or not values_dict:
            signed_values, values_dict = self._get_preview_values()
        try:
            old_pdf = PdfFileReader(io.BytesIO(self.attachment_id.raw), strict=False)
            old_pdf.getNumPages()
        except (ValueError, PdfReadError):
            raise ValidationError(_("ERROR: Invalid PDF file!"))

        isEncrypted = old_pdf.isEncrypted
        if isEncrypted and not old_pdf.decrypt(password):
            # password is not correct
            return

        font = self._get_font()
        normalFontSize = self._get_normal_font_size()

        packet = io.BytesIO()
        can = canvas.Canvas(packet, pagesize=self._get_page_size(old_pdf))
        for p in range(0, old_pdf.getNumPages()):
            page = old_pdf.getPage(p)
            # Absolute values are taken as it depends on the MediaBox template PDF metadata, they may be negative
            width = float(abs(page.mediaBox.getWidth()))
            height = float(abs(page.mediaBox.getHeight()))
            
            #add the final_log_hash as the certificate reference id on each page
            if final_log_hash:
                can.setFont(font, height * 0.01)
                ref_text = f"Signature: {final_log_hash}"
                can.drawCentredString(width/3, height-15, ref_text)

            # Set page orientation (either 0, 90, 180 or 270)
            rotation = page.get('/Rotate', 0)
            if rotation and isinstance(rotation, int):
                can.rotate(rotation)
                # Translate system so that elements are placed correctly
                # despite of the orientation
                if rotation == 90:
                    width, height = height, width
                    can.translate(0, -height)
                elif rotation == 180:
                    can.translate(-width, -height)
                elif rotation == 270:
                    width, height = height, width
                    can.translate(-width, 0)

            items = items_by_page.get(p + 1, [])
            for item in items:
                value_dict = signed_values.get(item.id)
                if not value_dict:
                    continue
                # only get the 1st
                value = value_dict['value']
                frame = value_dict['frame']
                if frame:
                    try:
                        image_reader = ImageReader(io.BytesIO(base64.b64decode(frame[frame.find(',') + 1:])))
                    except UnidentifiedImageError:
                        raise ValidationError(_("There was an issue downloading your document. Please contact an administrator."))
                    _fix_image_transparency(image_reader._image)
                    can.drawImage(
                        image_reader,
                        width * item.posX,
                        height * (1 - item.posY - item.height),
                        width * item.width,
                        height * item.height,
                        'auto',
                        True
                    )

                if item.type_id.item_type == "text":
                    value = reshape_text(value)
                    can.setFont(font, height * item.height * 0.8)
                    if item.alignment == "left":
                        can.drawString(width * item.posX, height * (1 - item.posY - item.height * 0.9), value)
                    elif item.alignment == "right":
                        can.drawRightString(width * (item.posX + item.width), height * (1 - item.posY - item.height * 0.9), value)
                    else:
                        can.drawCentredString(width * (item.posX + item.width / 2), height * (1 - item.posY - item.height * 0.9), value)

                elif item.type_id.item_type == "selection":
                    text = ""
                    for option in item.option_ids:
                        if option.id == int(value):
                            text = option.value
                    font_size = height * normalFontSize * 0.8
                    string_width = stringWidth(text, font, font_size)
                    p = Paragraph(text, ParagraphStyle(name='Selection Paragraph', fontName=font, fontSize=font_size, leading=12))
                    posX = width * (item.posX + item.width * 0.5) - string_width // 2
                    posY = height * (1 - item.posY - item.height * 0.5) - p.wrap(width, height)[1] // 2
                    p.drawOn(can, posX, posY)

                elif item.type_id.item_type == "textarea":
                    font_size = height * normalFontSize * 0.8
                    can.setFont(font, font_size)
                    lines = value.split('\n')
                    y = (1 - item.posY)
                    for line in lines:
                        empty_space = width * item.width - can.stringWidth(line, font, font_size)
                        x_shift = 0
                        if item.alignment == 'center':
                            x_shift = empty_space / 2
                        elif item.alignment == 'right':
                            x_shift = empty_space
                        y -= normalFontSize * 0.9
                        line = reshape_text(line)
                        can.drawString(width * item.posX + x_shift, height * y, line)
                        y -= normalFontSize * 0.1

                elif item.type_id.item_type == "checkbox":
                    itemW, itemH = item.width * width, item.height * height
                    itemX, itemY = item.posX * width, (1 - item.posY) * height
                    meanSize = (itemW + itemH) // 2
                    can.setLineWidth(max(meanSize // 30, 1))
                    can.rect(itemX, itemY - itemH, itemW, itemH)
                    if value == 'on':
                        can.setLineWidth(max(meanSize // 20, 1))
                        can.bezier(
                            itemX + 0.20 * itemW, itemY - 0.35 * itemH,
                            itemX + 0.30 * itemW, itemY - 0.8 * itemH,
                            itemX + 0.30 * itemW, itemY - 1.2 * itemH,
                            itemX + 0.85 * itemW, itemY - 0.15 * itemH,
                        )
                elif item.type_id.item_type == "radio":
                    x = width * item.posX
                    y = height * (1 - item.posY)
                    w = item.width * width
                    h = item.height * height
                    # Calculate the center of the sign item rectangle.
                    c_x = x + w * 0.5
                    c_y = y - h * 0.5
                    # Draw the outer empty circle.
                    can.circle(c_x, c_y, h * 0.5)
                    if value == "on":
                        # Draw the inner filled circle.
                        can.circle(x_cen=c_x, y_cen=c_y, r=h * 0.5 * 0.75, fill=1)
                elif item.type_id.item_type == "signature" or item.type_id.item_type == "initial":
                    try:
                        image_reader = ImageReader(io.BytesIO(base64.b64decode(value[value.find(',') + 1:])))
                    except UnidentifiedImageError:
                        raise ValidationError(_("There was an issue downloading your document. Please contact an administrator."))
                    _fix_image_transparency(image_reader._image)
                    can.drawImage(image_reader, width * item.posX, height * (1 - item.posY - item.height), width * item.width, height * item.height, 'auto', True)
                elif item.type_id.item_type == "strikethrough" and value == "striked":
                    x = width * item.posX
                    y = height * (1 - item.posY)
                    w = item.width * width
                    h = item.height * height
                    can.line(x, y - 0.5 * h, x + w, y - 0.5 * h)

            can.showPage()

        can.save()

        item_pdf = PdfFileReader(packet)
        new_pdf = PdfFileWriter()

        for p in range(0, old_pdf.getNumPages()):
            page = old_pdf.getPage(p)
            page.mergePage(item_pdf.getPage(p))
            new_pdf.addPage(page)

        if isEncrypted:
            new_pdf.encrypt(password)

        output = io.BytesIO()
        try:
            new_pdf.write(output)
        except PdfReadError:
            raise ValidationError(_("There was an issue downloading your document. Please contact an administrator."))
        return output

    def action_template_preview(self):
        self.ensure_one()
        # We create the wizard here to have a proper id (not newID). The pdf_viewer widget needs it
        # to display the pdf in the iFrame
        wizard = self.env['sign.template.preview'].create({
            'template_id': self.id
        })
        return {
            'name': _("Template Preview"),
            'res_id': wizard.id,
            'type': 'ir.actions.act_window',
            'res_model': 'sign.template.preview',
            'target': 'new',
            'views': [[False, 'form']],
            'context': self.env.context,
        }

    def get_template_items_roles_info(self):
        """ Extract a unique list of role IDs and colors from self.sign_item_ids, adding an index. """
        self.ensure_one()
        roles_info = []
        for idx, role in enumerate(self.sign_item_ids.responsible_id):
            roles_info.append({
                'id': idx,
                'roleId': role.id,
                'colorId': idx,
            })
        return roles_info
