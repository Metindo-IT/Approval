import { renderToString } from "@web/core/utils/render";
import {
    startHelperLines,
    offset,
    normalizePosition,
    generateRandomId,
    startSmoothScroll,
    startResize,
} from "@sign/components/sign_request/utils";
import { isMobileOS } from "@web/core/browser/feature_detection";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

/**
 * Mixin that adds edit features into PDF_iframe classes like drag/drop, resize, helper lines
 * Currently, it should be used only for SignTemplateIframe
 * Parent class should implement allowEdit and saveChanges
 *
 * @param { class } pdfClass
 * @returns class
 */
export const EditablePDFIframeMixin = (pdfClass) =>
    class extends pdfClass {
        /**
         * @override
         */
        async start() {
            await super.start();
            this.root.addEventListener("mousemove", (e) => this.onMouseMove(e));
            this.root.addEventListener("keydown", (e) => this.handleKeyDown(e));
            const validator = {
                set: this.onSignItemsSet.bind(this),
                deleteProperty: this.onSignItemsDelete.bind(this),
            };
            for (const page in this.signItems) {
                this.signItems[page] = new Proxy(this.signItems[page], validator);
                for (const signItem of Object.values(this.signItems[page])) {
                    if (signItem.data.type === "signature") {
                        this.setSignatureImage(signItem, signItem.data.roleName);
                    } else if (signItem.data.type === "initial") {
                        this.setSignatureImage(signItem, this.getInitialsText(signItem.data.roleName));
                    }
                }
            }
            this.updateSideBarSignItemsCount();
        }

        onSignItemsSet(target, key, value) {
            target[key] = value;
            const roleName = value.data.roleName;
            if (value.data.type === "signature") {
                this.setSignatureImage(value, roleName);
            } else if (value.data.type === "initial") {
                this.setSignatureImage(value, this.getInitialsText(roleName));
            }
            this.updateSideBarSignItemsCount();
            return true;
        }

        onSignItemsDelete(target, key) {
            delete target[key];
            this.updateSideBarSignItemsCount();
            return true;
        }

        /**
         * Gets an SVG matching the given parameters, output compatible with the
         * src attribute of <img/>.
         *
         * @param {string} text: the name to draw
         * @param {number} width: the width of the resulting image in px
         * @param {number} height: the height of the resulting image in px
         * @returns {string} image = mimetype + image data
         */
        getSVGText(text="", width, height) {
            const svg = renderToString("web.sign_svg_text", {
                width: width,
                height: height,
                font: this.font,
                text: text,
                type: "signature",
                color: "DarkBlue",
            });
            return "data:image/svg+xml," + encodeURI(svg);
        }

        setSignatureImage(signItem, text) {
            const { data, el } = signItem;
            const width = this.getPageContainer(data.page).getBoundingClientRect().width * data.width;
            const height = this.getPageContainer(data.page).getBoundingClientRect().height * data.height;
            const src = this.getSVGText(text, width, height);
            this.fillItemWithSignature(el.firstChild.firstChild, src);
        }

        updateRoleName(roleId, roleName) {
            for (const page in this.signItems) {
                for (const id in this.signItems[page]) {
                    const signItem = this.signItems[page][id];
                    if (signItem.data.responsible === roleId) {
                        signItem.data.roleName = roleName;
                        if (signItem.data.type === "signature") {
                            this.setSignatureImage(signItem, roleName);
                        } else if (signItem.data.type === "initial") {
                            this.setSignatureImage(signItem, this.getInitialsText(roleName));
                        }
                    }
                }
            }
        }

        /**
         * Return the initials string format for a given text.
         * @param {string} text: the name that will be turned into initials
         * @param {string}: text in initials format, such as "G.F."
         */
        getInitialsText(text) {
            const parts = text.split(' ');
            const initials = parts.map(part => {
                return part.length > 0 ? part[0] + '.' : '';
            });
            return initials.join('');
        }

        updateSideBarSignItemsCount() {
            const signItemsCountByRole = {};
            const countedRadioSets = {};
            for (const page in this.signItems) {
                for (const id in this.signItems[page]) {
                    const { data } = this.signItems[page][id];
                    if (data.type === "radio") {
                        if (countedRadioSets[data.radio_set_id]) {
                            continue;
                        }
                        countedRadioSets[data.radio_set_id] = true;
                    }
                    const role = this.signItems[page][id].data.responsible;
                    if (!signItemsCountByRole[role]) {
                        signItemsCountByRole[role] = 0;
                    }
                    signItemsCountByRole[role]++;
                }
            }
            this.updateSignItemsCountCallback(signItemsCountByRole);
        }

        setFont(font) {
            this.font = font;
        }

        setupDragAndDrop() {
            this.startDragAndDrop();
            this.helperLines = startHelperLines(this.root);
        }

        /**
         * Callback executed when a sign item is resized
         * @param {SignItem} signItem
         * @param {Object} change object with new width and height of sign item
         * @param {Boolean} end boolean indicating if the resize is done or still in progress
         */
        onResizeItem(signItem, change, end = false) {
            this.setCanvasVisibility("hidden");
            this.helperLines.show(signItem.el);
            /**
             * Apply the changes only if they respect the minimum width/height.
             * The minimum width is 5.5% of the page width
             * The minimum height is 1% of the page height
             */
            if (change.width >= 0.01 && change.height >= 0.01) {
                Object.assign(signItem.el.style, {
                    height: `${change.height * 100}%`,
                    width: `${change.width * 100}%`,
                });
                Object.assign(signItem.data, {
                    width: change.width,
                    height: change.height,
                    updated: true,
                });
                Object.assign(this.getSignItemById(signItem.data.id).data, {
                    width: change.width,
                    height: change.height,
                    updated: true,
                });
                this.updateSignItemFontSize(signItem);
            }
            if (end) {
                this.helperLines.hide();
                this.setCanvasVisibility("visible");
                this.setTemplateChanged();
            }
        }

        get allowEdit() {
            return false;
        }

        getSignItemById(id) {
            for (const page in this.signItems) {
                if (this.signItems[page].hasOwnProperty(id)) {
                    return this.signItems[page][id];
                }
            }
            return undefined;
        }

        /**
         * Changes visibility of the canvas_layer_0 that is used for drawing connecting lines between sign items of type radio.
         * @param {string} visibility
         */
        setCanvasVisibility(visibility) {
            const canvas_layer = this.getPageContainer(1).parentElement.parentElement.querySelector("#canvas_layer_0");
            if(canvas_layer){
                canvas_layer.style.visibility = visibility;
            }
        }

        /**
         * @override
         */
        renderSignItem() {
            const signItem = super.renderSignItem(...arguments);
            if (isMobileOS()) {
                for (const node of signItem.querySelectorAll(
                    ".o_sign_config_handle, .o_resize_handler"
                )) {
                    node.classList.add("d-none");
                }
            }
            return signItem;
        }

        onMouseMove(e) {
            e.preventDefault();
            this.mousePosition = {
                x: e.clientX,
                y: e.clientY,
            }
        }

        /**
         * Given the (x, y) position with respect to the root document
         * @param {Number} x 
         * @param {Number} y 
         * @returns the document page which contain the (x, y) position 
         * and the ratio of the (x, y) position inside the page.
         */
        getPositionData(x, y) {
            for (let page = 1; page <= this.pageCount; page++) {
                const rect = this.getPageContainer(page).getBoundingClientRect();
                if (rect.left <= x && x <= rect.right
                    && rect.top <= y &&  y <= rect.bottom) {
                        const width = rect.right - rect.left;
                        const height = rect.bottom - rect.top;
                        const x1 = x - rect.left;
                        const y1 = y - rect.top;
                        const posX = x1 / width;
                        const posY = y1 / height;
                        return {
                            page: page,
                            posX: posX,
                            posY: posY,
                        }
                    }
            }
            return {page: -1};
        }

        onPasteItems() {
            // Sorts copiedItems based on page, then position within the page (y-axis), then position on the x-axis
            this.copiedItems.sort((a, b) => {
                return (
                    100 * (a.page - b.page) + // Sort primarily by page number
                    10 * (a.posY - b.posY) +  // Secondary sort by y-axis position
                    (a.posX - b.posX)         // Tertiary sort by x-axis position
                );
            });
            const head = this.copiedItems[0];
            const headPage = this.getPageContainer(head.page);
            const headPageRect = headPage.getBoundingClientRect();
            const headX = headPageRect.left + (headPageRect.right - headPageRect.left) * head.posX;
            const headY = headPageRect.top + (headPageRect.bottom - headPageRect.top) * head.posY;
            this.copiedItems.forEach((data) => {
                const page = this.getPageContainer(data.page);
                const rect = page.getBoundingClientRect();
                const x = rect.left + (rect.right - rect.left) * data.posX;
                const y = rect.top + (rect.bottom - rect.top) * data.posY;
                Object.assign(data, {
                    dx: x - headX,
                    dy: y - headY,
                })
            });
            this.copiedItems.forEach((data) => {
                const X = this.mousePosition.x + data['dx'];
                const Y = this.mousePosition.y + data['dy'];
                const {page, posX, posY} = this.getPositionData(X, Y);
                if (page == -1) {
                    return;
                }
                const newItemData = { ...data };
                const id = generateRandomId();
                Object.assign(newItemData, {
                    page: page,
                    posX: posX,
                    posY: posY,
                    id: id,
                    updated: true,
                    radio_set_id: undefined,
                });
                this.signItems[page][id] = {
                    data: newItemData,
                    el: this.renderSignItem(newItemData, this.getPageContainer(page)),
                };
            });
            this.setTemplateChanged();
            this.refreshSignItems();
            this.mousePosition.x += 10;
            this.mousePosition.y += 10;
        }

        handleKeyDown(event) {
            if ((event.ctrlKey || event.metaKey) && event.key == 'v' && this.copiedItems) {
                this.onPasteItems();
            }
        }

        renderSignItems() {
            super.renderSignItems();
            if (this.allowEdit) {
                this.setupDragAndDrop();
            }
        }

        startDragAndDrop() {
            this.root.querySelectorAll(".page").forEach((page) => {
                if (!page.hasAttribute("updated")) {
                    page.addEventListener("dragover", (e) => this.onDragOver(e));
                    page.addEventListener("drop", (e) => this.onDrop(e));
                    page.setAttribute("updated", true);
                }
            });

            document.querySelectorAll(".o_sign_field_type_button").forEach((sidebarItem) => {
                if (!sidebarItem.hasAttribute("updated")) {
                    sidebarItem.setAttribute("draggable", true);
                    sidebarItem.addEventListener("dragstart", (e) => this.onSidebarDragStart(e));
                    sidebarItem.addEventListener("dragend", (e) => this.onSidebarDragEnd(e));
                    sidebarItem.setAttribute("updated", true);
                }
            });
        }

        onDragStart(e) {
            this.setCanvasVisibility("hidden");
            const signItem = e.currentTarget.parentElement.parentElement.parentElement;
            const page = signItem.parentElement;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("page", page.dataset.pageNumber);
            e.dataTransfer.setData("id", signItem.dataset.id);

            // Align drag image with cursor, save offsets for subtracting them on onDrop.
            const rect = signItem.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;
            e.dataTransfer.setDragImage(signItem, offsetX, offsetY);
            e.dataTransfer.setData("offsetX", offsetX);
            e.dataTransfer.setData("offsetY", offsetY);

            // workaround to hide element while keeping the drag image visible
            requestAnimationFrame(() => {
                if (signItem) {
                    signItem.style.visibility = "hidden";
                }
            }, 0);
            this.scrollCleanup = startSmoothScroll(
                this.root.querySelector("#viewerContainer"),
                signItem,
                null,
                this.helperLines,
                offsetX,
                offsetY,
            );
        }

        onDragEnd(e) {
            this.scrollCleanup();
            // Make sign item visible again after dragging ends. It is a mandatory step when
            // moving items out of bounds since in that flow the items don't get re-rendered.
            let signItem = e.currentTarget.parentElement.parentElement.parentElement;
            if (signItem)
                signItem.style.visibility = "visible";
            this.setCanvasVisibility("visible");
        }

        onSidebarDragStart(e) {
            this.setCanvasVisibility("hidden");
            const signTypeElement = e.currentTarget;
            const firstPage = this.root.querySelector('.page[data-page-number="1"]');
            firstPage.insertAdjacentHTML(
                "beforeend",
                renderToString(
                    "sign.signItem",
                    this.createSignItemDataFromType(signTypeElement.dataset)
                )
            );
            this.ghostSignItem = firstPage.lastChild;
            const itemData = this.signItemTypesById[signTypeElement.dataset.itemTypeId];
            this.updateSignItemFontSize({el: this.ghostSignItem, data: {type: itemData.item_type}});
            e.dataTransfer.setData("itemTypeId", signTypeElement.dataset.itemTypeId);
            e.dataTransfer.setData("roleId", signTypeElement.dataset.roleId);
            e.dataTransfer.setData("roleName", signTypeElement.dataset.roleName);
            e.dataTransfer.setDragImage(this.ghostSignItem, 0, 0);
            this.scrollCleanup = startSmoothScroll(
                this.root.querySelector("#viewerContainer"),
                e.currentTarget,
                this.ghostSignItem,
                this.helperLines
            );
            // workaround to set original element to hidden while keeping the cloned element visible
            requestAnimationFrame(() => {
                if (this.ghostSignItem) {
                    this.ghostSignItem.style.visibility = "hidden";
                }
            }, 0);
        }

        onSidebarDragEnd() {
            this.scrollCleanup();
            const firstPage = this.root.querySelector('.page[data-page-number="1"]');
            firstPage.removeChild(this.ghostSignItem);
            this.ghostSignItem = false;
            this.setCanvasVisibility("visible");
        }

        onDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        }

        onDrop(e) {
            e.preventDefault();
            const page = e.currentTarget;
            const textLayer = page.querySelector(".textLayer");
            const targetPage = Number(page.dataset.pageNumber);

            const { top, left } = offset(textLayer);
            const itemTypeId = e.dataTransfer.getData("itemTypeId");
            const roleId = e.dataTransfer.getData("roleId");
            const roleName = e.dataTransfer.getData("roleName");
            const box = textLayer.getBoundingClientRect();
            const height = box.bottom - box.top;
            const width = box.right - box.left;
            if (itemTypeId) {
                const id = generateRandomId();
                const data = this.createSignItemDataFromType({ itemTypeId, roleId, roleName });
                const posX =
                    Math.round(normalizePosition((e.pageX - left) / width, data.width) * 1000) /
                    1000;
                const posY =
                    Math.round(normalizePosition((e.pageY - top) / height, data.height) * 1000) /
                    1000;
                Object.assign(data, { id, posX, posY, page: targetPage });
                if (data.type === "initial") {
                    this.helperLines.hide();
                    if (this.pageCount > 1) {
                        return this.openDialogAfterInitialDrop(data);
                    }
                } else if (data.type == "radio") {
                    return this.addRadioSet(data);
                }
                this.signItems[targetPage][id] = {
                    data,
                    el: this.renderSignItem(data, page),
                };
                this.refreshSignItems();
            } else if (e.dataTransfer.getData("page") && e.dataTransfer.getData("id")) {
                const initialPage = Number(e.dataTransfer.getData("page"));
                const id = Number(e.dataTransfer.getData("id"));
                const signItem = this.signItems[initialPage][id];
                const signItemEl = signItem.el;
                const posX =
                    Math.round(
                        normalizePosition((e.pageX - left - e.dataTransfer.getData("offsetX")) / width, signItem.data.width) * 1000
                    ) / 1000;
                const posY =
                    Math.round(
                        normalizePosition((e.pageY - top - e.dataTransfer.getData("offsetY")) / height, signItem.data.height) * 1000
                    ) / 1000;

                if (initialPage !== targetPage) {
                    signItem.data.page = targetPage;
                    this.signItems[targetPage][id] = signItem;
                    delete this.signItems[initialPage][id];
                    page.appendChild(signItemEl.parentElement.removeChild(signItemEl));
                }

                Object.assign(signItem.data, {
                    posX,
                    posY,
                    updated: true,
                });
                Object.assign(signItemEl.style, {
                    top: `${posY * 100}%`,
                    left: `${posX * 100}%`,
                    visibility: "visible",
                });
                // Re-bind updated signItem to the resize function.
                startResize(signItem, this.onResizeItem.bind(this));
            } else {
                return;
            }

            this.setTemplateChanged();
            this.refreshSignItems();
        }

        /**
         * Enables resizing and drag/drop for sign items
         * @param {SignItem} signItem
         */
        enableCustom(signItem) {
            super.enableCustom(signItem);
            if (signItem.data.isSignItemEditable) {
                startResize(signItem, this.onResizeItem.bind(this));
                this.registerDragEventsForSignItem(signItem);
            }
        }

        openDialogAfterInitialDrop(data) {
            this.dialog.add(ConfirmationDialog, {
                title: _t('Add Initials'),
                body: _t('Do you want to add initials to all pages?'),
                confirmLabel: _t("Yes"),
                confirm: () => this.addInitialSignItem(data, true),
                cancelLabel: _t("No, add only once"),
                cancel: () => this.addInitialSignItem(data, false),
            });
        }

        /**
         * Inserts initial sign items in the page
         * @param {Object} data data of the sign item to be added
         * @param {Boolean} targetAllPages if the item should be added in all pages or only at the current one
         */
        addInitialSignItem(data, targetAllPages = false) {
            if (targetAllPages) {
                for (let page = 1; page <= this.pageCount; page++) {
                    const id = generateRandomId();
                    const signItemData = { ...data, page, id};
                    this.signItems[page][id] = {
                        data: signItemData,
                        el: this.renderSignItem(signItemData, this.getPageContainer(page)),
                    };
                }
            } else {
                this.signItems[data.page][data.id] = {
                    data,
                    el: this.renderSignItem(data, this.getPageContainer(data.page)),
                };
            }
            this.setTemplateChanged();
        }

        /**
         * Creates and renders the inital two sign items of the radio set.
         * @param: {Object} data: the first radio item data
         */
        async addRadioSet(data) {
            const [rs_id] = await this.orm.create('sign.item.radio.set', [{}]);
            data['radio_set_id'] = rs_id;
            const id2 = generateRandomId();
            const signItemData1 = { ...data };
            const signItemData2 = { ...data };
            signItemData2['id'] = id2;
            signItemData2['posY'] += 0.04;
            this.signItems[data.page][data.id] = {
                data: signItemData1,
                el: this.renderSignItem(signItemData1, this.getPageContainer(data.page)),
            }
            this.signItems[data.page][id2] = {
                data: signItemData2,
                el: this.renderSignItem(signItemData2, this.getPageContainer(data.page)),
            }
            this.radioSets[data['radio_set_id']] = {
                num_options: 2,
                radio_item_ids: [signItemData1.id , signItemData2.id],
            };
            this.refreshSignItems();
            this.setTemplateChanged();
        }

        setTemplateChanged() {}

        registerDragEventsForSignItem(signItem) {
            const handle = signItem.el.querySelector(".o_sign_config_handle");
            handle.setAttribute("draggable", true);
            handle.addEventListener("dragstart", (e) => this.onDragStart(e));
            handle.addEventListener("dragend", (e) => this.onDragEnd(e));
        }

        /**
         * Deletes a sign item from the template
         * @param {SignItem} signItem
         */
        deleteSignItem(signItem) {
            const { id, page } = signItem.data;
            signItem.el.parentElement.removeChild(signItem.el);
            delete this.signItems[page][id];
            this.setTemplateChanged();
        }

        /**
         * Bulk delete of multiple sign items, saves the template only once.
         * @param {SignItem []} deletedItems 
         */
        async deleteSignItems(deletedItems) {
            deletedItems.forEach((signItem) => {
                this.deletedSignItemIds.push(signItem.data.id);
                signItem.el.parentElement.removeChild(signItem.el);
                delete this.signItems[signItem.data.page][signItem.data.id];
                if (signItem.data.type == "radio") {
                    this.radioSets[signItem.data.radio_set_id].num_options--;
                    this.radioSets[signItem.data.radio_set_id].radio_item_ids = 
                        this.radioSets[signItem.data.radio_set_id].radio_item_ids.filter((id) => id != signItem.data.id);
                }
            })
            await this.setTemplateChanged();
        }
    };
