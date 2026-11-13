import { _t } from "@web/core/l10n/translation";
import { Component, onWillStart, onMounted, useEffect, useRef, useState } from "@odoo/owl";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { Dialog } from "@web/core/dialog/dialog";
import { groupBy } from "@web/core/utils/arrays";
import { Record } from "@web/model/record";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { KnowledgeHtmlViewer } from "@knowledge/components/knowledge_html_viewer/knowledge_html_viewer";
import { WithSubEnv } from "@knowledge/components/with_sub_env/with_sub_env";
import { READONLY_MAIN_EMBEDDINGS } from "@html_editor/others/embedded_components/embedding_sets";
import { KNOWLEDGE_READONLY_EMBEDDINGS } from "@knowledge/editor/embedded_components/embedding_sets";

/**
 * This component will display an article template picker. The user will be able
 * to preview the article templates and select the one they want.
 */
export class ArticleTemplatePickerDialog extends Component {
    static template = "knowledge.ArticleTemplatePickerDialog";
    static components = {
        Dialog,
        Record,
        KnowledgeHtmlViewer,
        WithSubEnv
    };
    static props = {
        record: { type: Object },
        onLoadArticle: { type: Function },
        onLoadTemplate: { type: Function },
        close: { type: Function },
    };
    /**
     * @override
     */
    setup() {
        super.setup();
        this.size = "fs";
        this.user = user;
        this.orm = useService("orm");
        this.dialogService = useService("dialog");
        this.scrollView = useRef("scroll-view");
        this.state = useState({});

        onWillStart(async () => {
            const [articlesListedInTemplateGallery, templates] = await Promise.all([
                await this.orm.searchRead(
                    "knowledge.article",
                    [["is_listed_in_templates_gallery", "=", true]],
                    ["id", "icon", "name", "user_can_write"]),
                await this.orm.searchRead(
                    "knowledge.article",
                    [["is_template", "=", true], ["parent_id", "=", false]],
                    ["id", "icon", "template_name", "template_category_id",
                        "template_category_sequence", "template_sequence"])
            ]);

            const templatesGroupedByCategory = Object.values(
                groupBy(templates, template => template["template_category_id"][0])
            ).sort((a, b) => {
                return a[0]["template_category_sequence"] - b[0]["template_category_sequence"];
            }).map(group => group.sort((a, b) => {
                return a["template_sequence"] - b["template_sequence"];
            }));

            Object.assign(this.state, {
                articlesListedInTemplateGallery,
                templatesGroupedByCategory,
            });

            this.selectFirstEntryFromSidebar();
        });

        onMounted(() => {
            const { el } = this.scrollView;
            if (el) {
                el.scrollTop = 0;
            }
        });

        useEffect(() => {
            const { el } = this.scrollView;
            if (el) {
                el.style.visibility = "visible";
            }
        }, () => [this.state.resId]);
    }

    /**
     * @param {integer} resId
     * @param {function} onLoadRecord
     */
    loadRecord(resId, onLoadRecord) {
        const { el } = this.scrollView;
        if (el) {
            el.scrollTop = 0;
        }
        if (resId !== this.state.resId) {
            if (el) {
                el.style.visibility = "hidden";
            }
            this.state.resId = resId;
            onLoadRecord?.();
        }
    }

    /**
     * Selects the first entry from the templates gallery sidebar.
     */
    selectFirstEntryFromSidebar() {
        if (this.state.articlesListedInTemplateGallery.length > 0) {
            const articleId = this.state.articlesListedInTemplateGallery[0].id;
            this.onSelectArticle(articleId);
        } else if (this.state.templatesGroupedByCategory.length > 0) {
            const templateId = this.state.templatesGroupedByCategory[0][0].id;
            this.onSelectTemplate(templateId);
        }
    }

    /**
     * @param {integer} articleId
     */
    async onDeleteArticle(articleId) {
        this.dialogService.add(ConfirmationDialog, {
            title: _t("Remove Template from List"),
            body: _t("Are you sure you want to remove this template from the list?\nIf needed, it can be added later from the Article."),
            confirmLabel: _t("Remove Template"),
            confirm: async () => {
                if (this.props.record.resId === articleId) {
                    await this.props.record.save();
                }
                await this.orm.write("knowledge.article", [articleId], {
                    is_listed_in_templates_gallery: false,
                });
                if (this.props.record.resId === articleId) {
                    this.props.record.load();
                }
                this.state.articlesListedInTemplateGallery = this.state.articlesListedInTemplateGallery.filter(article => {
                    return article.id !== articleId;
                });
                if (this.state.resId === articleId) {
                    this.selectFirstEntryFromSidebar();
                }
            },
            cancel: () => {},
        });
    }

    /**
     * @param {integer} templateId
     */
    async onDeleteTemplate(templateId) {
        this.dialogService.add(ConfirmationDialog, {
            title: _t("Delete Template"),
            body: _t("Are you sure you want to delete this template from the database?"),
            confirmLabel: _t("Remove Template"),
            confirm: async () => {
                await this.orm.unlink("knowledge.article", [templateId]);
                const groups = [];
                for (const group of this.state.templatesGroupedByCategory) {
                    const templates = group.filter(template => {
                        return template.id !== templateId;
                    });
                    if (templates.length > 0) {
                        groups.push(templates);
                    }
                }
                this.state.templatesGroupedByCategory = groups;
                if (this.state.resId === templateId) {
                    this.selectFirstEntryFromSidebar();
                }
            },
            cancel: () => {},
        });
    }

    /**
     * @param {integer} articleId
     */
    onSelectArticle(articleId) {
        this.loadRecord(articleId, () => {
            this.state.isRenderingTemplate = false;
        });
    }

    /**
     * @param {integer} templateId
     */
    onSelectTemplate(templateId) {
        this.loadRecord(templateId, () => {
            this.state.isRenderingTemplate = true;
        });
    }

    async onLoadArticle() {
        await this.props.onLoadArticle(this.state.resId);
        this.props.close();
    }

    async onLoadTemplate() {
        await this.props.onLoadTemplate(this.state.resId);
        this.props.close();
    }

    /**
     * @param {Record} record
     * @returns {Object}
     */
    getHtmlViewerConfig(record) {
        return {
            config: {
                value: record.data.template_preview || record.data.body,
                embeddedComponents: [...READONLY_MAIN_EMBEDDINGS, ...KNOWLEDGE_READONLY_EMBEDDINGS],
            },
        };
    }

    /**
     * Returns the fields required for the preview of the templates.
     * @returns {Array[String]}
     */
    get templateFieldNames() {
        return [
            "cover_image_url",
            "icon",
            "id",
            "parent_id",
            "template_name",
            "template_preview",
            "template_description",
        ];
    }

    /**
     * Returns the fields required for the preview of the articles that are
     * listed in the templates gallery.
     * @returns {Array[String]}
     */
    get articleFieldNames() {
        return [
            "body",
            "cover_image_url",
            "icon",
            "id",
            "name",
            "parent_id",
        ];
    }
}
