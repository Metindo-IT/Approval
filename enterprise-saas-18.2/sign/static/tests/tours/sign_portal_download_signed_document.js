import { registry } from "@web/core/registry";
import { pointerDown } from "@odoo/hoot-dom";

registry.category("web_tour.tours").add("portal_download_signed_document", {
    url: "/my",

    steps: () => [
        {
            content: "Click on signature requests.",
            trigger: "a[title='Signature requests']",
            run: "click",
        },
        {
            content: "Click on sign button for request.",
            trigger: "a:contains(template_1_role)",
            run: "click",
        },
        {
            content: "Click on Download button.",
            trigger: "a[title=Download]",
            async run(helpers) {
                await pointerDown(helpers.anchor);
            },
        },
        {
            content: "Open all the signature requets",
            trigger: ".o_portal_submenu a:contains(Signature requests)",
            run: "click",
        },
    ],
});
