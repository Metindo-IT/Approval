# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import time
import uuid
from werkzeug.urls import url_join, url_quote
from markupsafe import Markup

from odoo import _, api, fields, models, Command
from odoo.tools import format_list, get_lang, is_html_empty, format_date
from odoo.exceptions import UserError, ValidationError
from odoo.tools.pdf.signature import PdfSigner


class SignRequest(models.Model):
    _name = 'sign.request'
    _description = "Signature Request"
    _rec_name = 'reference'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    def _default_access_token(self):
        return str(uuid.uuid4())

    def _get_mail_link(self, email, subject):
        return "mailto:%s?subject=%s" % (url_quote(email), url_quote(subject))

    @api.model
    def _selection_target_model(self):
        return [(model.model, model.name)
                for model in self.env['ir.model'].sudo().search([('model', '!=', 'sign.request'), ('is_mail_thread', '=', 'True')])]

    template_id = fields.Many2one('sign.template', string="Template", required=True)
    subject = fields.Char(string="Email Subject")
    reference = fields.Char(required=True, string="Document Name", help="This is how the document will be named in the mail")
    reference_doc = fields.Reference(string="Linked To", selection='_selection_target_model', index='btree_not_null')

    access_token = fields.Char('Security Token', required=True, default=_default_access_token, readonly=True, copy=False)
    share_link = fields.Char(string="Share Link", compute='_compute_share_link', readonly=False)
    is_shared = fields.Boolean(string="Share Request Button", compute='_compute_is_shared', inverse='_inverse_is_shared')

    request_item_ids = fields.One2many('sign.request.item', 'sign_request_id', string="Signers", copy=True)
    state = fields.Selection([
        ("shared", "Shared"),
        ("sent", "To Sign"),
        ("signed", "Fully Signed"),
        ("canceled", "Cancelled"),
        ("expired", "Expired"),
    ], default='sent', tracking=True, group_expand=True, copy=False, index=True)

    completed_document = fields.Binary(readonly=True, string="Completed Document", attachment=True, copy=False)

    nb_wait = fields.Integer(string="Sent Requests", compute="_compute_stats", store=True)
    nb_closed = fields.Integer(string="Completed Signatures", compute="_compute_stats", store=True)
    nb_total = fields.Integer(string="Requested Signatures", compute="_compute_stats", store=True)
    progress = fields.Char(string="Progress", compute="_compute_progress", compute_sudo=True)
    start_sign = fields.Boolean(string="Signature Started", help="At least one signer has signed the document.", compute="_compute_progress", compute_sudo=True)
    integrity = fields.Boolean(string="Integrity of the Sign request", compute='_compute_hashes', compute_sudo=True)

    active = fields.Boolean(default=True, string="Active", copy=False)
    favorited_ids = fields.Many2many('res.users', string="Favorite of")

    color = fields.Integer()
    request_item_infos = fields.Binary(compute="_compute_request_item_infos")
    last_action_date = fields.Datetime(related="message_ids.create_date", readonly=True, string="Last Action Date")
    completion_date = fields.Date(string="Completion Date", compute="_compute_progress", compute_sudo=True)
    communication_company_id = fields.Many2one('res.company', string="Company used for communication", default=lambda self: self.env.company)

    sign_log_ids = fields.One2many('sign.log', 'sign_request_id', string="Logs", help="Activity logs linked to this request")
    template_tags = fields.Many2many('sign.template.tag', string='Tags')
    cc_partner_ids = fields.Many2many('res.partner', string='Copy to', compute='_compute_cc_partners')
    message = fields.Html('sign.message')
    message_cc = fields.Html('sign.message_cc')
    attachment_ids = fields.Many2many('ir.attachment', string='Attachments', readonly=True, copy=False, ondelete="restrict")
    completed_document_attachment_ids = fields.Many2many('ir.attachment', 'sign_request_completed_document_rel', string='Completed Documents', readonly=True, copy=False, ondelete="restrict")

    need_my_signature = fields.Boolean(compute='_compute_need_my_signature', search='_search_need_my_signature')

    validity = fields.Date(string='Valid Until')
    reminder_enabled = fields.Boolean(default=False)
    reminder = fields.Integer(string='Reminder', default=7)
    last_reminder = fields.Date(string='Last reminder', default=lambda self: fields.Date.today())
    certificate_reference = fields.Boolean(string="Certificate Reference", default=False)

    @api.constrains('reminder_enabled', 'reminder')
    def _check_reminder(self):
        for request in self:
            if request.reminder_enabled and request.reminder <= 0:
                raise UserError(_("We can only send reminders in the future - as soon as we find a way to send reminders in the past we'll notify you.\nIn the mean time, please make sure to input a positive number of days for the reminder interval."))

    @api.depends('state')
    def _compute_is_shared(self):
        for sign_request in self:
            sign_request.is_shared = sign_request.state == 'shared'

    def _inverse_is_shared(self):
        for sign_request in self:
            if sign_request.is_shared:
                sign_request.state = 'shared'
            else:
                sign_request.state = 'sent'

    @api.depends_context('uid')
    def _compute_need_my_signature(self):
        my_partner_id = self.env.user.partner_id
        for sign_request in self:
            sign_request.need_my_signature = any(sri.partner_id.id == my_partner_id.id and sri.state == 'sent' and sri.is_mail_sent for sri in sign_request.request_item_ids)

    @api.model
    def _search_need_my_signature(self, operator, value):
        my_partner_id = self.env.user.partner_id
        if operator not in ['=', '!='] or not isinstance(value, bool):
            return []
        domain_operator = 'not in' if (operator == '=') ^ value else 'in'
        documents_ids = self.env['sign.request.item'].search([('partner_id', '=', my_partner_id.id), ('state', '=', 'sent'), ('is_mail_sent', '=', True)]).mapped('sign_request_id').ids
        return [('id', domain_operator, documents_ids)]

    @api.depends('request_item_ids.state')
    def _compute_stats(self):
        for rec in self:
            rec.nb_total = len(rec.request_item_ids)
            rec.nb_wait = len(rec.request_item_ids.filtered(lambda sri: sri.state == 'sent'))
            rec.nb_closed = rec.nb_total - rec.nb_wait

    @api.depends('request_item_ids.state')
    def _compute_progress(self):
        for rec in self:
            rec.start_sign = bool(rec.nb_closed)
            rec.progress = "{} / {}".format(rec.nb_closed, rec.nb_total)
            rec.completion_date = rec.request_item_ids.sorted(key="signing_date", reverse=True)[:1].signing_date if not rec.nb_wait else None

    @api.depends('request_item_ids.state', 'request_item_ids.partner_id.name')
    def _compute_request_item_infos(self):
        for request in self:
            request.request_item_infos = [{
                'id': item.id,
                'partner_name': item.display_name,
                'state': item.state,
                'signing_date': item.signing_date or ''
            } for item in request.request_item_ids]

    @api.depends('message_follower_ids.partner_id')
    def _compute_cc_partners(self):
        for sign_request in self:
            sign_request.cc_partner_ids = sign_request.message_follower_ids.partner_id - sign_request.request_item_ids.partner_id

    @api.depends('request_item_ids.access_token')
    def _compute_share_link(self):
        for sign_request in self.filtered(lambda sr: sr.state == 'shared'):
            sign_request.share_link = "%s/sign/document/mail/%s/%s" % (self.get_base_url(), sign_request.id, sign_request.request_item_ids[0].sudo().access_token)

    @api.model_create_multi
    def create(self, vals_list):
        sign_requests = super().create(vals_list)
        sign_requests.template_id._check_send_ready()
        for sign_request in sign_requests:
            if not sign_request.request_item_ids:
                raise ValidationError(_("A valid sign request needs at least one sign request item"))
            sign_request.template_tags = [Command.set(sign_request.template_id.tag_ids.ids)]
            sign_request.attachment_ids.write({'res_model': sign_request._name, 'res_id': sign_request.id})
            sign_request.message_subscribe(partner_ids=sign_request.request_item_ids.partner_id.ids)
            self.env['sign.log'].sudo().create({'sign_request_id': sign_request.id, 'action': 'create'})
        if not self._context.get('no_sign_mail'):
            sign_requests.send_signature_accesses()
        return sign_requests

    def write(self, vals):
        today = fields.Date.today()
        if 'validity' in vals and fields.Date.from_string(vals['validity']) < today:
            vals['state'] = 'expired'

        res = super().write(vals)
        return res

    def copy_data(self, default=None):
        default = dict(default or {})
        vals_list = super().copy_data(default=default)
        if 'attachment_ids' not in default:
            for request, vals in zip(self, vals_list):
                vals['attachment_ids'] = request.attachment_ids.copy().ids
        return vals_list

    def copy(self, default=None):
        sign_requests = super().copy(default)
        for old_request, new_request in zip(self, sign_requests):
            new_request.message_subscribe(partner_ids=old_request.cc_partner_ids.ids)
        return sign_requests

    def action_archive(self):
        self.filtered(lambda sr: sr.active and sr.state == 'sent').cancel()
        return super().action_archive()

    def action_share_request(self):
        self.ensure_one()
        self.is_shared = True
        return {'type': 'ir.actions.act_window_close'}

    def action_close_request(self):
        self.ensure_one()
        if not self.is_shared:
            self.unlink()
        return {'type': 'ir.actions.act_window_close'}

    def _check_senders_validity(self):
        invalid_senders = self.create_uid.filtered(lambda u: not u.email_formatted)
        if invalid_senders:
            raise ValidationError(_("Please configure senders'(%s) email addresses", ', '.join(invalid_senders.mapped('name'))))

    def _check_signers_roles_validity(self):
        for sign_request in self:
            template_roles = sign_request.sudo().template_id.sign_item_ids.responsible_id
            sign_request_items = sign_request.request_item_ids
            if len(sign_request_items) != max(len(template_roles), 1) or \
                    set(sign_request_items.role_id.ids) != (set(template_roles.ids) if template_roles else set([self.env.ref('sign.sign_item_role_default').id])):
                raise ValidationError(_("You must specify one signer for each role of your sign template"))

    def _check_signers_partners_validity(self):
        for sign_request in self:
            sign_request_items = sign_request.request_item_ids
            if sign_request.state == 'shared' and (len(sign_request_items) != 1 or sign_request_items.partner_id):
                raise ValidationError(_("A shared sign request should only have one signer with an empty partner"))
            if sign_request.state != 'shared' and any(not sri.partner_id for sri in sign_request_items):
                raise ValidationError(_("A non-shared sign request's should not have any signer with an empty partner"))

    def _get_final_recipients(self):
        all_recipients = set(self.request_item_ids.mapped('signer_email')) | \
                         set(self.cc_partner_ids.filtered(lambda p: p.email_formatted).mapped('email'))
        return all_recipients

    def _get_next_sign_request_items(self):
        self.ensure_one()
        sign_request_items_sent = self.request_item_ids.filtered(lambda sri: sri.state == 'sent')
        if not sign_request_items_sent:
            return self.env['sign.request.item']
        smallest_order = min(sign_request_items_sent.mapped('mail_sent_order'))
        next_request_items = sign_request_items_sent.filtered(lambda sri: sri.mail_sent_order == smallest_order)
        return next_request_items

    def go_to_document(self):
        self.ensure_one()
        request_items = self.request_item_ids.filtered(lambda r: not r.partner_id or (r.state == 'sent' and r.partner_id.id == self.env.user.partner_id.id))
        return {
            'name': self.reference,
            'type': 'ir.actions.client',
            'tag': 'sign.Document',
            'context': {
                'id': self.id,
                'token': self.access_token,
                'need_to_sign': bool(request_items),
                'create_uid': self.create_uid.id,
                'state': self.state,
                'request_item_states': {str(item.id): item.is_mail_sent for item in self.request_item_ids},
            },
        }

    def go_to_signable_document(self, request_items=None):
        """ go to the signable document as the signers for specified request_items or the current user"""
        self.ensure_one()
        if not request_items:
            request_items = self.request_item_ids.filtered(lambda r: not r.partner_id or (r.state == 'sent' and r.partner_id.id == self.env.user.partner_id.id))
        if not request_items:
            return
        return {
            'name': self.reference,
            'type': 'ir.actions.client',
            'tag': 'sign.SignableDocument',
            'context': {
                'id': self.id,
                'token': request_items[:1].sudo().access_token,
                'create_uid': self.create_uid.id,
                'state': self.state,
                'request_item_states': {item.id: item.is_mail_sent for item in self.request_item_ids},
                'template_editable': self.nb_closed == 0,
                'token_list': request_items[1:].sudo().mapped('access_token'),
                'name_list': [item.partner_id.name for item in request_items[1:]],
            },
        }

    def open_template(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": _("Templates"),
            "res_model": "sign.template",
            "domain": [["id", "=", self.template_id.id], ["active", "=", self.template_id.active]],
            "views": [[False, 'kanban']]
        }

    def get_completed_document(self):
        if not self:
            raise UserError(_('You should select at least one document to download.'))

        if len(self) < 2:
            return {
                'name': 'Signed Document',
                'type': 'ir.actions.act_url',
                'url': '/sign/download/%(request_id)s/%(access_token)s/completed' % {'request_id': self.id, 'access_token': self.access_token},
            }
        else:
            return {
                'name': 'Signed Documents',
                'type': 'ir.actions.act_url',
                'url': f'/sign/download/zip/{",".join(map(str, self.ids))}',
            }

    def open_logs(self):
        self.ensure_one()
        return {
            "name": _("Activity Logs"),
            "type": "ir.actions.act_window",
            "res_model": "sign.log",
            'view_mode': 'list,form',
            'domain': [('sign_request_id', '=', self.id)],
        }

    def _get_linked_record_action(self, default_action=None):
        """" Return the default action for any kind of record. This method can be override for specific kind or rec
        """
        self.ensure_one()
        if not default_action:
            default_action = {}
        action_rec = self.env['ir.actions.act_window'].search([
            ('res_model', '=', self.reference_doc._name),
            ('context', 'not ilike', 'active_id')], limit=1)
        if action_rec:
            action = action_rec._get_action_dict()
            action.update({
                "views": [(False, "form")],
                "view_mode":  'form',
                "res_id": self.reference_doc.id,
                "target": 'current',
            })
        else:
            action = default_action
        return action

    def get_close_values(self):
        self.ensure_one()
        # check if frontend user or backend
        action = self.env["ir.actions.actions"]._for_xml_id("sign.sign_request_action")
        result = {"action": action, "label": _("Close"), "custom_action": False}
        if self.reference_doc and self.reference_doc.exists():
            action = self._get_linked_record_action(action)
            result = {"action": action, "label": _("Back to %s", self.reference_doc._description), "custom_action": True}
        return result

    @api.onchange("progress", "start_sign")
    def _compute_hashes(self):
        for document in self:
            try:
                document.integrity = self.sign_log_ids._check_document_integrity()
            except Exception:
                document.integrity = False

    def toggle_favorited(self):
        self.ensure_one()
        self.write({'favorited_ids': [(3 if self.env.user in self.favorited_ids else 4, self.env.user.id)]})

    def _refuse(self, refuser, refusal_reason):
        """ Refuse a SignRequest. It can only be used in SignRequestItem._refuse
        :param res.partner refuser: the refuser who refuse to sign
        :param str refusal_reason: the refusal reason provided by the refuser
        """
        self.ensure_one()
        if self.state != 'sent':
            raise UserError(_("This sign request cannot be refused"))
        self._check_senders_validity()
        self.cancel()

        # cancel request and activities for other unsigned users
        for user in self.request_item_ids.partner_id.user_ids.filtered(lambda u: u.has_group('sign.group_sign_user')):
            self.activity_unlink(['mail.mail_activity_data_todo'], user_id=user.id)

        # send emails to signers and cc_partners
        for sign_request_item in self.request_item_ids:
            self._send_refused_mail(refuser, refusal_reason, sign_request_item.partner_id, access_token=sign_request_item.sudo().access_token, force_send=True)
        for partner in self.cc_partner_ids.filtered(lambda p: p.email_formatted) - self.request_item_ids.partner_id:
            self._send_refused_mail(refuser, refusal_reason, partner)

    def _send_refused_mail(self, refuser, refusal_reason, partner, access_token=None, force_send=False):
        self.ensure_one()
        if access_token is None:
            access_token = self.access_token
        subject = _("The document (%s) has been rejected by one of the signers", self.template_id.name)
        base_url = self.get_base_url()
        partner_lang = get_lang(self.env, lang_code=partner.lang).code
        body = self.env['ir.qweb']._render('sign.sign_template_mail_refused', {
            'record': self,
            'recipient': partner,
            'refuser': refuser,
            'link': url_join(base_url, 'sign/document/%s/%s' % (self.id, access_token)),
            'subject': subject,
            'body': Markup('<p style="white-space: pre">{}</p>').format(refusal_reason),
        }, lang=partner_lang, minimal_qcontext=True)

        self._message_send_mail(
            body, 'sign.sign_mail_notification_light',
            {'record_name': self.reference},
            {'model_description': _('Signature'),
             'company': self.communication_company_id or self.create_uid.company_id,
             'partner': partner},
            {'email_from': self.create_uid.email_formatted,
             'author_id': self.create_uid.partner_id.id,
             'email_to': partner.email_formatted,
             'subject': subject},
            force_send=force_send,
            lang=partner_lang,
        )

    def send_signature_accesses(self):
        # Send/Resend accesses for 'sent' sign.request.items by email
        allowed_request_ids = self.filtered(lambda sr: sr.state == 'sent')
        allowed_request_ids._check_senders_validity()
        for sign_request in allowed_request_ids:
            sign_request._get_next_sign_request_items().send_signature_accesses()
            sign_request.last_reminder = fields.Date.today()

    @api.model
    def _cron_reminder(self):
        today = fields.Date.today()
        # find all expired sign requests and those that need a reminder
        # in one query, the code will handle them differently
        # note: archived requests are not fetched.
        self.flush_model()
        self.env.cr.execute(f'''
        SELECT id
        FROM sign_request sr
        WHERE sr.state = 'sent'
        AND active = TRUE
        AND (
            sr.validity < '{today}'
            OR (sr.reminder_enabled AND sr.last_reminder + sr.reminder * ('1 day'::interval) <= '{today}')
        )
        ''')
        res = self.env.cr.fetchall()
        request_to_send = self.env['sign.request']
        for request in self.browse(v[0] for v in res):
            if request.validity < today:
                request.state = 'expired'
            else:
                request_to_send += request
        request_to_send.with_context(force_send=False).send_signature_accesses()

    def _sign(self):
        """ Sign a SignRequest. It can only be used in the SignRequestItem._sign """
        self.ensure_one()
        if self.state != 'sent' or any(sri.state != 'completed' for sri in self.request_item_ids):
            raise UserError(_("This sign request cannot be signed"))
        self.write({'state': 'signed'})
        if not self.template_id._check_is_encrypted():
            # if the file is encrypted, we must wait that the document is decrypted
            self._send_completed_document()

            if self.reference_doc:
                model = self.env['ir.model']._get(self.reference_doc._name)
                if model.is_mail_thread:
                    self.reference_doc.message_post_with_source(
                        "sign.message_signature_link",
                        render_values={"request": self, "salesman": self.env.user.partner_id},
                        subtype_xmlid='mail.mt_note',
                    )
                    # attach a copy of the signed document to the record for easy retrieval
                    attachment_values = []
                    for att in self.completed_document_attachment_ids:
                        attachment_values.append({
                            "name": att['name'],
                            "datas": att['datas'],
                            "type": "binary",
                            "res_model": self.reference_doc._name,
                            "res_id": self.reference_doc.id

                        })
                    self.env["ir.attachment"].create(attachment_values)

    def cancel(self):
        for sign_request in self:
            sign_request.write({'access_token': self._default_access_token(), 'state': 'canceled'})
        self.request_item_ids._cancel()

        # cancel activities for signers
        for user in self.request_item_ids.sudo().partner_id.user_ids.filtered(lambda u: u.has_group('sign.group_sign_user')):
            self.activity_unlink(['mail.mail_activity_data_todo'], user_id=user.id)

        self.env['sign.log'].sudo().create([{'sign_request_id': sign_request.id, 'action': 'cancel'} for sign_request in self])

    def _send_completed_document(self):
        """ Send the completed document to signers and Contacts in copy with emails
        """
        self.ensure_one()
        if self.state != 'signed':
            raise UserError(_('The sign request has not been fully signed'))
        self._check_senders_validity()

        if not self.completed_document:
            self._generate_completed_document()

        signers = [{'name': signer.partner_id.name, 'email': signer.signer_email, 'id': signer.partner_id.id} for signer in self.request_item_ids]
        request_edited = any(log.action == "update" for log in self.sign_log_ids)
        for sign_request_item in self.request_item_ids:
            self._send_completed_document_mail(signers, request_edited, sign_request_item.partner_id, access_token=sign_request_item.sudo().access_token, with_message_cc=False, force_send=True)

        cc_partners_valid = self.cc_partner_ids.filtered(lambda p: p.email_formatted)
        for cc_partner in cc_partners_valid:
            self._send_completed_document_mail(signers, request_edited, cc_partner)
        if cc_partners_valid:
            body = _(
                "The mail has been sent to contacts in copy: %(contacts)s",
                contacts=format_list(self.env, cc_partners_valid.mapped("name")),
            )
            if not is_html_empty(self.message_cc):
                body += self.message_cc
            self.message_post(body=body, attachment_ids=self.attachment_ids.ids + self.completed_document_attachment_ids.ids)
        if self.reference_doc:
            record_body = _("The document %s has been fully signed.", self._get_html_link())
            self.reference_doc.message_post(
                body=record_body,
                attachment_ids=self.completed_document_attachment_ids.ids,
                partner_ids=cc_partners_valid.ids,
            )

    def _send_completed_document_mail(self, signers, request_edited, partner, access_token=None, with_message_cc=True, force_send=False):
        self.ensure_one()
        if access_token is None:
            access_token = self.access_token
        partner_lang = get_lang(self.env, lang_code=partner.lang).code
        base_url = self.get_base_url()
        body = self.env['ir.qweb']._render('sign.sign_template_mail_completed', {
            'record': self,
            'link': url_join(base_url, 'sign/document/%s/%s' % (self.id, access_token)),
            'subject': '%s signed' % self.reference,
            'body': self.message_cc if with_message_cc and not is_html_empty(self.message_cc) else False,
            'recipient_name': partner.name,
            'recipient_id': partner.id,
            'signers': signers,
            'request_edited': request_edited,
            }, lang=partner_lang, minimal_qcontext=True)

        self.env['sign.request']._message_send_mail(
            body, 'sign.sign_mail_notification_light',
            {'record_name': self.reference},
            {'model_description': _('Signature'),
             'company': self.communication_company_id or self.create_uid.company_id,
             'partner': partner},
            {'email_from': self.create_uid.email_formatted,
             'author_id': self.create_uid.partner_id.id,
             'email_to': partner.email_formatted,
             'subject': _('%s has been edited and signed', self.reference) if request_edited else _('%s has been signed', self.reference),
             'attachment_ids': self.attachment_ids.ids + self.completed_document_attachment_ids.ids},
            force_send=force_send,
            lang=partner_lang,
        )

    ##################
    # PDF Rendering  #
    ##################

    def _get_user_formatted_datetime(self, datetime_val):
        """
        Get the user's preferred datetime format based on their language settings.
        """
        lang = self.env['res.lang']._lang_get(self.create_uid.lang)
        user_date_format, user_time_format = lang.date_format, lang.time_format
        return datetime_val.strftime(f"{user_date_format} {user_time_format}")

    def _get_final_signature_log_hash(self):
        """
        Fetch the log_hash of the final signature from the sign.log table.
        """
        self.ensure_one()
        if not self.certificate_reference:
            return False

        final_log = self.env['sign.log'].search([
            ('sign_request_id', '=', self.id),
            ('action', 'in', ['sign', 'create']),
        ], order='id DESC', limit=1)

        return final_log.log_hash if final_log else False

    def _generate_completed_document(self, password="", preview=False):
        if not preview:
            self.ensure_one()
        if self.state != 'signed':
            raise UserError(_("The completed document cannot be created because the sign request is not fully signed"))
        if not self.template_id.sign_item_ids:
            self.completed_document = self.template_id.attachment_id.datas
        else:
            itemsByPage = self.template_id._get_sign_items_by_page()
            items_ids = [id for items in itemsByPage.values() for id in items.ids]
            values_dict = self.env['sign.request.item.value']._read_group(
                [('sign_item_id', 'in', items_ids), ('sign_request_id', '=', self.id)],
                groupby=['sign_item_id'],
                aggregates=['value:array_agg', 'frame_value:array_agg', 'frame_has_hash:array_agg']
            )
            signed_values = {
                sign_item.id : {
                    'value': values[0],
                    'frame': frame_values[0],
                    'frame_has_hash': frame_has_hashes[0],
                }
                for sign_item, values, frame_values, frame_has_hashes in values_dict
            }
            final_log_hash = self._get_final_signature_log_hash()
            output = self.template_id._render_template_with_items(password=password, signed_values=signed_values, values_dict=values_dict, final_log_hash=final_log_hash)

            signer = PdfSigner(output, self.communication_company_id)
            signed_output = signer.sign_pdf(True, self._get_signing_field_name(), self.create_uid.partner_id)

            if signed_output:
                output = signed_output

            self.completed_document = base64.b64encode(output.getvalue())
            output.close()

        attachment = self.env['ir.attachment'].create({
            'name': "%s.pdf" % self.reference if self.reference.split('.')[-1] != 'pdf' else self.reference,
            'datas': self.completed_document,
            'type': 'binary',
            'res_model': self._name,
            'res_id': self.id,
        })

        # print the report with the public user in a sudoed env
        # public user because we don't want groups to pollute the result
        # (e.g. if the current user has the group Sign Manager,
        # some private information will be sent to *all* signers)
        # sudoed env because we have checked access higher up the stack
        public_user = self.env.ref('base.public_user', raise_if_not_found=False)
        if not public_user:
            # public user was deleted, fallback to avoid crash (info may leak)
            public_user = self.env.user
        pdf_content, __ = self.env["ir.actions.report"].with_user(public_user).sudo()._render_qweb_pdf(
            'sign.action_sign_request_print_logs',
            self.ids,
            data={'format_date': format_date, 'company_id': self.communication_company_id}
        )
        attachment_log = self.env['ir.attachment'].create({
            'name': "Certificate of completion - %s.pdf" % time.strftime('%Y-%m-%d - %H:%M:%S'),
            'raw': pdf_content,
            'type': 'binary',
            'res_model': self._name,
            'res_id': self.id,
        })
        self.completed_document_attachment_ids = [Command.set([attachment.id, attachment_log.id])]

    def _get_signing_field_name(self) -> str:
        """Generates a name for the signing field of the pdf document

        Returns:
            str: the name of the signature field
        """
        return self.env.company.name

    ##################
    # Mail overrides #
    ##################

    @api.model
    def _message_send_mail(self, body, email_layout_xmlid, message_values, notif_values, mail_values, force_send=False, **kwargs):
        """ Shortcut to send an email. """
        default_lang = get_lang(self.env, lang_code=kwargs.get('lang')).code
        lang = kwargs.get('lang', default_lang)
        sign_request = self.with_context(lang=lang)
        partner_id = notif_values.get("partner")
        if partner_id and len(partner_id.user_ids) == 1 and partner_id.user_ids.notification_type == "inbox":
            return sign_request.message_notify(
                body=body,
                subject=mail_values.get("subject"),
                author_id=self.create_uid.partner_id.id,
                email_from=mail_values.get("email_from"),
                attachment_ids=mail_values.get("attachment_ids"),
                partner_ids=notif_values.get("partner").ids,
                record_name=message_values.get("record_name"),
                model_description=notif_values.get("model_description"),
                mail_auto_delete=False,
                force_send=force_send,
            )

        # the notif layout wrapping expects a mail.message record, but we don't want
        # to actually create the record
        # See @tde-banana-odoo for details
        msg = sign_request.env['mail.message'].sudo().new(dict(body=body, **message_values))
        body_html = sign_request.env['ir.qweb']._render(
            email_layout_xmlid,
            dict(message=msg, **notif_values),
            minimal_qcontext=True
        )
        body_html = sign_request.env['mail.render.mixin']._replace_local_links(body_html)

        mail_values['reply_to'] = mail_values.get('email_from')
        mail = sign_request.env['mail.mail'].sudo().create(dict(body_html=body_html, **mail_values))
        if force_send:
            mail.send_after_commit()
        return mail

    def _schedule_activity(self, sign_users):
        for user in sign_users:
            self.with_context(mail_activity_quick_update=True).activity_schedule(
                'mail.mail_activity_data_todo',
                user_id=user.id
            )
