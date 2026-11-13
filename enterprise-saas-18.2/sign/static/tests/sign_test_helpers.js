import { mailModels } from "@mail/../tests/mail_test_helpers";
import { defineModels } from "@web/../tests/web_test_helpers";

export function defineSignModels() {
    return defineModels(signModels);
}

export const signModels = { ...mailModels };
