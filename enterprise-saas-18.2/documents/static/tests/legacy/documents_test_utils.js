import { registry } from "@web/core/registry";
import { makeView } from "@web/../tests/views/helpers";

// Services
import { busParametersService } from "@bus/bus_parameters_service";
import { imStatusService } from "@mail/core/common/im_status_service";
import { multiTabService } from "@bus/multi_tab_service";
import { busService } from "@bus/services/bus_service";
import { presenceService } from "@bus/services/presence_service";
import { documentService } from "@documents/core/document_service";
import { fileUploadService } from "@web/core/file_upload/file_upload_service";
import { makeMockServer } from "@web/../tests/helpers/mock_server";

export function getEnrichedSearchArch(searchArch='<search></search>') {
    var searchPanelArch = `
        <searchpanel class="o_documents_search_panel">
            <field name="folder_id" string="Folders"/>
        </searchpanel>
    `;
    return searchArch.split('</search>')[0] + searchPanelArch + '</search>';
}

export async function createDocumentsView(params) {
    params.searchViewArch = getEnrichedSearchArch(params.searchViewArch);
    return makeView(params);
}

export async function createFolderView(params) {
    params.searchViewArch = '<search></search>';
    return makeView(params);
}

export async function createDocumentsViewWithMessaging(params) {
    // NOT EXPECTED TO WORK - SUITE MUST BE CONVERTED TO HOOT
    const serverData = params.serverData || {};
    serverData.views = serverData.views || {};
    const searchArchs = {};
    for (const viewKey in serverData.views) {
        const [modelName] = viewKey.split(',');
        searchArchs[`${modelName},false,search`] = getEnrichedSearchArch(serverData.views[`${modelName},false,search`]);
    };
    Object.assign(serverData.views, searchArchs);
    return createDocumentsView(params);
}

function makeFakeMailStoreService() {
    return {
        start: (env) => ({}),
    };
}

/**
 * Load the services needed to test the documents views.
 */
export function loadServices(extraServices = {}) {
    const REQUIRED_SERVICES = {
        documents_pdf_thumbnail: {
            start() {
                return {
                    enqueueRecords: () => {},
                };
            },
        },
        "bus.parameters": busParametersService,
        "document.document": documentService,
        // Should be replaced with original mail.store service in hoot
        "mail.store": makeFakeMailStoreService(),
        bus_service: busService,
        im_status: imStatusService,
        file_upload: fileUploadService,
        multi_tab: multiTabService,
        presence: presenceService,
        ...extraServices,
    };

    const serviceRegistry = registry.category("services");
    for (const [serviceName, service] of Object.entries(REQUIRED_SERVICES)) {
        if (!serviceRegistry.contains(serviceName)) {
            serviceRegistry.add(serviceName, service);
        }
    }
}

export function makeDocumentsMockServer() {
    return makeMockServer({
        models: {
            "documents.document": {
                fields: {
                    id: { type: "integer" },
                    activity_state: { string: "Activity State", type: "selection" },
                    attachment_id: { relation: "ir.attachment", type: "many2one" },
                    is_editable_attachment: { type: "boolean" },
                    file_size: { type: "integer" },
                    mimetype: { type: "char" },
                    res_model: { type: "char" },
                    res_id: {
                        type: "many2one_reference",
                        model_name_ref_fname: "res_model",
                    },
                    res_name: { type: "char" },
                    active: { default: true, type: "boolean" },
                    res_model_name: { type: "char" },
                    type: {
                        selection: [
                            ["url", "URL"],
                            ["binary", "File"],
                            ["folder", "Folder"],
                        ],
                        type: "selection",
                    },

                    tag_ids: { relation: "documents.tag", type: "many2many" },
                    partner_id: { relation: "res.partner", type: "many2one" },
                    owner_id: { relation: "res.users", type: "many2one" },
                    lock_uid: { relation: "res.users", type: "many2one" },
                    access_internal: {
                        name: "access_internal",
                        selection: [
                            ["view", "Viewer"],
                            ["edit", "Editor"],
                            ["none", "None"],
                        ],
                        type: "selection",
                    },
                    user_permission: {
                        name: "user_permission",
                        selection: [
                            ["edit", "Editor"],
                            ["view", "Viewer"],
                            ["none", "None"],
                        ],
                        type: "selection",
                    },

                    folder_id: { relation: "documents.document", type: "many2one" },
                    children_ids: { relation: "documents.document", type: "one2many" },
                    is_company_root_folder: { type: "boolean" },
                    available_embedded_actions_ids: {
                        relation: "ir.embedded.actions",
                        type: "many2many",
                    },
                    alias_tag_ids: { relation: "documents.tag", type: "many2many" },
                    last_access_date_group: {
                        selection: [
                            ["0_older", "Older"],
                            ["1_month", "This Month"],
                            ["2_week", "This Week"],
                            ["3_day", "Today"],
                        ],
                        type: "selection",
                    },
                },
                records: [],
            },
            "documents.tag": { fields: { sequence: { type: "integer" } }, records: [] },
            "ir.attachment": { fields: {}, records: [] },
            "res.partner": { fields: { email: { type: "char" } }, records: [] },
            "res.users": {
                fields: {
                    partner_id: { type: "many2one", relation: "res.partner" },
                    login: { type: "char" },
                    password: { type: "char" },
                },
                records: [],
            },
            "res.fake": { fields: {}, records: [] },
        },
    });
}
