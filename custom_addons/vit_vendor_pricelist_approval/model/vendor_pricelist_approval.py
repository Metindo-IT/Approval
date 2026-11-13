from datetime import datetime, timedelta
import pytz

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class VendorPricelistApproval(models.Model):
    _name = "vendor.pricelist.approval"
    _description = "Vendor Pricelist Approval"
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = "id desc"

    name = fields.Char(
        string="Nomor Dokumen",
        readonly=True,
        copy=False,
        default='New',
        tracking=True,
    )
    category_id = fields.Many2one(
        'product.category',
        string="Kategori Produk",
        required=True,
        domain="[('pricelist_approval_required', '=', True)]",
        tracking=True,
    )
    user_id = fields.Many2one(
        'res.users',
        string="Dibuat Oleh",
        default=lambda self: self.env.user,
        readonly=True,
        tracking=True,
    )
    company_id = fields.Many2one(
        'res.company',
        string="Company",
        default=lambda self: self.env.company,
        readonly=True,
    )
    state = fields.Selection(
        [
            ('draft', 'Draft'),
            ('approval_1', 'Approval 1: Purchasing'),
            ('approval_2', 'Approval 2: Marketing'),
            ('approval_3', 'Approval 3: Finance'),
            ('approved', 'Approved'),
            ('rejected', 'Rejected'),
        ],
        string="Status",
        default='draft',
        tracking=True,
        copy=False,
        index=True,
    )
    supplierinfo_ids = fields.One2many(
        'product.supplierinfo',
        'pricelist_approval_id',
        string="Daftar Harga Vendor",
        context={'active_test': False},
    )
    partner_ids = fields.Many2many(
        'res.partner',
        string="Vendor",
        compute="_compute_partner_ids",
        store=True,
    )
    line_ids = fields.One2many(
        'vendor.pricelist.approval.line',
        'approval_id',
        string="Lembar Persetujuan",
        copy=False,
    )
    can_approve = fields.Boolean(
        string="Bisa Approve",
        compute="_compute_can_approve",
    )
    submit_date = fields.Datetime(
        string="Tanggal Submit",
        readonly=True,
        copy=False,
    )
    stage_deadline = fields.Date(
        string="Batas Waktu Tahap",
        readonly=True,
        copy=False,
        tracking=True,
    )
    affected_bill_count = fields.Integer(
        string="Bill Terdampak",
        compute="_compute_affected_bill_count",
    )

    @api.depends('supplierinfo_ids', 'supplierinfo_ids.partner_id')
    def _compute_partner_ids(self):
        for rec in self:
            lines = rec.with_context(active_test=False).supplierinfo_ids
            rec.partner_ids = lines.mapped('partner_id')

    @api.depends('state', 'line_ids.user_id', 'line_ids.state', 'line_ids.stage')
    def _compute_can_approve(self):
        current_uid = self.env.uid
        stage_map = {
            'approval_1': '1',
            'approval_2': '2',
            'approval_3': '3',
        }
        for rec in self:
            stage = stage_map.get(rec.state)
            if not stage:
                rec.can_approve = False
                continue
            rec.can_approve = bool(rec.line_ids.filtered(
                lambda l: l.stage == stage and l.state == 'pending' and l.user_id.id == current_uid
            ))

    def _get_affected_bill_domain(self):
        self.ensure_one()
        lines = self.with_context(active_test=False).supplierinfo_ids
        products = lines.mapped('product_id') | lines.mapped('product_tmpl_id.product_variant_ids')
        vendors = lines.mapped('partner_id')
        if not products or not vendors:
            return [('id', '=', 0)]
        domain = [
            ('move_type', '=', 'in_invoice'),
            ('state', '=', 'posted'),
            ('partner_id', 'in', vendors.ids),
            ('invoice_line_ids.product_id', 'in', products.ids),
        ]
        if self.submit_date:
            domain.append(('invoice_date', '>=', self.submit_date.date()))
        return domain

    def _compute_affected_bill_count(self):
        Move = self.env['account.move']
        for rec in self:
            if rec.state == 'approved':
                rec.affected_bill_count = Move.search_count(rec._get_affected_bill_domain())
            else:
                rec.affected_bill_count = 0

    def action_view_affected_bills(self):
        self.ensure_one()
        return {
            'name': _("Bill Terdampak - %s") % self.name,
            'type': 'ir.actions.act_window',
            'res_model': 'account.move',
            'view_mode': 'list,form',
            'domain': self._get_affected_bill_domain(),
            'context': {'create': False},
        }

    @api.model
    def _today_wib(self):
        return datetime.now(pytz.UTC).astimezone(pytz.timezone('Asia/Jakarta')).date()

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                categ = self.env['product.category'].browse(vals.get('category_id'))
                req_categ = categ._get_pricelist_category() if categ else categ
                code = (req_categ and req_categ.pricelist_code) or categ.pricelist_code or 'GEN'
                seq = self.env['ir.sequence'].next_by_code('vendor.pricelist.approval') or '00001'
                today = self._today_wib()
                vals['name'] = f"PRICE/{code}/{today:%Y/%m}/{seq}"
        return super().create(vals_list)

    @api.model
    def _attach_imported_prices(self, supplierinfos):
        grouped = {}
        for sinfo in supplierinfos.with_context(active_test=False):
            req_categ = sinfo._get_approval_category()
            if not req_categ:
                continue
            grouped.setdefault(req_categ, self.env['product.supplierinfo'])
            grouped[req_categ] |= sinfo

        for categ, records in grouped.items():
            doc = self.search([
                ('state', '=', 'draft'),
                ('user_id', '=', self.env.uid),
                ('category_id', '=', categ.id),
            ], limit=1, order='id desc')
            if not doc:
                doc = self.create({
                    'category_id': categ.id,
                    'user_id': self.env.uid,
                })
            for rec in records:
                old_matches = rec._find_matching_active_supplierinfo()
                rec.with_context(pricelist_approval_write=True).write({
                    'pricelist_approval_id': doc.id,
                    'replaced_supplierinfo_ids': [(6, 0, old_matches.ids)],
                })

    def _get_config_users(self, param_key):
        raw = self.env['ir.config_parameter'].sudo().get_param(param_key, default='')
        ids = [int(x) for x in raw.split(',') if x.strip().isdigit()]
        return self.env['res.users'].browse(ids).exists()

    def _get_config_partners(self, param_key):
        raw = self.env['ir.config_parameter'].sudo().get_param(param_key, default='')
        ids = [int(x) for x in raw.split(',') if x.strip().isdigit()]
        return self.env['res.partner'].browse(ids).exists()

    def _get_stage_approvers(self, stage):
        key_map = {
            1: 'vit_vendor_pricelist_approval.approver_1_ids',
            2: 'vit_vendor_pricelist_approval.approver_2_ids',
            3: 'vit_vendor_pricelist_approval.approver_3_ids',
        }
        return self._get_config_users(key_map[stage])

    def _get_deadline_days(self, stage):
        ICP = self.env['ir.config_parameter'].sudo()
        if stage == 1:
            return int(ICP.get_param('vit_vendor_pricelist_approval.deadline_1', default=2) or 2)
        return int(ICP.get_param('vit_vendor_pricelist_approval.deadline_2', default=3) or 3)

    def _check_submit_requirements(self):
        self.ensure_one()
        lines = self.with_context(active_test=False).supplierinfo_ids
        if not lines:
            raise UserError(_("Dokumen approval harus memiliki minimal 1 baris harga vendor."))

        attachment_count = self.env['ir.attachment'].sudo().search_count([
            ('res_model', '=', self._name),
            ('res_id', '=', self.id),
        ])
        if attachment_count < 2:
            raise UserError(_(
                "Wajib melampirkan minimal 2 dokumen pada chatter sebelum Submit:\n"
                "1. Update Price List\n"
                "2. Quotation bertanda tangan"
            ))

        for sinfo in lines:
            if sinfo.price <= 0:
                raise UserError(_(
                    "Harga untuk vendor '%s' (%s) harus lebih besar dari 0."
                ) % (sinfo.partner_id.display_name, sinfo.product_tmpl_id.display_name))
            if not sinfo.date_start:
                raise UserError(_(
                    "Start Date (date_start) wajib diisi untuk semua baris harga (Vendor: %s, Produk: %s)."
                ) % (sinfo.partner_id.display_name, sinfo.product_tmpl_id.display_name))

    def action_submit(self):
        for rec in self:
            if rec.state not in ('draft', 'rejected'):
                raise UserError(_("Hanya dokumen berstatus Draft atau Rejected yang dapat di-submit."))
            rec._check_submit_requirements()

            lines = rec.with_context(active_test=False).supplierinfo_ids
            for sinfo in lines:
                old_matches = sinfo._find_matching_active_supplierinfo()
                sinfo.with_context(pricelist_approval_write=True).write({
                    'active': False,
                    'approval_state': 'to_approve',
                    'replaced_supplierinfo_ids': [(6, 0, old_matches.ids)],
                })

            rec.submit_date = fields.Datetime.now()
            rec._start_stage(1)

    def _start_stage(self, stage):
        self.ensure_one()
        stage_str = str(stage)
        approvers = self._get_stage_approvers(stage)
        if not approvers:
            raise UserError(_(
                "Daftar Approver Tahap %s belum dikonfigurasi di Purchase → Configuration → Settings."
            ) % stage_str)

        self.line_ids.filtered(lambda l: l.stage == stage_str and l.state == 'pending').unlink()

        role = 'acknowledged' if stage in (1, 2) else 'approved'
        line_vals = [
            {
                'approval_id': self.id,
                'stage': stage_str,
                'user_id': user.id,
                'role': role,
                'state': 'pending',
            }
            for user in approvers
        ]
        self.env['vendor.pricelist.approval.line'].create(line_vals)

        today = self._today_wib()
        if stage == 1:
            deadline = today + timedelta(days=self._get_deadline_days(1))
        elif stage == 2:
            deadline = today + timedelta(days=self._get_deadline_days(2))
        else:
            deadline = self.stage_deadline if (self.stage_deadline and self.stage_deadline >= today) else today + timedelta(days=1)

        self.write({
            'state': f'approval_{stage}',
            'stage_deadline': deadline,
        })

        followers = self._get_config_partners('vit_vendor_pricelist_approval.follower_ids')
        partner_to_sub = followers | approvers.mapped('partner_id')
        if partner_to_sub:
            self.message_subscribe(partner_ids=partner_to_sub.ids)

        act_type = self.env.ref(
            'vit_vendor_pricelist_approval.mail_activity_type_pricelist_approval',
            raise_if_not_found=False,
        ) or self.env.ref('mail.mail_activity_data_todo')

        for user in approvers:
            self.activity_schedule(
                activity_type_id=act_type.id,
                date_deadline=deadline,
                summary=_("Approval Pricelist Tahap %s: %s") % (stage_str, self.name),
                note=_("Mohon periksa dan beri persetujuan pada dokumen %s.") % self.name,
                user_id=user.id,
            )

    def _clear_stage_activities(self, user=None):
        self.ensure_one()
        acts = self.activity_ids
        if user:
            acts = acts.filtered(lambda a: a.user_id == user)
        if acts:
            acts.action_feedback(feedback=_("Approval selesai."))

    def action_approve(self):
        stage_map = {
            'approval_1': 1,
            'approval_2': 2,
            'approval_3': 3,
        }
        for rec in self:
            stage = stage_map.get(rec.state)
            if not stage:
                raise UserError(_("Dokumen ini tidak sedang berada dalam tahap approval."))

            pending_line = rec.line_ids.filtered(
                lambda l: l.stage == str(stage) and l.state == 'pending' and l.user_id == self.env.user
            )
            if not pending_line:
                raise UserError(_(
                    "Anda bukan approver aktif untuk tahap ini atau Anda sudah melakukan approve."
                ))

            pending_line.write({
                'state': 'approved',
                'date': fields.Datetime.now(),
            })
            rec._clear_stage_activities(user=self.env.user)
            rec.message_post(body=_("Tahap %s disetujui oleh <b>%s</b>.") % (stage, self.env.user.display_name))

            still_pending = rec.line_ids.filtered(
                lambda l: l.stage == str(stage) and l.state == 'pending'
            )
            if not still_pending:
                if stage < 3:
                    rec._start_stage(stage + 1)
                else:
                    rec._action_final_approve()

    def action_reject(self):
        self.ensure_one()
        stage_map = {
            'approval_1': '1',
            'approval_2': '2',
            'approval_3': '3',
        }
        stage = stage_map.get(self.state)
        if not stage:
            raise UserError(_("Dokumen tidak berada dalam tahap approval."))
        pending_line = self.line_ids.filtered(
            lambda l: l.stage == stage and l.state == 'pending' and l.user_id == self.env.user
        )
        if not pending_line:
            raise UserError(_("Anda tidak memiliki wewenang untuk menolak dokumen pada tahap ini."))

        return {
            'name': _("Alasan Reject Pricelist"),
            'type': 'ir.actions.act_window',
            'res_model': 'vendor.pricelist.reject.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_approval_id': self.id,
            },
        }

    def _do_reject(self, reason):
        self.ensure_one()
        stage_map = {
            'approval_1': '1',
            'approval_2': '2',
            'approval_3': '3',
        }
        stage = stage_map.get(self.state)
        pending_line = self.line_ids.filtered(
            lambda l: l.stage == stage and l.state == 'pending' and l.user_id == self.env.user
        )
        if not pending_line:
            raise UserError(_("Anda tidak memiliki wewenang untuk menolak dokumen pada tahap ini."))

        pending_line.write({
            'state': 'rejected',
            'date': fields.Datetime.now(),
            'note': reason,
        })
        self.line_ids.filtered(lambda l: l.state == 'pending').unlink()
        if self.activity_ids:
            self.activity_ids.unlink()

        self.with_context(active_test=False).supplierinfo_ids.with_context(
            pricelist_approval_write=True
        ).write({
            'active': False,
            'approval_state': 'draft',
        })
        self.write({
            'state': 'draft',
            'stage_deadline': False,
        })
        self.message_post(
            body=_("Dokumen di-<b>reject</b> oleh <b>%s</b> (Tahap %s).<br/>Alasan: %s")
            % (self.env.user.display_name, stage, reason)
        )
        if self.user_id:
            self.activity_schedule(
                'mail.mail_activity_data_todo',
                date_deadline=self._today_wib(),
                summary=_("Revisi Pricelist Approval: %s") % self.name,
                note=_("Ditolak oleh %s: %s") % (self.env.user.display_name, reason),
                user_id=self.user_id.id,
            )

    def _action_final_approve(self):
        self.ensure_one()
        new_lines = self.with_context(active_test=False).supplierinfo_ids.with_context(
            pricelist_approval_write=True
        )
        for sinfo in new_lines:
            old_matches = sinfo._find_matching_active_supplierinfo() | sinfo.replaced_supplierinfo_ids
            if old_matches:
                old_matches.with_context(pricelist_approval_write=True).write({'active': False})

        new_lines.write({
            'active': True,
            'approval_state': 'approved',
        })
        self.write({
            'state': 'approved',
            'stage_deadline': False,
        })
        self.message_post(body=_("Seluruh tahap approval selesai. Harga vendor telah <b>AKTIF</b>."))
        self._update_open_purchase_lines()

    def _update_open_purchase_lines(self):
        self.ensure_one()
        new_lines = self.with_context(active_test=False).supplierinfo_ids
        products = (
            new_lines.mapped('product_id')
            | new_lines.mapped('product_tmpl_id.product_variant_ids')
        )
        vendors = new_lines.mapped('partner_id')
        if not products or not vendors:
            return

        commercial_partners = vendors | vendors.mapped('commercial_partner_id')
        all_vendor_partners = self.env['res.partner'].search([
            '|',
            ('id', 'in', commercial_partners.ids),
            ('commercial_partner_id', 'in', commercial_partners.ids),
        ])

        po_lines = self.env['purchase.order.line'].search([
            ('product_id', 'in', products.ids),
            ('partner_id', 'in', all_vendor_partners.ids),
            ('order_id.state', 'in', ('draft', 'sent', 'to approve', 'purchase')),
            ('display_type', '=', False),
            ('qty_received', '=', 0),
            ('qty_invoiced', '=', 0),
        ])
        for line in po_lines:
            seller = line.product_id._select_seller(
                partner_id=line.partner_id,
                quantity=line.product_qty,
                date=line.order_id.date_order and line.order_id.date_order.date() or fields.Date.context_today(line),
                uom_id=line.product_uom_id,
            )
            if not seller or seller not in new_lines:
                seller = new_lines.filtered(
                    lambda s: (s.partner_id in (line.partner_id | line.partner_id.commercial_partner_id))
                    and (s.product_id == line.product_id or (not s.product_id and s.product_tmpl_id == line.product_id.product_tmpl_id))
                )[:1]
            if not seller:
                continue
            new_price = seller.price
            if seller.currency_id != line.order_id.currency_id:
                new_price = seller.currency_id._convert(
                    new_price,
                    line.order_id.currency_id,
                    line.order_id.company_id or self.env.company,
                    line.order_id.date_order or fields.Date.today(),
                )
            if line.product_uom_id and seller.product_uom_id and line.product_uom_id != seller.product_uom_id:
                new_price = seller.product_uom_id._compute_price(new_price, line.product_uom_id)

            old_price = line.price_unit
            if old_price != new_price:
                line.write({'price_unit': new_price})
                line.order_id.message_post(
                    body=_(
                        "Harga item <b>%s</b> diperbarui otomatis dari <b>%s</b> menjadi <b>%s</b> "
                        "sesuai persetujuan Pricelist <b>%s</b>."
                    ) % (line.product_id.display_name, old_price, new_price, self.name)
                )

    @api.model
    def _cron_remind_overdue_approvals(self):
        today = self._today_wib()
        overdue_docs = self.search([
            ('state', 'in', ('approval_1', 'approval_2', 'approval_3')),
            ('stage_deadline', '<', today),
        ])
        stage_map = {
            'approval_1': '1',
            'approval_2': '2',
            'approval_3': '3',
        }
        act_type = self.env.ref(
            'vit_vendor_pricelist_approval.mail_activity_type_pricelist_approval',
            raise_if_not_found=False,
        ) or self.env.ref('mail.mail_activity_data_todo')

        for doc in overdue_docs:
            stage = stage_map.get(doc.state)
            pending_users = doc.line_ids.filtered(
                lambda l: l.stage == stage and l.state == 'pending'
            ).mapped('user_id')
            if not pending_users:
                continue
            names = ', '.join(pending_users.mapped('display_name'))
            doc.message_post(
                body=_(
                    "<b>Pengingat Batas Waktu:</b> Dokumen ini telah melewati batas waktu tahap %s (%s). "
                    "Menunggu persetujuan dari: %s."
                ) % (stage, doc.stage_deadline, names)
            )
            for user in pending_users:
                existing = doc.activity_ids.filtered(lambda a: a.user_id == user)
                if not existing:
                    doc.activity_schedule(
                        activity_type_id=act_type.id,
                        date_deadline=today,
                        summary=_("OVERDUE Approval Pricelist Tahap %s: %s") % (stage, doc.name),
                        note=_("Dokumen %s telah melewati batas waktu (%s).") % (doc.name, doc.stage_deadline),
                        user_id=user.id,
                    )


class VendorPricelistRejectWizard(models.TransientModel):
    _name = "vendor.pricelist.reject.wizard"
    _description = "Wizard Alasan Reject Pricelist"

    approval_id = fields.Many2one(
        'vendor.pricelist.approval',
        string="Dokumen Approval",
        required=True,
    )
    reason = fields.Text(string="Alasan Penolakan", required=True)

    def action_confirm_reject(self):
        self.ensure_one()
        reason = (self.reason or '').strip()
        if not reason:
            raise UserError(_("Alasan penolakan wajib diisi."))
        self.approval_id._do_reject(reason)
        return {'type': 'ir.actions.act_window_close'}
