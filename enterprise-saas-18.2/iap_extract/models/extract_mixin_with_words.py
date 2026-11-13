from odoo import models, fields, Command


class IAPExtractedWords(models.Model):
    _name = 'iap.extracted.words'
    _description = 'Extracted words from an OCRed document'

    field = fields.Char()
    ocr_selected = fields.Boolean()
    user_selected = fields.Boolean()
    word_text = fields.Char()
    word_page = fields.Integer()
    word_box_midX = fields.Float()
    word_box_midY = fields.Float()
    word_box_width = fields.Float()
    word_box_height = fields.Float()
    word_box_angle = fields.Float()

    res_model = fields.Char('Resource Model')
    res_id = fields.Many2oneReference('Resource ID', model_field='res_model')


class ExtractMixinWithWords(models.AbstractModel):
    _name = 'extract.mixin.with.words'
    _inherit = ['extract.mixin']
    _description = 'Base class to extract data from documents with OCRed words saved'

    extract_attachment_id = fields.Many2one('ir.attachment', readonly=True, ondelete='set null', copy=False, index='btree_not_null')
    extracted_word_ids = fields.One2many('iap.extracted.words', 'res_id', string="Extracted Words")

    def _upload_to_extract_success_callback(self):
        super()._upload_to_extract_success_callback()
        self.extract_attachment_id = self.message_main_attachment_id

    ### Methods for the OCR correction feature ###

    def _on_ocr_results(self, ocr_results):
        super()._on_ocr_results(ocr_results)
        self._update_extracted_word_ids(ocr_results)

    def _get_field_extracted_word_ids(self):
        if "extracted_word_ids" in self:
            return self["extracted_word_ids"]
        raise NotImplementedError()

    def _get_fields_with_boxes(self):
        """ Return the fields that have boxes. This method is meant to be overridden """
        return []

    def _update_extracted_word_ids(self, ocr_results):
        if self._get_field_extracted_word_ids():  # We don't want to recreate the boxes when the user clicks on "Reload AI data"
            return

        fields_with_boxes = self._get_fields_with_boxes()
        for field in filter(ocr_results.get, fields_with_boxes):
            value = ocr_results[field]
            selected_value = value.get('selected_value')
            data = []

            # We need to make sure that only one candidate is selected.
            # Once this flag is set, the next candidates can't be set as selected.
            ocr_chosen_candidate_found = False
            for candidate in value.get('candidates', []):
                ocr_chosen = selected_value == candidate and not ocr_chosen_candidate_found
                if ocr_chosen:
                    ocr_chosen_candidate_found = True
                data.append(Command.create({
                    "res_model": self._name,
                    "res_id": self.id,
                    "field": field,
                    "ocr_selected": ocr_chosen,
                    "user_selected": ocr_chosen,
                    "word_text": candidate['content'],
                    "word_page": candidate['page'],
                    "word_box_midX": candidate['coords'][0],
                    "word_box_midY": candidate['coords'][1],
                    "word_box_width": candidate['coords'][2],
                    "word_box_height": candidate['coords'][3],
                    "word_box_angle": candidate['coords'][4],
                }))
            self.write({'extracted_word_ids': data})

    def get_boxes(self):
        return [{
            "id": data.id,
            "feature": data.field,
            "text": data.word_text,
            "ocr_selected": data.ocr_selected,
            "user_selected": data.user_selected,
            "page": data.word_page,
            "box_midX": data.word_box_midX,
            "box_midY": data.word_box_midY,
            "box_width": data.word_box_width,
            "box_height": data.word_box_height,
            "box_angle": data.word_box_angle
        } for data in self._get_field_extracted_word_ids()]

    def _set_user_selected_box(self, id):
        """Set the selected box for a feature. The id of the box indicates the concerned feature.
        The method returns the text that can be set in the view (possibly different of the text in the file)"""
        self.ensure_one()
        word = self._get_field_extracted_word_ids().browse(int(id))
        to_unselect = self._get_field_extracted_word_ids().search([
            (self._fields['extracted_word_ids'].inverse_name, "=", self.id),
            ("field", "=", word.field),
            ("user_selected", "=", True),
        ])
        to_unselect.user_selected = False
        word.user_selected = True
        return word
