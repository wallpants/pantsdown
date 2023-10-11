export class Hooks {
    static passThroughHooks = new Set(["preprocess", "postprocess"]);

    /**
     * Process markdown before marked
     */
    preprocess(markdown: string) {
        return markdown;
    }

    /**
     * Process HTML after marked is finished
     */
    postprocess(html: string) {
        return html;
    }
}
