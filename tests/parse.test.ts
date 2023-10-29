import { expect, test } from "bun:test";
import { Pantsdown } from "../src";

test("1 + 2", () => {
    expect(1 + 2).toBe(3);
});

// https://github.com/oven-sh/bun/issues/4722
test.skip("pantsdown.parse(test.md)", async () => {
    const pantsdown = new Pantsdown({
        renderer: {
            detailsTagDefaultOpen: true,
            relativeImageUrlPrefix: "/__localimage__/",
        },
    });

    const markdown = await Bun.file(import.meta.dir + "/test.md").text();
    const html = pantsdown.parse(markdown);

    expect(html).toMatchSnapshot();
});
