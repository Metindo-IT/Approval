import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add('portal_sign_document', {
    url: '/my',
    steps: () => [
        {
            content: "Click on signature requests.",
            trigger: "a[title='Signature requests']",
            run: "click",
        },
        {
            content: "Click on sign button for request.",
            trigger: "tr:has(td a:contains('template_1_role')) a.btn.btn-sm.btn-primary:contains('sign')",
            run: "click",
        },
        {
            content: "Follow the guide to sign the document.",
            trigger: ":iframe .o_sign_sign_item_navigator",
            run: "click",
        },
        {
            content: "Fill the sign item.",
            trigger: ":iframe input.o_sign_sign_item",
            run: "edit text",
        },
        {
            content: "Validate & Send Completed Document.",
            trigger: "button:contains('Validate & Send Completed Document')",
            run: "click",
        },
        {
            content: "Close the dialog.",
            trigger: "button:contains('close')",
            run: "click",
        },
    ]
});
